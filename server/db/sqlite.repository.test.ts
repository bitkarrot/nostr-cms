// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

import { openDatabase, SqliteSubscriberRepository } from './sqlite';
import type { SubscriberRepository } from './repository';

/** Schema mirroring server/db/migrations/001.sqlite.sql (task 01-01-02). */
const SCHEMA = `
CREATE TABLE subscribers (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  npub TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  segment TEXT,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  bounced_at TEXT,
  complained_at TEXT,
  UNIQUE(site_id, email)
);
CREATE TABLE settings (
  site_id TEXT PRIMARY KEY,
  module_enabled INTEGER NOT NULL DEFAULT 0,
  resend_api_key_enc TEXT,
  sending_domain TEXT,
  from_name TEXT,
  postal_address TEXT,
  rate_limit INTEGER,
  updated_at TEXT NOT NULL
);
CREATE TABLE verify_tokens (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);
CREATE TABLE send_log (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  post_event_id TEXT,
  subject TEXT,
  recipient_count INTEGER,
  sent_count INTEGER,
  status TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE delivery_events (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  send_log_id TEXT,
  subscriber_id TEXT,
  event_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  timestamp TEXT NOT NULL
);
`;

function newRepo(dir: string): { repo: SubscriberRepository; cleanup: () => void } {
  const dbPath = join(dir, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = openDatabase(dbPath);
  db.exec(SCHEMA);
  const repo = new SqliteSubscriberRepository(db);
  return { repo, cleanup: () => { db.close(); } };
}

describe('SqliteSubscriberRepository', () => {
  let dir: string;
  const cleanups: (() => void)[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sqlite-repo-'));
    cleanups.length = 0;
  });

  afterEach(() => {
    cleanups.forEach((c) => c());
    rmSync(dir, { recursive: true, force: true });
  });

  function makeRepo(): SubscriberRepository {
    const { repo, cleanup } = newRepo(dir);
    cleanups.push(cleanup);
    return repo;
  }

  it('inserts and retrieves a subscriber by id', async () => {
    const repo = makeRepo();
    const sub = await repo.insertSubscriber('A', {
      site_id: 'A', email: 'a@example.com', name: 'A', npub: null,
      status: 'pending', segment: [], confirmed_at: null, bounced_at: null, complained_at: null,
    });
    expect(sub.id).toBeTruthy();
    const got = await repo.getSubscriber('A', sub.id);
    expect(got).not.toBeNull();
    expect(got!.email).toBe('a@example.com');
  });

  it('retrieves a subscriber by email', async () => {
    const repo = makeRepo();
    await repo.insertSubscriber('A', {
      site_id: 'A', email: 'a@example.com', name: null, npub: null,
      status: 'pending', segment: [], confirmed_at: null, bounced_at: null, complained_at: null,
    });
    const got = await repo.getSubscriberByEmail('A', 'a@example.com');
    expect(got).not.toBeNull();
    expect(got!.email).toBe('a@example.com');
  });

  it('lists subscribers with status/segment/limit/offset options', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 5; i++) {
      await repo.insertSubscriber('A', {
        site_id: 'A', email: `a${i}@example.com`, name: null, npub: null,
        status: i % 2 === 0 ? 'active' : 'pending', segment: i < 2 ? ['followers'] : [],
        confirmed_at: null, bounced_at: null, complained_at: null,
      });
    }
    const active = await repo.listSubscribers('A', { status: 'active' });
    expect(active.length).toBe(3);
    const followers = await repo.listSubscribers('A', { segment: 'followers' });
    expect(followers.length).toBe(2);
    const page = await repo.listSubscribers('A', { limit: 2, offset: 0 });
    expect(page.length).toBe(2);
  });

  it('counts subscribers with status/segment options', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 4; i++) {
      await repo.insertSubscriber('A', {
        site_id: 'A', email: `c${i}@example.com`, name: null, npub: null,
        status: 'active', segment: i < 2 ? ['followers'] : [], confirmed_at: null, bounced_at: null, complained_at: null,
      });
    }
    expect(await repo.countSubscribers('A')).toBe(4);
    expect(await repo.countSubscribers('A', { segment: 'followers' })).toBe(2);
  });

  it('enforces UNIQUE(site_id, email) on insert', async () => {
    const repo = makeRepo();
    await repo.insertSubscriber('A', {
      site_id: 'A', email: 'dup@example.com', name: null, npub: null,
      status: 'pending', segment: [], confirmed_at: null, bounced_at: null, complained_at: null,
    });
    await expect(repo.insertSubscriber('A', {
      site_id: 'A', email: 'dup@example.com', name: null, npub: null,
      status: 'pending', segment: [], confirmed_at: null, bounced_at: null, complained_at: null,
    })).rejects.toThrow();
    // same email under a different site_id is allowed
    const other = await repo.insertSubscriber('B', {
      site_id: 'B', email: 'dup@example.com', name: null, npub: null,
      status: 'pending', segment: [], confirmed_at: null, bounced_at: null, complained_at: null,
    });
    expect(other.id).toBeTruthy();
  });

  it('isolates by site_id — row under site A invisible to site B (T-01-01)', async () => {
    const repo = makeRepo();
    const sub = await repo.insertSubscriber('A', {
      site_id: 'A', email: 'iso@example.com', name: null, npub: null,
      status: 'pending', segment: [], confirmed_at: null, bounced_at: null, complained_at: null,
    });
    // lookup by id under site B returns null
    expect(await repo.getSubscriber('B', sub.id)).toBeNull();
    // lookup by email under site B returns null
    expect(await repo.getSubscriberByEmail('B', 'iso@example.com')).toBeNull();
    // list under site B does not include site A's row
    expect(await repo.listSubscribers('B')).toHaveLength(0);
    // count under site B is 0
    expect(await repo.countSubscribers('B')).toBe(0);
    // delete under site B does not affect site A's row
    await repo.deleteSubscriber('B', sub.id);
    expect(await repo.getSubscriber('A', sub.id)).not.toBeNull();
  });

  it('updates subscriber status (pending -> active -> unsubscribed/bounced)', async () => {
    const repo = makeRepo();
    const sub = await repo.insertSubscriber('A', {
      site_id: 'A', email: 'st@example.com', name: null, npub: null,
      status: 'pending', segment: [], confirmed_at: null, bounced_at: null, complained_at: null,
    });
    await repo.updateSubscriberStatus('A', sub.id, 'active');
    let got = await repo.getSubscriber('A', sub.id);
    expect(got!.status).toBe('active');
    expect(got!.confirmed_at).not.toBeNull();

    await repo.updateSubscriberStatus('A', sub.id, 'bounced');
    got = await repo.getSubscriber('A', sub.id);
    expect(got!.status).toBe('bounced');
    expect(got!.bounced_at).not.toBeNull();

    await repo.updateSubscriberStatus('A', sub.id, 'unsubscribed');
    got = await repo.getSubscriber('A', sub.id);
    expect(got!.status).toBe('unsubscribed');
    // cross-site update is a no-op (site_id in WHERE)
    await repo.updateSubscriberStatus('B', sub.id, 'active');
    got = await repo.getSubscriber('A', sub.id);
    expect(got!.status).toBe('unsubscribed');
  });

  it('deletes a subscriber scoped by site_id', async () => {
    const repo = makeRepo();
    const sub = await repo.insertSubscriber('A', {
      site_id: 'A', email: 'del@example.com', name: null, npub: null,
      status: 'pending', segment: [], confirmed_at: null, bounced_at: null, complained_at: null,
    });
    await repo.deleteSubscriber('A', sub.id);
    expect(await repo.getSubscriber('A', sub.id)).toBeNull();
  });

  it('upserts and reads settings keyed by site_id', async () => {
    const repo = makeRepo();
    expect(await repo.getSettings('A')).toBeNull();
    const s1 = await repo.upsertSettings('A', { module_enabled: true, from_name: 'Alice' });
    expect(s1.module_enabled).toBe(true);
    expect(s1.from_name).toBe('Alice');
    const s2 = await repo.upsertSettings('A', { from_name: 'Alice 2' });
    expect(s2.module_enabled).toBe(true);
    expect(s2.from_name).toBe('Alice 2');
    const got = await repo.getSettings('A');
    expect(got!.from_name).toBe('Alice 2');
  });

  it('creates, reads, and invalidates verify tokens (used=1 after invalidate)', async () => {
    const repo = makeRepo();
    const sub = await repo.insertSubscriber('A', {
      site_id: 'A', email: 'tok@example.com', name: null, npub: null,
      status: 'pending', segment: [], confirmed_at: null, bounced_at: null, complained_at: null,
    });
    const token = await repo.createToken({
      subscriber_id: sub.id, site_id: 'A', purpose: 'verify', expires_at: new Date(Date.now() + 60000).toISOString(),
    });
    expect(token.used).toBe(false);
    const got = await repo.getToken(token.id);
    expect(got).not.toBeNull();
    expect(got!.subscriber_id).toBe(sub.id);
    await repo.invalidateToken(token.id);
    const after = await repo.getToken(token.id);
    expect(after!.used).toBe(true);
  });

  it('creates, updates, and finds send_log by post_event_id (site-scoped)', async () => {
    const repo = makeRepo();
    const log = await repo.createSendLog({
      site_id: 'A', post_event_id: 'evt-1', subject: 'Hello', recipient_count: 10, sent_count: 0,
      status: 'pending', started_at: new Date().toISOString(), completed_at: null,
    });
    expect(log.id).toBeTruthy();
    await repo.updateSendLog(log.id, { sent_count: 10, status: 'completed', completed_at: new Date().toISOString() });
    const found = await repo.findSendLogByPostEventId('A', 'evt-1');
    expect(found).not.toBeNull();
    expect(found!.sent_count).toBe(10);
    expect(found!.status).toBe('completed');
    // cross-site lookup returns null
    expect(await repo.findSendLogByPostEventId('B', 'evt-1')).toBeNull();
  });

  it('records delivery events', async () => {
    const repo = makeRepo();
    const sub = await repo.insertSubscriber('A', {
      site_id: 'A', email: 'dev@example.com', name: null, npub: null,
      status: 'active', segment: [], confirmed_at: null, bounced_at: null, complained_at: null,
    });
    const ev = await repo.recordDeliveryEvent({
      site_id: 'A', send_log_id: null, subscriber_id: sub.id, event_type: 'delivered',
      recipient: 'dev@example.com', timestamp: new Date().toISOString(),
    });
    expect(ev.id).toBeTruthy();
    expect(ev.event_type).toBe('delivered');
  });

  it('closes the db handle without error', async () => {
    const { repo, cleanup } = newRepo(dir);
    await repo.close();
    // cleanup also closes; swallow the double-close
    try { cleanup(); } catch { /* already closed */ }
  });
});
