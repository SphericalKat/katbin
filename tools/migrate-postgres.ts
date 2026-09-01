#!/usr/bin/env node

import { createHash, createHmac } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { R2_THRESHOLD_BYTES } from "../src/constants.ts";

export type CursorName = "users" | "pastes";

export interface UserRecord {
  id: number;
  email: string;
  normalizedEmail: string;
  hashedPassword: string;
  confirmedAt: string | null;
  insertedAt: string;
  updatedAt: string;
}

export interface PasteRecord {
  id: string;
  content: string;
  isUrl: boolean;
  ownerId: number | null;
  insertedAt: string;
  updatedAt: string;
}

export interface TargetPasteRecord extends PasteRecord {
  content: string;
  storageType: "d1" | "r2";
  storageKey: string | null;
  contentLengthBytes: number;
  contentSha256: string;
}

export interface SourceAdapter {
  countUsers(): Promise<number>;
  countPastes(): Promise<number>;
  listUsersAfter(cursor: number | null, limit: number): Promise<UserRecord[]>;
  listPastesAfter(cursor: string | null, limit: number): Promise<PasteRecord[]>;
}

export interface TargetAdapter {
  getCursor(name: CursorName): Promise<string | null>;
  saveCursor(name: CursorName, cursor: string): Promise<void>;
  upsertUser(user: UserRecord): Promise<void>;
  upsertPaste(paste: TargetPasteRecord): Promise<void>;
  putPasteContent(key: string, content: Uint8Array): Promise<void>;
  getUser(id: number): Promise<UserRecord | null>;
  getPaste(id: string): Promise<TargetPasteRecord | null>;
  getPasteContent(key: string): Promise<Uint8Array | null>;
  countUsers(): Promise<number>;
  countPastes(): Promise<number>;
}

export class MigrationMismatchError extends Error {
  readonly recordType: string;
  readonly recordId: string;
  readonly field: string;

  constructor(recordType: string, recordId: string, field: string) {
    super(`Migration validation failed for ${recordType} ${recordId}: ${field}`);
    this.name = "MigrationMismatchError";
    this.recordType = recordType;
    this.recordId = recordId;
    this.field = field;
  }
}

class MigrationWriteError extends Error {
  constructor(recordType: string, recordId: string) {
    super(`Migration target write failed for ${recordType} ${recordId}`);
    this.name = "MigrationWriteError";
  }
}

const encoder = new TextEncoder();

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const contentFor = (paste: PasteRecord): TargetPasteRecord => {
  const bytes = encoder.encode(paste.content);
  const useR2 = bytes.byteLength > R2_THRESHOLD_BYTES;
  return {
    ...paste,
    content: useR2 ? "" : paste.content,
    storageType: useR2 ? "r2" : "d1",
    storageKey: useR2 ? paste.id : null,
    contentLengthBytes: bytes.byteLength,
    contentSha256: sha256(bytes),
  };
};

const mismatch = (type: string, id: string | number, field: string): never => {
  throw new MigrationMismatchError(type, String(id), field);
};

const equal = (
  actual: unknown,
  expected: unknown,
  type: string,
  id: string | number,
  field: string,
) => {
  if (actual !== expected) mismatch(type, id, field);
};

const validateUser = async (target: TargetAdapter, expected: UserRecord) => {
  const actual = await target.getUser(expected.id);
  if (actual === null) throw new MigrationMismatchError("user", String(expected.id), "row");
  for (const field of [
    "id",
    "email",
    "normalizedEmail",
    "hashedPassword",
    "confirmedAt",
    "insertedAt",
    "updatedAt",
  ] as const) {
    equal(actual[field], expected[field], "user", expected.id, field);
  }
};

