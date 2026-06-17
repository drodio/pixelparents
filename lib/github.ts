// GitHub repo-collaborator automation. When someone is made an admin in the app,
// we invite their GitHub account as a repo collaborator (and remove it when
// admin is revoked). Best-effort: never throws, so admin changes don't fail if
// GitHub is unreachable or unconfigured.
//
// Requires GITHUB_ADMIN_TOKEN (fine-grained PAT, repo Administration: write).
// Note: GitHub emails an invite the person must accept — collaborators on a
// personal-account repo aren't added silently.

const REPO = process.env.GITHUB_REPO ?? "drodio/pixelparents";
const API = "https://api.github.com";

function token(): string | null {
  return process.env.GITHUB_ADMIN_TOKEN || null;
}

function headers(t: string): HeadersInit {
  return {
    Authorization: `Bearer ${t}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "pixelparents-admin-bot",
  };
}

// Only letters, numbers and hyphens are valid GitHub usernames.
function validUsername(u: string | null | undefined): u is string {
  return Boolean(u && /^[A-Za-z0-9-]{1,39}$/.test(u));
}

// Invite (or update) a collaborator at the given permission ("maintain" by default).
export async function addRepoCollaborator(
  username: string | null | undefined,
  permission: "pull" | "triage" | "push" | "maintain" | "admin" = "maintain",
): Promise<boolean> {
  const t = token();
  if (!t) {
    console.warn("GITHUB_ADMIN_TOKEN not set — skipping collaborator invite");
    return false;
  }
  if (!validUsername(username)) {
    console.warn("No/invalid GitHub username — skipping collaborator invite");
    return false;
  }
  try {
    const res = await fetch(`${API}/repos/${REPO}/collaborators/${username}`, {
      method: "PUT",
      headers: { ...headers(t), "Content-Type": "application/json" },
      body: JSON.stringify({ permission }),
    });
    // 201 = invitation created, 204 = already a collaborator (updated).
    if (res.ok) return true;
    console.error(`GitHub add collaborator ${username} failed: ${res.status}`);
    return false;
  } catch (err) {
    console.error("GitHub add collaborator error:", err);
    return false;
  }
}

export async function removeRepoCollaborator(
  username: string | null | undefined,
): Promise<boolean> {
  const t = token();
  if (!t || !validUsername(username)) return false;
  try {
    const res = await fetch(`${API}/repos/${REPO}/collaborators/${username}`, {
      method: "DELETE",
      headers: headers(t),
    });
    if (res.ok) return true;
    console.error(`GitHub remove collaborator ${username} failed: ${res.status}`);
    return false;
  } catch (err) {
    console.error("GitHub remove collaborator error:", err);
    return false;
  }
}
