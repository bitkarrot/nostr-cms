import type { Context } from 'hono';

/**
 * Public health route (D-04). Returns exactly `{"ok":true}` with no auth, no
 * DB details, no subscriber counts, no config. Registered BEFORE any admin
 * auth middleware so it is publicly reachable (lets creators use external
 * uptime monitors like UptimeRobot/BetterStack).
 */
export function healthRoute(c: Context): Response {
  return c.json({ ok: true }, 200);
}
