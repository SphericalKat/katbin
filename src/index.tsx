import { Hono } from "hono";
import type { FC } from "hono/jsx";

import clientUrl from "./client.ts?url";
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

const Home: FC = () => (
  <>
    <Header />
    <main class="flex h-full max-h-full w-full flex-col overflow-hidden bg-light-grey">
      <form class="relative flex h-full w-full flex-col" action="/" method="post">
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

app.get("/", (c) =>
  c.html(
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
        <Home />
      </body>
    </html>,
  ),
);

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
