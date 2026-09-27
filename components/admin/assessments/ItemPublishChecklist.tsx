"use client";

import { useId } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ItemPublishCheck } from "@/lib/attestation/schemas";

/** The publish rules as a live checklist beside the item editor — the same
 * itemPublishChecks the save action and the database apply, so what is green
 * here will publish. */
export function ItemPublishChecklist({ checks }: { checks: readonly ItemPublishCheck[] }) {
  const t = useTranslations("pages.admin.assessments.editor.checks");
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <h3 id={headingId} className="text-[13.5px] font-semibold text-primary-dark">
        {t("heading")}
      </h3>
      <ul className="mt-2.5 space-y-1.5">
        {checks.map((check) => (
          <li key={check.rule} className="flex items-start gap-2 text-[12.5px] text-primary-dark">
            {check.ok ? (
              <CheckCircle2 size={15} className="mt-px shrink-0 text-status-ok" aria-hidden="true" />
            ) : (
              <XCircle size={15} className="mt-px shrink-0 text-status-outdated" aria-hidden="true" />
            )}
            <span>
              {t(check.rule)}
              <span className="sr-only"> — {check.ok ? t("ok") : t("failed")}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
