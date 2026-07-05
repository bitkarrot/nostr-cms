// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

import { openDatabase, SqliteSubscriberRepository } from './sqlite';

describe('SqliteSubscriberRepository WAL mode', () => {
  let dir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let repo: any;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sqlite-wal-'));
    const dbPath = join(dir, 'wal-test.db');
    const db = openDatabase(dbPath);
    repo = new SqliteSubscriberRepository(db);
  });

  afterEach(() => {
    try { repo.close(); } catch { /* already closed */ }
    rmSync(dir, { recursive: true, force: true });
  });

  it('PRAGMA journal_mode returns "wal" after open', () => {
    // WAL on :memory: is a no-op, so we use a temp file path (openDatabase above).
    const mode = repo.pragma('journal_mode');
    expect(mode).toBe('wal');
  });

  it('PRAGMA foreign_keys returns 1 (ON) after open', () => {
    const fk = repo.pragma('foreign_keys');
    expect(fk).toBe(1);
  });

  it('PRAGMA busy_timeout returns 5000 after open', () => {
    const bt = repo.pragma('busy_timeout');
    expect(bt).toBe(5000);
  });
});
