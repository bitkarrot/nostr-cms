import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';

import { openDatabase } from './sqlite';

type DB = Database.Database;

/**
 * Online backup of a better-sqlite3 database to `destPath` using SQLite's
 * native backup API (RESEARCH §2.3). Safe to call while the db is in use
 * because only the single connection mutates. Returns a Promise that resolves
 * when the backup is complete.
 */
export async function backupDatabase(db: DB, destPath: string): Promise<void> {
  await db.backup(destPath);
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Runs a backup of the email DB to `${EMAIL_BACKUP_DIR}/email.db.bak` and
 * rotates backups older than 7 days (by mtime). Reads `EMAIL_DB_PATH`
 * (default `/app/email.db`) and `EMAIL_BACKUP_DIR` (default `/app/backups`).
 */
export async function runBackup(): Promise<void> {
  const dbPath = process.env.EMAIL_DB_PATH || '/app/email.db';
  const backupDir = process.env.EMAIL_BACKUP_DIR || '/app/backups';
  mkdirSync(backupDir, { recursive: true });

  const db = openDatabase(dbPath);
  try {
    const dest = join(backupDir, 'email.db.bak');
    await backupDatabase(db, dest);

    // Rotate: delete email.db.bak* files older than 7 days.
    const now = Date.now();
    for (const filename of readdirSync(backupDir)) {
      if (!filename.startsWith('email.db.bak')) continue;
      const filepath = join(backupDir, filename);
      try {
        const st = statSync(filepath);
        if (now - st.mtimeMs > SEVEN_DAYS_MS) {
          unlinkSync(filepath);
        }
      } catch {
        // file may have been removed concurrently — ignore
      }
    }
  } finally {
    db.close();
  }
}

// Entry point when run directly via `npm run server:backup` (tsx server/db/backup.ts).
// `import.meta.url === ...` check for ESM direct execution.
if (import.meta.url === `file://${process.argv[1]}`) {
  runBackup().then(() => {
    console.log('Backup complete.');
  }).catch((err) => {
    console.error('Backup failed:', err);
    process.exit(1);
  });
}
