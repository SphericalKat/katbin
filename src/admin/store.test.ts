import { describe, expect, it } from "vitest";
import type { AdminDb } from "./store";
import {
  addDmcaPaste,
  createAccountBan,
  createDmcaCase,
  createPasteTombstone,
  decideDmcaCase,
  enqueueDeletion,
  getPasteTombstone,
  isAccountBanned,
  isPasteTombstoned,
  listAdminActions,
  listDeletions,
  logAbuseEvent,
  recordVisitorHash,
  searchAbuse,
  updateDeletionStatus,
  liftAccountBan,
} from "./store";

class FakeDb implements AdminDb {
  private readonly tables = new Map<string, any[]>();
  private readonly ids = new Map<string, number>();

  prepare(query: string) {
    return {
      bind: (...values: any[]) => ({
        run: async () => {
          this.execute(query, values);
          return {};
        },
        all: async () => ({ results: this.execute(query, values) }),
        first: async () => this.execute(query, values)[0] ?? null,
      }),
    };
  }

  rows(table: string) {
    return this.tables.get(table) ?? [];
  }

  private table(name: string) {
    const rows = this.tables.get(name) ?? [];
    this.tables.set(name, rows);
    return rows;
  }

  private nextId(table: string) {
    const id = (this.ids.get(table) ?? 0) + 1;
    this.ids.set(table, id);
    return id;
  }

  private execute(source: string, values: any[]): any[] {
    const query = source.replace(/\s+/g, " ").trim().toLowerCase();
    if (query.startsWith("insert into account_bans")) {
      const row = {
        id: this.nextId("account_bans"),
        user_id: values[0],
        reason: values[1],
        created_by: values[2],
        created_at: values[3],
        lifted_at: null,
      };
      this.table("account_bans").push(row);
      return query.includes("returning") ? [row] : [];
    }
    if (query.startsWith("update account_bans")) {
      const row = this.rows("account_bans").find(
        (item) => item.id === values[1] && item.lifted_at === null,
      );
      if (row) row.lifted_at = values[0];
      return [];
    }
    if (query.startsWith("select 1 as banned")) {
      return this.rows("account_bans").some(
        (row) => row.user_id === values[0] && row.lifted_at === null,
      )
        ? [{ banned: 1 }]
        : [];
    }
    if (query.startsWith("insert into dmca_cases")) {
      const row = {
        id: this.nextId("dmca_cases"),
        reference: values[0],
        complainant: values[1],
        received_at: values[2],
        notes: values[3],
        status: "open",
        decision_reason: "",
        decided_at: null,
        decided_by: null,
      };
      this.table("dmca_cases").push(row);
      return [row];
    }
    if (query.startsWith("insert or ignore into dmca_case_pastes")) {
      if (
        !this.rows("dmca_case_pastes").some(
          (row) => row.case_id === values[0] && row.paste_id === values[1],
        )
      )
        this.table("dmca_case_pastes").push({ case_id: values[0], paste_id: values[1] });
      return [];
    }
    if (query.startsWith("update dmca_cases")) {
      const row = this.rows("dmca_cases").find((item) => item.id === values[4]);
      if (row)
        Object.assign(row, {
          status: values[0],
          decision_reason: values[1],
          decided_at: values[2],
          decided_by: values[3],
        });
      return [];
    }
    if (query.startsWith("insert into admin_actions")) {
      const row = {
        id: this.nextId("admin_actions"),
        created_at: values[0],
        admin: values[1],
        action: values[2],
        target: values[3],
        reason: values[4],
        outcome: values[5],
      };
      this.table("admin_actions").push(row);
      return [row];
    }
    if (query.startsWith("select * from admin_actions"))
      return this.paginate(this.rows("admin_actions"), values, true);
    if (query.startsWith("insert into deletion_queue")) {
      const row = {
        id: this.nextId("deletion_queue"),
        paste_id: values[0],
        reason: values[1],
        created_at: values[2],
        status: "pending",
        attempts: 0,
        last_error: null,
        completed_at: null,
      };
      this.table("deletion_queue").push(row);
      return [row];
    }
    if (query.startsWith("update deletion_queue")) {
      const id = values[values.length - 1];
      const row = this.rows("deletion_queue").find((item) => item.id === id);
      if (row) {
        row.status = values[0];
        row.last_error = values[1];
        row.completed_at = values[2];
        if (query.includes("attempts = ?")) row.attempts = values[3];
      }
      return [];
    }
    if (query.startsWith("select * from deletion_queue")) {
      const hasStatus = query.includes("where status = ?");
      const rows = hasStatus
        ? this.rows("deletion_queue").filter((row) => row.status === values[0])
        : this.rows("deletion_queue");
      return this.paginate(rows, hasStatus ? values.slice(1) : values, false);
    }
    if (query.startsWith("insert into abuse_events")) {
      const row = {
        id: this.nextId("abuse_events"),
        created_at: values[0],
        ip: values[1],
        event_type: values[2],
        account_id: values[3],
        paste_id: values[4],
        email: values[5],
      };
      this.table("abuse_events").push(row);
      return [row];
    }
    if (query.startsWith("select * from abuse_events")) {
      const filterValues = values.slice(0, -2);
      const fields = ["account_id", "email", "paste_id", "ip"].filter((field) =>
        query.includes(`${field} = ?`),
      );
      const rows = this.rows("abuse_events").filter((row) =>
        fields.every((field, index) => row[field] === filterValues[index]),
      );
      return this.paginate(rows, values.slice(-2), true);
    }
    if (query.startsWith("insert or ignore into visitor_ips")) {
      if (
        !this.rows("visitor_ips").some((row) => row.day === values[0] && row.ip_hash === values[1])
      )
        this.table("visitor_ips").push({ day: values[0], ip_hash: values[1] });
      return [];
    }
    if (query.startsWith("insert or ignore into paste_tombstones")) {
      if (!this.rows("paste_tombstones").some((row) => row.paste_id === values[0]))
        this.table("paste_tombstones").push({
          paste_id: values[0],
          deleted_at: values[1],
          reason: values[2],
        });
      return [];
    }
    if (query.startsWith("select * from paste_tombstones"))
      return this.rows("paste_tombstones").filter((row) => row.paste_id === values[0]);
    throw new Error(`Unsupported fake query: ${query}`);
  }

