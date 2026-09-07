import { describe, expect, it } from "vitest";
import type { MetricsDb } from "./metrics";
import {
  formatStale,
  getRange,
  purgeVisitorHashes,
  recordEvent,
  recordVisit,
  shouldCountUsage,
  summarizeTotals,
  utcDay,
  VISITOR_LIMITATIONS,
} from "./metrics";

class FakeDb implements MetricsDb {
  readonly daily = new Map<string, Record<string, any>>();
  readonly visitors = new Set<string>();
  users = 0;
  pastes = [{ deleted_at: null }, { deleted_at: "2026-01-02" }];

  prepare(query: string) {
    return {
      bind: (...values: any[]) => ({
        run: async () => this.execute(query, values, "run"),
        all: async () => ({ results: this.execute(query, values, "all") }),
        first: async () => this.execute(query, values, "first"),
      }),
    };
  }

  private execute(query: string, values: any[], mode: "run" | "all" | "first"): any {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.startsWith("insert into daily_metrics")) {
      const column = normalized.match(/daily_metrics \(day, ([a-z_]+), updated_at\)/)?.[1];
      if (!column) throw new Error("Missing metric column");
      const [day, updatedAt] = values;
      const row = this.daily.get(day) ?? { day };
      row[column] = Number(row[column] ?? 0) + 1;
      row.updated_at = updatedAt;
      this.daily.set(day, row);
      return {};
    }
    if (normalized.startsWith("insert or ignore into visitor_ips")) {
      const key = `${values[0]}|${values[1]}`;
      if (this.visitors.has(key)) return mode === "first" ? null : {};
      this.visitors.add(key);
      return mode === "first" ? { inserted: 1 } : {};
    }
    if (normalized.startsWith("delete from visitor_ips")) {
      for (const key of this.visitors) if (key.split("|")[0] < values[0]) this.visitors.delete(key);
      return {};
    }
    if (normalized.startsWith("select * from daily_metrics")) {
      return [...this.daily.values()].filter((row) => row.day >= values[0] && row.day <= values[1]);
    }
    if (normalized.startsWith("select count(*) as count from users")) {
      return { count: this.users };
    }
    if (normalized.startsWith("select count(*) as count from pastes")) {
      return { count: this.pastes.filter((paste) => paste.deleted_at === null).length };
    }
    throw new Error(`Unsupported query: ${normalized}`);
  }
}

describe("metrics", () => {
  it("uses UTC day boundaries", () => {
    expect(utcDay(new Date("2026-01-01T23:30:00-02:00"))).toBe("2026-01-02");
  });

  it("aggregates events and deduplicates visitors within a day", async () => {
    const db = new FakeDb();
    await recordEvent(db, "paste_created", "2026-02-01");
    await recordEvent(db, "paste_created", "2026-02-01");
    await recordEvent(db, "text", "2026-02-01");
    const hash = (value: string) => value;
    await recordVisit(db, "192.0.2.1", "2026-02-01", hash);
    await recordVisit(db, "192.0.2.1", "2026-02-01", hash);
    await recordVisit(db, "192.0.2.2", "2026-02-01", hash);
    await recordVisit(db, "unknown", "2026-02-01", hash);
    expect(db.daily.get("2026-02-01")).toMatchObject({
      pastes_created: 2,
      text_pastes: 1,
      visitors: 2,
    });
  });

  it("uses a caller-supplied pepper for visitor hashes", async () => {
    const db = new FakeDb();
    const hash = (value: string) => value;
    const day = "2026-02-01";
    const ip = "192.0.2.1";

    await recordVisit(db, ip, day, hash, "first-secret");
    await recordVisit(db, ip, day, hash, "second-secret");

    expect(db.visitors).toEqual(
      new Set([`${day}|first-secret|${day}|${ip}`, `${day}|second-secret|${day}|${ip}`]),
    );
    expect(db.visitors).not.toContain(`${day}|${day}|${ip}`);
  });

  it("marks missing days as unavailable instead of zero", async () => {
    const db = new FakeDb();
    await recordEvent(db, "read", "2026-02-07");
    const range = await getRange(db, 7, "2026-02-07");
    expect(range.days).toEqual([
      "2026-02-01",
      "2026-02-02",
      "2026-02-03",
      "2026-02-04",
      "2026-02-05",
      "2026-02-06",
      "2026-02-07",
    ]);
    expect(range.rows["2026-02-01"]).toEqual({ unavailable: true });
    expect(range.rows["2026-02-07"]).toMatchObject({ reads: 1 });
    expect(range.rows["2026-02-01"]).not.toHaveProperty("reads");
  });

  it("purges hashes without changing daily totals", async () => {
    const db = new FakeDb();
    await recordVisit(db, "192.0.2.1", "2026-01-01", (value) => value);
    await recordVisit(db, "192.0.2.1", "2026-01-02", (value) => value);
    await purgeVisitorHashes(db, "2026-01-02");
    expect(db.visitors).toEqual(new Set(["2026-01-02||2026-01-02|192.0.2.1"]));
    expect(db.daily.get("2026-01-01")?.visitors).toBe(1);
  });

  it("filters non-usage paths and describes visitor limits", async () => {
    expect(shouldCountUsage("/static/app.js")).toBe(false);
    expect(shouldCountUsage("/admin/metrics")).toBe(false);
    expect(shouldCountUsage("/health")).toBe(false);
    expect(shouldCountUsage("/favicon.ico")).toBe(false);
    expect(shouldCountUsage("/assets/site.css")).toBe(false);
    expect(shouldCountUsage("/p/example")).toBe(true);
    expect(VISITOR_LIMITATIONS).toContain("not people");
    expect(VISITOR_LIMITATIONS).toContain("Do not sum daily rows");
    expect(formatStale(null)).toBe("unavailable");
    expect(formatStale("2026-01-01T00:00:00.000Z", Date.parse("2026-01-02T02:00:01.000Z"))).toBe(
      "stale",
    );
    await expect(summarizeTotals(Object.assign(new FakeDb(), { users: 3 }))).resolves.toEqual({
      accounts: 3,
      activePastes: 1,
    });
  });
});