const validatePaste = async (
  target: TargetAdapter,
  source: PasteRecord,
  expected: TargetPasteRecord,
) => {
  const actual = await target.getPaste(expected.id);
  if (actual === null) throw new MigrationMismatchError("paste", expected.id, "row");
  for (const field of [
    "id",
    "isUrl",
    "ownerId",
    "insertedAt",
    "updatedAt",
    "storageType",
    "storageKey",
    "contentLengthBytes",
    "contentSha256",
  ] as const) {
    equal(actual[field], expected[field], "paste", expected.id, field);
  }

  if (expected.storageType === "d1")
    equal(actual.content, source.content, "paste", expected.id, "content");
  else equal(actual.content, "", "paste", expected.id, "content");
  const bytes =
    expected.storageType === "r2"
      ? await target.getPasteContent(expected.storageKey!)
      : encoder.encode(actual.content);
  if (bytes === null) throw new MigrationMismatchError("paste", expected.id, "content");
  equal(bytes.byteLength, expected.contentLengthBytes, "paste", expected.id, "content length");
  equal(sha256(bytes), expected.contentSha256, "paste", expected.id, "content checksum");
};

const validateTotal = async (actual: number, expected: number, name: CursorName) => {
  if (actual !== expected) mismatch("dataset", name, "row total");
};

const migrateUsers = async (source: SourceAdapter, target: TargetAdapter, batchSize: number) => {
  const cursorValue = await target.getCursor("users");
  let cursor = cursorValue === null ? null : parseCursorId(cursorValue, "users");
  for (;;) {
    const batch = await source.listUsersAfter(cursor, batchSize);
    if (!batch.length) return;
    for (const user of batch) {
      try {
        await target.upsertUser(user);
        await validateUser(target, user);
      } catch (error) {
        if (error instanceof MigrationMismatchError) throw error;
        throw new MigrationWriteError("user", user.id.toString());
      }
    }
    const nextCursor = batch.at(-1)!.id;
    if (cursor !== null && nextCursor <= cursor) mismatch("user", nextCursor, "cursor order");
    await target.saveCursor("users", String(nextCursor));
    cursor = nextCursor;
  }
};

const migratePastes = async (source: SourceAdapter, target: TargetAdapter, batchSize: number) => {
  let cursor = await target.getCursor("pastes");
  for (;;) {
    const batch = await source.listPastesAfter(cursor, batchSize);
    if (!batch.length) return;
    for (const sourcePaste of batch) {
      const targetPaste = contentFor(sourcePaste);
      try {
        if (targetPaste.storageKey) {
          await target.putPasteContent(targetPaste.storageKey, encoder.encode(sourcePaste.content));
        }
        await target.upsertPaste(targetPaste);
        await validatePaste(target, sourcePaste, targetPaste);
      } catch (error) {
        if (error instanceof MigrationMismatchError) throw error;
        throw new MigrationWriteError("paste", sourcePaste.id);
      }
    }
    const nextCursor = batch.at(-1)!.id;
    if (cursor !== null && nextCursor <= cursor) mismatch("paste", nextCursor, "cursor order");
    await target.saveCursor("pastes", nextCursor);
    cursor = nextCursor;
  }
};

export interface MigrationOptions {
  batchSize?: number;
}

export interface MigrationSummary {
  users: number;
  pastes: number;
}

export const migrate = async (
  source: SourceAdapter,
  target: TargetAdapter,
  { batchSize = 100 }: MigrationOptions = {},
): Promise<MigrationSummary> => {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1)
    throw new Error("Migration batch size must be positive");
  const userTotal = await source.countUsers();
  await migrateUsers(source, target, batchSize);
  await validateTotal(await target.countUsers(), userTotal, "users");

  const pasteTotal = await source.countPastes();
  await migratePastes(source, target, batchSize);
  await validateTotal(await target.countPastes(), pasteTotal, "pastes");
  return { users: userTotal, pastes: pasteTotal };
};

interface PostgresPool {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}

const parseId = (value: unknown, type: string): number => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) mismatch(type, String(value), "identifier");
  return id;
};

const parseOptionalId = (value: unknown, type: string): number | null =>
  value === null ? null : parseId(value, type);

