// Per-category record scope for an RBAC role. "all" = every record; "theirs" =
// only records the admin created/uploaded (matched by created_by_email). Two
// categories carry a scope independently: Users (scoring jobs + scored profiles)
// and Events. The "admin" grant category is super-admin territory — no scope.
// Pure helpers (no DB/React) so they're testable and shared by enforcement.

export type RoleScope = "all" | "theirs";

// Normalize a stored/submitted scope. Only "theirs" narrows; everything else
// (including the legacy "edit_all" value and unconfigured nulls) means "all".
export function clampScope(v: unknown): RoleScope {
  return v === "theirs" ? "theirs" : "all";
}

// The viewer's effective scope for a category. Privileged viewers (super-admin /
// env admin) and role-less admins always see everything ("all"); a role-based
// admin uses their role's per-category scope.
export function effectiveScope(opts: {
  privileged: boolean;
  roleScope: unknown;
}): RoleScope {
  if (opts.privileged) return "all";
  if (opts.roleScope == null) return "all";
  return clampScope(opts.roleScope);
}
