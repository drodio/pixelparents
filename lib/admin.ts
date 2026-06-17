import { eq } from "drizzle-orm";
import { getSql, getDb, hasDatabase } from "./db";
import { admins } from "./db/schema/admins";
import { getSignupByEmail } from "./db/signups";
import { addRepoCollaborator, removeRepoCollaborator } from "./github";

// Self-healing guard for the `admins` table (same rationale as ensureApiKeysTable
// in lib/db/ensure.ts: this app shares one Neon DB across in-flight features and
// a sibling `drizzle-kit push` could drop tables it doesn't know about). We
// create it idempotently on first admin operation per cold start.
let ensured: Promise<void> | null = null;
export function ensureAdminsTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await getSql()`
        CREATE TABLE IF NOT EXISTS admins (
          email text PRIMARY KEY,
          created_at timestamptz NOT NULL DEFAULT now(),
          created_by text
        )
      `;
    })().catch((e) => {
      ensured = null;
      throw e;
    });
  }
  return ensured;
}

function envAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// Bootstrap superadmins from the env var — these can't be revoked from the UI.
export function isEnvAdmin(email?: string | null): boolean {
  if (!email) return false;
  return envAdminEmails().includes(email.toLowerCase());
}

// The full admin gate: env superadmin OR a row in the `admins` table.
export async function isAdminEmail(email?: string | null): Promise<boolean> {
  if (!email) return false;
  const e = email.toLowerCase();
  if (envAdminEmails().includes(e)) return true;
  if (!hasDatabase()) return false;
  await ensureAdminsTable();
  const rows = await getDb()
    .select({ email: admins.email })
    .from(admins)
    .where(eq(admins.email, e))
    .limit(1);
  return rows.length > 0;
}

// Lowercased set of DB-promoted admin emails — used to render the table's
// per-row admin state without an N+1 query.
export async function dbAdminEmails(): Promise<Set<string>> {
  if (!hasDatabase()) return new Set();
  await ensureAdminsTable();
  const rows = await getDb().select({ email: admins.email }).from(admins);
  return new Set(rows.map((r) => r.email.toLowerCase()));
}

export async function addAdmin(email: string, by: string | null): Promise<void> {
  await ensureAdminsTable();
  await getSql()`
    INSERT INTO admins (email, created_by) VALUES (${email.toLowerCase()}, ${by})
    ON CONFLICT (email) DO NOTHING
  `;
  // Best-effort: invite their GitHub account as a repo collaborator (maintain).
  try {
    const signup = await getSignupByEmail(email);
    await addRepoCollaborator(signup?.githubUsername);
  } catch (err) {
    console.error("addAdmin: GitHub collaborator invite failed:", err);
  }
}

export async function removeAdmin(email: string): Promise<void> {
  await ensureAdminsTable();
  await getSql()`DELETE FROM admins WHERE email = ${email.toLowerCase()}`;
  // Best-effort: revoke their repo access too.
  try {
    const signup = await getSignupByEmail(email);
    await removeRepoCollaborator(signup?.githubUsername);
  } catch (err) {
    console.error("removeAdmin: GitHub collaborator removal failed:", err);
  }
}
