// @vitest-environment node
import { describe, it } from 'vitest';

import { SqliteSubscriberRepository } from './sqlite';

describe('SqliteSubscriberRepository WAL mode (stub)', () => {
  it.todo('PRAGMA journal_mode returns "wal" after open');
  it.todo('PRAGMA foreign_keys returns 1 (ON) after open');
  it.todo('PRAGMA busy_timeout returns 5000 after open');
});
