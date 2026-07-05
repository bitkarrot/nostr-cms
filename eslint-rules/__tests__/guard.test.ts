import { describe, it } from 'vitest';

/**
 * ESLint server-only import guard (SRV-01) — stub created in Wave 0 (01-01-00).
 * Plan 01-03 task 01-03-01 owns the test body (RuleTester / Linter approach).
 */
describe('server-only import guard (stub — owned by 01-03-01)', () => {
  it.todo('src/ importing resend -> lint error');
  it.todo('src/ importing better-sqlite3 -> lint error');
  it.todo('src/ importing csv-parse -> lint error');
  it.todo('src/ importing pg -> lint error');
  it.todo('src/ importing from server/* -> lint error');
  it.todo('server/ importing better-sqlite3 -> no error');
  it.todo('server/ importing hono -> no error');
});
