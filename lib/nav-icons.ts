import {
  ArrowRightLeft,
  BookOpen,
  BookUser,
  Boxes,
  Building2,
  Calculator,
  ChartColumn,
  CircleX,
  Compass,
  Factory,
  FileBadge,
  FileSpreadsheet,
  Filter,
  Gauge,
  GraduationCap,
  Handshake,
  Headset,
  History,
  IdCard,
  Info,
  LayoutGrid,
  ListTodo,
  Lock,
  MessageCircleQuestion,
  MessageSquareText,
  MessageSquareWarning,
  Milestone,
  Repeat,
  Scale,
  Send,
  ShieldCheck,
  Swords,
  Target,
  TrendingUp,
  Trophy,
  Truck,
  Undo2,
  UserPlus,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";

// The operator app's page icons. Every siteTree node (lib/site-config.ts) names
// one of these in its `icon`, so the sidebar — expanded, the collapsed rail and
// its flyout, the phone drawer — and the section landing cards show the page's
// own glyph instead of its content type's. One icon per page:
// tests/unit/nav-icons.test.ts checks that every node has one, that no two
// pages share one, and that nothing here is unused — each entry ships in the
// operator layout's bundle (Sidebar is a client component of AppShell).

export const NAV_ICONS = {
  // Jonli skript va yordamchi — the live-call workspace.
  Headset,
  // Kompaniya
  Building2,
  Info,
  Compass,
  GraduationCap,
  BookUser,
  ShieldCheck,
  Factory,
  // Mahsulot va narx
  Boxes,
  LayoutGrid,
  Scale,
  FileBadge,
  Milestone,
  // Savdo jarayoni
  Handshake,
  MessageSquareWarning,
  Swords,
  // Dasturlar va vositalar, amoCRM
  Wrench,
  Workflow,
  UserPlus,
  ArrowRightLeft,
  ListTodo,
  IdCard,
  CircleX,
  ChartColumn,
  Calculator,
  FileSpreadsheet,
  BookOpen,
  Filter,
  Repeat,
  // Logistika
  Truck,
  Send,
  Undo2,
  // Standartlar, KPI va motivatsiya
  Target,
  MessageSquareText,
  Gauge,
  Trophy,
  TrendingUp,
  // Savol-javob, O'zgarishlar tarixi
  MessageCircleQuestion,
  History,
} satisfies Record<string, LucideIcon>;

/** A key of NAV_ICONS — what a siteTree node's `icon` holds. */
export type NavIconName = keyof typeof NAV_ICONS;

/** The padlock beside a locked page's name. */
export { Lock as LockIcon };
