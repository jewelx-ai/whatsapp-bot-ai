"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AppIcon, BrandMark, type AppIconName } from "@/components/ui/icons";
import { supabaseBrowser } from "@/lib/supabase/client";

// Mirrors the tenant dashboard navigation (same shell, same design system),
// but scoped to cross-tenant platform operations.

const navigationGroups = [
  {
    label: "Platform",
    links: [
      { href: "/admin", label: "Overview", icon: "grid" },
      { href: "/admin/organizations", label: "Organizations", icon: "building" },
      { href: "/admin/users", label: "Users", icon: "contacts" },
    ],
  },
  {
    label: "Access",
    links: [{ href: "/admin/access", label: "Access", icon: "shield" }],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  links: ReadonlyArray<{ href: string; label: string; icon: AppIconName }>;
}>;

function isCurrentRoute(pathname: string, href: string) {
  // "/admin" is the index route, so it must match exactly.
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function currentRouteLabel(pathname: string) {
  for (const group of navigationGroups) {
    for (const link of group.links) {
      if (isCurrentRoute(pathname, link.href)) return link.label;
    }
  }
  return undefined;
}

export function PlatformNavLinks({
  label = "Platform navigation",
  onNavigate,
}: {
  label?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="min-w-0">
      <div className="space-y-6">
        {navigationGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-slate-400">
              {group.label}
            </p>
            <ul className="space-y-1">
              {group.links.map((link) => {
                const current = isCurrentRoute(pathname, link.href);

                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onNavigate={onNavigate}
                      aria-current={current ? "page" : undefined}
                      className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold ${
                        current
                          ? "bg-emerald-50 text-emerald-950 shadow-[inset_0_0_0_1px_rgb(4_120_87_/_0.14)]"
                          : "text-slate-600 hover:bg-stone-100/80 hover:text-slate-950"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.625rem] ${
                          current
                            ? "bg-emerald-700 text-white shadow-sm shadow-emerald-950/20"
                            : "border border-stone-200/90 bg-white text-slate-500 group-hover:border-stone-300 group-hover:text-slate-700"
                        }`}
                        aria-hidden="true"
                      >
                        <AppIcon name={link.icon} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{link.label}</span>
                      {current && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600"
                          aria-hidden="true"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}


      </div>
    </nav>
  );
}

export function PlatformSignOutButton() {
  const router = useRouter();
  const errorId = useId();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    if (isSigningOut) return;
    setError(null);
    setIsSigningOut(true);

    try {
      const { error: signOutError } = await supabaseBrowser().auth.signOut();
      if (signOutError) throw signOutError;
      router.replace("/login");
      router.refresh();
    } catch {
      setError("We couldn’t sign you out. Check your connection and try again.");
      setIsSigningOut(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={signOut}
        disabled={isSigningOut}
        aria-busy={isSigningOut}
        aria-describedby={error ? errorId : undefined}
        className="btn-secondary w-full"
      >
        {isSigningOut ? (
          <span className="spinner" aria-hidden="true" />
        ) : (
          <AppIcon name="logout" className="h-4 w-4" />
        )}
        <span aria-live="polite">{isSigningOut ? "Signing out…" : "Sign out"}</span>
      </button>
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function PlatformAccountPanel({ email }: { email: string }) {
  const initial = email.trim().charAt(0).toUpperCase() || "P";

  return (
    <section
      aria-label="Signed-in platform admin"
      className="rounded-2xl border border-stone-200/90 bg-stone-100/70 p-3"
    >
      <div className="mb-3 flex items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white shadow-sm"
          aria-hidden="true"
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800" title={email}>
            {email}
          </p>
          <span className="badge-accent mt-1">
            <span className="sr-only">Role: </span>
            Platform admin
          </span>
        </div>
      </div>
      <PlatformSignOutButton />
    </section>
  );
}

export function PlatformMobileNavigation({ email }: { email: string }) {
  const pathname = usePathname();
  const sectionLabel = currentRouteLabel(pathname) ?? "Platform";
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const closeDrawer = useCallback((restoreFocus = true) => {
    setIsOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() =>
      closeButtonRef.current?.focus()
    );

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      const activeElement = document.activeElement;
      const focusIsInside = drawerRef.current.contains(activeElement);
      if (!first || !last) return;

      if (event.shiftKey && (activeElement === first || !focusIsInside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !focusIsInside)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeDrawer, isOpen]);

  return (
    <>
      <header className="sticky top-0 z-30 flex min-h-[4.0625rem] items-center justify-between gap-3 border-b border-app-border bg-surface/95 px-4 py-3 shadow-[0_1px_0_rgb(23_33_31_/_0.02)] backdrop-blur-xl lg:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-[-0.01em] text-slate-950">
              Platform Admin
            </p>
            <p className="truncate text-[0.6875rem] font-medium text-slate-500">
              {sectionLabel}
            </p>
          </div>
        </div>
        <button
          ref={triggerRef}
          type="button"
          className="btn-icon border-app-border bg-white shadow-sm"
          aria-label="Open navigation"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls="platform-navigation-drawer"
          onClick={() => setIsOpen(true)}
        >
          <AppIcon name="menu" />
        </button>
      </header>

      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Close navigation"
            className="drawer-overlay absolute inset-0 h-full w-full bg-slate-950/35 backdrop-blur-[2px]"
            onClick={() => closeDrawer()}
          />
          <aside
            ref={drawerRef}
            id="platform-navigation-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="platform-navigation-title"
            className="drawer-panel h-app-screen safe-area-top safe-area-bottom absolute inset-y-0 left-0 flex w-[min(87vw,21rem)] flex-col border-r border-app-border bg-surface px-4 shadow-raised"
          >
            <div className="flex items-center justify-between gap-3 border-b border-app-border pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <BrandMark />
                <div className="min-w-0">
                  <h2
                    id="platform-navigation-title"
                    className="truncate text-sm font-semibold text-slate-950"
                  >
                    Platform Admin
                  </h2>
                  <p className="truncate text-xs text-slate-500">
                    Cross-tenant operations
                  </p>
                </div>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="btn-icon"
                aria-label="Close navigation"
                onClick={() => closeDrawer()}
              >
                <AppIcon name="close" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-5">
              <PlatformNavLinks
                label="Mobile platform navigation"
                onNavigate={() => closeDrawer(false)}
              />
            </div>

            <PlatformAccountPanel email={email} />
          </aside>
        </div>
      )}
    </>
  );
}
