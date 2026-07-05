// @vitest-environment node
import { describe, it } from 'vitest';

import { SqliteSubscriberRepository } from './sqlite';

describe('SqliteSubscriberRepository (stub)', () => {
  it.todo('inserts and retrieves a subscriber by id');
  it.todo('retrieves a subscriber by email');
  it.todo('lists subscribers with status/segment/limit/offset options');
  it.todo('counts subscribers with status/segment options');
  it.todo('enforces UNIQUE(site_id, email) on insert');
  it.todo('isolates by site_id — row under site A invisible to site B (T-01-01)');
  it.todo('updates subscriber status (pending -> active -> unsubscribed/bounced)');
  it.todo('deletes a subscriber scoped by site_id');
  it.todo('upserts and reads settings keyed by site_id');
  it.todo('creates, reads, and invalidates verify tokens (used=1 after invalidate)');
  it.todo('creates, updates, and finds send_log by post_event_id (site-scoped)');
  it.todo('records delivery events');
  it.todo('closes the db handle without error');
});