const parseCount = (value: unknown, name: string) => {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) mismatch("dataset", name, "row total");
  return count;
};

const timestamp = (column: string) => `to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

export class PostgresSource implements SourceAdapter {
  private readonly pool: PostgresPool;

  constructor(pool: PostgresPool) {
    this.pool = pool;
  }

  static async fromEnv() {
    const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
    if (!connectionString) throw new Error("Set POSTGRES_URL or DATABASE_URL");
    const { Pool } = await import("pg");
    return new PostgresSource(new Pool({ connectionString }) as unknown as PostgresPool);
  }

  async close() {
    await this.pool.end();
  }

  private async query<T extends Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ) {
    return (await this.pool.query<T>(text, values)).rows;
  }

  async countUsers() {
    const [row] = await this.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM users");
    return parseCount(row.count, "users");
  }

  async countPastes() {
    const [row] = await this.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM pastes");
    return parseCount(row.count, "pastes");
  }

  async listUsersAfter(cursor: number | null, limit: number) {
    const where = cursor === null ? "" : "WHERE id > $1";
    const values = cursor === null ? [limit] : [cursor, limit];
    const rows = await this.query<{
      id: string;
      email: string;
      hashedPassword: string;
      confirmedAt: string | null;
      insertedAt: string;
      updatedAt: string;
    }>(
      `SELECT id::text AS id, email::text AS email, hashed_password AS "hashedPassword",
              ${timestamp("confirmed_at")} AS "confirmedAt",
              ${timestamp("inserted_at")} AS "insertedAt",
              ${timestamp("updated_at")} AS "updatedAt"
         FROM users ${where} ORDER BY id ASC LIMIT $${values.length}`,
      values,
    );
    return rows.map((row) => ({
      id: parseId(row.id, "user"),
      email: row.email,
      normalizedEmail: row.email.toLowerCase(),
      hashedPassword: row.hashedPassword,
      confirmedAt: row.confirmedAt,
      insertedAt: row.insertedAt,
      updatedAt: row.updatedAt,
    }));
  }

  async listPastesAfter(cursor: string | null, limit: number) {
    const where = cursor === null ? "" : "WHERE id > $1";
    const values = cursor === null ? [limit] : [cursor, limit];
    const rows = await this.query<{
      id: string;
      isUrl: boolean;
      content: string;
      ownerId: string | null;
      insertedAt: string;
      updatedAt: string;
    }>(
      `SELECT id, is_url AS "isUrl", content, belongs_to::text AS "ownerId",
              ${timestamp("inserted_at")} AS "insertedAt",
              ${timestamp("updated_at")} AS "updatedAt"
         FROM pastes ${where} ORDER BY id ASC LIMIT $${values.length}`,
      values,
    );
    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      isUrl: row.isUrl,
      ownerId: parseOptionalId(row.ownerId, "paste owner"),
      insertedAt: row.insertedAt,
      updatedAt: row.updatedAt,
    }));
  }
}

const parseCursorId = (value: string, name: CursorName) => parseId(value, name.slice(0, -1));

interface D1Executor {
  query<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<void>;
}

interface CloudflareD1Options {
  accountId: string;
  databaseId: string;
  apiToken: string;
  fetch?: typeof fetch;
  apiBaseUrl?: string;
}

export class CloudflareD1 implements D1Executor {
  private readonly fetch: typeof fetch;
  private readonly apiBaseUrl: string;
  private readonly options: CloudflareD1Options;

  constructor(options: CloudflareD1Options) {
    this.options = options;
    this.fetch = options.fetch ?? fetch;
    this.apiBaseUrl = options.apiBaseUrl ?? "https://api.cloudflare.com/client/v4";
  }

  async query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
    const response = await this.fetch(
      `${this.apiBaseUrl}/accounts/${this.options.accountId}/d1/database/${this.options.databaseId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql, params }),
      },
    );
    const body = (await response.json()) as {
      success?: boolean;
      result?: Array<{ results?: unknown[] }>;
    };
    const result = body.result?.[0];
    if (!response.ok || !body.success || !result)
      throw new Error(`Cloudflare D1 request failed (${response.status})`);
    return (result.results ?? []) as T[];
  }

  async execute(sql: string, params: unknown[] = []) {
    await this.query(sql, params);
  }
}

