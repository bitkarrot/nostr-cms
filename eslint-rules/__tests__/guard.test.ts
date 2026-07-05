import { describe, it, expect } from 'vitest';
import { Linter } from 'eslint';

/**
 * ESLint server-only import guard (SRV-01, T-01-04).
 *
 * Verifies the `no-restricted-imports` rule config used in `eslint.config.js`
 * for src files: the four server-only npm packages
 * (resend, better-sqlite3, csv-parse, pg) and any relative import reaching into
 * `server/` must produce an ESLint error when imported from a src/ file.
 *
 * A server/ file importing the same deps must NOT be flagged (the rule is
 * scoped to src in the flat config). We model that here by NOT enabling the
 * rule for the server-fixture lint pass — mirroring how the flat config's
 * src files block does not match server files.
 *
 * This Linter-based approach (per the plan / VALIDATION "or RuleTester"
 * alternative) avoids polluting src/ with a guard-violation fixture that
 * would break the full `npx eslint` run.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- Linter rule configs are loosely typed in eslint's types; casting is the documented escape hatch. */

/** The exact rule config used in eslint.config.js for src files. */
const SRC_RULE_CONFIG: any = [
  'error',
  {
    paths: [
      { name: 'resend', message: 'resend is server-only. Import it from server/ only.' },
      { name: 'better-sqlite3', message: 'better-sqlite3 is server-only. Import it from server/ only.' },
      { name: 'csv-parse', message: 'csv-parse is server-only. Import it from server/ only.' },
      { name: 'pg', message: 'pg is server-only. Import it from server/ only.' },
    ],
    patterns: [
      {
        // WR-06: matches server/ relative imports at any depth.
        group: ['**/server/*', '**/../server/*', '../../server/*', '../../../server/*', '../../../../server/*', '../../../../../server/*'],
        message: 'Importing from server/ is forbidden in src/ (server-only boundary).',
      },
    ],
  },
];

/** Lint a source string as a src/ file (rule enabled). */
function lintAsSrc(code: string): Linter.LintMessage[] {
  const linter = new Linter();
  return linter.verify(code, {
    languageOptions: { ecmaVersion: 2020, sourceType: 'module' },
    rules: { 'no-restricted-imports': SRC_RULE_CONFIG },
  });
}

/** Lint a source string as a server/ file (rule NOT enabled — matches flat-config scoping). */
function lintAsServer(code: string): Linter.LintMessage[] {
  const linter = new Linter();
  return linter.verify(code, {
    languageOptions: { ecmaVersion: 2020, sourceType: 'module' },
    // no-restricted-imports intentionally absent — server/ files may import the guarded deps.
    rules: {},
  });
}

describe('server-only import guard (SRV-01, T-01-04)', () => {
  it('src/ importing resend -> lint error', () => {
    const messages = lintAsSrc("import { Resend } from 'resend';");
    const hits = messages.filter((m) => m.ruleId === 'no-restricted-imports');
    expect(hits.length).toBe(1);
    expect(hits[0].message).toContain('resend is server-only');
  });

  it('src/ importing better-sqlite3 -> lint error', () => {
    const messages = lintAsSrc("import Database from 'better-sqlite3';");
    const hits = messages.filter((m) => m.ruleId === 'no-restricted-imports');
    expect(hits.length).toBe(1);
    expect(hits[0].message).toContain('better-sqlite3 is server-only');
  });

  it('src/ importing csv-parse -> lint error', () => {
    const messages = lintAsSrc("import { parse } from 'csv-parse';");
    const hits = messages.filter((m) => m.ruleId === 'no-restricted-imports');
    expect(hits.length).toBe(1);
    expect(hits[0].message).toContain('csv-parse is server-only');
  });

  it('src/ importing pg -> lint error', () => {
    const messages = lintAsSrc("import { Pool } from 'pg';");
    const hits = messages.filter((m) => m.ruleId === 'no-restricted-imports');
    expect(hits.length).toBe(1);
    expect(hits[0].message).toContain('pg is server-only');
  });

  it('src/ importing from server/* (relative) -> lint error', () => {
    const messages = lintAsSrc("import { openDatabase } from '../../server/db/sqlite';");
    const hits = messages.filter((m) => m.ruleId === 'no-restricted-imports');
    expect(hits.length).toBe(1);
    expect(hits[0].message).toContain('server-only boundary');
  });

  it('src/ importing from server/* (top-level relative) -> lint error', () => {
    const messages = lintAsSrc("import { foo } from 'server/db/sqlite';");
    const hits = messages.filter((m) => m.ruleId === 'no-restricted-imports');
    expect(hits.length).toBe(1);
    expect(hits[0].message).toContain('server-only boundary');
  });

  it('src/ importing from server/* 4 levels deep -> lint error (WR-06 depth ceiling)', () => {
    // WR-06: a 4+-deep src/ file (e.g. src/a/b/c/d/file.ts) importing
    // ../../../../server/db/sqlite must NOT bypass the guard.
    const messages = lintAsSrc("import { openDatabase } from '../../../../server/db/sqlite';");
    const hits = messages.filter((m) => m.ruleId === 'no-restricted-imports');
    expect(hits.length).toBe(1);
    expect(hits[0].message).toContain('server-only boundary');
  });

  it('src/ importing from server/* 5 levels deep -> lint error (WR-06 depth ceiling)', () => {
    const messages = lintAsSrc("import { openDatabase } from '../../../../../server/db/sqlite';");
    const hits = messages.filter((m) => m.ruleId === 'no-restricted-imports');
    expect(hits.length).toBe(1);
    expect(hits[0].message).toContain('server-only boundary');
  });

  it('src/ importing a normal client package -> no error', () => {
    const messages = lintAsSrc("import { useQuery } from '@tanstack/react-query';");
    const hits = messages.filter((m) => m.ruleId === 'no-restricted-imports');
    expect(hits.length).toBe(0);
  });

  it('server/ importing better-sqlite3 -> no error', () => {
    const messages = lintAsServer("import Database from 'better-sqlite3';");
    const hits = messages.filter((m) => m.ruleId === 'no-restricted-imports');
    expect(hits.length).toBe(0);
  });

  it('server/ importing hono -> no error', () => {
    const messages = lintAsServer("import { Hono } from 'hono';");
    const hits = messages.filter((m) => m.ruleId === 'no-restricted-imports');
    expect(hits.length).toBe(0);
  });
});
