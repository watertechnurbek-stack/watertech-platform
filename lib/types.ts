import type { NavIconName } from "./nav-icons";

export type ContentType = "doc" | "database" | "video" | "checklist" | "quiz";

export type Audience = "Operator" | "Manager" | "Head";
export type Level = "Basic" | "Intermediate" | "Expert";
export type PageStatus = "up-to-date" | "in-review" | "outdated";

export interface NavNode {
  title: string;
  path: string;
  contentType: ContentType;
  /** The page's own icon in the sidebar and on its section's landing page — a
   * key of NAV_ICONS (lib/nav-icons.ts), unique across the tree. */
  icon: NavIconName;
  locked?: boolean;
  description?: string;
  children?: NavNode[];
}

/** Count badges shown next to sidebar nav rows, keyed by NavNode["path"].
 * The layout (app/(app)/layout.tsx) computes the ones that are the same for
 * everyone from real content; AppShell adds the per-operator /changelog one on
 * the client. Threaded down AppShell -> Sidebar -> SidebarNav -> NavItem. */
export type NavBadges = Record<string, { count: number; tone: "ok" | "warning" }>;

export interface PageMeta {
  owner: string;
  approvedBy: string;
  updatedDate: string;
  nextReviewDate: string;
  audience: Audience;
  level: Level;
  status: PageStatus;
}
