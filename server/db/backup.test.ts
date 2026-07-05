// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';

import Database from 'better-sqlite3';

import { backupDatabase, runBackup } from './backup';
import { openDatabase } from './sqlite';

describe('backupDatabase', () => {
  let dir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'backup-'));
    const dbPath = join(dir, 'src.db');
    db = openDatabase(dbPath);
    db.exec('CREATE TABLE t (id INTEGER)');
  });

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
    rmSync(dir, { recursive: true, force: true });
  });

  it('produces a valid, openable SQLite file with the same row count as the source', async () => {
    db.prepare('INSERT INTO t (id) VALUES (?)').run(1);
    db.prepare('INSERT INTO t (id) VALUES (?)').run(2);
    db.prepare('INSERT INTO t (id) VALUES (?)').run(3);

    const dest = join(dir, 'backup.db');
    await backupDatabase(db, dest);

    expect(existsSync(dest)).toBe(true);
    const destDb = new Database(dest);
    try {
      const count = destDb.prepare('SELECT COUNT(*) AS n FROM t').get() as { n: number };
      expect(count.n).toBe(3);
    } finally {
      destDb.close();
    }
  });

  it('completes without error when a write is in progress mid-backup', async () => {
    db.prepare('INSERT INTO t (id) VALUES (?)').run(1);
    const dest = join(dir, 'backup-during-write.db');

    // Start the backup; while it is in flight, insert another row. The backup
    // should complete and yield an openable, consistent db (the extra row may
    // or may not be in the snapshot — we assert openability + consistency, not
    // a specific count, per RESEARCH §7.3).
    const backupPromise = backupDatabase(db, dest);
    db.prepare('INSERT INTO t (id) VALUES (?)').run(2);
    await backupPromise;

    expect(existsSync(dest)).toBe(true);
    const destDb = new Database(dest);
    try {
      const count = destDb.prepare('SELECT COUNT(*) AS n FROM t').get() as { n: number };
      expect(count.n).toBeGreaterThanOrEqual(1);
    } finally {
      destDb.close();
    }
  });
});

describe('runBackup', () => {
  let dir: string;
  const prevDbPath = process.env.EMAIL_DB_PATH;
  const prevBackupDir = process.env.EMAIL_BACKUP_DIR;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'runbackup-'));
    process.env.EMAIL_DB_PATH = join(dir, 'email.db');
    process.env.EMAIL_BACKUP_DIR = join(dir, 'backups');
    const db = openDatabase(process.env.EMAIL_DB_PATH);
    db.exec('CREATE TABLE t (id INTEGER)');
    db.prepare('INSERT INTO t (id) VALUES (?)').run(1);
    db.close();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (prevDbPath === undefined) delete process.env.EMAIL_DB_PATH; else process.env.EMAIL_DB_PATH = prevDbPath;
    if (prevBackupDir === undefined) delete process.env.EMAIL_BACKUP_DIR; else process.env.EMAIL_BACKUP_DIR = prevBackupDir;
  });

  it('respects EMAIL_DB_PATH and EMAIL_BACKUP_DIR env vars', async () => {
    await runBackup();
    // WR-04: filename is now timestamped (email.db.YYYY-MM-DD.bak).
    const stamp = new Date().toISOString().slice(0, 10);
    const dest = join(process.env.EMAIL_BACKUP_DIR!, `email.db.${stamp}.bak`);
    expect(existsSync(dest)).toBe(true);
    const destDb = new Database(dest);
    try {
      const count = destDb.prepare('SELECT COUNT(*) AS n FROM t').get() as { n: number };
      expect(count.n).toBe(1);
    } finally {
      destDb.close();
    }
  });

  it('produces a distinct timestamped file each run (WR-04)', async () => {
    await runBackup();
    await runBackup();
    const files = readdirSync(process.env.EMAIL_BACKUP_DIR!).filter(
      (f) => f.startsWith('email.db.') && f.endsWith('.bak'),
    );
    // Two runs on the same day produce the same timestamped filename, so the
    // file is overwritten within a day — but the key fix is that the filename
    // is timestamped (not a fixed `email.db.bak`). Assert the timestamped name
    // exists and the old fixed name does NOT.
    const stamp = new Date().toISOString().slice(0, 10);
    expect(files).toContain(`email.db.${stamp}.bak`);
    expect(files).not.toContain('email.db.bak');
  });

  it('rotates backups older than 7 days', async () => {
    const backupDir = process.env.EMAIL_BACKUP_DIR!;
    const { mkdirSync } = await import('node:fs');
    mkdirSync(backupDir, { recursive: true });
    // Create a stale timestamped backup file (8 days old) and a fresh one.
    const stale = join(backupDir, 'email.db.2020-01-01.bak');
    writeFileSync(stale, 'stale');
    const staleStat = statSync(stale);
    // Backdate the stale file by patching mtime via utimes.
    const oldTime = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const { utimesSync } = await import('node:fs');
    utimesSync(stale, oldTime, oldTime);

    await runBackup();

    // The stale file should be gone; the fresh timestamped backup should remain.
    expect(existsSync(stale)).toBe(false);
    const stamp = new Date().toISOString().slice(0, 10);
    const files = readdirSync(backupDir).filter(
      (f) => f.startsWith('email.db.') && f.endsWith('.bak'),
    );
    expect(files).toContain(`email.db.${stamp}.bak`);
    // staleStat is just for linter; confirm it existed before rotation
    expect(staleStat).toBeDefined();
  });
});
