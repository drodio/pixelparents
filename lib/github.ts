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

// Cap on how many pages of commits we'll walk (100 per page). Bounds the number
// of outbound requests for a prolific contributor so the check stays cheap.
const MAX_COMMIT_PAGES = 5;

// Count commits authored by `username` in the GoPixel repo, driving the
// auto "Builder" tag. Best-effort: returns 0 (never throws) on any failure —
// missing token/username, a private/absent repo (404), rate-limit/permissions
// (403), or a network error — so the caller can treat 0 as "no commits found".
// Walks pages of up to 100 until a short page (or the page cap) is hit.
export async function countUserCommits(
  username: string | null | undefined,
): Promise<number> {
  const t = token();
  if (!t || !validUsername(username)) return 0;

  let total = 0;
  try {
    for (let page = 1; page <= MAX_COMMIT_PAGES; page += 1) {
      const url = `${API}/repos/${REPO}/commits?author=${encodeURIComponent(
        username,
      )}&per_page=100&page=${page}`;
      const res = await fetch(url, { headers: headers(t) });
      if (!res.ok) {
        // 404 = no such repo/user, 403/422 = rate-limited / bad author, etc. Any
        // non-2xx means "couldn't determine" — fail soft with whatever we counted
        // so far (0 on the first page).
        console.error(`GitHub commit count for ${username} failed: ${res.status}`);
        break;
      }
      const body = (await res.json()) as unknown;
      if (!Array.isArray(body)) break;
      total += body.length;
      // A short page (< per_page) means we've reached the end.
      if (body.length < 100) break;
    }
  } catch (err) {
    console.error("GitHub commit count error:", err);
    return total;
  }
  return total;
}

// A single commit as the changelog generator needs it: title (first line of the
// message) + body (the rest), the commit author's display name, the linked
// GitHub login (null when the commit isn't tied to a GH account), the authored
// date, and the html_url. `body` is trimmed to keep prompts small.
export type RecentCommit = {
  sha: string;
  title: string;
  body: string;
  authorName: string;
  authorLogin: string | null;
  date: string; // ISO
  url: string;
};

// How many pages of up to 100 commits to walk (~200 commits) before stopping.
const MAX_RECENT_COMMIT_PAGES = 2;
// Cap a commit body so a single verbose message can't blow up the LLM prompt.
const COMMIT_BODY_MAX = 500;

// Shape of the GitHub commits API items we read (only the fields we use).
type GhCommitItem = {
  sha?: string;
  html_url?: string;
  commit?: { message?: string; author?: { name?: string; date?: string } };
  author?: { login?: string } | null;
};

// List commits on the default branch merged since `sinceISO`. Paginates up to
// MAX_RECENT_COMMIT_PAGES, stopping early on a short page. Best-effort: returns
// [] on any error (missing token, non-2xx, network) so the cron never throws.
// De-duping by SHA against already-processed commits is the caller's job.
export async function listRecentCommits(sinceISO: string): Promise<RecentCommit[]> {
  const t = token();
  if (!t) {
    console.warn("GITHUB_ADMIN_TOKEN not set — skipping recent-commits fetch");
    return [];
  }
  const out: RecentCommit[] = [];
  try {
    for (let page = 1; page <= MAX_RECENT_COMMIT_PAGES; page += 1) {
      const url = `${API}/repos/${REPO}/commits?since=${encodeURIComponent(
        sinceISO,
      )}&per_page=100&page=${page}`;
      const res = await fetch(url, { headers: headers(t) });
      if (!res.ok) {
        console.error(`GitHub listRecentCommits failed: ${res.status}`);
        break;
      }
      const body = (await res.json()) as unknown;
      if (!Array.isArray(body)) break;
      for (const raw of body as GhCommitItem[]) {
        const sha = raw?.sha;
        if (!sha) continue;
        const message = raw.commit?.message ?? "";
        const lines = message.split("\n");
        const title = (lines[0] ?? "").trim();
        const rest = lines.slice(1).join("\n").trim().slice(0, COMMIT_BODY_MAX);
        out.push({
          sha,
          title,
          body: rest,
          authorName: raw.commit?.author?.name?.trim() || "Unknown",
          authorLogin: raw.author?.login ?? null,
          date: raw.commit?.author?.date ?? new Date().toISOString(),
          url: raw.html_url ?? `https://github.com/${REPO}/commit/${sha}`,
        });
      }
      if (body.length < 100) break;
    }
  } catch (err) {
    console.error("GitHub listRecentCommits error:", err);
    return out;
  }
  return out;
}
