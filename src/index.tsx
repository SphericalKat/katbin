import { Hono } from "hono";
import type { Context } from "hono";
import type { FC } from "hono/jsx";
import { raw } from "hono/html";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { and, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import bcrypt from "bcryptjs";
import hljs from "highlight.js/lib/common";
import elixir from "highlight.js/lib/languages/elixir";
import erlang from "highlight.js/lib/languages/erlang";
import { marked } from "marked";
import { scryptSync, timingSafeEqual } from "node:crypto";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";

import clientUrl from "./client.ts?url";
import { pastes, sessions, users } from "./db/schema";
import stylesheetUrl from "./styles.css?url";

const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "0",
};

hljs.registerLanguage("elixir", elixir);
hljs.registerLanguage("erlang", erlang);
hljs.configure({ classPrefix: "" });

const safeMarkdownHtml = (content: string) =>
  sanitizeHtml(marked.parse(content, { async: false }), {
    allowedTags: [
      "a",
      "blockquote",
      "br",
      "code",
      "del",
      "em",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hr",
      "img",
      "li",
      "ol",
      "p",
      "pre",
      "strong",
      "table",
      "tbody",
      "td",
      "th",
      "thead",
      "tr",
      "ul",
    ],
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt", "title"],
    },
    allowedSchemes: ["https"],
    allowedSchemesByTag: { a: ["https"], img: ["https"] },
  });

const PasteContent: FC<{ content: string; extension: string }> = ({ content, extension }) => {
  if (extension === "md") {
    return (
      <div class="break-word h-full w-full overflow-y-auto px-6 py-4 markdown">
        {raw(safeMarkdownHtml(content))}
      </div>
    );
  }

  const language = hljs.getLanguage(extension);
  if (!language) {
    return <pre class="break-word whitespace-pre-wrap px-6 py-4">{content}</pre>;
  }

  return (
    <pre class="break-word whitespace-pre-wrap px-6 py-4">
      <code class="hljs">{raw(hljs.highlight(content, { language: extension }).value)}</code>
    </pre>
  );
};

type Bindings = {
  DB: D1Database;
  ENVIRONMENT: string;
  PASTES: R2Bucket;
};
type AppContext = Context<{ Bindings: Bindings }>;
type User = typeof users.$inferSelect;
type Session = typeof sessions.$inferSelect;
type FormErrors = Record<string, string[]>;

const MAX_BODY_BYTES = 10_000_000;
const R2_THRESHOLD_BYTES = 1_000_000;
const SESSION_COOKIE = "__Host-katbin_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 60;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 32;
const FLASH_COOKIE = "__Host-katbin_flash";
const OWNERSHIP_ERROR = "You don't own this paste!";
const consonants = "bcdfghjklmnpqrstvwxyz";
const vowels = "aeiou";
const customIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
const reservedIds = new Set(["api", "assets", "edit", "pastes", "raw", "users", "v"]);

const pastePathSchema = z.object({ id: z.string().min(1).max(128) });
const pasteFormSchema = z.object({ "paste[content]": z.string().min(1).max(MAX_BODY_BYTES) });
const emailSchema = z.preprocess(
  (value) => (typeof value === "string" ? value : ""),
  z
    .string()
    .min(1, "can't be blank")
    .regex(/^[^\s]+@[^\s]+$/, "must have the @ sign and no spaces")
    .max(160, "should be at most 160 character(s)"),
);
const passwordSchema = z.preprocess(
  (value) => (typeof value === "string" ? value : ""),
  z
    .string()
    .min(1, "can't be blank")
    .min(8, "should be at least 8 character(s)")
    .max(80, "should be at most 80 character(s)"),
);
const registrationFormSchema = z.object({
  "user[email]": emailSchema,
  "user[password]": passwordSchema,
});
const loginFormSchema = z.object({
  "user[email]": z.preprocess((value) => (typeof value === "string" ? value : ""), z.string()),
  "user[password]": z.preprocess((value) => (typeof value === "string" ? value : ""), z.string()),
  "user[remember_me]": z.enum(["true"]).optional(),
});
const csrfFormSchema = z.object({ _csrf: z.string().min(1) });
const customIdSchema = z.string().regex(customIdPattern);

