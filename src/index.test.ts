import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { scryptSync } from "node:crypto";

import { app } from "./index";

describe("Katbin shell", () => {
  it("serves the home page with secure headers and the existing navigation", async () => {
    const response = await app.request("https://katb.in/", undefined, {
      DB: new TestDatabase(),
    } as never);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("content-security-policy")).toContain("img-src 'self' https:");
    expect(response.headers.get("content-security-policy")).not.toContain("unsafe-inline");
    expect(body).toContain("&lt;Kat");
    expect(body).toContain("/users/register");
    expect(body).toContain("/users/log_in");
    expect(body).toContain("Paste, save, share!");
  });

  it("creates, displays, and returns a paste through request routes", async () => {
    const db = new TestDatabase();
    const home = await app.request("https://katb.in/", { method: "GET" }, { DB: db } as never);
    const cookie = home.headers.get("set-cookie")!.split(";", 1)[0];
    const csrf = (await home.text()).match(/name="_csrf" value="([^"]+)"/)![1];
    const content = '<script>alert("escaped")</script>';

    const created = await app.request(
      "https://katb.in/",
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: "https://katb.in",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ "paste[content]": content, _csrf: csrf }),
      },
      { DB: db } as never,
    );

    expect(created.status).toBe(303);
    const id = new URL(created.headers.get("location")!, "https://katb.in").pathname.slice(1);
    expect(id).toMatch(
      /^(?:(?:[bcdfghjklmnpqrstvwxyz][aeiou]){5}[bcdfghjklmnpqrstvwxyz]|(?:[aeiou][bcdfghjklmnpqrstvwxyz]){5}[aeiou])$/,
    );
    const display = await app.request(`https://katb.in/${id}`, undefined, { DB: db } as never);
    const raw = await app.request(`https://katb.in/${id}/raw`, undefined, { DB: db } as never);
    expect(display.status).toBe(200);
    expect(await display.text()).toContain(
      "&lt;script&gt;alert(&quot;escaped&quot;)&lt;/script&gt;",
    );
    expect(raw.status).toBe(200);
    expect(await raw.text()).toBe(content);
  });

  it("rejects missing pastes and invalid input", async () => {
    const db = new TestDatabase();
    expect(
      (await app.request("https://katb.in/bababababab", undefined, { DB: db } as never)).status,
    ).toBe(404);
    expect(
      (await app.request("https://katb.in/not-a-paste", undefined, { DB: db } as never)).status,
    ).toBe(404);
    const home = await app.request("https://katb.in/", undefined, { DB: db } as never);
    const cookie = home.headers.get("set-cookie")!.split(";", 1)[0];
    const csrf = (await home.text()).match(/name="_csrf" value="([^"]+)"/)![1];
    const response = await app.request(
      "https://katb.in/",
      {
        method: "POST",
        headers: {
          Origin: "https://katb.in",
          Cookie: cookie,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ "paste[content]": "", _csrf: csrf }),
      },
      { DB: db } as never,
    );
    expect(response.status).toBe(400);
  });

  it("separates URL redirects, previews, text pastes, extensions, and mailto", async () => {
    const db = new TestDatabase();
    const home = await app.request("https://katb.in/", undefined, { DB: db } as never);
    const cookie = cookieFrom(home)!;
    const csrf = csrfFrom(await home.text());
    const create = (content: string) =>
      app.request(
        "https://katb.in/",
        formRequest(cookie, { _csrf: csrf, "paste[content]": content }),
        { DB: db } as never,
      );

    const urlPaste = await create("https://example.com/docs");
    const textPaste = await create("plain text");
    const mailtoPaste = await create("mailto:user@example.com");
    const urlId = new URL(urlPaste.headers.get("location")!, "https://katb.in").pathname.slice(3);
    const textId = new URL(textPaste.headers.get("location")!, "https://katb.in").pathname.slice(1);
    const mailtoId = new URL(
      mailtoPaste.headers.get("location")!,
      "https://katb.in",
    ).pathname.slice(1);

    expect(urlPaste.status).toBe(303);
    expect(urlPaste.headers.get("location")).toBe(`/v/${urlId}`);
    expect(textPaste.headers.get("location")).toBe(`/${textId}`);
    expect(mailtoPaste.headers.get("location")).toBe(`/${mailtoId}`);

    const redirect = await app.request(`https://katb.in/${urlId}`, undefined, { DB: db } as never);
    const urlPreview = await app.request(`https://katb.in/v/${urlId}`, undefined, {
      DB: db,
    } as never);
    const textPreview = await app.request(`https://katb.in/v/${textId}`, undefined, {
      DB: db,
    } as never);
    const textDisplay = await app.request(`https://katb.in/${textId}.md`, undefined, {
      DB: db,
    } as never);
    const textRaw = await app.request(`https://katb.in/${textId}.md/raw`, undefined, {
      DB: db,
    } as never);
    const mailtoDisplay = await app.request(`https://katb.in/${mailtoId}`, undefined, {
      DB: db,
    } as never);

    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("https://example.com/docs");
    expect(urlPreview.status).toBe(200);
    expect(await urlPreview.text()).toContain("https://example.com/docs");
    expect(textPreview.status).toBe(200);
    expect(await textPreview.text()).toContain("plain text");
    expect(textDisplay.status).toBe(200);
    expect(await textDisplay.text()).toContain("plain text");
    expect(textRaw.status).toBe(200);
    expect(await textRaw.text()).toBe("plain text");
    expect(mailtoDisplay.status).toBe(200);
    expect(await mailtoDisplay.text()).toContain("mailto:user@example.com");
  });
});

