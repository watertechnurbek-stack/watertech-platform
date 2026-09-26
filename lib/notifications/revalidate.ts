import "server-only";
import { revalidatePath } from "next/cache";

/** Re-renders every view that shows notification data: the admin layout
 * (NotificationsBell in AdminShell, /admin/notifications and the overview's
 * attention list under it). Route groups are part of the path Next.js tags
 * layouts with, hence `(admin)`. */
export function revalidateNotificationViews(): void {
  revalidatePath("/[locale]/(admin)/admin", "layout");
}
