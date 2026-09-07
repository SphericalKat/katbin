export interface MetricsDb {
  prepare(query: string): {
    bind(...args: any[]): {
      run(): Promise<any>;
      all(): Promise<{ results: any[] }>;
      first(): Promise<any>;
    };
  };
}

export type MetricKind =
  | "account_created"
  | "paste_created"
  | "paste_anon"
  | "paste_authed"
  | "text"
  | "shortlink"
  | "read"
  | "redirect"
  | "ip_ban_reject"
  | "rate_limit_reject"
  | "server_error";

const metricColumns: Record<MetricKind, string> = {
  account_created: "accounts_created",
  paste_created: "pastes_created",
  paste_anon: "pastes_anon",
  paste_authed: "pastes_authed",
  text: "text_pastes",
  shortlink: "short_links",
  read: "reads",
  redirect: "redirects",
  ip_ban_reject: "ip_ban_rejects",
  rate_limit_reject: "rate_limit_rejects",
  server_error: "server_errors",
};

const now = () => new Date().toISOString();

export function utcDay(date = new Date()): string {
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date");
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
    .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, "0")))
    .join("-");
}

async function incrementMetric(db: MetricsDb, column: string, day: string): Promise<void> {
  const updatedAt = now();
  await db
    .prepare(
      `INSERT INTO daily_metrics (day, ${column}, updated_at) VALUES (?, 1, ?) ON CONFLICT(day) DO UPDATE SET ${column} = COALESCE(daily_metrics.${column}, 0) + 1, updated_at = excluded.updated_at`,
    )
    .bind(day, updatedAt)
    .run();
}

export async function recordEvent(db: MetricsDb, kind: MetricKind, day = utcDay()): Promise<void> {
  const column = metricColumns[kind];
  if (!column) throw new Error(`Unknown metric kind: ${kind}`);
  await incrementMetric(db, column, day);
}

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Production callers must supply the secret VISITOR_HASH_PEPPER value.
 * Schedule purgeVisitorHashes after daily aggregation to limit hash retention.
 */
export async function recordVisit(
  db: MetricsDb,
  ip: string,
  day = utcDay(),
  hashFn: (value: string) => Promise<string> | string = sha256,
  pepper?: string,
): Promise<void> {
  if (ip.trim().toLowerCase() === "unknown") return;

  const ipHash = await hashFn(`${pepper ?? ""}|${day}|${ip}`);
  const inserted = await db
    .prepare(
      "INSERT OR IGNORE INTO visitor_ips (day, ip_hash) VALUES (?, ?) RETURNING 1 AS inserted",
    )
    .bind(day, ipHash)
    .first();
  if (inserted === null || inserted === undefined) return;

  await incrementMetric(db, "visitors", day);
}

export async function purgeVisitorHashes(db: MetricsDb, beforeDay: string): Promise<void> {
  // Production must schedule this after daily aggregation.
  await db.prepare("DELETE FROM visitor_ips WHERE day < ?").bind(beforeDay).run();
}

const RANGE_DAYS = [7, 30, 90] as const;
export type MetricRange = (typeof RANGE_DAYS)[number];

function rangeDays(days: MetricRange, endDay: string): string[] {
  const end = new Date(`${endDay}T00:00:00.000Z`);
  if (Number.isNaN(end.getTime()) || utcDay(end) !== endDay) {
    throw new Error("Invalid end day");
  }
  return Array.from({ length: days }, (_, index) =>
    utcDay(new Date(end.getTime() - (days - index - 1) * 24 * 60 * 60 * 1000)),
  );
}

export async function getRange(
  db: MetricsDb,
  days: MetricRange,
  endDay = utcDay(),
): Promise<{ days: string[]; rows: Record<string, any>; lastUpdated: string | null }> {
  if (!RANGE_DAYS.includes(days)) throw new Error("Invalid range");
  const range = rangeDays(days, endDay);
  const result = await db
    .prepare("SELECT * FROM daily_metrics WHERE day >= ? AND day <= ? ORDER BY day ASC")
    .bind(range[0], range[range.length - 1])
    .all();

  const available = new Map<string, any>();
  let lastUpdated: string | null = null;
  for (const row of result.results) {
    const day = String(row.day);
    available.set(day, row);
    const updatedAt = row.updated_at ?? row.updatedAt;
    if (typeof updatedAt !== "string") continue;
    if (lastUpdated === null || new Date(updatedAt).getTime() > new Date(lastUpdated).getTime()) {
      lastUpdated = updatedAt;
    }
  }

  const rows: Record<string, any> = {};
  for (const day of range) rows[day] = available.get(day) ?? { unavailable: true };
  return { days: range, rows, lastUpdated };
}

function countFrom(row: any): number {
  const value = row?.count ?? row?.["COUNT(*)"] ?? (row ? Object.values(row)[0] : 0);
  return Number(value ?? 0);
}

export async function summarizeTotals(
  db: MetricsDb,
): Promise<{ accounts: number; activePastes: number }> {
  const accounts = await db.prepare("SELECT COUNT(*) AS count FROM users").bind().first();
  const activePastes = await db
    .prepare("SELECT COUNT(*) AS count FROM pastes WHERE deleted_at IS NULL")
    .bind()
    .first();
  return { accounts: countFrom(accounts), activePastes: countFrom(activePastes) };
}

export function formatStale(
  lastUpdated: string | null,
  nowMs = Date.now(),
): "fresh" | "stale" | "unavailable" {
  if (lastUpdated === null) return "unavailable";
  const updatedMs = Date.parse(lastUpdated);
  if (Number.isNaN(updatedMs)) return "unavailable";
  return nowMs - updatedMs > 25 * 60 * 60 * 1000 ? "stale" : "fresh";
}

/** Callers must filter these paths before recording usage metrics. */
export function shouldCountUsage(path: string): boolean {
  const rawPath = path.split(/[?#]/, 1)[0] || "/";
  const normalized = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  if (normalized === "/favicon.ico") return false;
  return !["/static", "/admin", "/health", "/assets"].some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

export const VISITOR_LIMITATIONS =
  "Visitor totals estimate daily distinct IP addresses, not people. Shared networks, changing addresses, and bots affect the estimate. Do not sum daily rows across days to estimate weekly or monthly unique visitors.";
