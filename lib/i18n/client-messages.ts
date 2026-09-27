import type { AbstractIntlMessages } from "next-intl";

/**
 * Message paths that Client Components serialize into the page. `NextIntlClientProvider`
 * ships whatever it is given to the browser, so each layout passes only the paths its
 * client islands read through `useTranslations` — the long-form `pages.*` copy that
 * Server Components render stays on the server.
 *
 * An entry is a namespace or a dotted sub-path (`pages.home`) and covers everything below
 * it. tests/unit/i18n/client-messages.test.ts fails when a client component reads a path
 * that is not listed here (or in the area list of the layout that mounts it).
 */
export const ROOT_CLIENT_NAMESPACES = [
  "avatarMenu",
  "callMode",
  "chrome",
  "common",
  "copilot",
  "dailyTimeline",
  "emptyState",
  "errors",
  "feedback",
  "login",
  "nav",
  "pageMeta",
  "scripts",
  "theme",
  "toast",
  "widgetFallback",
  "pages.changelog",
  "pages.company.onboarding",
  "pages.home",
  "pages.products.catalog",
  "pages.products.technicalDocs.certificates",
  "pages.salesProcess.battleCards.detail",
  "pages.salesProcess.objections.playbook",
  "pages.tools.calculator",
] as const;

/** Added on top of the root list by app/[locale]/(admin)/admin/layout.tsx.
 * `dashboard.duration` ("2 soat 15 daq") is for the people directory's cards,
 * which format active time like the dashboard does (lib/dashboard/format.ts). */
export const ADMIN_CLIENT_NAMESPACES = ["admin", "pages.admin", "dashboard.duration"] as const;

/** Added on top of the root list by app/[locale]/dashboard/layout.tsx. `admin.shell` and
 * `admin.nav` are for AdminShell, which both admin layouts mount; `admin.gate` is for
 * GateReportDialog and `admin.errors` / `admin.validation` for useActionError, which the
 * dashboard's QuickActionButton shares with the admin editors. */
export const DASHBOARD_CLIENT_NAMESPACES = [
  "dashboard",
  "admin.shell",
  "admin.nav",
  "admin.gate",
  "admin.errors",
  "admin.validation",
] as const;

/** Copies the listed paths out of `messages`, keeping their nesting. Unknown paths are skipped. */
export function pickMessages(
  messages: AbstractIntlMessages,
  paths: readonly string[],
): AbstractIntlMessages {
  const picked: AbstractIntlMessages = {};

  for (const path of paths) {
    const keys = path.split(".");
    let source: AbstractIntlMessages | string | undefined = messages;
    let target = picked;

    for (const [depth, key] of keys.entries()) {
      if (typeof source !== "object") break;
      source = source[key];
      if (source === undefined) break;

      if (depth === keys.length - 1) {
        target[key] = source;
        break;
      }

      const existing = target[key];
      if (typeof existing === "object") {
        target = existing;
      } else {
        const branch: AbstractIntlMessages = {};
        target[key] = branch;
        target = branch;
      }
    }
  }

  return picked;
}