const isUrl = (value: string) => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.includes(".") &&
      !url.hostname.includes("katb.in")
    );
  } catch {
    return false;
  }
};

const pastePath = (value: string) => {
  const parsed = pastePathSchema.safeParse({ id: value });
  if (!parsed.success) return null;
  const [id, ...extensions] = parsed.data.id.split(".");
  if (!id) return null;
  return { id, fullId: parsed.data.id, extension: extensions.join(".") };
};

const dbFor = (env: Bindings) => drizzle(env.DB);
const now = () => Math.floor(Date.now() / 1000);

const encodeBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const decodeBase64Url = (value: string) => {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

const hashToken = async (token: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const sha256 = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const csrfToken = hashToken;

const sameValue = (left: string, right: string) => {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
};

const sameOrigin = (request: Request) => {
  const expected = new URL(request.url).origin;
  const origin = request.headers.get("Origin");
  const referer = request.headers.get("Referer");
  try {
    return (origin ?? (referer && new URL(referer).origin)) === expected;
  } catch {
    return false;
  }
};

const parseForm = async (request: Request) =>
  Object.fromEntries(new URLSearchParams(await request.text()));

const formErrors = (error: z.ZodError): FormErrors =>
  error.issues.reduce<FormErrors>((errors, issue) => {
    const field = issue.path[0];
    if (typeof field === "string") {
      const name = field.replace(/^user\[|\]$/g, "");
      (errors[name] ??= []).push(issue.message);
    }
    return errors;
  }, {});

const sessionFromToken = async (env: Bindings, token: string) =>
  dbFor(env)
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, await hashToken(token)), gt(sessions.expiresAt, now())))
    .get();

const createSession = async (env: Bindings, userId: number | null) => {
  const token = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const insertedAt = now();
  const session: Session = {
    tokenHash: await hashToken(token),
    userId,
    expiresAt: insertedAt + SESSION_MAX_AGE,
    insertedAt,
  };
  await dbFor(env).insert(sessions).values(session);
  return { token, session };
};

const setSessionCookie = (c: AppContext, token: string, remember = false) => {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: true,
    path: "/",
    ...(remember ? { maxAge: SESSION_MAX_AGE } : {}),
  });
};

const getCurrentUser = async (env: Bindings, session: Session | null) =>
  session?.userId
    ? ((await dbFor(env).select().from(users).where(eq(users.id, session.userId)).get()) ?? null)
    : null;

const sessionFromRequest = async (c: AppContext) => {
  const token = getCookie(c, SESSION_COOKIE);
  return { token, session: token ? ((await sessionFromToken(c.env, token)) ?? null) : null };
};

const ownershipError = (c: AppContext, id: string) => {
  setCookie(c, FLASH_COOKIE, OWNERSHIP_ERROR, {
    httpOnly: true,
    sameSite: "Lax",
    secure: true,
    path: "/",
  });
  return c.redirect(`/${encodeURIComponent(id)}`, 302);
};

const takeFlash = (c: AppContext) => {
  const flash = getCookie(c, FLASH_COOKIE);
  if (flash)
    deleteCookie(c, FLASH_COOKIE, { httpOnly: true, sameSite: "Lax", secure: true, path: "/" });
  return flash;
};

