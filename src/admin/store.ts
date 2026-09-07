export interface AdminDb {
  prepare(query: string): {
    bind(...args: any[]): {
      run(): Promise<any>;
      all(): Promise<{ results: any[] }>;
      first(): Promise<any>;
    };
  };
}

export type DmcaStatus = "open" | "upheld" | "rejected";
export type DeletionStatus = "pending" | "in_progress" | "completed" | "failed";

export interface AccountBanInput {
  userId: number;
  reason: string;
  createdBy: string;
  createdAt?: string;
}

export interface IpBanInput {
  target: string;
  reason: string;
  createdBy: string;
  createdAt?: string;
}

export interface AbuseEventInput {
  ip: string;
  eventType: string;
  accountId?: number | null;
  pasteId?: string | null;
  email?: string | null;
  createdAt?: string;
}

export interface AbuseSearch {
  accountId?: number;
  email?: string;
  pasteId?: string;
  ip?: string;
  limit?: number;
  offset?: number;
}

export interface DmcaCaseInput {
  reference: string;
  complainant: string;
  receivedAt?: string;
  notes?: string;
}

export interface AdminActionInput {
  admin: string;
  action: string;
  target: string;
  reason: string;
  outcome: string;
  createdAt?: string;
}

export interface DeletionInput {
  pasteId: string;
  reason: string;
  createdAt?: string;
}

export interface DailyMetricInput {
  day: string;
  accountsCreated?: number;
  pastesCreated?: number;
  pastesAnon?: number;
  pastesAuthed?: number;
  textPastes?: number;
  shortLinks?: number;
  reads?: number;
  redirects?: number;
  visitors?: number;
  ipBanRejects?: number;
  rateLimitRejects?: number;
  serverErrors?: number;
  updatedAt?: string;
}

const metricColumns = {
  accountsCreated: "accounts_created",
  pastesCreated: "pastes_created",
  pastesAnon: "pastes_anon",
  pastesAuthed: "pastes_authed",
  textPastes: "text_pastes",
  shortLinks: "short_links",
  reads: "reads",
  redirects: "redirects",
  visitors: "visitors",
  ipBanRejects: "ip_ban_rejects",
  rateLimitRejects: "rate_limit_rejects",
  serverErrors: "server_errors",
} as const;

const timestamp = (value?: string) => {
  if (value === undefined) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Invalid timestamp");
  return parsed.toISOString();
};

const pageSize = (value: number | undefined, fallback = 50) =>
  Math.max(0, Math.floor(value ?? fallback));

const pageOffset = (value: number | undefined) => Math.max(0, Math.floor(value ?? 0));

const insertedId = async (
  statement: {
    bind(...args: any[]): { first(): Promise<any> };
  },
  ...values: any[]
) => {
  const row = await statement.bind(...values).first();
  const id = Number(row?.id);
  if (!Number.isInteger(id)) throw new Error("Insert did not return an id");
  return id;
};

export const createAccountBan = (db: AdminDb, input: AccountBanInput) =>
  insertedId(
    db.prepare(
      "INSERT INTO account_bans (user_id, reason, created_by, created_at) VALUES (?, ?, ?, ?) RETURNING id",
    ),
    input.userId,
    input.reason,
    input.createdBy,
    timestamp(input.createdAt),
  );

export async function liftAccountBan(db: AdminDb, id: number, liftedAt?: string) {
  await db
    .prepare("UPDATE account_bans SET lifted_at = ? WHERE id = ? AND lifted_at IS NULL")
    .bind(timestamp(liftedAt), id)
    .run();
}

export async function isAccountBanned(db: AdminDb, userId: number) {
  const row = await db
    .prepare("SELECT 1 AS banned FROM account_bans WHERE user_id = ? AND lifted_at IS NULL LIMIT 1")
    .bind(userId)
    .first();
  return row !== null && row !== undefined;
}

export const createIpBan = (db: AdminDb, input: IpBanInput) =>
  insertedId(
    db.prepare(
      "INSERT INTO ip_bans (target, reason, created_by, created_at) VALUES (?, ?, ?, ?) RETURNING id",
    ),
    input.target,
    input.reason,
    input.createdBy,
    timestamp(input.createdAt),
  );

