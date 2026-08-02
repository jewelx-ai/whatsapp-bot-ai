import { requirePlatformAdmin } from "@/lib/platform";
import { BrandMark } from "@/components/ui/icons";
import {
  PlatformAccountPanel,
  PlatformMobileNavigation,
  PlatformNavLinks,
} from "./nav";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requirePlatformAdmin();

  return (
    <div className="app-shell lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
      <a href="#platform-content" className="skip-link">
        Skip to content
      </a>

      <aside
        aria-label="Platform sidebar"
        className="h-app-screen sticky top-0 hidden border-r border-app-border bg-surface/95 px-4 py-5 backdrop-blur-xl lg:flex lg:flex-col"
      >
        <div className="flex items-center gap-3 border-b border-app-border px-2 pb-5">
          <BrandMark />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-[-0.01em] text-slate-950">
              Platform Admin
            </p>
            <p className="truncate text-xs font-medium text-slate-500">
              Cross-tenant operations
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-5">
          <PlatformNavLinks />
        </div>

        <PlatformAccountPanel email={admin.email} />
      </aside>

      <div className="min-w-0">
        <PlatformMobileNavigation email={admin.email} />
        <main
          id="platform-content"
          tabIndex={-1}
          className="min-h-[calc(100dvh-4.0625rem)] min-w-0 lg:min-h-screen"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
