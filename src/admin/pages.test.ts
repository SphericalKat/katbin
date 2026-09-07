import { describe, expect, it } from "vitest";
import { jsx } from "hono/jsx";
import { AdminLayout, BansPage, OverviewPage, SearchPage } from "./pages";

const render = (value: any) => value.toString();
const element = (component: any, props: Record<string, any>) => jsx(component, props);

describe("admin pages", () => {
  it("renders admin navigation and labelled search controls", () => {
    const layout = render(
      element(AdminLayout, {
        csrf: "token",
        active: "Search",
        children: element("p", { children: "Content" }),
      }),
    );
    expect(layout).toContain('href="/admin"');
    expect(layout).toContain("Overview");
    expect(layout).toContain("Search");
    expect(layout).toContain("DMCA");

    const search = render(element(SearchPage, { page: 1, results: { abuse: [] } }));
    expect(search).toContain("Search account, email, paste ID or URL, or IP");
    expect(search).toContain('for="admin-search-query"');
    expect(search).toContain('name="_csrf"');
    expect(search).toContain("shared IP is not proof");
  });

  it("renders unavailable and stale metric states without turning missing values into zero", () => {
    const overview = render(
      element(OverviewPage, {
        totals: { accounts: 1, activePastes: 2 },
        range: 7,
        series: [
          {
            day: "2026-01-01",
            accounts_created: 0,
            pastes_created: 0,
            pastes_anon: 0,
            pastes_authed: 0,
            reads: 0,
            redirects: 0,
            visitors: 0,
            ip_ban_rejects: 0,
            rate_limit_rejects: 0,
            server_errors: 0,
            unavailable: true,
          },
        ],
        lastUpdated: null,
        storage: { stale: true },
        notes: ["Execution failed after 20 ms"],
      }),
    );
    expect(overview).toContain("Stale metrics");
    expect(overview).toContain("Metrics unavailable");
    expect(overview).toContain("Unavailable");
    expect(overview).toContain("Visitor totals estimate daily distinct IP addresses");
    expect(overview).toContain("Execution failed after 20 ms");
  });

  it("labels ban forms and does not render paste body fields", () => {
    const bans = render(
      element(BansPage, { accountBans: [], ipBans: [], csrf: "token", preview: "203.0.113.0/24" }),
    );
    expect(bans).toContain('for="user_id"');
    expect(bans).toContain('for="target"');
    expect(bans).toContain("Effective range preview");

    const search = render(
      element(SearchPage, {
        page: 1,
        results: { abuse: [], pastes: [{ id: "p1", url: "/p/p1" }] },
      }),
    );
    expect(search).toContain("p1");
    expect(search).not.toContain("private paste body");
  });
});
