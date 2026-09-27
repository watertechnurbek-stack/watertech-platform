import { createClient } from "@/lib/supabase/server";
import { emailFromClaims, homeForRole, isAdminRole, roleFromClaims, type Role } from "@/lib/auth/claims";
import { redirect } from "@/i18n/routing";

export interface ServerSession {
  email: string;
  role: Role;
}

/** A ServerSession that has been checked to be the admin's. */
export interface AdminPageSession extends ServerSession {
  role: "admin";
}

/** Server-only session read for Route Handlers and Server Components —
 * verifies the JWT locally via getClaims() (no DB round trip) and returns
 * null when there's no session or the role claim isn't a valid allow-list
 * role. Middleware already gates page access; this is for the handlers and
 * pages that need the identity themselves. */
export async function getServerSession(): Promise<ServerSession | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  const role = roleFromClaims(claims);
  const email = emailFromClaims(claims);
  if (!role || !email) return null;

  return { email, role };
}

/** The page-level gate of the admin panel: the admin layout calls it first, and
 * so do the monitoring pages and the people pages themselves
 * (tests/unit/auth/admin-gates.test.ts). Middleware already keeps a non-admin
 * out of /admin and /dashboard; this refuses them again on its own
 * (CLAUDE.md §7, "each refusing on its own"), sending an operator or a sales
 * manager to their home and a missing session to /login. Returns only for the
 * admin. */
export async function requireAdminPage(locale: string): Promise<AdminPageSession> {
  const session = await getServerSession();
  if (!session) return redirect({ href: "/login", locale });
  if (!isAdminRole(session.role)) return redirect({ href: homeForRole(session.role), locale });
  return { email: session.email, role: session.role };
}
