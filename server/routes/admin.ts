import { Hono } from 'hono';

import { nip98Auth, type Nip98Env } from '../middleware/nip98Auth';
import { resolveMasterPubkey } from '../auth/master-pubkey';

/**
 * Admin routes for the email service (SRV-03). All routes under
 * `/api/email/admin/*` require a valid NIP-98 signature from the site master
 * pubkey via the `nip98Auth` middleware. The public health route
 * (`/api/email/health`) is registered separately in `createApp` BEFORE this
 * router so it stays public (D-04).
 *
 * Phase 1 ships a scaffold `GET /api/email/admin/ping` proving the auth seam
 * works end-to-end. Future phases add settings, subscriber management, and
 * send-pipeline routes on the same authenticated router.
 */
export function createAdminRouter(): Hono<Nip98Env> {
  const admin = new Hono<Nip98Env>();

  // Every admin route requires master NIP-98 auth.
  admin.use(
    '/*',
    nip98Auth({ masterResolver: () => resolveMasterPubkey() }),
  );

  // Scaffold ping — returns ok + the verified signer pubkey.
  admin.get('/ping', (c) => c.json({ ok: true, pubkey: c.get('pubkey') }, 200));

  // POST variant used by the payload-tamper test (task 01-02-02). Reads the
  // body so NIP98.verify's payload SHA-256 check is exercised.
  admin.post('/ping', async (c) => {
    await c.req.text(); // consume the body so the digest is computed
    return c.json({ ok: true, pubkey: c.get('pubkey') }, 200);
  });

  return admin;
}
