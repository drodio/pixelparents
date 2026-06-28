import type { EnricherContext, EnrichmentResult } from "./types";
import { fetchCratesUser, fetchUserCrates, type Crate } from "../crates-io";

// crates.io enricher — Rust open-source footprint (FOUNDER-rubric builder signal,
// complementary to [github] / [npm] / [huggingface]). Identity is SAFE without any
// name-guessing: crates.io logins ARE GitHub logins (OAuth), so we key off the
// GitHub login the subject already resolved to and confirm the crates.io account's
// GitHub URL points back at the same login.

// Extract the bare GitHub login (first path segment) from a github.com profile/repo
// URL, skipping reserved namespaces that are not user logins.
const GH_RESERVED = new Set([
  "orgs", "sponsors", "marketplace", "topics", "collections", "trending", "about",
  "features", "settings", "notifications", "explore", "apps", "login", "join", "pricing",
]);

export function githubLoginsFromUrls(urls: string[]): string[] {
  const out: string[] = [];
  for (const u of urls) {
    const m = u.match(/github\.com\/([A-Za-z0-9-]+)(?:[/?#]|$)/i);
    if (m && m[1] && !GH_RESERVED.has(m[1].toLowerCase())) out.push(m[1]);
  }
  return [...new Set(out)];
}

function fmt(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`.replace(".0k", "k");
  return n.toLocaleString("en-US");
}

export async function enrichWithCrates(
  ctx: EnricherContext,
  knownGithubUrls: string[],
): Promise<EnrichmentResult> {
  const empty: EnrichmentResult = { source: "crates", facts: [], citations: [] };

  for (const login of githubLoginsFromUrls(knownGithubUrls).slice(0, 3)) {
    const user = await fetchCratesUser(login);
    if (!user) continue;
    // Confirm the crates.io account links back to the same GitHub login (identity-safe).
    const linksBack = (user.githubUrl ?? "").toLowerCase().includes(`github.com/${login.toLowerCase()}`);
    if (!linksBack) continue;

    const res = await fetchUserCrates(user.id);
    const crates = res?.crates ?? [];
    if (crates.length === 0) continue;

    const totalDownloads = crates.reduce((s, c) => s + c.downloads, 0);
    const top: Crate = crates.slice().sort((a, b) => b.downloads - a.downloads)[0]!;
    const numCrates = res?.total ?? crates.length;

    const facts: string[] = [
      `crates.io: @${user.login}${user.name ? ` (${user.name})` : ""} — maintains ${numCrates} published Rust crate${numCrates !== 1 ? "s" : ""}.`,
    ];
    if (totalDownloads > 0) {
      facts.push(`${fmt(totalDownloads)} total crate downloads (widely-used Rust open-source).`);
    }
    if (top.downloads > 0) {
      facts.push(`Top crate: ${top.name} (${fmt(top.downloads)} downloads).`);
    }

    return {
      source: "crates",
      facts,
      citations: [`https://crates.io/users/${user.login}`, `https://crates.io/crates/${top.name}`],
      raw: {
        login: user.login,
        num_crates: numCrates,
        total_downloads: totalDownloads,
        top_crates: crates.slice(0, 5).map((c) => ({ name: c.name, downloads: c.downloads })),
      },
    };
  }

  return empty;
}