  private paginate(rows: any[], values: any[], newestFirst: boolean) {
    const ordered = newestFirst ? [...rows].reverse() : [...rows];
    const offset = values[values.length - 1];
    const limit = values[values.length - 2];
    return ordered.slice(offset, offset + limit);
  }
}

describe("admin store", () => {
  it("creates, finds, and lifts an account ban", async () => {
    const db = new FakeDb();
    const id = await createAccountBan(db, {
      userId: 7,
      reason: "spam",
      createdBy: "operator",
      createdAt: "2026-01-01T00:00:00Z",
    });
    expect(await isAccountBanned(db, 7)).toBe(true);
    await liftAccountBan(db, id, "2026-01-02T00:00:00Z");
    expect(await isAccountBanned(db, 7)).toBe(false);
  });

  it("keeps DMCA paste links and decision history when a decision changes", async () => {
    const db = new FakeDb();
    const caseId = await createDmcaCase(db, {
      reference: "DMCA-1",
      complainant: "legal@example.test",
      receivedAt: "2026-01-01T00:00:00Z",
    });
    await addDmcaPaste(db, caseId, "paste-a");
    await addDmcaPaste(db, caseId, "paste-b");
    await decideDmcaCase(
      db,
      caseId,
      "upheld",
      "valid complaint",
      "operator",
      "2026-01-02T00:00:00Z",
    );
    await decideDmcaCase(
      db,
      caseId,
      "rejected",
      "duplicate notice",
      "operator",
      "2026-01-03T00:00:00Z",
    );
    expect(db.rows("dmca_case_pastes")).toHaveLength(2);
    expect(db.rows("dmca_cases")[0]).toMatchObject({
      status: "rejected",
      decision_reason: "duplicate notice",
    });
    expect(await listAdminActions(db)).toHaveLength(2);
  });

  it("tracks deletion queue transitions", async () => {
    const db = new FakeDb();
    const id = await enqueueDeletion(db, {
      pasteId: "paste-a",
      reason: "moderation",
      createdAt: "2026-01-01T00:00:00Z",
    });
    expect((await listDeletions(db, "pending"))[0].status).toBe("pending");
    await updateDeletionStatus(db, id, "failed", "R2 unavailable", undefined, 1);
    expect((await listDeletions(db, "failed"))[0]).toMatchObject({
      attempts: 1,
      last_error: "R2 unavailable",
    });
    await updateDeletionStatus(db, id, "completed", null, "2026-01-02T00:00:00Z", 2);
    expect((await listDeletions(db, "completed"))[0].completed_at).toBe("2026-01-02T00:00:00.000Z");
  });

  it("searches abuse events with pagination", async () => {
    const db = new FakeDb();
    await logAbuseEvent(db, {
      ip: "192.0.2.1",
      eventType: "paste_created",
      createdAt: "2026-01-01T00:00:00Z",
    });
    await logAbuseEvent(db, {
      ip: "192.0.2.1",
      eventType: "account_created",
      createdAt: "2026-01-02T00:00:00Z",
    });
    await logAbuseEvent(db, {
      ip: "192.0.2.1",
      eventType: "signed_in",
      createdAt: "2026-01-03T00:00:00Z",
    });
    expect((await searchAbuse(db, { ip: "192.0.2.1", limit: 1, offset: 1 }))[0].event_type).toBe(
      "account_created",
    );
  });

  it("records visitor hashes idempotently and tombstones a paste", async () => {
    const db = new FakeDb();
    await recordVisitorHash(db, "2026-01-01", "hash");
    await recordVisitorHash(db, "2026-01-01", "hash");
    expect(db.rows("visitor_ips")).toHaveLength(1);
    await createPasteTombstone(db, "paste-a", "DMCA", "2026-01-01T00:00:00Z");
    expect(await isPasteTombstoned(db, "paste-a")).toBe(true);
    expect(await getPasteTombstone(db, "paste-a")).toMatchObject({ reason: "DMCA" });
  });
});
