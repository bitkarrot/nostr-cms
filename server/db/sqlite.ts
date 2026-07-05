import Database from 'better-sqlite3';
import crypto from 'node:crypto';

import type {
  CountSubscribersOpts,
  DeliveryEvent,
  ListSubscribersOpts,
  NewDeliveryEvent,
  NewSendLog,
  NewSubscriber,
  NewToken,
  SendLog,
  Settings,
  Subscriber,
  SubscriberRepository,
  SubscriberStatus,
  VerifyToken,
} from './repository';

type DB = Database.Database;

/** Row shapes as stored in SQLite (segment is JSON text, booleans are 0/1). */
interface SubscriberRow {
  id: string;
  site_id: string;
  email: string;
  name: string | null;
  npub: string | null;
  status: string;
  segment: string | null;
  created_at: string;
  confirmed_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
}

interface SettingsRow {
  site_id: string;
  module_enabled: number;
  resend_api_key_enc: string | null;
  sending_domain: string | null;
  from_name: string | null;
  postal_address: string | null;
  rate_limit: number | null;
  updated_at: string;
}

interface VerifyTokenRow {
  id: string;
  subscriber_id: string;
  site_id: string;
  purpose: string;
  expires_at: string;
  used: number;
}

interface SendLogRow {
  id: string;
  site_id: string;
  post_event_id: string | null;
  subject: string | null;
  recipient_count: number | null;
  sent_count: number | null;
  status: string | null;
  started_at: string;
  completed_at: string | null;
}

interface DeliveryEventRow {
  id: string;
  site_id: string;
  send_log_id: string | null;
  subscriber_id: string | null;
  event_type: string;
  recipient: string;
  timestamp: string;
}

function rowToSubscriber(row: SubscriberRow): Subscriber {
  return {
    id: row.id,
    site_id: row.site_id,
    email: row.email,
    name: row.name,
    npub: row.npub,
    status: row.status as SubscriberStatus,
    segment: row.segment ? JSON.parse(row.segment) as string[] : [],
    created_at: row.created_at,
    confirmed_at: row.confirmed_at,
    bounced_at: row.bounced_at,
    complained_at: row.complained_at,
  };
}

function rowToSettings(row: SettingsRow): Settings {
  return {
    site_id: row.site_id,
    module_enabled: row.module_enabled === 1,
    resend_api_key_enc: row.resend_api_key_enc,
    sending_domain: row.sending_domain,
    from_name: row.from_name,
    postal_address: row.postal_address,
    rate_limit: row.rate_limit,
    updated_at: row.updated_at,
  };
}

function rowToToken(row: VerifyTokenRow): VerifyToken {
  return {
    id: row.id,
    subscriber_id: row.subscriber_id,
    site_id: row.site_id,
    purpose: row.purpose,
    expires_at: row.expires_at,
    used: row.used === 1,
  };
}

function rowToSendLog(row: SendLogRow): SendLog {
  return {
    id: row.id,
    site_id: row.site_id,
    post_event_id: row.post_event_id,
    subject: row.subject,
    recipient_count: row.recipient_count,
    sent_count: row.sent_count,
    status: row.status as SendLog['status'],
    started_at: row.started_at,
    completed_at: row.completed_at,
  };
}

function rowToDeliveryEvent(row: DeliveryEventRow): DeliveryEvent {
  return {
    id: row.id,
    site_id: row.site_id,
    send_log_id: row.send_log_id,
    subscriber_id: row.subscriber_id,
    event_type: row.event_type as DeliveryEvent['event_type'],
    recipient: row.recipient,
    timestamp: row.timestamp,
  };
}

/**
 * Opens a better-sqlite3 connection with WAL mode, foreign_keys, and
 * busy_timeout pragmas applied (RESEARCH §2.2, §7.3). Returns the raw
 * `Database` so the caller (server/index.ts) can run migrations and online
 * backups on the single connection before/while the repository uses it.
 */
