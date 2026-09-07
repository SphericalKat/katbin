import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const pastes = sqliteTable(
  "pastes",
  {
    id: text("id").primaryKey(),
    content: text("content").notNull(),
    isUrl: integer("is_url", { mode: "boolean" }).notNull().default(false),
    ownerId: integer("owner_id"),
    storageType: text("storage_type").notNull().default("d1"),
    storageKey: text("storage_key"),
    contentLengthBytes: integer("content_length_bytes").notNull(),
    contentSha256: text("content_sha256").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => [index("pastes_owner_id_index").on(table.ownerId)],
);

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  normalizedEmail: text("normalized_email").notNull().unique(),
  hashedPassword: text("hashed_password").notNull(),
  confirmedAt: text("confirmed_at"),
  insertedAt: text("inserted_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  insertedAt: integer("inserted_at").notNull(),
});

export const accountTokens = sqliteTable("account_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  context: text("context").notNull(),
  sentTo: text("sent_to").notNull(),
  insertedAt: integer("inserted_at").notNull(),
});

export const accountBans = sqliteTable(
  "account_bans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    liftedAt: text("lifted_at"),
  },
  (table) => [index("account_bans_user_id_index").on(table.userId)],
);

export const ipBans = sqliteTable(
  "ip_bans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    target: text("target").notNull(),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    liftedAt: text("lifted_at"),
  },
  (table) => [index("ip_bans_target_index").on(table.target)],
);

export const dmcaCases = sqliteTable("dmca_cases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reference: text("reference").notNull(),
  complainant: text("complainant").notNull(),
  receivedAt: text("received_at").notNull(),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("open"),
  decisionReason: text("decision_reason").notNull().default(""),
  decidedAt: text("decided_at"),
  decidedBy: text("decided_by"),
});

export const dmcaCasePastes = sqliteTable(
  "dmca_case_pastes",
  {
    caseId: integer("case_id").notNull(),
    pasteId: text("paste_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.caseId, table.pasteId] })],
);

export const adminActions = sqliteTable("admin_actions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at").notNull(),
  admin: text("admin").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  reason: text("reason").notNull(),
  outcome: text("outcome").notNull(),
});

export const abuseEvents = sqliteTable(
  "abuse_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    createdAt: text("created_at").notNull(),
    ip: text("ip").notNull(),
    eventType: text("event_type").notNull(),
    accountId: integer("account_id"),
    pasteId: text("paste_id"),
    email: text("email"),
  },
  (table) => [
    index("abuse_events_account_id_index").on(table.accountId),
    index("abuse_events_paste_id_index").on(table.pasteId),
    index("abuse_events_ip_index").on(table.ip),
    index("abuse_events_created_at_index").on(table.createdAt),
  ],
);

export const dailyMetrics = sqliteTable("daily_metrics", {
  day: text("day").primaryKey(),
  accountsCreated: integer("accounts_created").default(0),
  pastesCreated: integer("pastes_created").default(0),
  pastesAnon: integer("pastes_anon").default(0),
  pastesAuthed: integer("pastes_authed").default(0),
  textPastes: integer("text_pastes").default(0),
  shortLinks: integer("short_links").default(0),
  reads: integer("reads").default(0),
  redirects: integer("redirects").default(0),
  visitors: integer("visitors").default(0),
  ipBanRejects: integer("ip_ban_rejects").default(0),
  rateLimitRejects: integer("rate_limit_rejects").default(0),
  serverErrors: integer("server_errors").default(0),
  updatedAt: text("updated_at").notNull(),
});

export const visitorIps = sqliteTable(
  "visitor_ips",
  {
    day: text("day").notNull(),
    ipHash: text("ip_hash").notNull(),
  },
  (table) => [primaryKey({ columns: [table.day, table.ipHash] })],
);

export const deletionQueue = sqliteTable(
  "deletion_queue",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pasteId: text("paste_id").notNull(),
    reason: text("reason").notNull(),
    createdAt: text("created_at").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").default(0),
    lastError: text("last_error"),
    completedAt: text("completed_at"),
  },
  (table) => [index("deletion_queue_status_index").on(table.status)],
);

export const pasteTombstones = sqliteTable("paste_tombstones", {
  pasteId: text("paste_id").primaryKey(),
  storageKey: text("storage_key"),
  deletedAt: text("deleted_at").notNull(),
  reason: text("reason").notNull(),
});