const userFromRow = (row: Record<string, unknown>): UserRecord => ({
  id: parseId(row.id, "user"),
  email: String(row.email),
  normalizedEmail: String(row.normalized_email),
  hashedPassword: String(row.hashed_password),
  confirmedAt: row.confirmed_at === null ? null : String(row.confirmed_at),
  insertedAt: String(row.inserted_at),
  updatedAt: String(row.updated_at),
});

const pasteFromRow = (row: Record<string, unknown>): TargetPasteRecord => ({
  id: String(row.id),
  content: String(row.content),
  isUrl: Boolean(Number(row.is_url)),
  ownerId: row.owner_id === null ? null : parseId(row.owner_id, "paste owner"),
  storageType: String(row.storage_type) as TargetPasteRecord["storageType"],
  storageKey: row.storage_key === null ? null : String(row.storage_key),
  contentLengthBytes: Number(row.content_length_bytes),
  contentSha256: String(row.content_sha256),
  insertedAt: String(row.inserted_at),
  updatedAt: String(row.updated_at),
});

export class CloudflareTarget implements TargetAdapter {
  private readonly db: D1Executor;
  private readonly objects: R2ObjectStore;

  constructor(db: D1Executor, objects: R2ObjectStore) {
    this.db = db;
    this.objects = objects;
  }

  static fromEnv() {
    const accountId = requiredEnv("CLOUDFLARE_ACCOUNT_ID");
    const apiToken = requiredEnv("CLOUDFLARE_API_TOKEN");
    const databaseId = requiredEnv("D1_DATABASE_ID");
    const bucket = requiredEnv("R2_BUCKET_NAME");
    const accessKeyId = requiredEnv("R2_ACCESS_KEY_ID");
    const secretAccessKey = requiredEnv("R2_SECRET_ACCESS_KEY");
    const endpoint = process.env.R2_ENDPOINT ?? `https://${accountId}.r2.cloudflarestorage.com`;
    return new CloudflareTarget(
      new CloudflareD1({ accountId, databaseId, apiToken }),
      new R2ObjectStore({ endpoint, bucket, accessKeyId, secretAccessKey }),
    );
  }

  async getCursor(name: CursorName) {
    const [row] = await this.db.query<{ cursor: string }>(
      "SELECT cursor FROM migration_cursors WHERE name = ?",
      [name],
    );
    return row?.cursor ?? null;
  }

  async saveCursor(name: CursorName, cursor: string) {
    await this.db.execute(
      `INSERT INTO migration_cursors (name, cursor) VALUES (?, ?)
       ON CONFLICT(name) DO UPDATE SET cursor = excluded.cursor`,
      [name, cursor],
    );
  }

  async upsertUser(user: UserRecord) {
    await this.db.execute(
      `INSERT INTO users
         (id, email, normalized_email, hashed_password, confirmed_at, inserted_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         normalized_email = excluded.normalized_email,
         hashed_password = excluded.hashed_password,
         confirmed_at = excluded.confirmed_at,
         inserted_at = excluded.inserted_at,
         updated_at = excluded.updated_at`,
      [
        user.id,
        user.email,
        user.normalizedEmail,
        user.hashedPassword,
        user.confirmedAt,
        user.insertedAt,
        user.updatedAt,
      ],
    );
  }

