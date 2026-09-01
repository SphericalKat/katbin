import { describe, expect, it } from "vitest";

import { R2_THRESHOLD_BYTES } from "../src/constants";
import {
  type PasteRecord,
  type TargetPasteRecord,
  type UserRecord,
  contentFor,
} from "./migrate-postgres";
import {
  replicateBatch,
  type ReplicationEvent,
  type ReplicationSource,
  type ReplicationTarget,
} from "./replicate-postgres";

const user = (id: number): UserRecord => ({
  id,
  email: `user${id}@example.com`,
  normalizedEmail: `user${id}@example.com`,
  hashedPassword: `hash-${id}`,
  confirmedAt: "2024-01-02T03:04:05Z",
  insertedAt: "2024-01-01T03:04:05Z",
  updatedAt: "2024-01-02T03:04:05Z",
});

const paste = (id: string, content: string, ownerId: number | null): PasteRecord => ({
  id,
  content,
  isUrl: false,
  ownerId,
  insertedAt: "2024-01-01T03:04:05Z",
  updatedAt: "2024-01-02T03:04:05Z",
});

class FakeSource implements ReplicationSource {
  constructor(
    readonly users: Map<number, UserRecord>,
    readonly pastes: Map<string, PasteRecord>,
    readonly events: ReplicationEvent[],
  ) {}

  listReplicationEventsAfter(cursor: string | null, limit: number) {
    const after = cursor === null ? 0n : BigInt(cursor);
    return Promise.resolve(this.events.filter((event) => BigInt(event.id) > after).slice(0, limit));
  }

  getReplicationQueue(cursor: string | null) {
    const after = cursor === null ? 0n : BigInt(cursor);
    const pending = this.events.filter((event) => BigInt(event.id) > after);
    return Promise.resolve({ pending: pending.length, latestId: this.events.at(-1)?.id ?? null });
  }

  getUser(id: number) {
    const value = this.users.get(id);
    return Promise.resolve(value ? { ...value } : null);
  }

  getPaste(id: string) {
    const value = this.pastes.get(id);
    return Promise.resolve(value ? { ...value } : null);
  }
}

class FakeTarget implements ReplicationTarget {
  readonly users = new Map<number, UserRecord>();
  readonly pastes = new Map<string, TargetPasteRecord>();
  readonly objects = new Map<string, Uint8Array>();
  cursor: string | null = null;

  getCursor() {
    return Promise.resolve(this.cursor);
  }

  saveCursor(_name: "outbox", cursor: string) {
    this.cursor = cursor;
    return Promise.resolve();
  }

  upsertUser(value: UserRecord) {
    this.users.set(value.id, { ...value });
    return Promise.resolve();
  }

  upsertPaste(value: TargetPasteRecord) {
    const current = this.pastes.get(value.id);
    if (current?.storageKey && current.storageKey !== value.storageKey)
      this.objects.delete(current.storageKey);
    this.pastes.set(value.id, { ...value });
    return Promise.resolve();
  }

  putPasteContent(key: string, content: Uint8Array) {
    this.objects.set(key, content.slice());
    return Promise.resolve();
  }

  deleteUser(id: number) {
    this.users.delete(id);
    return Promise.resolve();
  }

  deletePaste(id: string) {
    const current = this.pastes.get(id);
    if (current?.storageKey) this.objects.delete(current.storageKey);
    this.pastes.delete(id);
    return Promise.resolve();
  }
}

describe("PostgreSQL replication", () => {
  it("applies inserts, updates, deletes, and resumes from the event cursor", async () => {
    const largeContent = "x".repeat(R2_THRESHOLD_BYTES + 1);
    const source = new FakeSource(
      new Map([[7, user(7)]]),
      new Map([["paste", paste("paste", largeContent, 7)]]),
      [
        { id: "1", table: "users", rowId: "7", operation: "INSERT" },
        { id: "2", table: "pastes", rowId: "paste", operation: "INSERT" },
        { id: "3", table: "pastes", rowId: "paste", operation: "UPDATE" },
        { id: "4", table: "pastes", rowId: "paste", operation: "DELETE" },
        { id: "5", table: "users", rowId: "7", operation: "DELETE" },
      ],
    );
    const target = new FakeTarget();

    await expect(replicateBatch(source, target, { batchSize: 2 })).resolves.toEqual({
      processed: 2,
      cursor: "2",
      pending: 3,
      latestId: "5",
    });
    expect(target.users).toEqual(new Map([[7, user(7)]]));
    expect(target.pastes.get("paste")).toMatchObject(contentFor(paste("paste", largeContent, 7)));
    expect(target.objects.get("paste")?.byteLength).toBe(largeContent.length);

    source.pastes.set("paste", paste("paste", "updated", 7));
    await expect(replicateBatch(source, target, { batchSize: 2 })).resolves.toEqual({
      processed: 2,
      cursor: "4",
      pending: 1,
      latestId: "5",
    });
    expect(target.pastes).toEqual(new Map());
    expect(target.objects).toEqual(new Map());

    await expect(replicateBatch(source, target, { batchSize: 2 })).resolves.toEqual({
      processed: 1,
      cursor: "5",
      pending: 0,
      latestId: "5",
    });
    expect(target.users).toEqual(new Map());
  });
});
