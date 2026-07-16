/**
 * Admin access — must match saite.phonix (website) exactly.
 *
 * Website sources:
 * - src/components/Navbar.tsx: role === "admin" || userEmail === ADMIN_EMAIL
 * - src/app/admin/layout.tsx: user.email === ADMIN_EMAIL (route guard)
 * - src/app/auth/login/page.tsx: email === ADMIN_EMAIL → /admin
 */

export const ADMIN_EMAIL = "ibrahimyackop20@gmail.com";

type AuthUserLike = {
  email?: string | null;
  identities?: Array<{ identity_data?: { email?: string } }> | null;
  user_metadata?: Record<string, unknown> | null;
} | null | undefined;

/** Resolve email from Supabase user (session.user / getUser). */
export function resolveAuthEmail(
  user: AuthUserLike,
  fallback?: string | null
): string {
  const direct = user?.email?.trim();
  if (direct) return direct;

  const fromIdentity = user?.identities
    ?.map((i) => i.identity_data?.email)
    .find((e): e is string => typeof e === "string" && e.trim().length > 0)
    ?.trim();
  if (fromIdentity) return fromIdentity;

  const meta = user?.user_metadata?.email;
  if (typeof meta === "string" && meta.trim()) return meta.trim();

  return (fallback ?? "").trim();
}

/** Primary admin route guard (website admin layout). */
export function isPrimaryAdminEmail(email?: string | null): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  return normalized === ADMIN_EMAIL.toLowerCase();
}

/** UI / feature flag — show admin menu, push provider, etc. */
export function isAdminUser(opts: {
  role?: string | null;
  email?: string | null;
}): boolean {
  return opts.role === "admin" || isPrimaryAdminEmail(opts.email);
}
