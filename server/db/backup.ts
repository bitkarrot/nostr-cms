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
 * Runs a backup of the email DB to `${EMAIL_BACKUP_DIR}/email.db.YYYY-MM-DD.bak`
 * (WR-04: each run produces a distinct timestamped file so backups are not
 * silently overwritten — the previous single-file approach made "7-day
 * retention" illusory). Reads `EMAIL_DB_PATH` (default `./email.db`) and
 * `EMAIL_BACKUP_DIR` (default `/app/backups`). Prunes `email.db.*.bak` files
 * older than 7 days by mtime after the backup completes.
 */
export async function runBackup(): Promise<void> {
  const dbPath = process.env.EMAIL_DB_PATH || './email.db';
  const backupDir = process.env.EMAIL_BACKUP_DIR || '/app/backups';
  mkdirSync(backupDir, { recursive: true });

  const db = openDatabase(dbPath);
  try {
    // WR-04: stamp the filename with the current date so each run produces a
    // distinct file (the old fixed `email.db.bak` was overwritten every run,
    // making the 7-day rotation a no-op).
    const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const dest = join(backupDir, `email.db.${stamp}.bak`);
    await backupDatabase(db, dest);

    // Rotate: delete email.db.*.bak files older than 7 days (by mtime).
    const now = Date.now();
    for (const filename of readdirSync(backupDir)) {
      if (!filename.startsWith('email.db.') || !filename.endsWith('.bak')) continue;
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
