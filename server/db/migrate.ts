import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type Database from 'better-sqlite3';

type DB = Database.Database;

interface MigrationFile {
  version: number;
  filename: string;
  sql: string;
}

/**
 * Reads migration files matching `/^(\d+)\.sqlite\.sql$/` from `migrationsDir`,
 * sorted by the numeric prefix. Each unapplied version is executed inside a
 * transaction and recorded in `schema_migrations(version, applied_at)`.
 *
 * Idempotent: re-running skips already-applied versions (the test runs it twice
 * and asserts no error + one row per file in schema_migrations).
 */
export async function runMigrations(db: DB, migrationsDir: string): Promise<void> {
  // Ensure the tracking table exists.
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`,
  );

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: string }[])
      .map((r) => r.version),
  );

  const files: MigrationFile[] = [];
  for (const filename of readdirSync(migrationsDir)) {
    const match = filename.match(/^(\d+)\.sqlite\.sql$/);
    if (!match) continue;
    const version = match[1];
    const sql = readFileSync(join(migrationsDir, filename), 'utf8');
    files.push({ version: Number(version), filename, sql });
  }
  files.sort((a, b) => a.version - b.version);

  for (const file of files) {
    const versionStr = String(file.version);
    if (applied.has(versionStr)) continue;
    const apply = db.transaction(() => {
      db.exec(file.sql);
      db.prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      ).run(versionStr, new Date().toISOString());
    });
    try {
      apply();
    } catch (err) {
      throw new Error(
        `Migration ${file.filename} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
