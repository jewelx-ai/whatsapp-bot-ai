import {
  PLATFORM_LOGIN_PATH,
  requirePlatformAdmin,
  superAdminEmail,
} from "@/lib/platform";

export const dynamic = "force-dynamic";

export default async function AccessPage() {
  const admin = await requirePlatformAdmin();
  const configured = superAdminEmail();

  return (
    <div className="app-page-narrow">
      <header className="page-header">
        <div className="page-heading">
          <p className="page-kicker">Platform</p>
          <h1 className="page-title">Access</h1>
          <p className="page-copy">
            This deployment has a single platform operator account. Everyone else
            signs in to their own workspace.
          </p>
        </div>
      </header>

      <section className="page-section app-panel">
        <div className="card-header">
          <h2 className="card-title">Operator account</h2>
          <p className="card-copy">
            Identity and passwords are managed by Supabase Auth.
          </p>
        </div>
        <div className="card-body">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-slate-500">Signed in as</dt>
              <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                {admin.email}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">
                Configured operator
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                {configured ?? "not configured"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Portal</dt>
              <dd className="mt-0.5 text-sm text-slate-700">
                {PLATFORM_LOGIN_PATH}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">User ID</dt>
              <dd className="mt-0.5 font-mono text-xs text-slate-600">
                {admin.userId}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="page-section app-panel">
        <div className="card-header">
          <h2 className="card-title">Changing the operator</h2>
          <p className="card-copy">How to move platform access to another account.</p>
        </div>
        <div className="card-body space-y-3 text-sm leading-6 text-slate-600">
          <p>
            Set <code className="font-mono text-xs">PLATFORM_SUPER_ADMIN_EMAIL</code> in
            the server environment to the new operator&apos;s email, then restart
            the app. The account must already exist in Supabase Auth.
          </p>
          <p>
            To change the password, use Supabase Auth (dashboard or a password
            reset) for that account.
          </p>
          <div className="feedback-info">
            <p className="feedback-copy">
              Only one operator is supported by design. This keeps cross-tenant
              access to a single, auditable account.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
