"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Link, usePathname } from "@/i18n/routing";
import { Eye, LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSessionUser } from "@/hooks/useSessionUser";
import { signOutAndPurge } from "@/lib/auth/sign-out";
import { ADMIN_NAV_GROUPS, isNavItemActive } from "@/lib/admin/nav";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** The one shell of the admin panel (CLAUDE.md §15): every page of /admin/**
 * (monitoring, CMS, system) renders inside it. Structurally its own
 * thing — a sticky header and a grouped left nav from lib/admin/nav.ts —
 * deliberately not built from AppShell/Sidebar (design-locked, CLAUDE.md §6),
 * though the row styling mirrors them: rounded-2xl rows, text-[13.5px]
 * labels, the same token palette. */
export function AdminShell({
  children,
  notificationsSlot,
}: {
  children: ReactNode;
  /** Server-rendered NotificationsBell — passed in because this shell is a Client Component. */
  notificationsSlot?: ReactNode;
}) {
  const pathname = usePathname();
  const locale = useLocale();
  const { user } = useSessionUser();
  const tNav = useTranslations("admin.nav");
  const tShell = useTranslations("admin.shell");
  const stripRef = useRef<HTMLElement>(null);

  // The phone strip scrolls sideways; bring the current section into view
  // after a navigation, so the strip always shows where you are. Sets the
  // strip's own scrollLeft — never the window's scroll (CLAUDE.md §14).
  useEffect(() => {
    const strip = stripRef.current;
    const active = strip?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!strip || !active) return;
    strip.scrollLeft = Math.max(0, active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2);
  }, [pathname]);

  async function handleSignOut() {
    await signOutAndPurge({ locale, email: user?.email });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface/95 px-4 backdrop-blur sm:gap-3">
        <Link href="/admin" className={`flex shrink-0 items-center gap-2 rounded-lg ${FOCUS_RING}`}>
          <Logo className="h-7 w-7 shrink-0" />
          <span className="hidden text-sm font-semibold text-primary-dark sm:inline">{tShell("title")}</span>
        </Link>

        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
          {user?.email && (
            <span
              title={tShell("signedInAs", { email: user.email })}
              className="hidden max-w-[16rem] truncate text-[12.5px] text-text-secondary lg:inline"
            >
              {user.email}
            </span>
          )}
          {notificationsSlot}
          <Link
            href="/"
            aria-label={tShell("operatorView")}
            title={tShell("operatorView")}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[13px] font-medium text-primary-dark transition-colors hover:bg-surface-alt ${FOCUS_RING}`}
          >
            <Eye size={15} className="text-text-secondary" aria-hidden="true" />
            <span className="hidden md:inline">{tShell("operatorView")}</span>
          </Link>
          <ThemeToggle />
          <button
            type="button"
            onClick={handleSignOut}
            aria-label={tShell("signOut")}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[13px] font-medium text-primary-dark transition-colors hover:bg-surface-alt sm:px-3 ${FOCUS_RING}`}
          >
            <LogOut size={15} className="text-text-secondary" aria-hidden="true" />
            <span className="hidden sm:inline">{tShell("signOut")}</span>
          </button>
        </div>
      </header>

      {/* The left nav below is md-and-up; on a phone this strip is the only way between sections. */}
      <nav
        ref={stripRef}
        aria-label={tShell("sections")}
        className="relative flex items-center gap-1 overflow-x-auto border-b border-border bg-surface px-3 py-2 md:hidden"
      >
        {ADMIN_NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.id} className="flex shrink-0 items-center gap-1">
            {groupIndex > 0 && <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />}
            {group.items.map((item) => {
              const isActive = isNavItemActive(item, pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 text-[13px] ${FOCUS_RING} ${
                    isActive
                      ? "bg-primary/10 font-semibold text-primary-dark"
                      : "text-text-secondary hover:bg-primary/5 hover:text-primary-dark"
                  }`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {tNav(`items.${item.label}`)}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] self-start w-60 shrink-0 overflow-y-auto border-r border-border bg-surface px-3 py-4 md:block">
          <nav aria-label={tShell("sections")} className="space-y-5">
            {ADMIN_NAV_GROUPS.map((group) => (
              <div key={group.id}>
                <p id={`admin-nav-${group.id}`} className="px-3 pb-1.5 text-[11px] font-semibold text-text-secondary">
                  {tNav(`groups.${group.id}`)}
                </p>
                <ul aria-labelledby={`admin-nav-${group.id}`} className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = isNavItemActive(item, pathname);
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={isActive ? "page" : undefined}
                          className={`flex items-center gap-3 rounded-2xl px-3 py-2 text-[13.5px] ${FOCUS_RING} ${
                            isActive
                              ? "bg-primary/10 font-semibold text-primary-dark"
                              : "text-text-secondary hover:bg-primary/5 hover:text-primary-dark"
                          }`}
                        >
                          <Icon size={16} aria-hidden="true" />
                          {tNav(`items.${item.label}`)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
