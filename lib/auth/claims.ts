/** Role model v2 (CLAUDE.md §7, migration 0020): `admin` is the owner — the
 * admin panel plus a preview of the operator app; `manager` is a sales manager
 * and `operator` an operator, and both use the operator app only. */
export type Role = "operator" | "manager" | "admin";

/** The admin panel — every page lives under /admin since the S03 monitoring IA.
 * /dashboard has no pages any more (next.config.js redirects its old tabs to
 * /admin before middleware runs) but stays an admin area: if a redirect is ever
 * removed, or a page is added back there, it is still refused to anyone but the
 * admin. Admin only — `isAdminArea()` is the one path check for it. */
export const ADMIN_AREAS = ["/admin", "/dashboard"] as const;

/** Roles whose sessions telemetry records and the dashboards list as people
 * (CLAUDE.md §9). An admin session records nothing. */
export const TRACKED_ROLES = ["operator", "manager"] as const satisfies readonly Role[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reads app_metadata.role from decoded JWT claims, returning it only when
 * it is exactly "operator", "manager" or "admin" — anything else means the
 * caller isn't on the allow-list.
 *
 * Since migration 0014 the access-token hook refuses to issue a token for an
 * email that is not an active `allowed_users` row, so a token that reaches
 * this function normally always carries one of the three roles. It stays a
 * fail-closed check for the three cases that can still produce none: the
 * hook not enabled in the Supabase dashboard, a token minted before 0014 that
 * still carries the old `role: "none"` stamp, and malformed claims. RLS makes
 * the same distinction in the database via `private.is_member()`. */
export function roleFromClaims(claims: unknown): Role | null {
  if (!isRecord(claims)) return null;
  const appMetadata = claims.app_metadata;
  if (!isRecord(appMetadata)) return null;
  const role = appMetadata.role;
  return role === "operator" || role === "manager" || role === "admin" ? role : null;
}

export function emailFromClaims(claims: unknown): string | null {
  if (!isRecord(claims)) return null;
  const email = claims.email;
  return typeof email === "string" ? email : null;
}

export function isAdminRole(role: Role | null | undefined): role is "admin" {
  return role === "admin";
}

/** True for a locale-less pathname inside the admin panel — the area itself
 * or anything under it, never a mere prefix match ("/administrator"). */
export function isAdminArea(pathname: string): boolean {
  return ADMIN_AREAS.some((area) => pathname === area || pathname.startsWith(`${area}/`));
}

/** Where a signed-in role lands: the admin panel for the owner, the operator
 * app for everyone else. */
export function homeForRole(role: Role): string {
  return isAdminRole(role) ? "/admin" : "/";
}
