import {
  FileText,
  FileQuestion,
  ShieldAlert,
  UserCheck,
  HelpCircle,
  Swords,
  PackageSearch,
  GitCompare,
  SearchX,
  BarChart3,
  Inbox,
  History,
  WifiOff,
  CheckCircle2,
  Clock,
  Languages,
  ThumbsUp,
  BellOff,
  Newspaper,
  Phone,
  Trash2,
  Bot,
  Activity,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** How the primary CTA is built by the component that renders this entry's
 * EmptyState — kept as a plain tag (not a function) so server components can
 * pass it down to a client table (DataTable/DatabaseTemplate) without
 * crossing the RSC boundary with a closure. The component owns turning the
 * kind into an actual href/onClick. */
export type EmptyStateCtaKind = "link" | "clear-filters" | "open-search" | "create" | "retry" | "home";

export interface EmptyStateCatalogEntry {
  key: string;
  icon: LucideIcon;
  ctaKind: EmptyStateCtaKind;
}

/** Copy for each entry lives at `emptyState.<key>.{title,reason,cta}` in
 * messages/uz.json + ru.json — except `offline` and `notFound`, which reuse
 * the copy that already exists at `chrome.offline.*` / `errors.*` (see
 * CLAUDE.md section 5: never duplicate a constant that exists as data
 * elsewhere). `scriptNotFound`'s copy is written generically (`{type}` /
 * `{listName}` placeholders) so it covers both the script and battle-card
 * "content not found" pages instead of needing a second catalog key. */
export const EMPTY_STATES = {
  scriptsNone: { key: "scriptsNone", icon: FileText, ctaKind: "home" },
  scriptNotFound: { key: "scriptNotFound", icon: FileQuestion, ctaKind: "link" },
  objectionsNone: { key: "objectionsNone", icon: ShieldAlert, ctaKind: "open-search" },
  faqNone: { key: "faqNone", icon: HelpCircle, ctaKind: "open-search" },
  changelogNone: { key: "changelogNone", icon: Newspaper, ctaKind: "home" },
  contactsNone: { key: "contactsNone", icon: Phone, ctaKind: "home" },
  battleCardsNone: { key: "battleCardsNone", icon: Swords, ctaKind: "open-search" },
  productsNoMatch: { key: "productsNoMatch", icon: PackageSearch, ctaKind: "clear-filters" },
  comparisonsNone: { key: "comparisonsNone", icon: GitCompare, ctaKind: "link" },
  searchNoResults: { key: "searchNoResults", icon: SearchX, ctaKind: "create" },
  dashboardNoEvents: { key: "dashboardNoEvents", icon: BarChart3, ctaKind: "home" },
  dashboardNoDrafts: { key: "dashboardNoDrafts", icon: CheckCircle2, ctaKind: "link" },
  dashboardNoStale: { key: "dashboardNoStale", icon: Clock, ctaKind: "link" },
  dashboardNoMissingRu: { key: "dashboardNoMissingRu", icon: Languages, ctaKind: "link" },
  dashboardNoFeedback: { key: "dashboardNoFeedback", icon: ThumbsUp, ctaKind: "link" },
  dashboardNoOperators: { key: "dashboardNoOperators", icon: UserCheck, ctaKind: "link" },
  notificationsNone: { key: "notificationsNone", icon: BellOff, ctaKind: "clear-filters" },
  adminListNone: { key: "adminListNone", icon: Inbox, ctaKind: "create" },
  versionsNone: { key: "versionsNone", icon: History, ctaKind: "retry" },
  trashNone: { key: "trashNone", icon: Trash2, ctaKind: "retry" },
  copilotNoUnanswered: { key: "copilotNoUnanswered", icon: Bot, ctaKind: "link" },
  attentionClear: { key: "attentionClear", icon: CheckCircle2, ctaKind: "link" },
  knowledgeNoGaps: { key: "knowledgeNoGaps", icon: CheckCircle2, ctaKind: "link" },
  activityNone: { key: "activityNone", icon: Activity, ctaKind: "clear-filters" },
  offline: { key: "offline", icon: WifiOff, ctaKind: "retry" },
  notFound: { key: "notFound", icon: FileQuestion, ctaKind: "home" },
} as const satisfies Record<string, EmptyStateCatalogEntry>;

export type EmptyStateKey = keyof typeof EMPTY_STATES;
