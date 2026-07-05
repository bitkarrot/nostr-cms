import { serve } from '@hono/node-server';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp } from './app';
import { openDatabase, SqliteSubscriberRepository } from './db/sqlite';
import { runMigrations } from './db/migrate';
import type { SubscriberRepository } from './db/repository';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'db', 'migrations');

/**
 * Server entry point (SRV-01). Reads `EMAIL_PORT` (default 3001, D-01) and
 * `EMAIL_DB_BACKEND` (default `sqlite`), opens the repository, runs migrations,
 * constructs the Hono app via `createApp`, and starts `@hono/node-server`.
 *
 * The app construction is factored into `createApp` (server/app.ts) so tests
 * can mount the app without binding a port. This entry only runs when executed
 * directly (`npm run server` / `tsx server/index.ts`).
 */
async function main(): Promise<void> {
  const port = Number(process.env.EMAIL_PORT || 3001);
  const backend = process.env.EMAIL_DB_BACKEND || 'sqlite';

  let repo: SubscriberRepository;
  if (backend === 'postgres') {
    // Postgres impl is additive (future phase). The branch exists for later.
    throw new Error('EMAIL_DB_BACKEND=postgres is not implemented in this phase');
  } else {
    const dbPath = process.env.EMAIL_DB_PATH || './email.db';
    const db = openDatabase(dbPath);
    await runMigrations(db, MIGRATIONS_DIR);
    repo = new SqliteSubscriberRepository(db);
  }

  const app = createApp(repo);

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`email service listening on http://localhost:${info.port}`);
  });
}

// Only run when executed directly (not when imported by a test).
const isDirectEntry =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('server/index.ts');

if (isDirectEntry) {
  main().catch((err) => {
    console.error('Failed to start email service:', err);
    process.exit(1);
  });
}

export { createApp };
