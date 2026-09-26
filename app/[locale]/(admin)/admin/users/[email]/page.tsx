import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { requireAdminPage } from "@/lib/auth/server-session";
import { PersonDetail } from "@/components/admin/people/PersonDetail";
import {
  fetchPersonDaily,
  fetchPersonHourly,
  fetchPersonMostViewed,
  fetchPersonSections,
  fetchPersonSummary,
  fetchPersonTimeline,
  fetchPersonZeroSearches,
  getPersonRecord,
} from "@/lib/admin/people-queries";
import { parsePersonParam } from "@/lib/admin/people";
import { parseDashboardRange, type DashboardRange } from "@/lib/dashboard/range";

interface PersonPageProps {
  params: { locale: string; email: string };
  searchParams: Record<string, string | string[] | undefined>;
}

/** The person's name — or, with none on the allow-list, their gmail. */
export async function generateMetadata({ params: { locale, email } }: PersonPageProps): Promise<Metadata> {
  const parsed = parsePersonParam(email);
  const person = parsed ? await getPersonRecord(parsed) : null;
  if (!person) {
    const t = await getTranslations({ locale, namespace: "pages.admin.people.directory" });
    return { title: t("title") };
  }
  return { title: person.fullName?.trim() || person.email };
}

/** One person's data and nobody else's (/admin/users/[email], R3/S04). The email
 * segment is parsed with the allow-list's own schema (parsePersonParam) and must
 * be a row of `allowed_users` — anything else is a 404, which is also what a
 * person removed from the list gets. Range from ?from&to, the last 7 days by
 * default; the `op` filter of the knowledge page has no meaning here (the person
 * is the path) and is ignored.
 *
 * The allow-list row and every number — one call each of a 0021 / 0016 function
 * under the admin's own session — are started together (Promise.all): a slow or
 * failed call costs its widget only (WidgetData), and no raw telemetry row is
 * ever read. The row's answer decides the rest: no row is a 404, and an admin
 * row uses none of the numbers (telemetry is never recorded for that role, so
 * the page shows the locked panel and a note instead). */
export default async function PersonPage({ params: { locale, email: rawEmail }, searchParams }: PersonPageProps) {
  unstable_setRequestLocale(locale);
  const session = await requireAdminPage(locale);

  const email = parsePersonParam(rawEmail);
  if (!email) notFound();

  const range: DashboardRange = { ...parseDashboardRange(searchParams), operatorEmail: null };

  const [person, summary, daily, hourly, sections, topViewed, zeroSearches, timeline] = await Promise.all([
    getPersonRecord(email),
    fetchPersonSummary(email, range),
    fetchPersonDaily(email, range),
    fetchPersonHourly(email, range),
    fetchPersonSections(email, range),
    fetchPersonMostViewed(email, range),
    fetchPersonZeroSearches(email, range),
    fetchPersonTimeline(email),
  ]);
  if (!person) notFound();

  return (
    <PersonDetail
      locale={locale}
      person={person}
      isSelf={person.email === session.email.toLowerCase()}
      range={range}
      widgets={
        person.role === "admin" ? null : { summary, daily, hourly, sections, topViewed, zeroSearches, timeline }
      }
    />
  );
}
