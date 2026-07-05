-- Initial schema for the email newsletter service (SRV-02).
-- All entity tables carry site_id (single-tenant now, multi-tenant-ready later).
-- SQLite dialect: TEXT for timestamps (ISO strings), INTEGER booleans.

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

-- Partial unique index for send_log dedup (Pitfall P10): a post_event_id can
-- only appear once per site when it is not null.
CREATE UNIQUE INDEX send_log_post_event_id_unique
  ON send_log(site_id, post_event_id)
  WHERE post_event_id IS NOT NULL;

CREATE TABLE delivery_events (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  send_log_id TEXT,
  subscriber_id TEXT,
  event_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  timestamp TEXT NOT NULL
);
