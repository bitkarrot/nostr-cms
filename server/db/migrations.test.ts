// @vitest-environment node
import { describe, it } from 'vitest';

import { runMigrations } from './migrate';

describe('runMigrations (stub)', () => {
  it.todo('applies all migration files in numeric order');
  it.todo('records each applied version in schema_migrations once');
  it.todo('is idempotent — re-running applies no new files and does not error');
  it.todo('throws a clear error if a migration file is missing or SQL fails');
});
