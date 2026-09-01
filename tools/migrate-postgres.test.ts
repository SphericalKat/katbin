import { describe, expect, it } from "vitest";

import { R2_THRESHOLD_BYTES } from "../src/constants";
import {
  type CursorName,
  type PasteRecord,
  type TargetAdapter,
  type TargetPasteRecord,
  type UserRecord,
  type SourceAdapter,
  migrate,
  MigrationMismatchError,
} from "./migrate-postgres";

const user = (id: number, email = `User${id}@example.com`): UserRecord => ({
  id,
  email,
  normalizedEmail: email.toLowerCase(),
  hashedPassword: `$2b$12$hash-${id}`,
  confirmedAt: "2024-01-02T03:04:05Z",
  insertedAt: "2024-01-01T03:04:05Z",
  updatedAt: "2024-01-02T03:04:05Z",
});

const paste = (
  id: string,
  content: string,
  ownerId: number | null,
  isUrl = false,
): PasteRecord => ({
  id,
  content,
  isUrl,
  ownerId,
  insertedAt: "2024-01-01T03:04:05Z",
  updatedAt: "2024-01-02T03:04:05Z",
});

class FakeSource implements SourceAdapter {
  readonly userCursors: Array<number | null> = [];
  readonly pasteCursors: Array<string | null> = [];

  constructor(
    private readonly users: UserRecord[],
    private readonly pastes: PasteRecord[],
  ) {}

  countUsers() {
    return Promise.resolve(this.users.length);
  }

  countPastes() {
    return Promise.resolve(this.pastes.length);
  }

  listUsersAfter(cursor: number | null, limit: number) {
    this.userCursors.push(cursor);
    return Promise.resolve(
      this.users.filter((row) => cursor === null || row.id > cursor).slice(0, limit),
    );
  }

  listPastesAfter(cursor: string | null, limit: number) {
    this.pasteCursors.push(cursor);
    return Promise.resolve(
      this.pastes.filter((row) => cursor === null || row.id > cursor).slice(0, limit),
    );
  }
}

class FakeTarget implements TargetAdapter {
  readonly users = new Map<number, UserRecord>();
  readonly pastes = new Map<string, TargetPasteRecord>();
  readonly objects = new Map<string, Uint8Array>();
  readonly cursors = new Map<CursorName, string>();
  userWrites = 0;
  pasteWrites = 0;
  objectWrites = 0;
  private failed = false;

  constructor(
    private readonly failPasteId?: string,
    private readonly corruptObjects = false,
  ) {}

  getCursor(name: CursorName) {
    return Promise.resolve(this.cursors.get(name) ?? null);
  }

  saveCursor(name: CursorName, cursor: string) {
    this.cursors.set(name, cursor);
    return Promise.resolve();
  }

  upsertUser(value: UserRecord) {
    this.userWrites += 1;
    this.users.set(value.id, { ...value });
    return Promise.resolve();
  }

  upsertPaste(value: TargetPasteRecord) {
    if (value.id === this.failPasteId && !this.failed) {
      this.failed = true;
      return Promise.reject(new Error("interrupted"));
    }
    this.pasteWrites += 1;
    this.pastes.set(value.id, { ...value });
    return Promise.resolve();
  }

  putPasteContent(key: string, content: Uint8Array) {
    this.objectWrites += 1;
    const corrupted = content.slice();
    if (this.corruptObjects) corrupted[0] ^= 1;
    this.objects.set(key, corrupted);
    return Promise.resolve();
  }

  getUser(id: number) {
    const value = this.users.get(id);
    return Promise.resolve(value ? { ...value } : null);
  }

  getPaste(id: string) {
    const value = this.pastes.get(id);
    return Promise.resolve(value ? { ...value } : null);
  }

  getPasteContent(key: string) {
    const value = this.objects.get(key);
    return Promise.resolve(value ? value.slice() : null);
  }

  countUsers() {
    return Promise.resolve(this.users.size);
  }

  countPastes() {
    return Promise.resolve(this.pastes.size);
  }
}

describe("PostgreSQL migration", () => {
  it("resumes an interrupted batch and does not reread completed user batches", async () => {
    const source = new FakeSource([user(1), user(2)], [paste("a", "a", 1), paste("b", "b", 2)]);
    const target = new FakeTarget("b");

    await expect(migrate(source, target, { batchSize: 2 })).rejects.toThrow("paste b");
    expect(target.cursors).toEqual(new Map([["users", "2"]]));
    expect(target.pastes.size).toBe(1);

    await expect(migrate(source, target, { batchSize: 2 })).resolves.toEqual({
      users: 2,
      pastes: 2,
    });
    expect(source.userCursors).toEqual([null, 2, 2]);
    expect(source.pasteCursors).toEqual([null, null, "b"]);
    expect(target.pastes.size).toBe(2);
  });

  it("replays writes idempotently after the cursor is reset", async () => {
    const source = new FakeSource([user(7)], [paste("same", "content", 7)]);
    const target = new FakeTarget();

    await migrate(source, target);
    target.cursors.clear();
    await migrate(source, target);

    expect(target.users.size).toBe(1);
    expect(target.pastes.size).toBe(1);
    expect(target.userWrites).toBe(2);
    expect(target.pasteWrites).toBe(2);
  });

  it("preserves identifiers, metadata, ownership, and mixed D1/R2 storage", async () => {
    const largeContent = "🙂".repeat(R2_THRESHOLD_BYTES / 4 + 1);
    const source = new FakeSource(
      [user(42, "CaseSensitive@Example.com")],
      [paste("small", "https://example.com", 42, true), paste("large", largeContent, null)],
    );
    const target = new FakeTarget();

    await expect(migrate(source, target)).resolves.toEqual({ users: 1, pastes: 2 });
    expect(target.users.get(42)).toEqual(user(42, "CaseSensitive@Example.com"));
    expect(target.pastes.get("small")).toMatchObject({
      id: "small",
      isUrl: true,
      ownerId: 42,
      content: "https://example.com",
      storageType: "d1",
      storageKey: null,
      contentLengthBytes: 19,
    });
    expect(target.pastes.get("large")).toMatchObject({
      id: "large",
      ownerId: null,
      content: "",
      storageType: "r2",
      storageKey: "large",
      contentLengthBytes: new TextEncoder().encode(largeContent).byteLength,
    });
    expect(new TextDecoder().decode(target.objects.get("large"))).toBe(largeContent);
  });

  it("stops on a checksum mismatch and reports only the paste identifier", async () => {
    const content = "🙂".repeat(R2_THRESHOLD_BYTES / 4 + 1);
    const source = new FakeSource(
      [user(1)],
      [paste("broken", content, 1), paste("later", "later", 1)],
    );
    const target = new FakeTarget(undefined, true);

    const result = migrate(source, target);
    await expect(result).rejects.toBeInstanceOf(MigrationMismatchError);
    await expect(result).rejects.toThrow("paste broken: content checksum");
    await result.catch((error: MigrationMismatchError) => {
      expect(error.message).not.toContain(content);
      expect(target.cursors.has("pastes")).toBe(false);
      expect(target.pastes.has("later")).toBe(false);
    });
  });
});
