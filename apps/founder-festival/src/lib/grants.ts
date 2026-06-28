import { currentUser } from "@clerk/nextjs/server";
import { SUPER_ADMIN_EMAILS } from "@/lib/admin";
import { getRoleForClerkUser } from "@/lib/admin-roles";
import { effectiveCostMultiplier } from "@/lib/cost-multiplier";
import { effectiveScope, type RoleScope } from "@/lib/role-scope";

export type Grant =
  | "run_scoring_jobs"
  | "create_events"
  | "manage_events"
  | "delete_events"
  | "create_roles"
  | "edit_roles"
  | "approve_admin_requests"
  | "view_profiles"
  | "manage_pending";

// Grants group into categories in the roles editor. "users" and "events" carry
// an All/Only-Theirs scope (Phase B); "admin" is super-admin territory (no scope).
export type GrantCategory = "users" | "events" | "admin";

export const GRANTS: { key: Grant; label: string; category: GrantCategory }[] = [
  { key: "run_scoring_jobs", label: "Run jobs to score users", category: "users" },
  { key: "view_profiles", label: "View scored profiles", category: "users" },
  { key: "manage_pending", label: "Review pending items", category: "users" },
  { key: "create_events", label: "Create events", category: "events" },
  { key: "manage_events", label: "Manage events", category: "events" },
  { key: "delete_events", label: "Delete events", category: "events" },
  { key: "approve_admin_requests", label: "Approve / deny admin requests", category: "admin" },
  { key: "create_roles", label: "Create roles", category: "admin" },
  { key: "edit_roles", label: "Edit roles", category: "admin" },
];

const ALL_GRANTS: Grant[] = GRANTS.map((g) => g.key);

function verifiedEmails(user: Awaited<ReturnType<typeof currentUser>>): string[] {
  return (user?.emailAddresses ?? [])
    .filter((e) => e.verification?.status === "verified")
    .map((e) => e.emailAddress.toLowerCase());
}

function envAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

// The current viewer's effective grants. Super-admins and env-bootstrap admins
// get ALL grants. An approved admin with a role gets that role's grants; an
// approved admin with no role gets ALL grants (backward-compatible). Else none.
export async function getViewerGrants(): Promise<Grant[]> {
  const user = await currentUser().catch(() => null);
  if (!user) return [];
  const verified = verifiedEmails(user);
  const supers = SUPER_ADMIN_EMAILS.map((s) => s.toLowerCase());
  if (verified.some((e) => supers.includes(e))) return [...ALL_GRANTS];
  const env = envAdminEmails();
  if (env.length > 0 && verified.some((e) => env.includes(e))) return [...ALL_GRANTS];
  const role = await getRoleForClerkUser(user.id);
  if (!role) return [];
  // An approved admin with NO role assigned gets NO access (they must be given a
  // role). (Previously this returned all grants for backward-compat.)
  if (role.grants === null) return [];
  return role.grants.filter((g): g is Grant => (ALL_GRANTS as string[]).includes(g));
}

export async function can(grant: Grant): Promise<boolean> {
  return (await getViewerGrants()).includes(grant);
}

// Is the current viewer a super-admin or env-bootstrap admin? These viewers see
// ×1 costs, full scope, and are never credit-blocked (so the operator can't lock
// themselves out when admin credit enforcement is on).
export async function viewerIsPrivileged(): Promise<boolean> {
  const user = await currentUser().catch(() => null);
  if (!user) return false;
  const verified = verifiedEmails(user);
  const supers = SUPER_ADMIN_EMAILS.map((s) => s.toLowerCase());
  if (verified.some((e) => supers.includes(e))) return true;
  const env = envAdminEmails();
  return env.length > 0 && verified.some((e) => env.includes(e));
}

// The viewer's cost multiplier: super-admins / env-admins / no-role admins see
// real costs (×1); a role-based admin uses their role's cost_multiplier.
export async function getViewerCostMultiplier(): Promise<number> {
  const user = await currentUser().catch(() => null);
  if (!user) return 1;
  const verified = verifiedEmails(user);
  const supers = SUPER_ADMIN_EMAILS.map((s) => s.toLowerCase());
  if (verified.some((e) => supers.includes(e))) return 1;
  const env = envAdminEmails();
  if (env.length > 0 && verified.some((e) => env.includes(e))) return 1;
  const role = await getRoleForClerkUser(user.id);
  return effectiveCostMultiplier({ privileged: false, roleMultiplier: role?.costMultiplier ?? null });
}

// API-route guard: throws a 403-shaped error when the viewer lacks the grant.
export async function requireGrant(grant: Grant): Promise<void> {
  if (!(await can(grant))) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
}

export type ViewerScopes = { users: RoleScope; events: RoleScope };

// The viewer's per-category record scope. Super-admins / env-admins / role-less
// admins get { users: "all", events: "all" }; a role-based admin uses their
// role's scopes. "theirs" narrows lists/mutations to records they created
// (matched by created_by_email — see getViewerEmail).
export async function getViewerScopes(): Promise<ViewerScopes> {
  const user = await currentUser().catch(() => null);
  if (!user) return { users: "all", events: "all" };
  const verified = verifiedEmails(user);
  const supers = SUPER_ADMIN_EMAILS.map((s) => s.toLowerCase());
  const env = envAdminEmails();
  const privileged =
    verified.some((e) => supers.includes(e)) ||
    (env.length > 0 && verified.some((e) => env.includes(e)));
  if (privileged) return { users: "all", events: "all" };
  const role = await getRoleForClerkUser(user.id);
  return {
    users: effectiveScope({ privileged: false, roleScope: role?.usersScope ?? null }),
    events: effectiveScope({ privileged: false, roleScope: role?.eventsScope ?? null }),
  };
}

// The viewer's lowercased primary email — the value stored in created_by_email
// on scoring_jobs/events, so it's what "theirs"-scoped enforcement compares to.
// null when signed out or no email; a null here means a "theirs"-scoped viewer
// matches no records (fail-closed).
export async function getViewerEmail(): Promise<string | null> {
  const user = await currentUser().catch(() => null);
  const email =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;
  return email ? email.toLowerCase() : null;
}
