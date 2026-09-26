"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/routing";

// The attestation section's own tabs: Natijalar · Savollar banki · Sozlamalar
// (docs/ATTESTATION.md §17). The admin nav lights "Attestatsiya" for all three;
// this says which one is open.

const TABS = [
  { href: "/admin/assessments", key: "results", exact: true },
  { href: "/admin/assessments/items", key: "items", exact: false },
  { href: "/admin/assessments/settings", key: "settings", exact: false },
] as const;

export function AssessmentsSubNav() {
  const t = useTranslations("pages.admin.assessments.subnav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("label")} className="border-b border-border">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center border-b-2 px-3 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  active ? "border-accent text-primary-dark" : "border-transparent text-text-secondary hover:text-primary-dark"
                }`}
              >
                {t(tab.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
