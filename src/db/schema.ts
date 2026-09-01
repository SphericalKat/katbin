import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const pastes = sqliteTable("pastes", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  isUrl: integer("is_url", { mode: "boolean" }).notNull().default(false),
  ownerId: integer("owner_id"),
  storageType: text("storage_type").notNull().default("d1"),
  storageKey: text("storage_key"),
  contentLengthBytes: integer("content_length_bytes").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

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
