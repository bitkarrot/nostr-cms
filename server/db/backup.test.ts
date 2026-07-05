// @vitest-environment node
import { describe, it } from 'vitest';

import { backupDatabase } from './backup';

describe('backupDatabase (stub)', () => {
  it.todo('produces a valid, openable SQLite file with the same row count as the source');
  it.todo('completes without error when a write is in progress mid-backup');
  it.todo('runBackup respects EMAIL_DB_PATH and EMAIL_BACKUP_DIR env vars');
  it.todo('runBackup rotates backups older than 7 days');
});
