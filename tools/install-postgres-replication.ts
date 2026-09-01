#!/usr/bin/env node

import { readFile } from "node:fs/promises";

import { PostgresSource } from "./migrate-postgres.ts";

const source = await PostgresSource.fromEnv();
try {
  const sql = await readFile(new URL("./postgres-replication.sql", import.meta.url), "utf8");
  await source.execute(sql);
  console.log("PostgreSQL replication triggers installed");
} finally {
  await source.close();
}
