import { Hono } from "hono";
import type { FC } from "hono/jsx";
import { getCookie, setCookie } from "hono/cookie";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { z } from "zod";

import clientUrl from "./client.ts?url";
import { pastes } from "./db/schema";
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

type Bindings = {
  DB: D1Database;
  ENVIRONMENT: string;
  PASTES: R2Bucket;
};

const MAX_BODY_BYTES = 10_000_000;
const SESSION_COOKIE = "__Host-katbin_session";
const consonants = "bcdfghjklmnpqrstvwxyz";
const vowels = "aeiou";
const idSchema = z.object({
  id: z
    .string()
    .regex(
      new RegExp(
        `^(?:[${consonants}][${vowels}]){5}[${consonants}]?$|^(?:[${vowels}][${consonants}]){5}[${vowels}]?$`,
      ),
    ),
});
const formSchema = z.object({
  "paste[content]": z.string().min(1).max(MAX_BODY_BYTES),
});

const sessionId = () => crypto.randomUUID();

const csrfToken = async (session: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(session));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
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

const generateId = () => {
  const startsWithConsonant = crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0;
  return Array.from({ length: 11 }, (_, index) => {
    const consonant = (index % 2 === 0) === startsWithConsonant;
    const alphabet = consonant ? consonants : vowels;
    return alphabet[crypto.getRandomValues(new Uint8Array(1))[0] % alphabet.length];
  }).join("");
};

const Header: FC = () => (
  <header class="flex w-full items-center justify-between px-6 py-3">
    <a href="/">
      <span class="text-xl font-semibold tracking-tight">
        <span class="text-amber">&lt;Kat</span>bin/&gt;
      </span>
    </a>
    <nav aria-label="Account navigation">
      <ul class="flex gap-4">
        <li>
          <a href="/users/register">Register</a>
        </li>
        <li>
          <a href="/users/log_in">Log in</a>
        </li>
      </ul>
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

const Home: FC<{ csrf: string }> = ({ csrf }) => (
  <>
    <Header />
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

export const app = new Hono<{
  Bindings: Bindings;
}>();

app.use("*", async (c, next) => {
  await next();
  const headers = new Headers(c.res.headers);
  for (const [name, value] of Object.entries(securityHeaders)) {
    headers.set(name, value);
  }
  c.res = new Response(c.res.body, {
    headers,
    status: c.res.status,
    statusText: c.res.statusText,
  });
});

app.get("/", async (c) => {
  const session = getCookie(c, SESSION_COOKIE) ?? sessionId();
  if (!getCookie(c, SESSION_COOKIE)) {
    setCookie(c, SESSION_COOKIE, session, {
      httpOnly: true,
      sameSite: "Lax",
      secure: true,
      path: "/",
    });
  }
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
        <Home csrf={await csrfToken(session)} />
      </body>
    </html>,
  );
});

app.post("/", async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: "Forbidden" }, 403);
  const session = getCookie(c, SESSION_COOKIE);
  if (!session) return c.json({ error: "Forbidden" }, 403);
  const contentLength = Number(c.req.header("Content-Length"));
  if (contentLength > MAX_BODY_BYTES) return c.json({ error: "Payload too large" }, 413);
  const body = await c.req.raw.arrayBuffer();
  if (body.byteLength > MAX_BODY_BYTES) return c.json({ error: "Payload too large" }, 413);
  const form = Object.fromEntries(new URLSearchParams(new TextDecoder().decode(body)));
  const csrf = await csrfToken(session);
  if (form._csrf !== csrf) return c.json({ error: "Forbidden" }, 403);
  const parsed = formSchema.safeParse(form);
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

  const id = generateId();
  const content = parsed.data["paste[content]"];
  await drizzle(c.env.DB)
    .insert(pastes)
    .values({
      id,
      content,
      contentLengthBytes: new TextEncoder().encode(content).byteLength,
    });
  return c.redirect(`/${id}`, 303);
});

app.get("/:id/raw", async (c) => {
  const params = idSchema.safeParse(c.req.param());
  if (!params.success) return c.text("Not found", 404);
  const paste = await drizzle(c.env.DB)
    .select({ content: pastes.content })
    .from(pastes)
    .where(eq(pastes.id, params.data.id))
    .get();
  return paste
    ? c.text(paste.content, 200, { "Content-Type": "text/plain; charset=UTF-8" })
    : c.text("Not found", 404);
});

app.get("/:id", async (c) => {
  const params = idSchema.safeParse(c.req.param());
  if (!params.success) return c.text("Not found", 404);
  const paste = await drizzle(c.env.DB)
    .select({ id: pastes.id, content: pastes.content })
    .from(pastes)
    .where(eq(pastes.id, params.data.id))
    .get();
  if (!paste) return c.text("Not found", 404);
  return c.html(
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{paste.id} | Katbin</title>
        <link rel="stylesheet" href={stylesheetUrl} />
      </head>
      <body class="flex h-full flex-col">
        <Header />
        <main class="h-full w-full overflow-y-auto bg-light-grey">
          <pre class="break-word whitespace-pre-wrap px-6 py-4">{paste.content}</pre>
        </main>
        <Footer />
      </body>
    </html>,
  );
});

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
