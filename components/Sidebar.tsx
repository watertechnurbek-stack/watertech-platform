"use client";

import { memo, useEffect, useState } from "react";
import { m, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ChevronRight, ChevronLeft, Home, type LucideIcon } from "lucide-react";
import { Link, usePathname } from "@/i18n/routing";
import { siteTree } from "@/lib/site-config";
import { NAV_ICONS, LockIcon } from "@/lib/nav-icons";
import type { NavNode, NavBadges } from "@/lib/types";
import { durations, easings, noTransition, springs } from "@/lib/motion/tokens";
import { Logo } from "@/components/Logo";

const COLLAPSE_KEY = "watertech-sidebar-collapsed";

// The one nav item operators need fastest, during a live call — the first
// entry of "Savdo jarayoni", which comes right after "Bugun". Set apart with
// an accent border, and its section starts expanded on every page, so the
// live script is always one click away.
const PINNED_PATH = "/sales-process/scripts";

function NavCountBadge({ tone, count }: { tone: "ok" | "warning"; count: number }) {
  return (
    <span
      className={`ml-auto flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
        tone === "ok" ? "bg-status-ok/15 text-primary-dark" : "bg-status-warning/15 text-primary-dark"
      }`}
    >
      {count}
    </span>
  );
}

/** Purely visual clustering of the top-level sections — chunk sizes must sum
 * to siteTree.length. Groups get extra margin between them so the sidebar
 * reads as clusters, not one continuous list. */
const NAV_GROUP_SIZES = [1, 3, 2, 2];

function chunk<T>(items: T[], sizes: number[]): T[][] {
  const groups: T[][] = [];
  let i = 0;
  for (const size of sizes) {
    groups.push(items.slice(i, i + size));
    i += size;
  }
  if (i < items.length) groups.push(items.slice(i));
  return groups;
}

function ActivePill({ scope }: { scope: string }) {
  const reduce = useReducedMotion();
  return (
    <m.div
      layoutId={`sidebar-active-pill-${scope}`}
      className="absolute inset-0 rounded-2xl border border-border bg-surface shadow-soft"
      transition={reduce ? noTransition : springs.snappy}
    />
  );
}

