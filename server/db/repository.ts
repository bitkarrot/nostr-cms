/**
 * Backend-agnostic subscriber repository interface (SRV-02).
 *
 * Every method is `async` so the same interface is satisfiable by both the
 * synchronous SQLite impl (`better-sqlite3`, wrapped in `Promise.resolve`) and
 * a future async Postgres impl (`pg`). Every method that touches a site is
 * scoped by `siteId` — this is the T-01-01 mitigation (cross-site reads/writes
 * are blocked because every SQL statement keys on `site_id`).
 */

export type SubscriberStatus = 'pending' | 'active' | 'unsubscribed' | 'bounced';

export interface Subscriber {
  id: string;
  site_id: string;
  email: string;
  name: string | null;
  npub: string | null;
  status: SubscriberStatus;
  segment: string[];
  created_at: string;
  confirmed_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
}

export interface Settings {
  site_id: string;
  module_enabled: boolean;
  resend_api_key_enc: string | null;
  sending_domain: string | null;
  from_name: string | null;
  postal_address: string | null;
  rate_limit: number | null;
  updated_at: string;
}

export interface VerifyToken {
  id: string;
  subscriber_id: string;
  site_id: string;
  purpose: string;
  expires_at: string;
  used: boolean;
}

export type SendLogStatus = 'pending' | 'sending' | 'completed' | 'failed';

export interface SendLog {
  id: string;
  site_id: string;
  post_event_id: string | null;
  subject: string | null;
  recipient_count: number | null;
  sent_count: number | null;
  status: SendLogStatus | null;
  started_at: string;
  completed_at: string | null;
}

export type DeliveryEventType = 'sent' | 'delivered' | 'bounced' | 'complaint' | 'opened' | 'clicked';

export interface DeliveryEvent {
  id: string;
  site_id: string;
  send_log_id: string | null;
  subscriber_id: string | null;
  event_type: DeliveryEventType;
  recipient: string;
  timestamp: string;
}

export interface ListSubscribersOpts {
  status?: SubscriberStatus;
  segment?: string;
  limit?: number;
  offset?: number;
}

export interface CountSubscribersOpts {
  status?: SubscriberStatus;
  segment?: string;
}

export type NewSubscriber = Omit<Subscriber, 'id' | 'created_at'>;
export type NewToken = Omit<VerifyToken, 'id' | 'used'>;
export type NewSendLog = Omit<SendLog, 'id'>;
export type NewDeliveryEvent = Omit<DeliveryEvent, 'id'>;

export interface SubscriberRepository {
  // subscribers
  getSubscriber(siteId: string, id: string): Promise<Subscriber | null>;
  getSubscriberByEmail(siteId: string, email: string): Promise<Subscriber | null>;
  listSubscribers(siteId: string, opts?: ListSubscribersOpts): Promise<Subscriber[]>;
  countSubscribers(siteId: string, opts?: CountSubscribersOpts): Promise<number>;
  insertSubscriber(siteId: string, sub: NewSubscriber): Promise<Subscriber>;
  updateSubscriberStatus(siteId: string, id: string, status: SubscriberStatus): Promise<void>;
  deleteSubscriber(siteId: string, id: string): Promise<void>;
  // settings
  getSettings(siteId: string): Promise<Settings | null>;
  upsertSettings(siteId: string, settings: Partial<Settings>): Promise<Settings>;
  // verify_tokens
  createToken(token: NewToken): Promise<VerifyToken>;
  getToken(id: string): Promise<VerifyToken | null>;
  invalidateToken(id: string): Promise<void>;
  // send_log
  createSendLog(entry: NewSendLog): Promise<SendLog>;
  updateSendLog(id: string, patch: Partial<SendLog>): Promise<void>;
  findSendLogByPostEventId(siteId: string, postEventId: string): Promise<SendLog | null>;
  // delivery_events
  recordDeliveryEvent(ev: NewDeliveryEvent): Promise<DeliveryEvent>;
  // maintenance
  close(): Promise<void>;
}
