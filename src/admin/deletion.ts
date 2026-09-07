export type DeletionDB = {
  prepare(q: string): {
    bind(...a: any[]): {
      run(): Promise<any>;
      all(): Promise<{ results: any[] }>;
      first(): Promise<any>;
    };
  };
};

export type DeletionBucket = {
  delete(key: string): Promise<void>;
};

type DeletionResult = {
  status: "completed" | "failed";
  r2KeysTried: string[];
  error?: string;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const r2KeyFrom = (row: any): string | undefined => {
  const key = row?.storage_key ?? row?.storageKey ?? row?.r2_key ?? row?.r2Key;
  return typeof key === "string" && key.length > 0 ? key : undefined;
};

const updateDeletionRows = async (
  db: DeletionDB,
  pasteId: string,
  status: "completed" | "failed",
  error: string | null,
): Promise<void> => {
  const completedAt = status === "completed" ? new Date().toISOString() : null;
  await db
    .prepare(
      "UPDATE deletion_queue SET status = ?, last_error = ?, completed_at = ? WHERE paste_id = ? AND status IN ('pending', 'failed')",
    )
    .bind(status, error, completedAt, pasteId)
    .run();
};

export const permanentlyDeletePaste = async (
  db: DeletionDB,
  bucket: DeletionBucket,
  pasteId: string,
  reason = "permanent deletion",
): Promise<DeletionResult> => {
  let paste: any;
  let tombstone: any;

  try {
    paste = await db.prepare("SELECT * FROM pastes WHERE id = ?").bind(pasteId).first();
    tombstone = await db
      .prepare("SELECT * FROM paste_tombstones WHERE paste_id = ?")
      .bind(pasteId)
      .first();
  } catch (error) {
    const message = errorMessage(error);
    await updateDeletionRows(db, pasteId, "failed", message);
    return { status: "failed", r2KeysTried: [], error: message };
  }

  const r2Key = r2KeyFrom(paste) ?? r2KeyFrom(tombstone);
  const r2KeysTried = r2Key ? [r2Key] : [];
  const errors: string[] = [];

  try {
    await db
      .prepare(
        "INSERT INTO paste_tombstones (paste_id, storage_key, deleted_at, reason) VALUES (?, ?, CURRENT_TIMESTAMP, ?) ON CONFLICT(paste_id) DO UPDATE SET storage_key = COALESCE(excluded.storage_key, paste_tombstones.storage_key), reason = excluded.reason",
      )
      .bind(pasteId, r2Key ?? null, reason)
      .run();
  } catch (error) {
    const message = errorMessage(error);
    await updateDeletionRows(db, pasteId, "failed", message);
    return { status: "failed", r2KeysTried, error: message };
  }

  if (paste) {
    try {
      await db.prepare("DELETE FROM pastes WHERE id = ?").bind(pasteId).run();
    } catch (error) {
      const message = errorMessage(error);
      await updateDeletionRows(db, pasteId, "failed", message);
      return { status: "failed", r2KeysTried, error: message };
    }
  }

  if (r2Key) {
    try {
      await bucket.delete(r2Key);
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }

  const error = errors.length > 0 ? errors.join("; ") : null;
  const status = error ? "failed" : "completed";
  await updateDeletionRows(db, pasteId, status, error);

  return error ? { status, r2KeysTried, error } : { status, r2KeysTried };
};

export const processDeletionQueue = async (
  db: DeletionDB,
  bucket: DeletionBucket,
  limit = 10,
): Promise<{ processed: number; failures: number }> => {
  const rows = (
    await db
      .prepare(
        "SELECT * FROM deletion_queue WHERE status IN ('pending', 'failed') ORDER BY id LIMIT ?",
      )
      .bind(limit)
      .all()
  ).results;

  let failures = 0;
  for (const row of rows) {
    const pasteId = String(row.paste_id ?? row.pasteId);
    const result = await permanentlyDeletePaste(
      db,
      bucket,
      pasteId,
      String(row.reason ?? "permanent deletion"),
    );
    const attempts = Number(row.attempts ?? 0) + 1;
    const completedAt = result.status === "completed" ? new Date().toISOString() : null;

    await db
      .prepare(
        "UPDATE deletion_queue SET status = ?, attempts = ?, last_error = ?, completed_at = ? WHERE id = ?",
      )
      .bind(result.status, attempts, result.error ?? null, completedAt, row.id)
      .run();

    if (result.status === "failed") failures += 1;
  }

  return { processed: rows.length, failures };
};

export const enqueuePermanentDeletion = async (
  db: DeletionDB,
  pasteId: string,
  reason: string,
): Promise<void> => {
  await db
    .prepare(
      "INSERT INTO deletion_queue (paste_id, reason, status, attempts) VALUES (?, ?, 'pending', 0)",
    )
    .bind(pasteId, reason)
    .run();
};
