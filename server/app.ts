import { Hono } from 'hono';

import type { SubscriberRepository } from './db/repository';
import { healthRoute } from './routes/health';

/**
 * Constructs the Hono app for the email service WITHOUT binding a port.
 * Registers the public health route (`/api/email/health` -> `{"ok":true}`,
 * D-04) before any auth middleware so it is publicly reachable.
 *
 * Plan 01-02 adds the NIP-98 admin auth middleware + admin routes by
 * extending this helper (the `repo` argument is the extension point — admin
 * routes need the repository).
 *
 * Exported so tests (task 01-02-05) can mount the app via `createApp()`
 * without starting a server.
 */
export function createApp(repo?: SubscriberRepository): Hono {
  const app = new Hono();

  // Public health route — registered first, before any auth middleware.
  app.get('/api/email/health', healthRoute);

  // Extension point for plan 01-02: admin auth middleware + admin routes.
  // app.use('/api/email/admin/*', nip98AdminAuth({ masterResolver }));
  // registerAdminRoutes(app, repo);
  void repo; // reserved for admin routes added in plan 01-02

  return app;
}
