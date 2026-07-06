# nostr-cms email service — Deploy Guide

This directory contains the deployment artifacts for the nostr-cms email
service (SRV-04). The email module is **opt-in at install time, default off**
— installers who don't want email don't start the service and see no email UI.

## Files

| File | Purpose |
|------|---------|
| `nginx.example.conf` | nginx `location /api/email/` snippet (copy into your existing server block) |
| `nostr-cms-email.service` | systemd unit template (process supervisor) |
| `email.env` | environment variable template (edit before use) |

## Prerequisites

- Node.js 20+ on the relay box
- nostr-cms cloned at `/app/nostr-cms` (adjust paths if different)
- nginx already serving the SPA and proxying `/api/` to swarm
- swarm is **NOT modified** — the email service talks to it over HTTP/WS only

## 1. Configure environment

```bash
cp server/deploy/email.env server/deploy/email.env.local
# Edit email.env.local: set EMAIL_PORT, EMAIL_DB_PATH, MASTER_PUBKEY, SWARM_BASE_URL
```

> If you use a separate env file, update the `EnvironmentFile=` path in the
> systemd unit to point to your edited copy.

## 2. Install nginx snippet (D-02, D-03)

The nginx `location /api/email/` block lives in this repo (not swarm). Copy
it into your existing nginx `server { }` block:

```bash
# Edit your nginx config (e.g. /etc/nginx/sites-available/relay.example.com)
# and paste the contents of server/deploy/nginx.example.conf inside the
# server { } block, as a sibling to the existing location /api/ block.

# Substitute EMAIL_PORT (default 3001):
#   proxy_pass http://127.0.0.1:3001;
# (or use sed / envsubst to substitute ${EMAIL_PORT})

sudo nginx -t && sudo systemctl reload nginx
```

**Routing:** nginx longest-prefix-match means `location /api/email/` wins over
`location /api/` (swarm). So `/api/email/*` → Node service, everything else
under `/api/` → swarm. No swarm config change is needed.

**Hardening included (D-03):**
- `client_max_body_size 10m` — covers future Phase 4 CSV uploads
- `proxy_read_timeout 60s` — covers slow admin operations
- Forwarded headers (`X-Forwarded-Proto`, `X-Forwarded-Host`, etc.) so the
  server can reconstruct the public URL for NIP-98 verification

**Deliberately omitted (D-03):**
- No nginx-level rate limiting (rate limiting is server-side, Phase 5)
- No WebSocket upgrade headers (email API is HTTP-only)

## 3. Install systemd unit (SRV-04)

systemd is the recommended process supervisor — it's already the init system
on any modern Linux relay box, survives reboots, captures logs to journald,
and restarts on failure. No extra runtime dependency (PM2/docker not needed).

```bash
# Copy the unit to systemd
sudo cp server/deploy/nostr-cms-email.service /etc/systemd/system/

# Edit paths/user if your deployment differs from the defaults
# (WorkingDirectory, EnvironmentFile, User)
sudo nano /etc/systemd/system/nostr-cms-email.service

# Reload systemd, enable and start
sudo systemctl daemon-reload
sudo systemctl enable --now nostr-cms-email

# Check status
sudo systemctl status nostr-cms-email
# Logs
sudo journalctl -u nostr-cms-email -f
```

## 4. Run the server

The `npm run server` script runs `tsx server/index.ts` (the server entry
point). In production, systemd runs this via `ExecStart=/usr/bin/npx tsx
server/index.ts`. For development:

```bash
npm run server          # tsx server/index.ts (single run)
npm run server:dev      # tsx watch server/index.ts (auto-reload on change)
npm run server:check    # tsc --noEmit -p server/tsconfig.json (type check)
```

## 5. Verify

### Automated (source assertions)

```bash
# nginx snippet has the required hardening
grep -c 'client_max_body_size 10m' server/deploy/nginx.example.conf
# server script exists in package.json
node -e "require('./package.json').scripts.server"
```

### Manual (on a real relay box — see VALIDATION.md)

These three checks are deferred to deploy-time because they require a real
relay box / running swarm and cannot be automated in CI. They are tracked as
Phase 1 tech debt (item 7 in the v1.0 milestone audit) and **must be
performed by the operator on first deploy** before declaring Phase 1 live.
Tick each box when verified:

- [ ] **1. nginx proxies `/api/email/health` (SRV-04, D-02/D-03):**
      Start `npm run server` on the relay box, add the
      `server/deploy/nginx.example.conf` snippet to the nginx server block
      (substitute `EMAIL_PORT`), then:
      ```bash
      sudo nginx -t && sudo systemctl reload nginx
      curl -sS https://<relay-domain>/api/email/health
      # expect: {"ok":true}   (D-04: public, no auth, no DB details)
      ```
- [ ] **2. systemd crash-restart (SRV-04):** Install the systemd unit, start
      it, then kill the node process and confirm systemd restarts it:
      ```bash
      sudo systemctl enable --now nostr-cms-email
      PID=$(systemctl show -p MainPID --value nostr-cms-email)
      kill -9 "$PID"
      sleep 2 && systemctl status nostr-cms-email
      # expect: active (running)  (restarted via Restart=on-failure)
      ```
- [ ] **3. `email_enabled` runtime toggle via swarm-config without rebuild
      (SRV-05):** Build the SPA once, then toggle the swarm-config meta tag
      without rebuilding:
      ```bash
      npm run build   # one-time build
      # swarm-config with email_enabled: false → reload → no Email nav
      # swarm-config with email_enabled: true  → reload (no rebuild) → Email nav appears
      ```

## Notes

- **swarm is a separate repo** (D-02) — do not modify it. The email service
  talks to swarm only over HTTP (nostr.json fetch) and WS (relay reads).
- **RESEND_API_KEY** is not in `email.env` yet — it's added in Phase 2 when
  the send pipeline lands. Phase 1 only stands up the server foundation.
- **Backups:** `npm run server:backup` runs an online backup via
  `better-sqlite3`'s backup API. Add a cron line for daily backups:
  `0 3 * * * cd /app/nostr-cms && npm run server:backup`
