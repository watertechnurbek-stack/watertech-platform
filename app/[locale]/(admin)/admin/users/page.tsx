import type { Metadata } from "next";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { requireAdminPage } from "@/lib/auth/server-session";
import { listAdminUsers } from "@/lib/admin/queries";
import { fetchPeopleOverview } from "@/lib/admin/people-queries";
import { DIRECTORY_WINDOW_DAYS, buildDirectory, parseDirectoryState } from "@/lib/admin/directory";
import { lastDaysRange } from "@/lib/dashboard/range";
import { fetchOnboardingProgress } from "@/lib/dashboard/quality";
import { PeopleDirectory } from "@/components/admin/people/PeopleDirectory";

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "pages.admin.people.directory" });
  return { title: t("title") };
}

/** "Xodimlar": everyone on the allow-list, with the last two weeks of their
 * activity, as cards (or the management table). The admin layout has already
 * refused anyone who is not the admin; the gate runs again here for the
 * caller's own email, which marks their row in the table view.
 *
 * Three reads, in parallel, all under the admin's own session: the allow-list
 * (lib/admin/queries.ts), admin_people_overview (0021) for the last
 * DIRECTORY_WINDOW_DAYS Tashkent days, and everyone's onboarding checklist
 * progress (user_state, the chip on each card and the table's column — it used
 * to be the retired quality tab's table). Both are joined by email; if either
 * fails the cards render without those numbers (buildDirectory) instead of the
 * page failing. The page is dynamic — it reads
 * the session — so router.refresh() after an add re-runs both and the new card
 * appears; there is no cache to invalidate. */
export default async function AdminUsersPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  unstable_setRequestLocale(locale);
  const session = await requireAdminPage(locale);

  const range = lastDaysRange(DIRECTORY_WINDOW_DAYS);
  const [list, overview, onboarding] = await Promise.all([
    listAdminUsers(),
    fetchPeopleOverview(range),
    fetchOnboardingProgress(null),
  ]);

  return (
    <PeopleDirectory
      people={buildDirectory(list.users, overview.ok ? overview.data : null, onboarding.ok ? onboarding.data : null)}
      windowStart={range.from}
      currentEmail={session.email.toLowerCase()}
      initialState={parseDirectoryState(searchParams)}
      overviewAvailable={overview.ok}
      activityAvailable={list.activityAvailable}
    />
  );
}
