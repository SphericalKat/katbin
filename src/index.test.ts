import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { scryptSync } from "node:crypto";

import { app } from "./index";

type ApiPaste = { id: string; content: string; is_url: boolean };

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

  it("renders safe Markdown, supported source, and escaped unsupported pastes", async () => {
    const db = new TestDatabase();
    const home = await app.request("https://katb.in/", undefined, { DB: db } as never);
    const cookie = cookieFrom(home)!;
    const csrf = csrfFrom(await home.text());
    const create = async (content: string) => {
      const response = await app.request(
        "https://katb.in/",
        formRequest(cookie, { _csrf: csrf, "paste[content]": content }),
        { DB: db } as never,
      );
      return new URL(response.headers.get("location")!, "https://katb.in").pathname.slice(1);
    };

    const markdownId = await create(
      '# Safe\n\n<script>alert("xss")</script>\n\n[link](https://example.com) ![image](https://example.com/image.png) [bad](javascript:alert(1))',
    );
    const elixirId = await create("defmodule Demo do\n  def run, do: :ok\nend");
    const erlangId = await create("-module(demo).\n-export([run/0]).");
    const unsupportedId = await create('<script>alert("escaped")</script>');

    const markdown = await app.request(`https://katb.in/${markdownId}.md`, undefined, {
      DB: db,
    } as never);
    const elixir = await app.request(`https://katb.in/${elixirId}.ex`, undefined, {
      DB: db,
    } as never);
    const erlang = await app.request(`https://katb.in/${erlangId}.erl`, undefined, {
      DB: db,
    } as never);
    const unsupported = await app.request(`https://katb.in/${unsupportedId}.wat`, undefined, {
      DB: db,
    } as never);
    const markdownBody = await markdown.text();
    const unsupportedBody = await unsupported.text();

    expect(markdownBody).toContain("<h1");
    expect(markdownBody).not.toContain("<script>alert");
    expect(markdownBody).toContain('href="https://example.com"');
    expect(markdownBody).toContain('src="https://example.com/image.png"');
    expect(markdownBody).not.toContain("javascript:");
    expect(await elixir.text()).toContain('<span class="keyword">defmodule</span>');
    expect(await erlang.text()).toContain('<span class="keyword">-module</span>');
    expect(unsupportedBody).toContain("&lt;script&gt;alert(&quot;escaped&quot;)&lt;/script&gt;");
    expect(unsupportedBody).not.toContain("<code");
  });

  it("stores paste content in D1 or R2 at the UTF-8 threshold", async () => {
    const db = new TestDatabase();
    const bucket = new TestBucket();
    const bindings = { DB: db, PASTES: bucket } as never;
    const home = await app.request("https://katb.in/", undefined, bindings);
    const cookie = cookieFrom(home)!;
    const csrf = csrfFrom(await home.text());
    const create = async (content: string) => {
      const response = await app.request(
        "https://katb.in/",
        formRequest(cookie, { _csrf: csrf, "paste[content]": content }),
        bindings,
      );
      return new URL(response.headers.get("location")!, "https://katb.in").pathname.slice(1);
    };
    const belowId = await create("é".repeat(499_999));
    const exactContent = "x".repeat(1_000_000);
    const exactId = await create(exactContent);
    const aboveContent = "🙂".repeat(250_001);
    const aboveId = await create(aboveContent);

    expect(db.paste(belowId)).toMatchObject({
      storage_type: "d1",
      storage_key: null,
      content_length_bytes: 999_998,
      content_sha256: await checksum("é".repeat(499_999)),
    });
    expect(db.paste(exactId)).toMatchObject({
      storage_type: "d1",
      storage_key: null,
      content_length_bytes: 1_000_000,
      content_sha256: await checksum(exactContent),
    });
    expect(db.paste(aboveId)).toMatchObject({
      storage_type: "r2",
      storage_key: aboveId,
      content: "",
      content_length_bytes: 1_000_004,
      content_sha256: await checksum(aboveContent),
    });
    expect(await bucket.text(aboveId)).toBe(aboveContent);
    expect(
      await (await app.request(`https://katb.in/${aboveId}`, undefined, bindings)).text(),
    ).toContain(aboveContent);
    expect(
      await (await app.request(`https://katb.in/v/${aboveId}`, undefined, bindings)).text(),
    ).toContain(aboveContent);
    expect(
      await (await app.request(`https://katb.in/${aboveId}/raw`, undefined, bindings)).text(),
    ).toBe(aboveContent);
    expect(
      await (await app.request(`https://katb.in/${aboveId}/raw`, undefined, bindings)).text(),
    ).toBe(aboveContent);
  });

  it("does not create a D1 reference when an R2 upload fails", async () => {
    const db = new TestDatabase();
    const bucket = new TestBucket(true);
    const bindings = { DB: db, PASTES: bucket } as never;
    const home = await app.request("https://katb.in/", undefined, bindings);
    const response = await app.request(
      "https://katb.in/",
      formRequest(cookieFrom(home)!, {
        _csrf: csrfFrom(await home.text()),
        "paste[content]": "x".repeat(1_000_001),
      }),
      bindings,
    );

    expect(response.status).toBe(500);
    expect(db.pasteCount()).toBe(0);
    expect(bucket.size()).toBe(0);
  });

  it("returns not found for a missing R2 object", async () => {
    const db = new TestDatabase();
    const bucket = new TestBucket();
    const bindings = { DB: db, PASTES: bucket } as never;
    const home = await app.request("https://katb.in/", undefined, bindings);
    const cookie = cookieFrom(home)!;
    const id = new URL(
      (
        await app.request(
          "https://katb.in/",
          formRequest(cookie, {
            _csrf: csrfFrom(await home.text()),
            "paste[content]": "x".repeat(1_000_001),
          }),
          bindings,
        )
      ).headers.get("location")!,
      "https://katb.in",
    ).pathname.slice(1);
    bucket.delete(id);

    for (const path of [`/${id}`, `/v/${id}`, `/${id}/raw`]) {
      const response = await app.request(`https://katb.in${path}`, undefined, bindings);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not found");
    }
  });

  it("preserves the JSON paste API contract across sessions and storage", async () => {
    const db = new TestDatabase();
    const bucket = new TestBucket();
    const bindings = { DB: db, PASTES: bucket } as never;
    const anonymous = await app.request(
      "https://katb.in/api/paste",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paste: { content: "https://example.com/docs" } }),
      },
      bindings,
    );
    const auth = await loginAs(db, "api-owner@example.com");
    const owned = await app.request(
      "https://katb.in/api/paste",
      {
        method: "POST",
        headers: { Cookie: auth.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ paste: { content: "small text" } }),
      },
      bindings,
    );
    const largeContent = "🙂".repeat(250_001);
    const large = await app.request(
      "https://katb.in/api/paste",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paste: { content: largeContent } }),
      },
      bindings,
    );
    const anonymousBody = (await anonymous.json()) as ApiPaste;
    const ownedBody = (await owned.json()) as ApiPaste;
    const largeBody = (await large.json()) as ApiPaste;

    expect(anonymous.status).toBe(201);
    expect(anonymousBody).toMatchObject({ content: "https://example.com/docs", is_url: true });
    expect(Object.keys(anonymousBody)).toEqual(["id", "content", "is_url"]);
    expect(owned.status).toBe(201);
    expect(db.paste(ownedBody.id as string)).toMatchObject({ owner_id: auth.userId });
    expect(large.status).toBe(201);
    expect(largeBody).toMatchObject({ content: largeContent, is_url: false });
    expect(await bucket.text(largeBody.id as string)).toBe(largeContent);

    for (const body of [anonymousBody, largeBody]) {
      const response = await app.request(
        `https://katb.in/api/paste/${body.id}.md`,
        undefined,
        bindings,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(body);
    }
    expect((await app.request("https://katb.in/api/paste", undefined, bindings)).status).toBe(404);
    expect(
      (await app.request("https://katb.in/api/paste/missing", undefined, bindings)).status,
    ).toBe(404);
  });

  it("rejects non-JSON and invalid API requests with safe client errors", async () => {
    const db = new TestDatabase();
    const request = (headers: HeadersInit, body: BodyInit) =>
      app.request("https://katb.in/api/paste", { method: "POST", headers, body }, {
        DB: db,
      } as never);

    expect(
      (
        await request(
          { "Content-Type": "application/x-www-form-urlencoded" },
          "paste%5Bcontent%5D=text",
        )
      ).status,
    ).toBe(415);
    expect((await request({ "Content-Type": "application/json" }, "not-json")).status).toBe(400);
    expect(
      (await request({ "Content-Type": "application/json" }, JSON.stringify({ paste: {} }))).status,
    ).toBe(400);
  });
});

