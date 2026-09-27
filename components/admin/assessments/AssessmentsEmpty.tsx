"use client";

import { ClipboardCheck } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

/** The results page's empty state, with the attestation's own icon — an icon
 * cannot cross the Server → Client boundary, so this small client wrapper
 * chooses it. Copy arrives translated. */
export function AssessmentsEmpty({
  title,
  reason,
  action,
}: {
  title: string;
  reason: string;
  action: { label: string; href: string };
}) {
  return <EmptyState icon={ClipboardCheck} title={title} reason={reason} action={action} />;
}
