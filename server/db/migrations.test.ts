// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';

import { openDatabase } from './sqlite';
import { runMigrations } from './migrate';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

describe('runMigrations', () => {
  let dir: string;
  let dbPath: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'migrate-'));
    dbPath = join(dir, 'test.db');
    db = openDatabase(dbPath);
  });

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
    rmSync(dir, { recursive: true, force: true });
  });

  it('applies all migration files in numeric order', async () => {
    await runMigrations(db, MIGRATIONS_DIR);
    // The 001 schema creates the subscribers table.
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('subscribers');
    expect(names).toContain('settings');
    expect(names).toContain('verify_tokens');
    expect(names).toContain('send_log');
    expect(names).toContain('delivery_events');
    expect(names).toContain('schema_migrations');
  });

  it('records each applied version in schema_migrations once', async () => {
    await runMigrations(db, MIGRATIONS_DIR);
    const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: string }[];
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].version).toBe('1');
    // one row per applied file (currently just 001)
    expect(rows.length).toBe(1);
  });

  it('is idempotent — re-running applies no new files and does not error', async () => {
    await runMigrations(db, MIGRATIONS_DIR);
    await runMigrations(db, MIGRATIONS_DIR); // second run is a no-op
    const rows = db.prepare('SELECT version FROM schema_migrations').all() as { version: string }[];
    expect(rows.length).toBe(1);
  });

  it('throws a clear error if a migration file is missing or SQL fails', async () => {
    // Point at a non-existent directory — no files, no error, but also no schema.
    // Instead, test the SQL-failure path by pointing at a dir with a bad SQL file.
    const badDir = join(dir, 'bad-migrations');
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, '001.sqlite.sql'), 'THIS IS NOT VALID SQL;');
    await expect(runMigrations(db, badDir)).rejects.toThrow(/Migration 001\.sqlite\.sql failed/);
  });
});
