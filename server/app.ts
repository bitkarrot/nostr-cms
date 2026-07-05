import { Hono } from 'hono';

import type { SubscriberRepository } from './db/repository';
import { healthRoute } from './routes/health';
import { createAdminRouter } from './routes/admin';

/**
 * Constructs the Hono app for the email service WITHOUT binding a port.
 * Registers the public health route (`/api/email/health` -> `{"ok":true}`,
 * D-04) BEFORE the NIP-98 admin auth middleware so it is publicly reachable,
 * then mounts the admin router under `/api/email/admin/*` (requires master
 * NIP-98, SRV-03).
 *
 * Exported so tests (task 01-02-05) can mount the app via `createApp()`
 * without starting a server.
 */
export function createApp(repo?: SubscriberRepository): Hono {
  const app = new Hono();

  // Public health route — registered first, before any auth middleware (D-04).
  app.get('/api/email/health', healthRoute);

  // Admin routes — all under /api/email/admin/* require master NIP-98 auth.
  // The admin router applies the nip98Auth middleware internally.
  app.route('/api/email/admin', createAdminRouter());

  void repo; // reserved for admin routes added in future phases

  return app;
}