  async upsertPaste(paste: TargetPasteRecord) {
    await this.db.execute(
      `INSERT INTO pastes
         (id, content, is_url, owner_id, storage_type, storage_key,
          content_length_bytes, content_sha256, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         content = excluded.content,
         is_url = excluded.is_url,
         owner_id = excluded.owner_id,
         storage_type = excluded.storage_type,
         storage_key = excluded.storage_key,
         content_length_bytes = excluded.content_length_bytes,
         content_sha256 = excluded.content_sha256,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at`,
      [
        paste.id,
        paste.content,
        paste.isUrl ? 1 : 0,
        paste.ownerId,
        paste.storageType,
        paste.storageKey,
        paste.contentLengthBytes,
        paste.contentSha256,
        paste.insertedAt,
        paste.updatedAt,
      ],
    );
  }

  putPasteContent(key: string, content: Uint8Array) {
    return this.objects.put(key, content);
  }

  async getUser(id: number) {
    const [row] = await this.db.query("SELECT * FROM users WHERE id = ?", [id]);
    return row ? userFromRow(row) : null;
  }

  async getPaste(id: string) {
    const [row] = await this.db.query("SELECT * FROM pastes WHERE id = ?", [id]);
    return row ? pasteFromRow(row) : null;
  }

  getPasteContent(key: string) {
    return this.objects.get(key);
  }

  private async count(table: "users" | "pastes") {
    const [row] = await this.db.query<{ count: number | string }>(
      `SELECT COUNT(*) AS count FROM ${table}`,
    );
    return parseCount(row?.count, table);
  }

  countUsers() {
    return this.count("users");
  }

  countPastes() {
    return this.count("pastes");
  }
}

interface R2ObjectStoreOptions {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  fetch?: typeof fetch;
}

export class R2ObjectStore {
  private readonly fetch: typeof fetch;
  private readonly options: R2ObjectStoreOptions;

  constructor(options: R2ObjectStoreOptions) {
    this.options = options;
    this.fetch = options.fetch ?? fetch;
  }

  private async request(method: "GET" | "PUT", key: string, body?: Uint8Array) {
    const endpoint = new URL(this.options.endpoint);
    const basePath = endpoint.pathname.replace(/\/$/, "");
    const encodePathPart = (value: string) =>
      encodeURIComponent(value).replace(
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      );
    const path = `${basePath}/${[this.options.bucket, ...key.split("/")].map(encodePathPart).join("/")}`;
    const url = `${endpoint.origin}${path}`;
    const payloadHash = sha256(body ?? new Uint8Array());
    const now = new Date();
    const amzDate = now
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
    const date = amzDate.slice(0, 8);
    const scope = `${date}/auto/s3/aws4_request`;
    const canonicalHeaders = `host:${endpoint.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = `${method}\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(encoder.encode(canonicalRequest))}`;
    const dateKey = createHmac("sha256", `AWS4${this.options.secretAccessKey}`)
      .update(date)
      .digest();
    const regionKey = createHmac("sha256", dateKey).update("auto").digest();
    const serviceKey = createHmac("sha256", regionKey).update("s3").digest();
    const signingKey = createHmac("sha256", serviceKey).update("aws4_request").digest();
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    const response = await this.fetch(url, {
      method,
      headers: {
        Authorization: `AWS4-HMAC-SHA256 Credential=${this.options.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
      },
      ...(body ? { body: body as unknown as BodyInit } : {}),
    });
    return response;
  }

  async put(key: string, content: Uint8Array) {
    const response = await this.request("PUT", key, content);
    if (!response.ok) throw new Error(`R2 upload failed (${response.status})`);
  }

  async get(key: string) {
    const response = await this.request("GET", key);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`R2 download failed (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  }
}

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
};

export const runConfiguredMigration = async () => {
  const source = await PostgresSource.fromEnv();
  try {
    const target = CloudflareTarget.fromEnv();
    const configuredBatchSize = Number(process.env.MIGRATION_BATCH_SIZE ?? 100);
    return await migrate(source, target, { batchSize: configuredBatchSize });
  } finally {
    await source.close();
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runConfiguredMigration()
    .then((summary) => console.log(JSON.stringify(summary)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Migration failed");
      process.exitCode = 1;
    });
}
