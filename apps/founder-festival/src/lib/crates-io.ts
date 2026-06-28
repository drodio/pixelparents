// crates.io (the Rust package registry) public API. Identity is clean and SAFE:
// crates.io accounts are GitHub OAuth logins, so a crates.io user `X` IS the GitHub
// user `X`. We key off the GitHub login we already resolved for the subject, so
// there's no name-guessing / false-attribution risk. Read-only, best-effort.
//
//   GET /api/v1/users/<login>            → { user: { id, login, name, url } }  (url = GitHub profile)
//   GET /api/v1/crates?user_id=<id>&...  → { crates: [{ name, downloads, ... }], meta: { total } }
//
// crates.io requires a descriptive User-Agent with contact info.

const API = "https://crates.io/api/v1";
const UA = "founder-festival-eval/1.0 (https://festival.so)";

export type CratesUser = { id: number; login: string; name: string | null; githubUrl: string | null };
export type Crate = { name: string; downloads: number; recentDownloads: number };

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, { headers: { "user-agent": UA, accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchCratesUser(login: string): Promise<CratesUser | null> {
  const j = await getJson<{ user?: { id: number; login: string; name?: string | null; url?: string | null } }>(
    `/users/${encodeURIComponent(login)}`,
  );
  if (!j?.user?.id) return null;
  return { id: j.user.id, login: j.user.login, name: j.user.name ?? null, githubUrl: j.user.url ?? null };
}

export async function fetchUserCrates(userId: number): Promise<{ crates: Crate[]; total: number } | null> {
  const j = await getJson<{
    crates?: Array<{ name: string; downloads?: number; recent_downloads?: number }>;
    meta?: { total?: number };
  }>(`/crates?user_id=${userId}&per_page=100&sort=downloads`);
  if (!j?.crates) return null;
  return {
    crates: j.crates.map((c) => ({
      name: c.name,
      downloads: Number(c.downloads ?? 0),
      recentDownloads: Number(c.recent_downloads ?? 0),
    })),
    total: Number(j.meta?.total ?? j.crates.length),
  };
}