describe("account authentication", () => {
  it("delivers exact confirmation instructions and consumes the token once", async () => {
    const db = new TestDatabase();
    const email = new TestEmailBinding();
    await loginAs(db, "user@example.com");
    const page = await app.request("https://katb.in/users/confirm", undefined, {
      DB: db,
      EMAIL: email,
    } as never);
    const cookie = cookieFrom(page)!;
    const response = await app.request(
      "https://katb.in/users/confirm",
      formRequest(cookie, {
        _csrf: csrfFrom(await page.text()),
        "user[email]": "user@example.com",
      }),
      { DB: db, EMAIL: email } as never,
    );
    const message = email.messages[0];
    const token = message.text!.match(/\/users\/confirm\/([^\s]+)/)![1];

    expect(response.status).toBe(303);
    expect(message).toEqual({
      to: "user@example.com",
      from: "Katbin <noreply@katb.in>",
      subject: "Account confirmation",
      text: `

==============================

Hi user@example.com,

You can confirm your account by visiting the URL below:

https://katb.in/users/confirm/${token}

If you didn't create an account with us, please ignore this.

==============================
`,
    });

    const confirmed = await app.request(`https://katb.in/users/confirm/${token}`, undefined, {
      DB: db,
      EMAIL: email,
    } as never);
    const repeated = await app.request(`https://katb.in/users/confirm/${token}`, undefined, {
      DB: db,
      EMAIL: email,
    } as never);

    expect(confirmed.status).toBe(302);
    const confirmedHome = await app.request(
      "https://katb.in/",
      { headers: { Cookie: `${cookie}; ${cookieFrom(confirmed)}` } },
      { DB: db } as never,
    );
    expect(await confirmedHome.text()).toContain("User confirmed successfully.");
    expect(repeated.status).toBe(302);
    expect(db.user("user@example.com")?.confirmed_at).not.toBeNull();
    expect(db.accountTokenCount()).toBe(0);
  });

  it("keeps reset requests impartial and resets passwords with expiry and session revocation", async () => {
    const db = new TestDatabase();
    const email = new TestEmailBinding();
    const auth = await loginAs(db, "user@example.com");
    const requestPage = await app.request("https://katb.in/users/reset_password", undefined, {
      DB: db,
      EMAIL: email,
    } as never);
    const cookie = auth.cookie;
    await requestPage.text();
    const unknown = await app.request(
      "https://katb.in/users/reset_password",
      formRequest(cookie, {
        _csrf: auth.csrf,
        "user[email]": "unknown@example.com",
      }),
      { DB: db, EMAIL: email } as never,
    );
    expect(unknown.status).toBe(303);
    expect(email.messages).toHaveLength(0);
    const known = await app.request(
      "https://katb.in/users/reset_password",
      formRequest(cookie, {
        _csrf: auth.csrf,
        "user[email]": "user@example.com",
      }),
      { DB: db, EMAIL: email } as never,
    );
    let token = email.messages[0].text!.match(/\/users\/reset_password\/([^\s]+)/)![1];
    db.expireAccountTokens();
    const expired = await app.request(`https://katb.in/users/reset_password/${token}`, undefined, {
      DB: db,
      EMAIL: email,
    } as never);
    expect(expired.status).toBe(302);
    await app.request(
      "https://katb.in/users/reset_password",
      formRequest(cookie, { _csrf: auth.csrf, "user[email]": "user@example.com" }),
      { DB: db, EMAIL: email } as never,
    );
    token = email.messages[1].text!.match(/\/users\/reset_password\/([^\s]+)/)![1];
    await app.request(`https://katb.in/users/reset_password/${token}`, undefined, {
      DB: db,
      EMAIL: email,
    } as never);
    const oldCookie = cookie;
    const reset = await app.request(
      `https://katb.in/users/reset_password/${token}`,
      requestWithMethod("PUT", oldCookie, {
        _csrf: auth.csrf,
        "user[password]": "new password",
        "user[password_confirmation]": "new password",
      }),
      { DB: db, EMAIL: email } as never,
    );
    const repeated = await app.request(`https://katb.in/users/reset_password/${token}`, undefined, {
      DB: db,
      EMAIL: email,
    } as never);
    expect(known.status).toBe(303);
    expect(reset.status).toBe(303);
    expect(reset.headers.get("location")).toBe("/users/log_in");
    expect(repeated.headers.get("location")).toBe("/");
    expect(
      (
        await app.request("https://katb.in/pastes", { headers: { Cookie: auth.cookie } }, {
          DB: db,
        } as never)
      ).status,
    ).toBe(302);
    expect(db.accountTokenCount()).toBe(0);
    expect(db.user("user@example.com")?.hashed_password).toMatch(/^scrypt\$/);
  });

  it("checks settings passwords and applies a confirmed email change", async () => {
    const db = new TestDatabase();
    const email = new TestEmailBinding();
    const auth = await loginAs(db, "user@example.com");
    const invalid = await app.request(
      "https://katb.in/users/settings",
      requestWithMethod("PUT", auth.cookie, {
        _csrf: auth.csrf,
        action: "update_email",
        current_password: "wrong",
        "user[email]": "new@example.com",
      }),
      { DB: db, EMAIL: email } as never,
    );
    expect(await invalid.text()).toContain("is not valid");
    expect(email.messages).toHaveLength(0);

    const update = await app.request(
      "https://katb.in/users/settings",
      requestWithMethod("PUT", auth.cookie, {
        _csrf: auth.csrf,
        action: "update_email",
        current_password: "password",
        "user[email]": "New@Example.com",
      }),
      { DB: db, EMAIL: email } as never,
    );
    const token = email.messages[0].text!.match(/\/users\/settings\/confirm_email\/([^\s]+)/)![1];
    const confirmed = await app.request(
      `https://katb.in/users/settings/confirm_email/${token}`,
      { headers: { Cookie: auth.cookie } },
      { DB: db, EMAIL: email } as never,
    );
    const settings = await app.request(
      "https://katb.in/users/settings",
      { headers: { Cookie: `${auth.cookie}; ${cookieFrom(confirmed)}` } },
      { DB: db, EMAIL: email } as never,
    );

    expect(update.status).toBe(303);
    expect(email.messages[0]).toMatchObject({
      to: "New@Example.com",
      from: "Katbin <noreply@katb.in>",
      subject: "Email update requested",
    });
    expect(confirmed.status).toBe(302);
    expect(await settings.text()).toContain("Email changed successfully.");
    expect(db.user("user@example.com")).toBeUndefined();
    expect(db.user("new@example.com")?.email).toBe("New@Example.com");
  });

  it("registers with form validation and logs in before confirmation", async () => {
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

  it("preserves browser authentication redirects and form contracts", async () => {
    const db = new TestDatabase();
    const settingsRedirect = await app.request("https://katb.in/users/settings", undefined, {
      DB: db,
    } as never);
    const register = await app.request("https://katb.in/users/register", undefined, {
      DB: db,
    } as never);
    const login = await app.request("https://katb.in/users/log_in", undefined, {
      DB: db,
    } as never);
    const registerBody = await register.text();
    const loginBody = await login.text();

    expect(settingsRedirect.status).toBe(302);
    expect(settingsRedirect.headers.get("location")).toBe("/users/log_in");
    expect(register.status).toBe(200);
    expect(register.headers.get("content-type")).toContain("text/html");
    expect(registerBody).toContain('<form action="/users/register" method="post"');
    expect(registerBody).toContain('name="user[email]"');
    expect(login.status).toBe(200);
    expect(loginBody).toContain('<form action="/users/log_in" method="post"');
    expect(loginBody).toContain('name="user[password]"');

    const auth = await loginAs(db, "auth@example.com");
    const authenticatedRegister = await app.request(
      "https://katb.in/users/register",
      { headers: { Cookie: auth.cookie } },
      { DB: db } as never,
    );
    const authenticatedLogin = await app.request(
      "https://katb.in/users/log_in",
      { headers: { Cookie: auth.cookie } },
      { DB: db } as never,
    );
    const settings = await app.request(
      "https://katb.in/users/settings",
      { headers: { Cookie: auth.cookie } },
      { DB: db } as never,
    );

    expect(authenticatedRegister.status).toBe(302);
    expect(authenticatedRegister.headers.get("location")).toBe("/");
    expect(authenticatedLogin.status).toBe(302);
    expect(authenticatedLogin.headers.get("location")).toBe("/");
    expect(settings.status).toBe(200);
    expect(await settings.text()).toContain(
      '<form action="/users/settings" method="post" data-method="put"',
    );
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
const checksum = async (content: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

class TestEmailBinding {
  readonly messages: Array<{ to: string; from: string; subject: string; text?: string }> = [];

  async send(message: { to: string; from: string; subject: string; text?: string }) {
    this.messages.push(message);
    return { messageId: String(this.messages.length) };
  }
}

class TestDatabase {
  private readonly rows = new Map<
    string,
    {
      id: string;
      content: string;
      is_url: boolean;
      owner_id: number | null;
      storage_type: string;
      storage_key: string | null;
      content_length_bytes: number;
      content_sha256: string;
    }
  >();
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
  private readonly accountTokenRows = new Map<
    string,
    { token_hash: string; user_id: number; context: string; sent_to: string; inserted_at: number }
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
    return id;
  }

  user(email: string) {
    return [...this.userRows.values()].find((user) => user.normalized_email === email);
  }

  sessionCount() {
    return this.sessionRows.size;
  }

  accountTokenCount() {
    return this.accountTokenRows.size;
  }

  expireAccountTokens() {
    for (const token of this.accountTokenRows.values()) token.inserted_at = 0;
  }

  paste(id: string) {
    return this.rows.get(id);
  }

  pasteCount() {
    return this.rows.size;
  }

  addPaste(paste: { id: string; content: string; ownerId?: number | null; isUrl?: boolean }) {
    this.rows.set(paste.id, {
      id: paste.id,
      content: paste.content,
      is_url: paste.isUrl ?? false,
      owner_id: paste.ownerId ?? null,
      storage_type: "d1",
      storage_key: null,
      content_length_bytes: new TextEncoder().encode(paste.content).byteLength,
      content_sha256: "",
    });
  }

  prepare(query: string) {
    const normalized = query.toLowerCase();
    return {
      bind: (...values: unknown[]) => ({
        run: async () => {
          if (normalized.includes('insert into "pastes"')) {
            const [
              id,
              content,
              isUrl,
              ownerId,
              storageType,
              storageKey,
              contentLengthBytes,
              contentSha256,
            ] = values as [
              string,
              string,
              boolean,
              number | null,
              string,
              string | null,
              number,
              string,
            ];
            this.rows.set(id, {
              id,
              content,
              is_url: isUrl,
              owner_id: ownerId,
              storage_type: storageType,
              storage_key: storageKey,
              content_length_bytes: contentLengthBytes,
              content_sha256: contentSha256,
            });
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
          } else if (normalized.includes('insert into "account_tokens"')) {
            const [tokenHash, userId, context, sentTo, insertedAt] = values as [
              string,
              number,
              string,
              string,
              number,
            ];
            this.accountTokenRows.set(tokenHash, {
              token_hash: tokenHash,
              user_id: userId,
              context,
              sent_to: sentTo,
              inserted_at: insertedAt,
            });
          } else if (normalized.startsWith('update "users"')) {
            const id = values.at(-1) as number;
            const user = this.userRows.get(id);
            if (user) {
              if (normalized.includes("hashed_password")) {
                const hashedPassword = values.find(
                  (value) => typeof value === "string" && String(value).startsWith("scrypt$"),
                );
                if (hashedPassword) user.hashed_password = hashedPassword as string;
              }
              if (normalized.includes("normalized_email")) {
                user.email = values[0] as string;
                user.normalized_email = values[1] as string;
              }
              if (normalized.includes("confirmed_at")) user.confirmed_at = values[0] as string;
            }
          } else if (normalized.startsWith('delete from "sessions"')) {
            if (normalized.includes("user_id")) {
              for (const [tokenHash, session] of this.sessionRows)
                if (session.user_id === values[0]) this.sessionRows.delete(tokenHash);
            } else {
              this.sessionRows.delete(values[0] as string);
            }
          } else if (normalized.startsWith('delete from "account_tokens"')) {
            if (normalized.includes("user_id")) {
              for (const [tokenHash, token] of this.accountTokenRows)
                if (token.user_id === values[0]) this.accountTokenRows.delete(tokenHash);
            } else {
              this.accountTokenRows.delete(values[0] as string);
            }
          } else if (normalized.startsWith('update "pastes"')) {
            const [
              content,
              isUrl,
              storageType,
              storageKey,
              contentLengthBytes,
              contentSha256,
              updatedAt,
            ] = values as [string, boolean, string, string | null, number, string, string];
            const row = this.rows.get(values.at(-1) as string);
            if (row) {
              Object.assign(row, {
                content,
                is_url: isUrl,
                storage_type: storageType,
                storage_key: storageKey,
                content_length_bytes: contentLengthBytes,
                content_sha256: contentSha256,
                updated_at: updatedAt,
              });
            }
          }
          return { success: true };
        },
        all: async () => {
          if (normalized.startsWith('delete from "account_tokens"')) {
            const tokenHash = values.find((value) => typeof value === "string") as string;
            const token = this.accountTokenRows.get(tokenHash);
            const context = values.find(
              (value) => typeof value === "string" && value !== tokenHash,
            ) as string | undefined;
            const currentTime = values.find((value) => typeof value === "number") as number;
            const matches =
              token &&
              (!context ||
                (context.endsWith("%")
                  ? token.context.startsWith("change:")
                  : token.context === context)) &&
              (!currentTime || token.inserted_at > currentTime);
            if (matches) this.accountTokenRows.delete(tokenHash);
            return { results: matches ? [token] : [] };
          }
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
          if (normalized.includes('from "account_tokens"')) {
            const tokenHash = values.find((value) => typeof value === "string") as string;
            const token = this.accountTokenRows.get(tokenHash);
            const context = values.find(
              (value) => typeof value === "string" && value !== tokenHash,
            ) as string | undefined;
            const currentTime = values.find((value) => typeof value === "number") as number;
            const matches =
              token &&
              (!context ||
                (context.endsWith("%")
                  ? token.context.startsWith("change:")
                  : token.context === context)) &&
              token.inserted_at > currentTime;
            return { results: matches ? [token] : [] };
          }
          if (normalized.includes('from "pastes"')) {
            const id = values.find((value) => typeof value === "string");
            if (id) {
              const row = this.rows.get(id);
              return { results: row ? [row] : [] };
            }
            const ownerId = values.find((value) => typeof value === "number");
            return {
              results: [...this.rows.values()].filter(
                (row) => ownerId === undefined || row.owner_id === ownerId,
              ),
            };
          }
          return { results: [] };
        },
        raw: async () => {
          if (normalized.startsWith('delete from "account_tokens"')) {
            const tokenHash = values.find((value) => typeof value === "string") as string;
            const token = this.accountTokenRows.get(tokenHash);
            const context = values.find(
              (value) => typeof value === "string" && value !== tokenHash,
            ) as string | undefined;
            const currentTime = values.find((value) => typeof value === "number") as number;
            const matches =
              token &&
              (!context ||
                (context.endsWith("%")
                  ? token.context.startsWith("change:")
                  : token.context === context)) &&
              token.inserted_at > currentTime;
            if (matches) this.accountTokenRows.delete(tokenHash);
            return matches
              ? [[token.token_hash, token.user_id, token.context, token.sent_to, token.inserted_at]]
              : [];
          }
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
          if (normalized.includes('from "account_tokens"')) {
            const tokenHash = values.find((value) => typeof value === "string") as string;
            const token = this.accountTokenRows.get(tokenHash);
            const context = values.find(
              (value) => typeof value === "string" && value !== tokenHash,
            ) as string | undefined;
            const currentTime = values.find((value) => typeof value === "number") as number;
            const matches =
              token &&
              (!context ||
                (context.endsWith("%")
                  ? token.context.startsWith("change:")
                  : token.context === context)) &&
              token.inserted_at > currentTime;
            return matches
              ? [[token.token_hash, token.user_id, token.context, token.sent_to, token.inserted_at]]
              : [];
          }
          if (normalized.includes('from "pastes"')) {
            const id = values.find((value) => typeof value === "string");
            if (id) {
              const row = this.rows.get(id);
              return row
                ? [
                    [
                      row.id,
                      row.content,
                      row.is_url,
                      row.owner_id,
                      row.storage_type,
                      row.storage_key,
                    ],
                  ]
                : [];
            }
            const ownerId = values.find((value) => typeof value === "number");
            return [...this.rows.values()]
              .filter((row) => ownerId === undefined || row.owner_id === ownerId)
              .map((row) => [
                row.id,
                row.content,
                row.is_url,
                row.owner_id,
                row.storage_type,
                row.storage_key,
              ]);
          }
          return [];
        },
      }),
    };
  }
}

class TestBucket {
  private readonly objects = new Map<string, Uint8Array>();

  constructor(private readonly fail = false) {}

  async put(key: string, value: ArrayBuffer | ArrayBufferView | string) {
    if (this.fail) throw new Error("R2 upload failed");
    this.objects.set(
      key,
      typeof value === "string"
        ? new TextEncoder().encode(value)
        : new Uint8Array(value instanceof ArrayBuffer ? value : value.buffer),
    );
  }

  async get(key: string) {
    const value = this.objects.get(key);
    return value ? { text: async () => new TextDecoder().decode(value) } : null;
  }

  async text(key: string) {
    return (await this.get(key))?.text();
  }

  delete(key: string) {
    this.objects.delete(key);
  }

  size() {
    return this.objects.size;
  }
}

const loginAs = async (db: TestDatabase, email: string) => {
  const userId = await db.addUser(email, "password", false);
  const loginPage = await app.request(`https://katb.in/users/log_in`, undefined, {
    DB: db,
  } as never);
  const login = await app.request(
    "https://katb.in/users/log_in",
    formRequest(cookieFrom(loginPage)!, {
      _csrf: csrfFrom(await loginPage.text()),
      "user[email]": email,
      "user[password]": "password",
    }),
    { DB: db } as never,
  );
  const cookie = cookieFrom(login)!;
  const home = await app.request("https://katb.in/", { headers: { Cookie: cookie } }, {
    DB: db,
  } as never);
  return { userId, cookie, csrf: csrfFrom(await home.text()) };
};

const requestWithMethod = (
  method: "PATCH" | "PUT",
  cookie: string,
  values: Record<string, string>,
) => ({
  method,
  headers: {
    Cookie: cookie,
    Origin: "https://katb.in",
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams(values),
});

describe("owned pastes", () => {
  it("assigns authenticated owners and keeps migrated identifiers readable", async () => {
    const db = new TestDatabase();
    const auth = await loginAs(db, "owner@example.com");
    const created = await app.request(
      "https://katb.in/",
      formRequest(auth.cookie, {
        _csrf: auth.csrf,
        "paste[content]": "owned",
        "paste[custom_url]": "my-paste_1",
      }),
      { DB: db } as never,
    );
    db.addPaste({ id: "legacy.id", content: "migrated" });

    expect(created.status).toBe(303);
    expect(created.headers.get("location")).toBe("/my-paste_1");
    expect(db.paste("my-paste_1")).toMatchObject({ owner_id: auth.userId });
    expect(
      (await app.request("https://katb.in/legacy.id", undefined, { DB: db } as never)).status,
    ).toBe(200);
  });

  it("rejects unsafe, oversized, reserved, and duplicate custom identifiers", async () => {
    const db = new TestDatabase();
    const auth = await loginAs(db, "owner@example.com");
    const create = (customId: string) =>
      app.request(
        "https://katb.in/",
        formRequest(auth.cookie, {
          _csrf: auth.csrf,
          "paste[content]": "content",
          "paste[custom_url]": customId,
        }),
        { DB: db } as never,
      );

    expect((await create("not safe")).status).toBe(400);
    expect((await create("x".repeat(65))).status).toBe(400);
    expect((await create("users")).status).toBe(400);
    expect((await create("taken")).status).toBe(303);
    expect((await create("taken")).status).toBe(400);
  });

  it("lists only owned pastes and shows the edit control to the owner", async () => {
    const db = new TestDatabase();
    const owner = await loginAs(db, "owner@example.com");
    const other = await loginAs(db, "other@example.com");
    const create = (auth: { cookie: string; csrf: string }, id: string) =>
      app.request(
        "https://katb.in/",
        formRequest(auth.cookie, {
          _csrf: auth.csrf,
          "paste[content]": id,
          "paste[custom_url]": id,
        }),
        { DB: db } as never,
      );
    await create(owner, "owner-paste");
    await create(other, "other-paste");

    const listing = await app.request(
      "https://katb.in/pastes",
      { headers: { Cookie: owner.cookie } },
      { DB: db } as never,
    );
    const ownedView = await app.request(
      "https://katb.in/v/owner-paste",
      {
        headers: { Cookie: owner.cookie },
      },
      { DB: db } as never,
    );
    const otherView = await app.request(
      "https://katb.in/v/owner-paste",
      {
        headers: { Cookie: other.cookie },
      },
      { DB: db } as never,
    );
    const ownerEdit = await app.request(
      "https://katb.in/edit/owner-paste",
      { headers: { Cookie: owner.cookie } },
      { DB: db } as never,
    );
    const otherEdit = await app.request(
      "https://katb.in/edit/owner-paste",
      { headers: { Cookie: other.cookie } },
      { DB: db } as never,
    );
    const anonymousListing = await app.request("https://katb.in/pastes", undefined, {
      DB: db,
    } as never);
    const listingBody = await listing.text();

    expect(listing.status).toBe(200);
    expect(listingBody).toContain("/v/owner-paste");
    expect(listingBody).not.toContain("/v/other-paste");
    expect(await ownedView.text()).toContain("/edit/owner-paste");
    expect(await otherView.text()).not.toContain("/edit/owner-paste");
    expect(ownerEdit.status).toBe(200);
    expect(await ownerEdit.text()).toContain('name="paste[content]"');
    expect(otherEdit.status).toBe(302);
    expect(anonymousListing.status).toBe(302);
  });

  it("updates owned content between D1 and R2 and rejects another user", async () => {
    const db = new TestDatabase();
    const bucket = new TestBucket();
    const bindings = { DB: db, PASTES: bucket } as never;
    const owner = await loginAs(db, "owner@example.com");
    const other = await loginAs(db, "other@example.com");
    await app.request(
      "https://katb.in/",
      formRequest(owner.cookie, {
        _csrf: owner.csrf,
        "paste[content]": "small",
        "paste[custom_url]": "editable",
      }),
      bindings,
    );

    const large = "🙂".repeat(250_001);
    const movedToR2 = await app.request(
      "https://katb.in/editable",
      requestWithMethod("PATCH", owner.cookie, { _csrf: owner.csrf, "paste[content]": large }),
      bindings,
    );
    expect(movedToR2.status).toBe(303);
    expect(db.paste("editable")).toMatchObject({ storage_type: "r2", content: "" });
    expect(await bucket.text(db.paste("editable")!.storage_key!)).toBe(large);

    const movedToD1 = await app.request(
      "https://katb.in/editable",
      requestWithMethod("PUT", owner.cookie, {
        _csrf: owner.csrf,
        "paste[content]": "small again",
      }),
      bindings,
    );
    expect(movedToD1.status).toBe(303);
    expect(db.paste("editable")).toMatchObject({
      storage_type: "d1",
      content: "small again",
      storage_key: null,
    });
    expect(bucket.size()).toBe(0);
    expect(
      await (await app.request("https://katb.in/editable/raw", undefined, bindings)).text(),
    ).toBe("small again");

    const unauthorized = await app.request(
      "https://katb.in/editable",
      requestWithMethod("PATCH", other.cookie, {
        _csrf: other.csrf,
        "paste[content]": "not yours",
      }),
      bindings,
    );
    expect(unauthorized.status).toBe(302);
    expect(unauthorized.headers.get("location")).toBe("/editable");
    const flashCookie = unauthorized.headers.get("set-cookie")!.split(";", 1)[0];
    const redirected = await app.request(
      "https://katb.in/editable",
      { headers: { Cookie: `${other.cookie}; ${flashCookie}` } },
      bindings,
    );
    expect(await redirected.text()).toContain("You don't own this paste!");
    expect(db.paste("editable")?.content).toBe("small again");
  });
});