function IconBadge({
  Icon,
  active,
  size = 36,
  iconSize = 17,
}: {
  Icon: LucideIcon;
  active: boolean;
  size?: number;
  iconSize?: number;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl border ${
        active
          ? "border-primary bg-primary text-surface shadow-softer"
          : "border-border bg-surface text-text-secondary"
      }`}
      style={{ height: size, width: size }}
    >
      <Icon size={iconSize} />
    </span>
  );
}

/** Full-width row used in the expanded sidebar and the mobile drawer.
 * `pathname` is threaded down from the single usePathname() call in
 * SidebarNav (rather than each of the ~35 nodes subscribing individually)
 * and the component is memoized so a navigation only re-renders the rows
 * whose props actually changed. */
const NavItem = memo(function NavItem({
  node,
  depth,
  scope,
  pathname,
  navBadges,
  t,
  tSidebar,
}: {
  node: NavNode;
  depth: number;
  scope: string;
  pathname: string;
  navBadges?: NavBadges;
  t: ReturnType<typeof useTranslations>;
  tSidebar: ReturnType<typeof useTranslations>;
}) {
  const isActive = pathname === node.path;
  const children = node.children ?? [];
  const isAncestor = children.length > 0 ? pathname.startsWith(node.path + "/") : false;
  const [open, setOpen] = useState(isAncestor || children.some((child) => child.path === PINNED_PATH));
  const Icon = NAV_ICONS[node.icon];
  const hasChildren = children.length > 0;
  const rowPaddingLeft = 16 + depth * 16;
  const guideLeft = rowPaddingLeft + 8;
  const isPinned = node.path === PINNED_PATH;

  useEffect(() => {
    if (isAncestor) setOpen(true);
  }, [isAncestor]);

  return (
    <div className="w-full">
      <div className="relative">
        {isActive && <ActivePill scope={scope} />}
        <div
          className={`group relative z-10 flex w-full items-center gap-1 rounded-2xl py-3.5 pr-3 ${
            isActive ? "" : "hover:bg-primary/5"
          } ${isPinned ? `border-l-[3px] border-l-accent ${isActive ? "" : "bg-accent/5"}` : ""}`}
          style={{ paddingLeft: `${rowPaddingLeft - (isPinned ? 3 : 0)}px` }}
        >
          <Link
            href={node.path}
            className={`flex min-w-0 flex-1 items-center gap-3 text-[13.5px] ${
              isActive ? "font-semibold text-primary-dark" : "text-text-secondary"
            } group-hover:text-primary-dark`}
          >
            <IconBadge
              Icon={Icon}
              active={isActive}
              size={depth === 0 ? 40 : 28}
              iconSize={depth === 0 ? 18 : 14}
            />
            <span className="truncate">{t(node.title)}</span>
            {node.locked && <LockIcon size={11} className="ml-auto shrink-0 text-status-outdated" />}
            {navBadges?.[node.path] && (
              <NavCountBadge tone={navBadges[node.path].tone} count={navBadges[node.path].count} />
            )}
          </Link>
          {hasChildren && (
            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? tSidebar("collapseChild") : tSidebar("expandChild")}
              className="shrink-0 rounded-lg p-1.5 text-text-secondary hover:bg-primary/10 hover:text-primary-dark"
            >
              <ChevronRight
                size={14}
                className={`transition-transform ${open ? "rotate-90" : ""}`}
              />
            </button>
          )}
        </div>
      </div>

      {hasChildren && open && (
        <div className="relative py-0.5">
          <div
            className="absolute bottom-2 top-0 bg-primary/40"
            style={{ left: `${guideLeft}px`, width: "2px" }}
            aria-hidden
          />
          <div className="space-y-0.5">
            {children.map((child) => (
              <div key={child.path} className="relative">
                <span
                  className="absolute top-[26px] bg-primary/40"
                  style={{ left: `${guideLeft}px`, width: `${16 + (depth + 1) * 16 - guideLeft}px`, height: "2px" }}
                  aria-hidden
                />
                <NavItem
                  node={child}
                  depth={depth + 1}
                  scope={scope}
                  pathname={pathname}
                  navBadges={navBadges}
                  t={t}
                  tSidebar={tSidebar}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

/** Icon-only rail row used when the desktop sidebar is collapsed. Children
 * appear in a floating flyout instead of an inline accordion. `pathname` is
 * threaded down from SidebarNav's single usePathname() call, same as NavItem. */
function CollapsedNavItem({
  node,
  scope,
  pathname,
  t,
}: {
  node: NavNode;
  scope: string;
  pathname: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const isActive = pathname === node.path;
  const children = node.children ?? [];
  const isAncestor = children.length > 0 ? pathname.startsWith(node.path + "/") : false;
  const active = isActive || isAncestor;
  const Icon = NAV_ICONS[node.icon];
  const hasChildren = children.length > 0;
  // The rail shows top-level rows only, so the marker sits on the section
  // that holds the live script.
  const isPinned = node.path === PINNED_PATH || children.some((child) => child.path === PINNED_PATH);

  return (
    <div className="group relative flex justify-center">
      {active && (
        <m.div
          layoutId={`sidebar-active-pill-${scope}`}
          className="absolute inset-0 mx-auto h-12 w-12 rounded-2xl border border-border bg-surface shadow-soft"
          transition={springs.snappy}
        />
      )}
      <Link
        href={node.path}
        title={t(node.title)}
        className="relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl hover:bg-primary/5"
      >
        <IconBadge Icon={Icon} active={active} size={40} iconSize={18} />
        {node.locked && (
          <LockIcon size={10} className="absolute right-1 top-1 text-status-outdated" />
        )}
        {isPinned && (
          <span
            className="absolute -bottom-0.5 left-1/2 h-1 w-4 -translate-x-1/2 rounded-full bg-accent"
            aria-hidden
          />
        )}
      </Link>

      {hasChildren && (
        <div className="invisible absolute left-full top-0 z-50 ml-3 w-56 rounded-2xl border border-border bg-surface p-2 opacity-0 shadow-soft transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
          <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            {t(node.title)}
          </p>
          <div className="relative">
            <div className="absolute bottom-2 top-1 w-0.5 bg-primary/40" style={{ left: "10px" }} aria-hidden />
            <div className="space-y-0.5">
              {children.map((child) => {
                const childActive = pathname === child.path;
                const ChildIcon = NAV_ICONS[child.icon];
                return (
                  <div key={child.path} className="relative">
                    <span
                      className="absolute top-[18px] h-0.5 w-2.5 bg-primary/40"
                      style={{ left: "10px" }}
                      aria-hidden
                    />
                    <Link
                      href={child.path}
                      className={`flex items-center gap-2 rounded-xl py-2 pl-6 pr-2.5 text-[13px] ${
                        childActive
                          ? "bg-primary/10 font-semibold text-primary-dark"
                          : "text-text-secondary hover:bg-primary/5 hover:text-primary-dark"
                      }`}
                    >
                      <ChildIcon size={14} className="shrink-0" aria-hidden="true" />
                      <span className="min-w-0">{t(child.title)}</span>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SidebarNav({
  scope = "desktop",
  collapsed = false,
  navBadges,
}: {
  scope?: string;
  collapsed?: boolean;
  navBadges?: NavBadges;
}) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const groups = chunk(siteTree, NAV_GROUP_SIZES);
  const t = useTranslations("nav");
  const tSidebar = useTranslations("chrome.sidebar");
  // The desktop rail stays in the DOM while the mobile drawer is open, so the
  // two <nav> landmarks are named apart rather than both reading "navigation".
  const navLabel = tSidebar(scope === "mobile" ? "mobileNavLabel" : "navLabel");

  if (collapsed) {
    return (
      <nav aria-label={navLabel} className="flex-1 overflow-y-visible px-2.5 py-4">
        <div className="group relative mb-5 flex justify-center">
          {isHome && (
            <m.div
              layoutId={`sidebar-active-pill-${scope}`}
              className="absolute inset-0 mx-auto h-12 w-12 rounded-2xl border border-border bg-surface shadow-soft"
              transition={springs.snappy}
            />
          )}
          <Link href="/" title={t("home")} className="relative z-10 flex h-12 w-12 items-center justify-center">
            <IconBadge Icon={Home} active={isHome} size={40} iconSize={18} />
          </Link>
        </div>
        {groups.map((group, gi) => (
          <div key={gi} className="mb-5 space-y-1.5 last:mb-0">
            {group.map((node) => (
              <CollapsedNavItem key={node.path} node={node} scope={scope} pathname={pathname} t={t} />
            ))}
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label={navLabel} className="flex-1 overflow-y-auto px-3 py-4">
      <div className="relative mb-6">
        {isHome && <ActivePill scope={scope} />}
        <Link
          href="/"
          className={`relative z-10 flex w-full items-center gap-3 rounded-2xl py-3.5 pr-3 pl-4 text-[13.5px] ${
            isHome
              ? "font-semibold text-primary-dark"
              : "text-text-secondary hover:bg-primary/5 hover:text-primary-dark"
          }`}
        >
          <IconBadge Icon={Home} active={isHome} size={40} iconSize={18} />
          {t("home")}
        </Link>
      </div>

      {groups.map((group, gi) => (
        <div key={gi} className="mb-6 space-y-1 last:mb-0">
          {group.map((node) => (
            <NavItem
              key={node.path}
              node={node}
              depth={0}
              scope={scope}
              pathname={pathname}
              navBadges={navBadges}
              t={t}
              tSidebar={tSidebar}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ navBadges }: { navBadges?: NavBadges }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const reduce = useReducedMotion();
  const tSidebar = useTranslations("chrome.sidebar");

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // ignore
    }
    setMounted(true);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {
      // localStorage unavailable — preference just won't persist
    }
  }

  return (
    <m.aside
      initial={{ width: 256 }}
      animate={{ width: collapsed ? 76 : 256 }}
      transition={{ duration: mounted && !reduce ? durations.fast : 0, ease: easings.standard }}
      className="relative hidden shrink-0 overflow-visible border-r border-border bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:self-start"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
        <Logo className="h-8 w-8 shrink-0" />
        {!collapsed && (
          <span className="truncate text-sm font-bold text-primary-dark">WaterTech</span>
        )}
      </div>

      <button
        onClick={toggle}
        aria-label={collapsed ? tSidebar("expand") : tSidebar("collapse")}
        className="absolute -right-3 top-6 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-text-secondary shadow-soft hover:text-primary-dark"
      >
        <ChevronLeft size={13} className={collapsed ? "rotate-180" : ""} />
      </button>

      <SidebarNav collapsed={collapsed} navBadges={navBadges} />

      {!collapsed && (
        <div className="shrink-0 border-t border-border p-3 text-[11px] text-text-secondary">
          {tSidebar("footer")}
        </div>
      )}
    </m.aside>
  );
}