describe("account authentication", () => {
  it("registers with Phoenix validation and logs in before confirmation", async () => {
    const db = new TestDatabase();
    const page = await app.request("https://katb.in/users/register", undefined, {
      DB: db,
    } as never);
    const cookie = cookieFrom(page)!;
    const csrf = csrfFrom(await page.text());
    const response = await app.request(
      "https://katb.in/users/register",
      formRequest(cookie, {
        _csrf: csrf,
        "user[email]": "Original@Example.com",
        "user[password]": "password",
      }),
      { DB: db } as never,
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/users/confirm");
    expect(db.user("original@example.com")?.email).toBe("Original@Example.com");
  });

  it("logs in case-insensitively and upgrades bcrypt after success", async () => {
    const db = new TestDatabase();
    await db.addUser("Original@Example.com", "password", true);
    const page = await app.request("https://katb.in/users/log_in", undefined, { DB: db } as never);
    const cookie = cookieFrom(page)!;
    const csrf = csrfFrom(await page.text());
    const response = await app.request(
      "https://katb.in/users/log_in",
      formRequest(cookie, {
        _csrf: csrf,
        "user[email]": "ORIGINAL@EXAMPLE.COM",
        "user[password]": "password",
      }),
      { DB: db } as never,
    );

    expect(response.status).toBe(303);
    expect(db.user("original@example.com")?.hashed_password).toMatch(/^scrypt\$/);
    expect(cookieFrom(response)).not.toBe(cookie);
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
  });

  it("rejects invalid credentials without changing the session", async () => {
    const db = new TestDatabase();
    await db.addUser("user@example.com", "password", true);
    const page = await app.request("https://katb.in/users/log_in", undefined, { DB: db } as never);
    const cookie = cookieFrom(page)!;
    const response = await app.request(
      "https://katb.in/users/log_in",
      formRequest(cookie, {
        _csrf: csrfFrom(await page.text()),
        "user[email]": "user@example.com",
        "user[password]": "wrong",
      }),
      { DB: db } as never,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Invalid email or password");
    expect(cookieFrom(response)).toBeUndefined();
  });

  it("rotates the token and sets a 60-day remember-me cookie", async () => {
    const db = new TestDatabase();
    await db.addUser("user@example.com", "password", false);
    const page = await app.request("https://katb.in/users/log_in", undefined, { DB: db } as never);
    const oldCookie = cookieFrom(page)!;
    const response = await app.request(
      "https://katb.in/users/log_in",
      formRequest(oldCookie, {
        _csrf: csrfFrom(await page.text()),
        "user[email]": "user@example.com",
        "user[password]": "password",
        "user[remember_me]": "true",
      }),
      { DB: db } as never,
    );
    const newCookie = cookieFrom(response);

    expect(newCookie).not.toBe(oldCookie);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=5184000");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(db.sessionCount()).toBe(1);
  });

  it("rejects a cross-site login and a bad CSRF token", async () => {
    const db = new TestDatabase();
    await db.addUser("user@example.com", "password", false);
    const page = await app.request("https://katb.in/users/log_in", undefined, { DB: db } as never);
    const cookie = cookieFrom(page)!;
    const body = {
      _csrf: "wrong",
      "user[email]": "user@example.com",
      "user[password]": "password",
    };
    const badCsrf = await app.request("https://katb.in/users/log_in", formRequest(cookie, body), {
      DB: db,
    } as never);
    const crossSite = await app.request(
      "https://katb.in/users/log_in",
      {
        ...formRequest(cookie, body),
        headers: {
          Cookie: cookie,
          Origin: "https://evil.example",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
      { DB: db } as never,
    );

    expect(badCsrf.status).toBe(403);
    expect(crossSite.status).toBe(403);
  });

  it("revokes the active session on logout", async () => {
    const db = new TestDatabase();
    await db.addUser("user@example.com", "password", false);
    const page = await app.request("https://katb.in/users/log_in", undefined, { DB: db } as never);
    const login = await app.request(
      "https://katb.in/users/log_in",
      formRequest(cookieFrom(page)!, {
        _csrf: csrfFrom(await page.text()),
        "user[email]": "user@example.com",
        "user[password]": "password",
      }),
      { DB: db } as never,
    );
    const cookie = cookieFrom(login)!;
    const home = await app.request("https://katb.in/", { headers: { Cookie: cookie } }, {
      DB: db,
    } as never);
    const logout = await app.request(
      "https://katb.in/users/log_out",
      {
        method: "DELETE",
        headers: {
          Cookie: cookie,
          Origin: "https://katb.in",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ _csrf: csrfFrom(await home.text()) }),
      },
      { DB: db } as never,
    );
    const after = await app.request("https://katb.in/", { headers: { Cookie: cookie } }, {
      DB: db,
    } as never);

    expect(logout.status).toBe(303);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(db.sessionCount()).toBe(1);
    expect(await after.text()).toContain("Register");
  });
});

const cookieFrom = (response: Response) => response.headers.get("set-cookie")?.split(";", 1)[0];
const csrfFrom = (body: string) => body.match(/name="_csrf" value="([^"]+)"/)![1];
const formRequest = (cookie: string, values: Record<string, string>) => ({
  method: "POST",
  headers: {
    Cookie: cookie,
    Origin: "https://katb.in",
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams(values),
});

class TestDatabase {
  private readonly rows = new Map<string, { id: string; content: string; is_url: boolean }>();
  private readonly userRows = new Map<
    number,
    {
      id: number;
      email: string;
      normalized_email: string;
      hashed_password: string;
      confirmed_at: string | null;
      inserted_at: string;
      updated_at: string;
    }
  >();
  private readonly sessionRows = new Map<
    string,
    { token_hash: string; user_id: number | null; expires_at: number; inserted_at: number }
  >();
  private nextUserId = 1;

  async addUser(email: string, password: string, bcryptHash: boolean) {
    const hash = bcryptHash
      ? await bcrypt.hash(password, 4)
      : (() => {
          const salt = new Uint8Array(16);
          crypto.getRandomValues(salt);
          const key = scryptSync(password, salt, 32, {
            N: 16_384,
            r: 8,
            p: 1,
            maxmem: 32 * 1024 * 1024,
          });
          const encode = (bytes: Uint8Array) =>
            btoa(String.fromCharCode(...bytes))
              .replaceAll("+", "-")
              .replaceAll("/", "_")
              .replaceAll("=", "");
          return `scrypt$16384$8$1$${encode(salt)}$${encode(key)}`;
        })();
    const id = this.nextUserId++;
    this.userRows.set(id, {
      id,
      email,
      normalized_email: email.toLowerCase(),
      hashed_password: hash,
      confirmed_at: null,
      inserted_at: "",
      updated_at: "",
    });
  }

  user(email: string) {
    return [...this.userRows.values()].find((user) => user.normalized_email === email);
  }

  sessionCount() {
    return this.sessionRows.size;
  }

  prepare(query: string) {
    const normalized = query.toLowerCase();
    return {
      bind: (...values: unknown[]) => ({
        run: async () => {
          if (normalized.includes('insert into "pastes"')) {
            const [id, content, isUrl] = values as [string, string, boolean];
            this.rows.set(id, { id, content, is_url: isUrl });
          } else if (normalized.includes('insert into "users"')) {
            const [email, normalizedEmail, hashedPassword] = values as [string, string, string];
            const id = this.nextUserId++;
            this.userRows.set(id, {
              id,
              email,
              normalized_email: normalizedEmail,
              hashed_password: hashedPassword,
              confirmed_at: null,
              inserted_at: "",
              updated_at: "",
            });
          } else if (normalized.includes('insert into "sessions"')) {
            const [tokenHash, userId, expiresAt, insertedAt] = values as [
              string,
              number | null,
              number,
              number,
            ];
            this.sessionRows.set(tokenHash, {
              token_hash: tokenHash,
              user_id: userId,
              expires_at: expiresAt,
              inserted_at: insertedAt,
            });
          } else if (normalized.startsWith('update "users"')) {
            const [hashedPassword, id] = values as [string, number];
            const user = this.userRows.get(id);
            if (user) user.hashed_password = hashedPassword;
          } else if (normalized.startsWith('delete from "sessions"')) {
            this.sessionRows.delete(values[0] as string);
          }
          return { success: true };
        },
        all: async () => {
          if (normalized.includes('from "users"')) {
            const lookup = values[0];
            const user =
              typeof lookup === "number" ? this.userRows.get(lookup) : this.user(lookup as string);
            return { results: user ? [user] : [] };
          }
          if (normalized.includes('from "sessions"')) {
            const session = this.sessionRows.get(
              values.find((value) => typeof value === "string") as string,
            );
            const currentTime = values.find((value) => typeof value === "number") as number;
            return { results: session && session.expires_at > currentTime ? [session] : [] };
          }
          const row = this.rows.get(values.at(-1) as string);
          return { results: row ? [row] : [] };
        },
        raw: async () => {
          if (normalized.includes('from "sessions"')) {
            const session = this.sessionRows.get(
              values.find((value) => typeof value === "string") as string,
            );
            const currentTime = values.find((value) => typeof value === "number") as number;
            return session && session.expires_at > currentTime
              ? [[session.token_hash, session.user_id, session.expires_at, session.inserted_at]]
              : [];
          }
          if (normalized.includes('from "users"')) {
            const lookup = values[0];
            const user =
              typeof lookup === "number" ? this.userRows.get(lookup) : this.user(lookup as string);
            return user
              ? [
                  [
                    user.id,
                    user.email,
                    user.normalized_email,
                    user.hashed_password,
                    user.confirmed_at,
                    user.inserted_at,
                    user.updated_at,
                  ],
                ]
              : [];
          }
          const row = this.rows.get(values.at(-1) as string);
          return row ? [[row.id, row.content, row.is_url]] : [];
        },
      }),
    };
  }
}