export async function liftIpBan(db: AdminDb, id: number, liftedAt?: string) {
  await db
    .prepare("UPDATE ip_bans SET lifted_at = ? WHERE id = ? AND lifted_at IS NULL")
    .bind(timestamp(liftedAt), id)
    .run();
}

export async function listActiveIpBans(db: AdminDb) {
  const result = await db
    .prepare("SELECT * FROM ip_bans WHERE lifted_at IS NULL ORDER BY id DESC")
    .bind()
    .all();
  return result.results;
}

export const logAbuseEvent = (db: AdminDb, input: AbuseEventInput) =>
  insertedId(
    db.prepare(
      "INSERT INTO abuse_events (created_at, ip, event_type, account_id, paste_id, email) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    ),
    timestamp(input.createdAt),
    input.ip,
    input.eventType,
    input.accountId ?? null,
    input.pasteId ?? null,
    input.email ?? null,
  );

export async function searchAbuse(db: AdminDb, search: AbuseSearch = {}) {
  const conditions: string[] = [];
  const values: any[] = [];
  if (search.accountId !== undefined) {
    conditions.push("account_id = ?");
    values.push(search.accountId);
  }
  if (search.email !== undefined) {
    conditions.push("email = ?");
    values.push(search.email);
  }
  if (search.pasteId !== undefined) {
    conditions.push("paste_id = ?");
    values.push(search.pasteId);
  }
  if (search.ip !== undefined) {
    conditions.push("ip = ?");
    values.push(search.ip);
  }
  const where = conditions.length === 0 ? "" : ` WHERE ${conditions.join(" AND ")}`;
  const result = await db
    .prepare(
      `SELECT * FROM abuse_events${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...values, pageSize(search.limit), pageOffset(search.offset))
    .all();
  return result.results;
}

export const createDmcaCase = (db: AdminDb, input: DmcaCaseInput) =>
  insertedId(
    db.prepare(
      "INSERT INTO dmca_cases (reference, complainant, received_at, notes) VALUES (?, ?, ?, ?) RETURNING id",
    ),
    input.reference,
    input.complainant,
    timestamp(input.receivedAt),
    input.notes ?? "",
  );

export async function addDmcaPaste(db: AdminDb, caseId: number, pasteId: string) {
  await db
    .prepare("INSERT OR IGNORE INTO dmca_case_pastes (case_id, paste_id) VALUES (?, ?)")
    .bind(caseId, pasteId)
    .run();
}

export async function decideDmcaCase(
  db: AdminDb,
  caseId: number,
  status: DmcaStatus,
  decisionReason: string,
  decidedBy: string,
  decidedAt?: string,
) {
  if (status !== "open" && status !== "upheld" && status !== "rejected") {
    throw new Error("Invalid DMCA status");
  }
  const isOpen = status === "open";
  const decisionTime = isOpen ? null : timestamp(decidedAt);
  const decisionAdmin = isOpen ? null : decidedBy;
  await db
    .prepare(
      "UPDATE dmca_cases SET status = ?, decision_reason = ?, decided_at = ?, decided_by = ? WHERE id = ?",
    )
    .bind(status, decisionReason, decisionTime, decisionAdmin, caseId)
    .run();
  await logAdminAction(db, {
    admin: decidedBy,
    action: "dmca_decision",
    target: String(caseId),
    reason: decisionReason,
    outcome: status,
    createdAt: decisionTime ?? undefined,
  });
}

export const logAdminAction = (db: AdminDb, input: AdminActionInput) =>
  insertedId(
    db.prepare(
      "INSERT INTO admin_actions (created_at, admin, action, target, reason, outcome) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    ),
    timestamp(input.createdAt),
    input.admin,
    input.action,
    input.target,
    input.reason,
    input.outcome,
  );

export async function listAdminActions(db: AdminDb, limit = 50, offset = 0) {
  const result = await db
    .prepare("SELECT * FROM admin_actions ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?")
    .bind(pageSize(limit), pageOffset(offset))
    .all();
  return result.results;
}

export const enqueueDeletion = (db: AdminDb, input: DeletionInput) =>
  insertedId(
    db.prepare(
      "INSERT INTO deletion_queue (paste_id, reason, created_at) VALUES (?, ?, ?) RETURNING id",
    ),
    input.pasteId,
    input.reason,
    timestamp(input.createdAt),
  );

export async function updateDeletionStatus(
  db: AdminDb,
  id: number,
  status: DeletionStatus,
  lastError: string | null = null,
  completedAt?: string,
  attempts?: number,
) {
  if (!(["pending", "in_progress", "completed", "failed"] as string[]).includes(status)) {
    throw new Error("Invalid deletion status");
  }
  const completed = status === "completed" ? timestamp(completedAt) : null;
  const fields = ["status = ?", "last_error = ?", "completed_at = ?"];
  const values: any[] = [status, lastError, completed];
  if (attempts !== undefined) {
    fields.push("attempts = ?");
    values.push(attempts);
  }
  values.push(id);
  await db
    .prepare(`UPDATE deletion_queue SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
}

export async function listDeletions(db: AdminDb, status?: DeletionStatus, limit = 50, offset = 0) {
  const where = status === undefined ? "" : " WHERE status = ?";
  const values = status === undefined ? [] : [status];
  const result = await db
    .prepare(`SELECT * FROM deletion_queue${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .bind(...values, pageSize(limit), pageOffset(offset))
    .all();
  return result.results;
}

export async function upsertDailyMetric(db: AdminDb, input: DailyMetricInput) {
  const columns = Object.entries(metricColumns).filter(
    ([key]) => input[key as keyof DailyMetricInput] !== undefined,
  );
  const insertColumns = ["day", ...columns.map(([, column]) => column), "updated_at"];
  const insertValues: any[] = [
    input.day,
    ...columns.map(([key]) => input[key as keyof DailyMetricInput]),
    timestamp(input.updatedAt),
  ];
  const updates = columns.map(([, column]) => `${column} = excluded.${column}`);
  updates.push("updated_at = excluded.updated_at");
  await db
    .prepare(
      `INSERT INTO daily_metrics (${insertColumns.join(", ")}) VALUES (${insertColumns.map(() => "?").join(", ")}) ON CONFLICT(day) DO UPDATE SET ${updates.join(", ")}`,
    )
    .bind(...insertValues)
    .run();
}

export async function getDailyMetrics(db: AdminDb, fromDay?: string, toDay?: string, limit = 90) {
  const conditions: string[] = [];
  const values: any[] = [];
  if (fromDay !== undefined) {
    conditions.push("day >= ?");
    values.push(fromDay);
  }
  if (toDay !== undefined) {
    conditions.push("day <= ?");
    values.push(toDay);
  }
  const where = conditions.length === 0 ? "" : ` WHERE ${conditions.join(" AND ")}`;
  const result = await db
    .prepare(`SELECT * FROM daily_metrics${where} ORDER BY day ASC LIMIT ?`)
    .bind(...values, pageSize(limit))
    .all();
  return result.results;
}

export async function recordVisitorHash(db: AdminDb, day: string, ipHash: string) {
  await db
    .prepare("INSERT OR IGNORE INTO visitor_ips (day, ip_hash) VALUES (?, ?)")
    .bind(day, ipHash)
    .run();
}

export const createPasteTombstone = (
  db: AdminDb,
  pasteId: string,
  reason: string,
  deletedAt?: string,
) =>
  db
    .prepare(
      "INSERT OR IGNORE INTO paste_tombstones (paste_id, deleted_at, reason) VALUES (?, ?, ?)",
    )
    .bind(pasteId, timestamp(deletedAt), reason)
    .run();

export async function getPasteTombstone(db: AdminDb, pasteId: string) {
  return db.prepare("SELECT * FROM paste_tombstones WHERE paste_id = ?").bind(pasteId).first();
}

export async function isPasteTombstoned(db: AdminDb, pasteId: string) {
  return (await getPasteTombstone(db, pasteId)) != null;
}

export const tombstonePaste = createPasteTombstone;
export const createTombstone = createPasteTombstone;
export const getTombstone = getPasteTombstone;
export const isTombstoned = isPasteTombstoned;
