import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", async () => {
  const actual = await vi.importActual<typeof import("./auth")>("./auth");
  return {
    ...actual,
    verifyAccessJwt: async (token: string) => ({ valid: token === "valid-access-token" }),
  };
});

import { app } from "../index";

/** Small D1-shaped fake for gate tests. Admin routes must not run queries before auth. */
class GateDatabase {
  prepare(_query: string) {
    const binding = {
      bind: (..._args: unknown[]) => binding,
      run: async () => ({ success: true }),
      all: async () => ({ results: [] }),
      first: async () => null,
    };
    return binding;
  }
}

class AdminDatabase {
  reads = 0;

  prepare(query: string) {
    const normalized = query.toLowerCase();
    const binding = {
      bind: (...values: unknown[]) => ({
        run: async () => {
          if (normalized.includes("daily_metrics") && normalized.includes("reads")) this.reads += 1;
          return { success: true };
        },
        all: async () => ({ results: this.all(normalized, values), success: true, meta: {} }),
        raw: async () => {
          if (normalized.includes('from "sessions"')) return [["session", 1, 4_000_000_000, 0]];
          if (normalized.includes('from "users"'))
            return [[1, "admin@example.com", "admin@example.com", "", null, "", ""]];
          if (normalized.includes('from "pastes"'))
            return [["abc", "hello", 5, 0, null, "d1", null, null]];
          return [];
        },
        first: async () => this.first(normalized),
      }),
    };
    return binding;
  }

  private all(query: string, _values: unknown[]) {
    if (query.includes('from "sessions"'))
      return [{ token_hash: "session", user_id: 1, expires_at: 4_000_000_000, inserted_at: 0 }];
    if (query.includes('from "users"'))
      return [{ id: 1, email: "admin@example.com", normalized_email: "admin@example.com" }];
    if (query.includes('from "pastes"'))
      return [
        {
          id: "abc",
          content: "hello",
          content_length_bytes: 5,
          is_url: 0,
          owner_id: null,
          storage_type: "d1",
          storage_key: null,
          deleted_at: null,
        },
      ];
    if (query.includes("from abuse_events")) return [];
    if (query.includes("from ip_bans")) return [];
    if (query.includes("from dmca_cases")) {
      return [
        {
          id: 1,
          reference: "case-1",
          complainant: "owner@example.com",
          received_at: "2026-09-07T00:00:00.000Z",
          status: "open",
          decision_reason: "",
          decided_by: null,
          decided_at: null,
        },
      ];
    }
    if (query.includes("from dmca_case_pastes")) return [];
    if (query.includes("from admin_actions"))
      return [
        {
          admin: "1",
          action: "dmca_create",
          target: "1",
          reason: "",
          outcome: "open",
          created_at: "2026-09-07T00:00:00.000Z",
        },
      ];
    if (query.includes("from deletion_queue")) return [];
    if (query.includes("from users where id")) return [];
    return [];
  }

  private first(query: string) {
    if (query.includes('from "sessions"'))
      return { token_hash: "session", user_id: 1, expires_at: 4_000_000_000, inserted_at: 0 };
    if (query.includes('from "users"'))
      return { id: 1, email: "admin@example.com", normalized_email: "admin@example.com" };
    if (query.includes("select 1 as banned")) return null;
    if (query.includes("insert into dmca_cases")) return { id: 1 };
    if (query.includes("insert into admin_actions")) return { id: 1 };
    if (query.includes("visitor_ips")) return { inserted: 1 };
    if (query.includes('from "pastes"'))
      return {
        id: "abc",
        content: "hello",
        content_length_bytes: 5,
        is_url: 0,
        owner_id: null,
        storage_type: "d1",
        storage_key: null,
        deleted_at: null,
      };
    return null;
  }
}

const adminEnvironment = {
  DB: new AdminDatabase(),
  ENVIRONMENT: "local",
  ADMIN_USER_IDS: "1",
  ACCESS_ISSUER: "https://access.example",
  ACCESS_AUDIENCE: "audience",
};

const adminHeaders = (csrf: string) => ({
  Cookie: "__Host-katbin_session=admin-token",
  Origin: "https://katb.in",
  "Cf-Access-Jwt-Assertion": "valid-access-token",
  "Content-Type": "application/x-www-form-urlencoded",
});

const csrfFor = async () =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode("admin-token")),
    ),
  ]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

describe("admin route gate", () => {
  it("denies requests without a verified Cloudflare Access token", async () => {
    const response = await app.request("https://katb.in/admin", undefined, {
      DB: new GateDatabase(),
      ENVIRONMENT: "production",
      CANONICAL_HOST: "katb.in",
    } as never);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("denies alternate hosts before checking credentials", async () => {
    const response = await app.request(
      "https://preview.example.workers.dev/admin",
      { headers: { "Cf-Access-Jwt-Assertion": "not-a-token" } },
      { DB: new GateDatabase(), ENVIRONMENT: "production", CANONICAL_HOST: "katb.in" } as never,
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("denies mutations without same-origin and CSRF protection", async () => {
    const response = await app.request(
      "https://katb.in/admin/bans/ip",
      {
        method: "POST",
        body: new URLSearchParams({ target: "203.0.113.8", reason: "test" }),
      },
      { DB: new GateDatabase(), ENVIRONMENT: "local", ADMIN_USER_IDS: "1" } as never,
    );

    // The request fails at the Access gate first. It must not reach the mutation handler.
    expect(response.status).toBe(401);
  });
});

describe("admin route behavior", () => {
  it("creates a DMCA case with the received_date field", async () => {
    const csrf = await csrfFor();
    const response = await app.request(
      "https://katb.in/admin/dmca",
      {
        method: "POST",
        headers: adminHeaders(csrf),
        body: new URLSearchParams({
          _csrf: csrf,
          reference: "case-1",
          complainant: "owner@example.com",
          received_date: "2026-09-07",
          paste_ids: "abc",
        }),
      },
      adminEnvironment as never,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("case-1");
  });

  it("retries the deletion queue and redirects back to deletions", async () => {
    const csrf = await csrfFor();
    const response = await app.request(
      "https://katb.in/admin/deletions/retry",
      {
        method: "POST",
        headers: adminHeaders(csrf),
        body: new URLSearchParams({ _csrf: csrf }),
      },
      adminEnvironment as never,
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/deletions");
  });

  it("counts a public paste read but not the pastes list", async () => {
    const db = new AdminDatabase();
    const environment = { ...adminEnvironment, DB: db };
    await app.request("https://katb.in/pastes", undefined, environment as never);
    expect(db.reads).toBe(0);

    const response = await app.request("https://katb.in/abc", undefined, environment as never);
    expect(response.status).toBe(200);
    expect(db.reads).toBe(1);
  });

  it("renders the action type in action history", async () => {
    const response = await app.request(
      "https://katb.in/admin/actions",
      { headers: adminHeaders(await csrfFor()) },
      adminEnvironment as never,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("dmca_create");
  });

  it("returns 404 when an account ban target does not exist", async () => {
    const csrf = await csrfFor();
    const response = await app.request(
      "https://katb.in/admin/bans/account",
      {
        method: "POST",
        headers: adminHeaders(csrf),
        body: new URLSearchParams({ _csrf: csrf, user_id: "99", reason: "abuse" }),
      },
      adminEnvironment as never,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Account not found" });
  });
});
