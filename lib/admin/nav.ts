import {
  Activity,
  AlertCircle,
  Bell,
  BookOpenCheck,
  Boxes,
  ClipboardCheck,
  HelpCircle,
  History,
  LayoutDashboard,
  MessagesSquare,
  Newspaper,
  Package,
  Phone,
  ScrollText,
  Trash2,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

// The one description of the admin panel's navigation (CLAUDE.md §15). Every
// page of /admin/** renders inside AdminShell, whose left nav (and phone strip)
// is built from ADMIN_NAV_GROUPS: Monitoring · Content · System. Monitoring is
// four pages, one question each: the overview ("how is my team doing and what
// needs me now?"), the people directory, the attestation (R4/S04: "how did each
// person do on it?") and knowledge quality ("is the knowledge base answering the
// operators?"); the old /dashboard tabs redirect to the S03 pages
// (next.config.js). A new admin page is added here once;
// tests/unit/admin/nav.test.ts checks the config against the pages on disk and
// against both message files.
//
// Client-safe on purpose (icons, strings, pure functions): it is imported by
// Client Components.

/** Namespace of every label and group heading below. Consumers open it with a
 * literal `useTranslations("admin.nav")` — tests/unit/i18n/client-messages.test.ts
 * requires one — and the nav test checks the keys against this string. */
export const ADMIN_NAV_MESSAGES = "admin.nav";

export type AdminNavGroupId = "monitoring" | "content" | "system";

export interface AdminNavItem {
  /** Locale-less path, as `usePathname()` from @/i18n/routing reports it. */
  readonly href: string;
  /** Message key under `admin.nav.items`. */
  readonly label: string;
  readonly icon: LucideIcon;
  /** Active only on `href` itself, not on the pages below it (a landing page
   * would otherwise stay lit on every one of its siblings). */
  readonly exact?: true;
}

export interface AdminNavGroup {
  /** Also the heading's message key under `admin.nav.groups`. */
  readonly id: AdminNavGroupId;
  readonly items: readonly AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: readonly AdminNavGroup[] = [
  {
    id: "monitoring",
    items: [
      { href: "/admin", label: "overview", icon: LayoutDashboard, exact: true },
      { href: "/admin/users", label: "people", icon: UsersRound },
      { href: "/admin/assessments", label: "assessments", icon: ClipboardCheck },
      { href: "/admin/knowledge", label: "knowledge", icon: BookOpenCheck },
    ],
  },
  {
    id: "content",
    items: [
      { href: "/admin/scripts", label: "scripts", icon: MessagesSquare },
      { href: "/admin/objections", label: "objections", icon: AlertCircle },
      { href: "/admin/faq", label: "faq", icon: HelpCircle },
      { href: "/admin/competitors", label: "competitors", icon: Users },
      { href: "/admin/packages", label: "packages", icon: Package },
      { href: "/admin/products", label: "products", icon: Boxes },
      { href: "/admin/changelog", label: "changelog", icon: Newspaper },
      { href: "/admin/contacts", label: "contacts", icon: Phone },
      { href: "/admin/sops", label: "sops", icon: ScrollText },
    ],
  },
  {
    id: "system",
    items: [
      { href: "/admin/activity", label: "history", icon: History },
      { href: "/admin/notifications", label: "notifications", icon: Bell },
      { href: "/admin/trash", label: "trash", icon: Trash2 },
      { href: "/admin/system", label: "system", icon: Activity },
    ],
  },
];

/** Every item, in nav order. */
export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = ADMIN_NAV_GROUPS.flatMap((group) => group.items);

/** A group by id — e.g. "content", whose sections the admin overview's
 * content-status grid lists in the same order. Throws only if the config
 * itself lacks the id, which the nav test rules out. */
export function adminNavGroup(id: AdminNavGroupId): AdminNavGroup {
  const group = ADMIN_NAV_GROUPS.find((entry) => entry.id === id);
  if (!group) throw new Error(`ADMIN_NAV_GROUPS has no "${id}" group`);
  return group;
}

/** Whether `item` is the current page — or, unless it is `exact`, a section
 * the current page sits inside. Matches on whole path segments, so
 * "/admin/faq" does not light up for "/admin/faqs". */
export function isNavItemActive(item: AdminNavItem, pathname: string): boolean {
  if (pathname === item.href) return true;
  return item.exact !== true && pathname.startsWith(`${item.href}/`);
}
