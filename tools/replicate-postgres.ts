#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  CloudflareTarget,
  contentFor,
  PostgresSource,
  type PasteRecord,
  type UserRecord,
} from "./migrate-postgres.ts";

type ReplicationTable = "users" | "pastes";
type ReplicationOperation = "INSERT" | "UPDATE" | "DELETE";

export interface ReplicationEvent {
  id: string;
  table: ReplicationTable;
  rowId: string;
  operation: ReplicationOperation;
}

export interface ReplicationSource {
  listReplicationEventsAfter(cursor: string | null, limit: number): Promise<ReplicationEvent[]>;
  getReplicationQueue(cursor: string | null): Promise<{ pending: number; latestId: string | null }>;
  getUser(id: number): Promise<UserRecord | null>;
  getPaste(id: string): Promise<PasteRecord | null>;
}

export interface ReplicationTarget {
  getCursor(name: "outbox"): Promise<string | null>;
  saveCursor(name: "outbox", cursor: string): Promise<void>;
  upsertUser(user: UserRecord): Promise<void>;
  upsertPaste(paste: ReturnType<typeof contentFor>): Promise<void>;
  putPasteContent(key: string, content: Uint8Array): Promise<void>;
  deleteUser(id: number): Promise<void>;
  deletePaste(id: string): Promise<void>;
}

export interface ReplicationOptions {
  batchSize?: number;
  pollIntervalMs?: number;
  once?: boolean;
  drain?: boolean;
  onBatch?: (summary: ReplicationSummary) => void;
}

export interface ReplicationSummary {
  processed: number;
  cursor: string | null;
  pending: number;
  latestId: string | null;
}

const parsePositiveInteger = (value: string, name: string) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be positive`);
  return parsed;
};

const parseUserId = (value: string) => parsePositiveInteger(value, "Replication user id");

const ensureEventOrder = (previous: string | null, next: string) => {
  if (!/^\d+$/.test(next) || BigInt(next) < 1n)
    throw new Error(`Invalid replication event id: ${next}`);
  if (previous !== null && BigInt(next) <= BigInt(previous))
    throw new Error(`Replication cursor moved backwards: ${previous} -> ${next}`);
};

const applyEvent = async (
  source: ReplicationSource,
  target: ReplicationTarget,
  event: ReplicationEvent,
) => {
  if (event.table === "users") {
    const id = parseUserId(event.rowId);
    if (event.operation === "DELETE") return target.deleteUser(id);
    const user = await source.getUser(id);
    return user ? target.upsertUser(user) : target.deleteUser(id);
  }

  if (event.operation === "DELETE") return target.deletePaste(event.rowId);
  const paste = await source.getPaste(event.rowId);
  if (!paste) return target.deletePaste(event.rowId);
  const targetPaste = contentFor(paste);
  if (targetPaste.storageKey)
    await target.putPasteContent(targetPaste.storageKey, new TextEncoder().encode(paste.content));
  await target.upsertPaste(targetPaste);
};

export const replicateBatch = async (
  source: ReplicationSource,
  target: ReplicationTarget,
  { batchSize = 100 }: Pick<ReplicationOptions, "batchSize"> = {},
): Promise<ReplicationSummary> => {
  const size = parsePositiveInteger(String(batchSize), "Replication batch size");
  let cursor = await target.getCursor("outbox");
  const events = await source.listReplicationEventsAfter(cursor, size);
  for (const event of events) {
    ensureEventOrder(cursor, event.id);
    await applyEvent(source, target, event);
    await target.saveCursor("outbox", event.id);
    cursor = event.id;
  }
  return { processed: events.length, cursor, ...(await source.getReplicationQueue(cursor)) };
};

export const runReplication = async (
  source: ReplicationSource,
  target: ReplicationTarget,
  {
    batchSize = 100,
    pollIntervalMs = 1000,
    once = false,
    drain = false,
    onBatch,
  }: ReplicationOptions = {},
) => {
  const interval = parsePositiveInteger(String(pollIntervalMs), "Replication poll interval");
  for (;;) {
    const summary = await replicateBatch(source, target, { batchSize });
    if (summary.processed || summary.pending) onBatch?.(summary);
    if (once || (drain && summary.processed === 0)) return summary;
    if (summary.processed === 0) await new Promise((resolve) => setTimeout(resolve, interval));
  }
};

export const runConfiguredReplication = async () => {
  const source = await PostgresSource.fromEnv();
  try {
    const target = CloudflareTarget.fromEnv();
    const args = new Set(process.argv.slice(2));
    let processedTotal = 0;
    const startedAt = Date.now();
    return await runReplication(source, target, {
      batchSize: Number(process.env.REPLICATION_BATCH_SIZE ?? 100),
      pollIntervalMs: Number(process.env.REPLICATION_POLL_INTERVAL_MS ?? 1000),
      once: args.has("--once"),
      drain: args.has("--drain"),
      onBatch: (summary) => {
        processedTotal += summary.processed;
        const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
        const ratePerSecond = processedTotal / elapsedSeconds;
        console.log(
          JSON.stringify({
            ...summary,
            processedTotal,
            ratePerSecond: Math.round(ratePerSecond * 10) / 10,
            etaSeconds: summary.pending === 0 ? 0 : Math.ceil(summary.pending / ratePerSecond),
          }),
        );
      },
    });
  } finally {
    await source.close();
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runConfiguredReplication().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Replication failed");
    process.exitCode = 1;
  });
}
