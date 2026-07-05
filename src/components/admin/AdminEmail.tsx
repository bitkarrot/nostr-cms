import { Mail } from 'lucide-react';

/**
 * Stub admin email page (Phase 1).
 *
 * This is a placeholder so the gated email nav entry (AdminLayout) resolves to
 * a real route instead of 404ing when the module is enabled. The real email
 * admin settings UI (subscriber management, Resend config, etc.) lands in
 * Phase 2. Kept intentionally minimal per Plan 01-04-03.
 */
export default function AdminEmail() {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Mail className="h-8 w-8 text-primary" />
          Email
        </h2>
        <p className="text-muted-foreground text-lg">
          Email newsletter management — coming soon.
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        The email module is enabled on this deployment. Full configuration and
        subscriber management will be available in a future release.
      </p>
    </div>
  );
}