export function openDatabase(dbPath: string): DB {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

/**
 * SQLite implementation of `SubscriberRepository` (SRV-02).
 *
 * Constructed with an already-opened `better-sqlite3` `Database` (opened via
 * `openDatabase` or supplied by the caller). The single-connection pattern is
 * required for safe online backup (RESEARCH §2.3). All sync better-sqlite3
 * calls are wrapped in `Promise.resolve` so the interface is uniformly async.
 *
 * Every SELECT/UPDATE/DELETE includes `AND site_id = ?` keyed on the passed
 * `siteId` — this is the T-01-01 mitigation (cross-site isolation).
 */
export class SqliteSubscriberRepository implements SubscriberRepository {
  constructor(private readonly db: DB) {}

  /** Test-friendly: read a PRAGMA value from the underlying connection. */
  pragma(name: string): unknown {
    return this.db.pragma(name, { simple: true });
  }

  /** Expose the underlying connection for online backup (server/db/backup.ts). */
  getDb(): DB {
    return this.db;
  }

  // --- subscribers ---

  async getSubscriber(siteId: string, id: string): Promise<Subscriber | null> {
    const row = this.db.prepare(
      'SELECT * FROM subscribers WHERE site_id = ? AND id = ?',
    ).get(siteId, id) as SubscriberRow | undefined;
    return row ? rowToSubscriber(row) : null;
  }

  async getSubscriberByEmail(siteId: string, email: string): Promise<Subscriber | null> {
    const row = this.db.prepare(
      'SELECT * FROM subscribers WHERE site_id = ? AND email = ?',
    ).get(siteId, email) as SubscriberRow | undefined;
    return row ? rowToSubscriber(row) : null;
  }

  async listSubscribers(siteId: string, opts: ListSubscribersOpts = {}): Promise<Subscriber[]> {
    const where: string[] = ['site_id = ?'];
    const params: unknown[] = [siteId];
    if (opts.status) {
      where.push('status = ?');
      params.push(opts.status);
    }
    if (opts.segment) {
      // segment stored as JSON array text — match the quoted segment name.
      // WR-03: escape LIKE metacharacters (% _ \) and the embedded JSON quote
      // (") so a segment name containing them matches literally instead of
      // acting as a wildcard or breaking the quote-delimited match. The value
      // is still bound as a parameter (no SQL injection); this is a
      // data-correctness fix. ESCAPE '\\' tells SQLite to honor the backslash
      // as the escape character.
      const esc = opts.segment.replace(/[%_"\\]/g, (c) => `\\${c}`);
      where.push("segment LIKE ? ESCAPE '\\'");
      params.push(`%"${esc}"%`);
    }
    let sql = `SELECT * FROM subscribers WHERE ${where.join(' AND ')} ORDER BY created_at DESC`;
    if (opts.limit !== undefined) {
      sql += ' LIMIT ? OFFSET ?';
      params.push(opts.limit, opts.offset ?? 0);
    }
    const rows = this.db.prepare(sql).all(...params) as SubscriberRow[];
    return rows.map(rowToSubscriber);
  }

  async countSubscribers(siteId: string, opts: CountSubscribersOpts = {}): Promise<number> {
    const where: string[] = ['site_id = ?'];
    const params: unknown[] = [siteId];
    if (opts.status) {
      where.push('status = ?');
      params.push(opts.status);
    }
    if (opts.segment) {
      // WR-03: escape LIKE metacharacters + embedded quote (see listSubscribers).
      const esc = opts.segment.replace(/[%_"\\]/g, (c) => `\\${c}`);
      where.push("segment LIKE ? ESCAPE '\\'");
      params.push(`%"${esc}"%`);
    }
    const row = this.db.prepare(
      `SELECT COUNT(*) AS n FROM subscribers WHERE ${where.join(' AND ')}`,
    ).get(...params) as { n: number };
    return row.n;
  }

  async insertSubscriber(siteId: string, sub: NewSubscriber): Promise<Subscriber> {
    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO subscribers
        (id, site_id, email, name, npub, status, segment, created_at, confirmed_at, bounced_at, complained_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      siteId,
      sub.email,
      sub.name,
      sub.npub,
      sub.status,
      JSON.stringify(sub.segment ?? []),
      created_at,
      sub.confirmed_at ?? null,
      sub.bounced_at ?? null,
      sub.complained_at ?? null,
    );
    const inserted = await this.getSubscriber(siteId, id);
    if (!inserted) throw new Error('insertSubscriber: row not found after insert');
    return inserted;
  }

  async updateSubscriberStatus(siteId: string, id: string, status: SubscriberStatus): Promise<void> {
    const now = new Date().toISOString();
    const sets: string[] = ['status = ?'];
    const params: unknown[] = [status];
    if (status === 'active') { sets.push('confirmed_at = ?'); params.push(now); }
    if (status === 'bounced') { sets.push('bounced_at = ?'); params.push(now); }
    if (status === 'unsubscribed') { sets.push('complained_at = ?'); params.push(now); }
    params.push(siteId, id);
    this.db.prepare(
      `UPDATE subscribers SET ${sets.join(', ')} WHERE site_id = ? AND id = ?`,
    ).run(...params);
  }

  async deleteSubscriber(siteId: string, id: string): Promise<void> {
    this.db.prepare(
      'DELETE FROM subscribers WHERE site_id = ? AND id = ?',
    ).run(siteId, id);
  }

  // --- settings ---

  async getSettings(siteId: string): Promise<Settings | null> {
    const row = this.db.prepare(
      'SELECT * FROM settings WHERE site_id = ?',
    ).get(siteId) as SettingsRow | undefined;
    return row ? rowToSettings(row) : null;
  }

  async upsertSettings(siteId: string, settings: Partial<Settings>): Promise<Settings> {
    const existing = await this.getSettings(siteId);
    const merged: Settings = {
      site_id: siteId,
      module_enabled: settings.module_enabled ?? existing?.module_enabled ?? false,
      resend_api_key_enc: settings.resend_api_key_enc ?? existing?.resend_api_key_enc ?? null,
      sending_domain: settings.sending_domain ?? existing?.sending_domain ?? null,
      from_name: settings.from_name ?? existing?.from_name ?? null,
      postal_address: settings.postal_address ?? existing?.postal_address ?? null,
      rate_limit: settings.rate_limit ?? existing?.rate_limit ?? null,
      updated_at: new Date().toISOString(),
    };
    this.db.prepare(
      `INSERT INTO settings
        (site_id, module_enabled, resend_api_key_enc, sending_domain, from_name, postal_address, rate_limit, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(site_id) DO UPDATE SET
        module_enabled = excluded.module_enabled,
        resend_api_key_enc = excluded.resend_api_key_enc,
        sending_domain = excluded.sending_domain,
        from_name = excluded.from_name,
        postal_address = excluded.postal_address,
        rate_limit = excluded.rate_limit,
        updated_at = excluded.updated_at`,
    ).run(
      merged.site_id,
      merged.module_enabled ? 1 : 0,
      merged.resend_api_key_enc,
      merged.sending_domain,
      merged.from_name,
      merged.postal_address,
      merged.rate_limit,
      merged.updated_at,
    );
    return merged;
  }

  // --- verify_tokens ---

  async createToken(token: NewToken): Promise<VerifyToken> {
    const id = crypto.randomUUID();
    this.db.prepare(
      `INSERT INTO verify_tokens (id, subscriber_id, site_id, purpose, expires_at, used)
       VALUES (?, ?, ?, ?, ?, 0)`,
    ).run(id, token.subscriber_id, token.site_id, token.purpose, token.expires_at);
    const created = await this.getToken(token.site_id, id);
    if (!created) throw new Error('createToken: row not found after insert');
    return created;
  }

  async getToken(siteId: string, id: string): Promise<VerifyToken | null> {
    const row = this.db.prepare(
      'SELECT * FROM verify_tokens WHERE site_id = ? AND id = ?',
    ).get(siteId, id) as VerifyTokenRow | undefined;
    return row ? rowToToken(row) : null;
  }

  async invalidateToken(siteId: string, id: string): Promise<void> {
    this.db.prepare(
      'UPDATE verify_tokens SET used = 1 WHERE site_id = ? AND id = ?',
    ).run(siteId, id);
  }

  // --- send_log ---

  async createSendLog(entry: NewSendLog): Promise<SendLog> {
    const id = crypto.randomUUID();
    this.db.prepare(
      `INSERT INTO send_log
        (id, site_id, post_event_id, subject, recipient_count, sent_count, status, started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      entry.site_id,
      entry.post_event_id,
      entry.subject,
      entry.recipient_count,
      entry.sent_count,
      entry.status,
      entry.started_at,
      entry.completed_at,
    );
    const row = this.db.prepare('SELECT * FROM send_log WHERE id = ?').get(id) as SendLogRow;
    return rowToSendLog(row);
  }

  async updateSendLog(siteId: string, id: string, patch: Partial<SendLog>): Promise<void> {
    // WR-02: allowlist of updatable columns — reject unknown keys to prevent
    // SQL injection via interpolated column names (values are parameterized,
    // but column names are not). Throw on any key not in the allowlist so a
    // future handler that spreads an untrusted JSON body into `patch` fails
    // loudly instead of injecting SQL.
    const ALLOWED_COLUMNS = new Set([
      'post_event_id', 'subject', 'recipient_count', 'sent_count',
      'status', 'completed_at',
    ]);
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'id' || key === 'site_id') continue;
      if (!ALLOWED_COLUMNS.has(key)) {
        throw new Error(`updateSendLog: unknown column "${key}"`);
      }
      sets.push(`${key} = ?`);
      params.push(value);
    }
    if (sets.length === 0) return;
    params.push(siteId, id);
    this.db.prepare(`UPDATE send_log SET ${sets.join(', ')} WHERE site_id = ? AND id = ?`).run(...params);
  }

  async findSendLogByPostEventId(siteId: string, postEventId: string): Promise<SendLog | null> {
    const row = this.db.prepare(
      'SELECT * FROM send_log WHERE site_id = ? AND post_event_id = ?',
    ).get(siteId, postEventId) as SendLogRow | undefined;
    return row ? rowToSendLog(row) : null;
  }

  // --- delivery_events ---

  async recordDeliveryEvent(ev: NewDeliveryEvent): Promise<DeliveryEvent> {
    const id = crypto.randomUUID();
    this.db.prepare(
      `INSERT INTO delivery_events
        (id, site_id, send_log_id, subscriber_id, event_type, recipient, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, ev.site_id, ev.send_log_id, ev.subscriber_id, ev.event_type, ev.recipient, ev.timestamp);
    const row = this.db.prepare('SELECT * FROM delivery_events WHERE id = ?').get(id) as DeliveryEventRow;
    return rowToDeliveryEvent(row);
  }

  // --- maintenance ---

  async close(): Promise<void> {
    this.db.close();
  }
}