const hashPassword = (password: string) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 32 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${encodeBase64Url(salt)}$${encodeBase64Url(key)}`;
};

const verifyScrypt = (password: string, stored: string) => {
  const [, n, r, p, encodedSalt, encodedKey] = stored.split("$");
  if (
    Number(n) !== SCRYPT_N ||
    Number(r) !== SCRYPT_R ||
    Number(p) !== SCRYPT_P ||
    !encodedSalt ||
    !encodedKey
  ) {
    return false;
  }
  try {
    const key = scryptSync(password, decodeBase64Url(encodedSalt), SCRYPT_KEY_LENGTH, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 32 * 1024 * 1024,
    });
    const expected = decodeBase64Url(encodedKey);
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
};

const verifyPassword = async (password: string, stored: string) => {
  if (stored.startsWith("scrypt$")) return verifyScrypt(password, stored);
  if (stored.startsWith("$2")) return bcrypt.compare(password, stored);
  return false;
};

const Header: FC<{ csrf?: string; user?: User | null }> = ({ csrf, user }) => (
  <header class="flex w-full items-center justify-between px-6 py-3">
    <a href="/">
      <span class="text-xl font-semibold tracking-tight">
        <span class="text-amber">&lt;Kat</span>bin/&gt;
      </span>
    </a>
    <nav aria-label="Account navigation">
      {user ? (
        <div class="flex items-center gap-4">
          <span class="text-amber">{user.email}</span>
          <a href="/pastes">My Pastes</a>
          {csrf ? (
            <form action="/users/log_out" method="post" data-method="delete">
              <input type="hidden" name="_csrf" value={csrf} />
              <button type="submit">Log out</button>
            </form>
          ) : null}
        </div>
      ) : (
        <ul class="flex gap-4">
          <li>
            <a href="/users/register">Register</a>
          </li>
          <li>
            <a href="/users/log_in">Log in</a>
          </li>
        </ul>
      )}
    </nav>
  </header>
);

const Footer: FC = () => (
  <footer class="bg-header px-4 py-1 text-xs font-bold text-amber sm:text-base">
    <div class="flex justify-between">
      <a href="https://kat.bio">© 2026 SphericalKat</a>
      <a href="https://github.com/sphericalkat/katbin">Fork me!</a>
    </div>
  </footer>
);

const Home: FC<{ csrf: string; user: User | null }> = ({ csrf, user }) => (
  <>
    <Header csrf={csrf} user={user} />
    <main class="flex h-full max-h-full w-full flex-col overflow-hidden bg-light-grey">
      <form class="relative flex h-full w-full flex-col" action="/" method="post">
        <input type="hidden" name="_csrf" value={csrf} />
        <div class="h-full w-full">
          <textarea
            class="h-full w-full resize-none bg-light-grey px-6 py-4 font-bold outline-none"
            name="paste[content]"
            placeholder="> Paste, save, share! (Pasting just a URL will shorten it!)"
            aria-label="Paste content"
          />
          <div class="absolute right-0 top-0 p-4">
            {user ? (
              <input
                class="mr-2 px-2 py-1 text-black outline-none"
                name="paste[custom_url]"
                placeholder="Custom URL"
                maxLength={64}
                pattern="[A-Za-z0-9_-]{1,64}"
              />
            ) : null}
            <button type="submit" aria-label="Save paste">
              <svg
                class="h-6 w-6 cursor-pointer fill-current text-white hover:text-amber"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M17.6 3.6c-.4-.4-.9-.6-1.4-.6H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7.8c0-.5-.2-1-.6-1.4l-2.8-2.8zM12 19c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3zm1-10H7c-1.1 0-2-.9-2-2s.9-2 2-2h6c1.1 0 2 .9 2 2s-.9 2-2 2z" />
              </svg>
            </button>
          </div>
        </div>
      </form>
    </main>
    <Footer />
  </>
);

const RegistrationPage: FC<{ csrf: string; email?: string; errors?: FormErrors }> = ({
  csrf,
  email = "",
  errors = {},
}) => (
  <>
    <Header />
    <main class="flex h-full w-full flex-col items-center justify-center">
      <h1 class="pt-4 text-4xl font-bold text-amber">Register</h1>
      <form
        action="/users/register"
        method="post"
        class="m-auto flex h-full flex-col items-start justify-center"
      >
        <input type="hidden" name="_csrf" value={csrf} />
        {Object.keys(errors).length ? (
          <div class="alert alert-danger">
            <p>Oops, something went wrong! Please check the errors below.</p>
          </div>
        ) : null}
        <label class="flex w-full flex-col" htmlFor="email">
          Email
          <input
            id="email"
            name="user[email]"
            type="email"
            value={email}
            class="px-2 py-1 text-black outline-none"
            required
          />
          {errors.email?.map((error) => (
            <span class="text-red-600">{error}</span>
          ))}
        </label>
        <label class="mt-2 flex w-full flex-col" htmlFor="password">
          Password
          <input
            id="password"
            name="user[password]"
            type="password"
            class="px-2 py-1 text-black outline-none"
            required
          />
          {errors.password?.map((error) => (
            <span class="text-red-600">{error}</span>
          ))}
        </label>
        <button type="submit" class="mt-4 rounded-sm bg-amber px-2 py-1">
          Sign up
        </button>
      </form>
      <p class="mb-4 text-amber">
        <a href="/users/log_in">Log in</a> <span>|</span>{" "}
        <a href="/users/reset_password">Forgot password?</a>
      </p>
    </main>
    <Footer />
  </>
);

const LoginPage: FC<{ csrf: string; error?: string }> = ({ csrf, error }) => (
  <>
    <Header />
    <main class="flex h-full w-full flex-col items-center justify-center">
      <h1 class="pt-4 text-4xl font-bold text-amber">Log in</h1>
      <form
        action="/users/log_in"
        method="post"
        class="m-auto flex h-full flex-col items-start justify-center"
      >
        <input type="hidden" name="_csrf" value={csrf} />
        {error ? (
          <div class="alert alert-danger">
            <p>{error}</p>
          </div>
        ) : null}
        <label class="flex w-full flex-col" htmlFor="login-email">
          Email
          <input
            id="login-email"
            name="user[email]"
            type="email"
            class="px-2 py-1 text-black outline-none"
            required
          />
        </label>
        <label class="mt-2 flex w-full flex-col" htmlFor="login-password">
          Password
          <input
            id="login-password"
            name="user[password]"
            type="password"
            class="px-2 py-1 text-black outline-none"
            required
          />
        </label>
        <label class="mt-2 flex w-full items-center justify-center" htmlFor="remember-me">
          <input
            id="remember-me"
            name="user[remember_me]"
            value="true"
            type="checkbox"
            class="mr-2 outline-none"
          />
          Keep me logged in for 60 days
        </label>
        <button type="submit" class="mt-4 rounded-sm bg-amber px-2 py-1">
          Log in
        </button>
      </form>
      <p class="mb-4 text-amber">
        <a href="/users/register">Register</a> |{" "}
        <a href="/users/reset_password">Forgot your password?</a>
      </p>
    </main>
    <Footer />
  </>
);

const PastePage: FC<{
  id: string;
  content: string;
  extension: string;
  csrf?: string;
  user?: User | null;
  showEdit?: boolean;
  error?: string;
}> = ({ id, content, extension, csrf, user, showEdit, error }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{id} | Katbin</title>
      <link rel="stylesheet" href={stylesheetUrl} />
      <script type="module" src={clientUrl} />
    </head>
    <body class="flex h-full flex-col">
      <Header csrf={csrf} user={user} />
      <main class="h-full w-full overflow-y-auto bg-light-grey">
        {error === OWNERSHIP_ERROR ? (
          <p class="alert alert-danger">{raw(OWNERSHIP_ERROR)}</p>
        ) : error ? (
          <p class="alert alert-danger">{error}</p>
        ) : null}
        {showEdit ? (
          <a class="absolute right-0 top-0 p-4" href={`/edit/${id}`}>
            Edit
          </a>
        ) : null}
        <PasteContent content={content} extension={extension} />
      </main>
      <Footer />
    </body>
  </html>
);

const PastesPage: FC<{ csrf: string; user: User; pastes: Array<{ id: string }> }> = ({
  csrf,
  user,
  pastes,
}) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>My Pastes | Katbin</title>
      <link rel="stylesheet" href={stylesheetUrl} />
      <script type="module" src={clientUrl} />
    </head>
    <body class="flex h-full flex-col">
      <Header csrf={csrf} user={user} />
      <main class="flex h-full w-full flex-col overflow-hidden bg-light-grey">
        <ul class="h-full w-full overflow-y-auto px-6 py-4">
          {pastes.map((paste) => (
            <li>
              <a href={`/v/${paste.id}`}>https://katb.in/v/{paste.id}</a>
            </li>
          ))}
        </ul>
      </main>
      <Footer />
    </body>
  </html>
);

const EditPage: FC<{ csrf: string; user: User; paste: { id: string; content: string } }> = ({
  csrf,
  user,
  paste,
}) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Edit {paste.id} | Katbin</title>
      <link rel="stylesheet" href={stylesheetUrl} />
      <script type="module" src={clientUrl} />
    </head>
    <body class="flex h-full flex-col">
      <Header csrf={csrf} user={user} />
      <main class="flex h-full w-full flex-col overflow-hidden bg-light-grey">
        <form
          class="relative flex h-full w-full flex-col"
          action={`/${paste.id}`}
          method="post"
          data-method="patch"
        >
          <input type="hidden" name="_csrf" value={csrf} />
          <textarea
            class="h-full w-full resize-none bg-light-grey px-6 py-4 font-bold outline-none"
            name="paste[content]"
            aria-label="Paste content"
          >
            {paste.content}
          </textarea>
          <button class="absolute right-0 top-0 p-4" type="submit">
            Save
          </button>
        </form>
      </main>
      <Footer />
    </body>
  </html>
);

export const app = new Hono<{ Bindings: Bindings }>();

app.use("*", async (c, next) => {
  await next();
  const headers = new Headers(c.res.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  c.res = new Response(c.res.body, { headers, status: c.res.status, statusText: c.res.statusText });
});

app.get("/", async (c) => {
  let token = getCookie(c, SESSION_COOKIE);
  let session = token ? await sessionFromToken(c.env, token) : null;
  if (!session) {
    const created = await createSession(c.env, null);
    token = created.token;
    session = created.session;
    setSessionCookie(c, token);
  }
  const user = await getCurrentUser(c.env, session);
  return c.html(
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Katbin</title>
        <meta
          name="description"
          content="Paste, save, share! A pastebin and URL shortener for all your needs."
        />
        <link rel="icon" href="/favicon.ico" />
        <link rel="stylesheet" href={stylesheetUrl} />
        <script type="module" src={clientUrl} />
      </head>
      <body class="flex h-full flex-col">
        <Home csrf={await csrfToken(token!)} user={user} />
      </body>
    </html>,
  );
});

app.get("/users/register", async (c) => {
  let token = getCookie(c, SESSION_COOKIE);
  let session = token ? await sessionFromToken(c.env, token) : null;
  if (session?.userId) return c.redirect("/", 302);
  if (!session) {
    const created = await createSession(c.env, null);
    token = created.token;
    session = created.session;
    setSessionCookie(c, token);
  }
  return c.html(
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Register | Katbin</title>
        <link rel="stylesheet" href={stylesheetUrl} />
      </head>
      <body class="flex h-full flex-col">
        <RegistrationPage csrf={await csrfToken(token!)} />
      </body>
    </html>,
  );
});

app.post("/users/register", async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: "Forbidden" }, 403);
  const token = getCookie(c, SESSION_COOKIE);
  const session = token ? await sessionFromToken(c.env, token) : null;
  if (!token || !session) return c.json({ error: "Forbidden" }, 403);
  const form = await parseForm(c.req.raw);
  const csrf = csrfFormSchema.safeParse(form);
  if (!csrf.success || !sameValue(csrf.data._csrf, await csrfToken(token)))
    return c.json({ error: "Forbidden" }, 403);
  const parsed = registrationFormSchema.safeParse(form);
  if (!parsed.success)
    return c.html(
      <RegistrationPage csrf={await csrfToken(token)} errors={formErrors(parsed.error)} />,
    );
  const email = parsed.data["user[email]"];
  const normalizedEmail = email.toLowerCase();
  const db = dbFor(c.env);
  if (
    await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.normalizedEmail, normalizedEmail))
      .get()
  )
    return c.html(
      <RegistrationPage
        csrf={await csrfToken(token)}
        email={email}
        errors={{ email: ["has already been taken"] }}
      />,
    );
  try {
    await db.insert(users).values({
      email,
      normalizedEmail,
      hashedPassword: hashPassword(parsed.data["user[password]"]),
    });
  } catch (error) {
    if (String(error).toLowerCase().includes("unique"))
      return c.html(
        <RegistrationPage
          csrf={await csrfToken(token)}
          email={email}
          errors={{ email: ["has already been taken"] }}
        />,
      );
    throw error;
  }
  const user = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.normalizedEmail, normalizedEmail))
    .get();
  if (!user) throw new Error("registered user was not returned");
  const created = await createSession(c.env, user.id);
  await db.delete(sessions).where(eq(sessions.tokenHash, await hashToken(token)));
  setSessionCookie(c, created.token);
  return c.redirect("/users/confirm", 303);
});

app.get("/users/log_in", async (c) => {
  let token = getCookie(c, SESSION_COOKIE);
  let session = token ? await sessionFromToken(c.env, token) : null;
  if (session?.userId) return c.redirect("/", 302);
  if (!session) {
    const created = await createSession(c.env, null);
    token = created.token;
    session = created.session;
    setSessionCookie(c, token);
  }
  return c.html(
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Log in | Katbin</title>
        <link rel="stylesheet" href={stylesheetUrl} />
      </head>
      <body class="flex h-full flex-col">
        <LoginPage csrf={await csrfToken(token!)} />
      </body>
    </html>,
  );
});

app.post("/users/log_in", async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: "Forbidden" }, 403);
  const token = getCookie(c, SESSION_COOKIE);
  const session = token ? await sessionFromToken(c.env, token) : null;
  if (!token || !session) return c.json({ error: "Forbidden" }, 403);
  const form = await parseForm(c.req.raw);
  const csrf = csrfFormSchema.safeParse(form);
  if (!csrf.success || !sameValue(csrf.data._csrf, await csrfToken(token)))
    return c.json({ error: "Forbidden" }, 403);
  const parsed = loginFormSchema.safeParse(form);
  if (!parsed.success)
    return c.html(<LoginPage csrf={await csrfToken(token)} error="Invalid email or password" />);
  const normalizedEmail = parsed.data["user[email]"].toLowerCase();
  const db = dbFor(c.env);
  const user = await db
    .select()
    .from(users)
    .where(eq(users.normalizedEmail, normalizedEmail))
    .get();
  const valid = user
    ? await verifyPassword(parsed.data["user[password]"], user.hashedPassword)
    : false;
  if (!user || !valid)
    return c.html(<LoginPage csrf={await csrfToken(token)} error="Invalid email or password" />);
  if (user.hashedPassword.startsWith("$2"))
    await db
      .update(users)
      .set({ hashedPassword: hashPassword(parsed.data["user[password]"]) })
      .where(eq(users.id, user.id));
  const created = await createSession(c.env, user.id);
  await db.delete(sessions).where(eq(sessions.tokenHash, await hashToken(token)));
  setSessionCookie(c, created.token, parsed.data["user[remember_me]"] === "true");
  return c.redirect("/", 303);
});

app.delete("/users/log_out", async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: "Forbidden" }, 403);
  const token = getCookie(c, SESSION_COOKIE);
  const session = token ? await sessionFromToken(c.env, token) : null;
  if (session) {
    const parsed = csrfFormSchema.safeParse(await parseForm(c.req.raw));
    if (!parsed.success || !sameValue(parsed.data._csrf, await csrfToken(token!)))
      return c.json({ error: "Forbidden" }, 403);
    await dbFor(c.env)
      .delete(sessions)
      .where(eq(sessions.tokenHash, await hashToken(token!)));
  }
  deleteCookie(c, SESSION_COOKIE, { httpOnly: true, sameSite: "Lax", secure: true, path: "/" });
  return c.redirect("/", 303);
});

app.post("/", async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: "Forbidden" }, 403);
  const token = getCookie(c, SESSION_COOKIE);
  const session = token ? await sessionFromToken(c.env, token) : null;
  if (!token || !session) return c.json({ error: "Forbidden" }, 403);
  const contentLength = Number(c.req.header("Content-Length"));
  if (contentLength > MAX_BODY_BYTES) return c.json({ error: "Payload too large" }, 413);
  const body = await c.req.raw.arrayBuffer();
  if (body.byteLength > MAX_BODY_BYTES) return c.json({ error: "Payload too large" }, 413);
  const form = Object.fromEntries(new URLSearchParams(new TextDecoder().decode(body)));
  const csrf = csrfFormSchema.safeParse(form);
  if (!csrf.success || !sameValue(csrf.data._csrf, await csrfToken(token)))
    return c.json({ error: "Forbidden" }, 403);
  const parsed = pasteFormSchema.safeParse(form);
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  const customId = typeof form["paste[custom_url]"] === "string" ? form["paste[custom_url]"] : "";
  let id = generateId();
  if (customId) {
    if (
      !session.userId ||
      !customIdSchema.safeParse(customId).success ||
      reservedIds.has(customId.toLowerCase())
    ) {
      return c.json({ error: "Invalid custom ID" }, 400);
    }
    if (
      await dbFor(c.env).select({ id: pastes.id }).from(pastes).where(eq(pastes.id, customId)).get()
    ) {
      return c.json({ error: "Custom ID already taken" }, 400);
    }
    id = customId;
  }
  const content = parsed.data["paste[content]"];
  const urlPaste = isUrl(content);
  const contentBytes = new TextEncoder().encode(content);
  const contentSha256 = await sha256(contentBytes);
  const useR2 = contentBytes.byteLength > R2_THRESHOLD_BYTES;
  let uploaded = false;
  try {
    if (useR2) {
      await c.env.PASTES.put(id, contentBytes);
      uploaded = true;
    }
    await dbFor(c.env)
      .insert(pastes)
      .values({
        id,
        content: useR2 ? "" : content,
        isUrl: urlPaste,
        ownerId: session.userId,
        storageType: useR2 ? "r2" : "d1",
        storageKey: useR2 ? id : null,
        contentLengthBytes: contentBytes.byteLength,
        contentSha256,
      });
  } catch (error) {
    if (uploaded) await c.env.PASTES.delete(id);
    if (String(error).toLowerCase().includes("unique"))
      return c.json({ error: "Custom ID already taken" }, 400);
    throw error;
  }
  return c.redirect(`${urlPaste ? "/v" : ""}/${id}`, 303);
});

const findPaste = async (c: AppContext, value: string) => {
  const path = pastePath(value);
  if (!path) return null;
  const findById = (id: string) =>
    dbFor(c.env)
      .select({
        id: pastes.id,
        content: pastes.content,
        isUrl: pastes.isUrl,
        ownerId: pastes.ownerId,
        storageType: pastes.storageType,
        storageKey: pastes.storageKey,
      })
      .from(pastes)
      .where(eq(pastes.id, id))
      .get();
  const paste =
    (await findById(path.id)) ??
    (path.fullId !== path.id ? await findById(path.fullId) : undefined);
  if (!paste) return null;
  if (paste.storageType === "r2") {
    if (!paste.storageKey) return null;
    const object = await c.env.PASTES.get(paste.storageKey);
    if (!object) return null;
    return {
      paste: { ...paste, content: await object.text() },
      extension: path.extension,
    };
  }
  return { paste, extension: path.extension };
};

app.get("/pastes", async (c) => {
  const { token, session } = await sessionFromRequest(c);
  const user = await getCurrentUser(c.env, session);
  if (!token || !session?.userId || !user) return c.redirect("/users/log_in", 302);
  const ownedPastes = await dbFor(c.env)
    .select({ id: pastes.id })
    .from(pastes)
    .where(eq(pastes.ownerId, user.id))
    .all();
  return c.html(<PastesPage csrf={await csrfToken(token)} user={user} pastes={ownedPastes} />);
});

app.get("/edit/:id", async (c) => {
  const value = c.req.param("id");
  const result = await findPaste(c, value);
  const { token, session } = await sessionFromRequest(c);
  const user = await getCurrentUser(c.env, session);
  if (!result) return c.text("Not found", 404);
  if (!token || !user || result.paste.ownerId !== user.id) return ownershipError(c, value);
  return c.html(<EditPage csrf={await csrfToken(token)} user={user} paste={result.paste} />);
});

app.on(["PATCH", "PUT"], "/:id", async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: "Forbidden" }, 403);
  const { token, session } = await sessionFromRequest(c);
  if (!token || !session) return c.json({ error: "Forbidden" }, 403);
  const contentLength = Number(c.req.header("Content-Length"));
  if (contentLength > MAX_BODY_BYTES) return c.json({ error: "Payload too large" }, 413);
  const form = await parseForm(c.req.raw);
  const csrf = csrfFormSchema.safeParse(form);
  if (!csrf.success || !sameValue(csrf.data._csrf, await csrfToken(token)))
    return c.json({ error: "Forbidden" }, 403);
  const parsed = pasteFormSchema.safeParse(form);
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  const value = c.req.param("id");
  const result = await findPaste(c, value);
  const user = await getCurrentUser(c.env, session);
  if (!result) return c.text("Not found", 404);
  if (!user || result.paste.ownerId !== user.id) return ownershipError(c, value);

  const content = parsed.data["paste[content]"];
  const contentBytes = new TextEncoder().encode(content);
  if (contentBytes.byteLength > MAX_BODY_BYTES) return c.json({ error: "Payload too large" }, 413);
  const urlPaste = isUrl(content);
  const useR2 = contentBytes.byteLength > R2_THRESHOLD_BYTES;
  const oldStorageKey = result.paste.storageKey;
  const newStorageKey = useR2
    ? `${result.paste.id}-${encodeBase64Url(crypto.getRandomValues(new Uint8Array(12)))}`
    : null;
  let uploaded = false;
  try {
    if (newStorageKey) {
      await c.env.PASTES.put(newStorageKey, contentBytes);
      uploaded = true;
    }
    await dbFor(c.env)
      .update(pastes)
      .set({
        content: useR2 ? "" : content,
        isUrl: urlPaste,
        storageType: useR2 ? "r2" : "d1",
        storageKey: newStorageKey,
        contentLengthBytes: contentBytes.byteLength,
        contentSha256: await sha256(contentBytes),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(pastes.id, result.paste.id));
  } catch (error) {
    if (uploaded && newStorageKey) await c.env.PASTES.delete(newStorageKey);
    throw error;
  }
  if (oldStorageKey && oldStorageKey !== newStorageKey) {
    try {
      await c.env.PASTES.delete(oldStorageKey);
    } catch (error) {
      console.error(
        JSON.stringify({ error: String(error), message: "old paste object cleanup failed" }),
      );
    }
  }
  return c.redirect(`${urlPaste ? "/v" : ""}/${result.paste.id}`, 303);
});

app.get("/:id/raw", async (c) => {
  const result = await findPaste(c, c.req.param("id"));
  if (!result) return c.text("Not found", 404);
  return c.text(result.paste.content, 200, { "Content-Type": "text/plain; charset=UTF-8" });
});

app.get("/v/:id", async (c) => {
  const result = await findPaste(c, c.req.param("id"));
  if (!result) return c.text("Not found", 404);
  const { token, session } = await sessionFromRequest(c);
  const user = await getCurrentUser(c.env, session);
  return c.html(
    <PastePage
      id={result.paste.id}
      content={result.paste.content}
      extension={result.extension}
      csrf={token && session ? await csrfToken(token) : undefined}
      user={user}
      showEdit={user?.id === result.paste.ownerId}
      error={takeFlash(c)}
    />,
  );
});

app.get("/:id", async (c) => {
  const result = await findPaste(c, c.req.param("id"));
  if (!result) return c.text("Not found", 404);
  if (result.paste.isUrl) return c.redirect(result.paste.content.replace(/[\r\n]/g, ""), 302);
  const { token, session } = await sessionFromRequest(c);
  const user = await getCurrentUser(c.env, session);
  return c.html(
    <PastePage
      id={result.paste.id}
      content={result.paste.content}
      extension={result.extension}
      csrf={token && session ? await csrfToken(token) : undefined}
      user={user}
      showEdit={user?.id === result.paste.ownerId}
      error={takeFlash(c)}
    />,
  );
});

function generateId() {
  const startsWithConsonant = crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0;
  return Array.from({ length: 11 }, (_, index) => {
    const consonant = (index % 2 === 0) === startsWithConsonant;
    const alphabet = consonant ? consonants : vowels;
    return alphabet[crypto.getRandomValues(new Uint8Array(1))[0] % alphabet.length];
  }).join("");
}

app.onError((error, c) => {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      message: "request failed",
      path: new URL(c.req.url).pathname,
    }),
  );
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
