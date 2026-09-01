import { describe, expect, it } from "vitest";

import { app } from "./index";

describe("Katbin shell", () => {
  it("serves the home page with secure headers and the existing navigation", async () => {
    const response = await app.request("https://katb.in/");
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
    const home = await app.request("https://katb.in/", { method: "GET" });
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
    expect(id).toMatch(/^(?:[bcdfghjklmnpqrstvwxyz][aeiou]){5}[bcdfghjklmnpqrstvwxyz]$/);
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
    const home = await app.request("https://katb.in/");
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
});

class TestDatabase {
  private readonly rows = new Map<string, { id: string; content: string }>();

  prepare(query: string) {
    return {
      bind: (...values: unknown[]) => ({
        run: async () => {
          if (query.startsWith("insert")) {
            const [id, content] = values as [string, string];
            this.rows.set(id, { id, content });
          }
          return { success: true };
        },
        all: async () => {
          const row = this.rows.get(values.at(-1) as string);
          return { results: row ? [row] : [] };
        },
        raw: async () => {
          const row = this.rows.get(values.at(-1) as string);
          return row
            ? [query.includes('select "content"') ? [row.content] : [row.id, row.content]]
            : [];
        },
      }),
    };
  }
}
