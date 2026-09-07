import { beforeEach, describe, expect, it } from "vitest";

import {
  enqueuePermanentDeletion,
  permanentlyDeletePaste,
  processDeletionQueue,
  type DeletionDB,
} from "./deletion";

type Paste = { id: string; content: string; storage_key?: string | null };
type Tombstone = {
  paste_id: string;
  storage_key: string | null;
  deleted_at: string;
  reason: string;
};
type QueueRow = {
  id: number;
  paste_id: string;
  reason: string;
  status: string;
  attempts: number;
  last_error: string | null;
  completed_at: string | null;
};

class MemoryDB implements DeletionDB {
  pastes = new Map<string, Paste>();
  tombstones = new Map<string, Tombstone>();
  queue: QueueRow[] = [];
  private nextQueueId = 1;

  prepare(query: string) {
    return {
      bind: (...args: any[]) => ({
        run: async () => this.run(query, args),
        all: async () => this.all(query, args),
        first: async () => this.first(query, args),
      }),
    };
  }

  private first(query: string, args: any[]) {
    if (query.includes("FROM pastes")) return this.pastes.get(String(args[0]));
    if (query.includes("FROM paste_tombstones")) return this.tombstones.get(String(args[0]));
    return undefined;
  }

  private all(query: string, args: any[]) {
    if (!query.includes("FROM deletion_queue")) return { results: [] };
    const limit = Number(args[0]);
    return {
      results: this.queue
        .filter((row) => row.status === "pending" || row.status === "failed")
        .sort((left, right) => left.id - right.id)
        .slice(0, limit),
    };
  }

  private run(query: string, args: any[]) {
    if (query.startsWith("DELETE FROM pastes")) {
      this.pastes.delete(String(args[0]));
    } else if (query.startsWith("INSERT INTO paste_tombstones")) {
      const pasteId = String(args[0]);
      const existing = this.tombstones.get(pasteId);
      this.tombstones.set(pasteId, {
        paste_id: pasteId,
        storage_key: args[1] ?? existing?.storage_key ?? null,
        deleted_at: existing?.deleted_at ?? "CURRENT_TIMESTAMP",
        reason: String(args[2]),
      });
    } else if (query.startsWith("INSERT INTO deletion_queue")) {
      this.queue.push({
        id: this.nextQueueId++,
        paste_id: String(args[0]),
        reason: String(args[1]),
        status: "pending",
        attempts: 0,
        last_error: null,
        completed_at: null,
      });
    } else if (query.includes("UPDATE deletion_queue") && query.includes("WHERE id = ?")) {
      const row = this.queue.find((candidate) => candidate.id === Number(args[4]));
      if (row) {
        row.status = String(args[0]);
        row.attempts = Number(args[1]);
        row.last_error = args[2];
        row.completed_at = args[3];
      }
    } else if (query.includes("UPDATE deletion_queue")) {
      for (const row of this.queue) {
        if (
          row.paste_id === String(args[3]) &&
          (row.status === "pending" || row.status === "failed")
        ) {
          row.status = String(args[0]);
          row.last_error = args[1];
          row.completed_at = args[2];
        }
      }
    }
    return {};
  }
}

class MemoryBucket {
  objects = new Set<string>();
  deleteCalls: string[] = [];
  failures = 0;

  async delete(key: string): Promise<void> {
    this.deleteCalls.push(key);
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error("R2 unavailable");
    }
    this.objects.delete(key);
  }
}

describe("permanent deletion", () => {
  let db: MemoryDB;
  let bucket: MemoryBucket;

  beforeEach(() => {
    db = new MemoryDB();
    bucket = new MemoryBucket();
  });

  it("deletes inline content and keeps a tombstone", async () => {
    db.pastes.set("inline", { id: "inline", content: "secret" });

    const result = await permanentlyDeletePaste(db, bucket, "inline");

    expect(result.status).toBe("completed");
    expect(db.pastes.has("inline")).toBe(false);
    expect(db.tombstones.get("inline")).toMatchObject({
      paste_id: "inline",
      storage_key: null,
      reason: "permanent deletion",
    });
  });

  it("deletes R2 content", async () => {
    db.pastes.set("large", { id: "large", content: "", storage_key: "pastes/large" });
    bucket.objects.add("pastes/large");

    const result = await permanentlyDeletePaste(db, bucket, "large");

    expect(result).toEqual({ status: "completed", r2KeysTried: ["pastes/large"] });
    expect(db.tombstones.get("large")).toMatchObject({ storage_key: "pastes/large" });
    expect(bucket.objects.has("pastes/large")).toBe(false);
  });

  it("reports storage failure while keeping the D1 row deleted", async () => {
    db.pastes.set("failed", { id: "failed", content: "", storage_key: "pastes/failed" });
    bucket.failures = 1;
    await enqueuePermanentDeletion(db, "failed", "abuse");

    const result = await permanentlyDeletePaste(db, bucket, "failed");

    expect(result.status).toBe("failed");
    expect(db.pastes.has("failed")).toBe(false);
    expect(db.tombstones.get("failed")).toMatchObject({ storage_key: "pastes/failed" });
    expect(db.queue[0]).toMatchObject({ status: "failed", last_error: "R2 unavailable" });
  });

  it("retries a failed storage delete", async () => {
    db.pastes.set("retry", { id: "retry", content: "", storage_key: "pastes/retry" });
    bucket.failures = 1;

    expect((await permanentlyDeletePaste(db, bucket, "retry")).status).toBe("failed");
    expect((await permanentlyDeletePaste(db, bucket, "retry")).status).toBe("completed");
    expect(bucket.deleteCalls).toEqual(["pastes/retry", "pastes/retry"]);
  });

  it("is safe to repeat", async () => {
    db.pastes.set("repeat", { id: "repeat", content: "secret" });

    await permanentlyDeletePaste(db, bucket, "repeat");
    const result = await permanentlyDeletePaste(db, bucket, "repeat");

    expect(result.status).toBe("completed");
    expect(db.tombstones.size).toBe(1);
  });

  it("retries a failed queue deletion with the tombstone storage key", async () => {
    db.pastes.set("retry", { id: "retry", content: "", storage_key: "pastes/retry" });
    bucket.objects.add("pastes/retry");
    bucket.failures = 1;
    await enqueuePermanentDeletion(db, "retry", "moderation");

    expect(await processDeletionQueue(db, bucket)).toEqual({ processed: 1, failures: 1 });
    expect(db.pastes.has("retry")).toBe(false);
    expect(db.tombstones.get("retry")).toMatchObject({ storage_key: "pastes/retry" });

    expect(await processDeletionQueue(db, bucket)).toEqual({ processed: 1, failures: 0 });
    expect(bucket.deleteCalls).toEqual(["pastes/retry", "pastes/retry"]);
    expect(bucket.objects.has("pastes/retry")).toBe(false);
    expect(db.queue[0]).toMatchObject({ status: "completed", last_error: null });
  });
});
