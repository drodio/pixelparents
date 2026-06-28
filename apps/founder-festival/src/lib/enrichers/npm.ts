import type { EnricherContext, EnrichmentResult } from "./types";
import { deriveHandleCandidates, handleFromUrls, nameOverlaps } from "./identity";

// npm enricher — free, no-auth APIs:
//   • Search by maintainer  https://registry.npmjs.org/-/v1/search?text=maintainer:<handle>&size=20
//       → objects[].{ package{ name, description, links, publisher, maintainers }, downloads{ monthly } }
//         The `downloads.monthly` field is already included in search results — no extra round-trip needed.
//   • Package manifest       https://registry.npmjs.org/<pkg>/latest
//       → { author{ name, email }, maintainers[{ name }] }
//         Used only for identity corroboration on the *derived* path: we look up the
//         author.name of the top result and run nameOverlaps() against it.
//
// Matching — precision over recall (false attribution >> missing signal):
//   • Highest trust: caller already resolved a `npmjs.com/~<handle>` URL via Exa.
//     We probe that handle directly and return whatever we find.
//   • Derived candidates (from deriveHandleCandidates): require corroboration.
//     npm search results don't include the maintainer's display name, so we do ONE
//     extra registry fetch for the top returned package to get `author.name` and
//     check nameOverlaps(). If corroboration fails, we DROP the candidate.
//     Note: many popular packages (e.g. Next.js ecosystem packages) have no `author`
//     field at the package level — in that case derived candidates will be rejected
//     (expected & correct: better no data than a wrong attribution).

const UA = "founder-festival-eval/1.0 (https://festival.so)";
const NPM_SEARCH = "https://registry.npmjs.org/-/v1/search";
const NPM_REGISTRY = "https://registry.npmjs.org";
const DEPS_DEV = "https://api.deps.dev";

// Shape returned by the npm search API.
type NpmSearchPkg = {
  name: string;
  description?: string;
  links?: {
    npm?: string;
    homepage?: string;
    repository?: string;
  };
  publisher?: { username?: string; email?: string };
  maintainers?: Array<{ username?: string; email?: string }>;
};
type NpmSearchObject = {
  package: NpmSearchPkg;
  downloads?: { monthly?: number };
};
type NpmSearchResp = {
  objects: NpmSearchObject[];
  total: number;
};

// Shape of the /<pkg>/latest manifest we use for corroboration.
type NpmManifest = {
  author?: { name?: string; email?: string } | null;
  maintainers?: Array<{ name?: string }>;
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function searchByHandle(handle: string): Promise<NpmSearchResp | null> {
  const url = `${NPM_SEARCH}?text=maintainer:${encodeURIComponent(handle)}&size=20`;
  return fetchJson<NpmSearchResp>(url);
}

// Fetch the `author.name` from a package manifest, used for corroboration.
async function fetchPackageAuthorName(pkgName: string): Promise<string | null> {
  const manifest = await fetchJson<NpmManifest>(
    `${NPM_REGISTRY}/${encodeURIComponent(pkgName)}/latest`,
  );
  return manifest?.author?.name ?? null;
}

// Fetch direct + indirect dependent counts from deps.dev for a package. This
// is the "how many other public npm packages depend on you" metric — far
// stronger than star counts as a signal of OSS impact (chalk: 810 direct
// dependents; React itself: tens of thousands). Two HTTP calls per package:
// one to get the default version, one to get its dependents. Returns null on
// any failure so the calling enricher silently degrades to "no dependent
// data" — never blocks the npm enrichment.
type DepsDevPkg = { versions: Array<{ versionKey: { version: string }; isDefault?: boolean }> };
type DepsDevDependents = {
  dependentCount?: number;
  directDependentCount?: number;
  indirectDependentCount?: number;
};
async function fetchDependentCount(
  pkgName: string,
): Promise<{ direct: number; total: number; version: string } | null> {
  const pkg = await fetchJson<DepsDevPkg>(
    `${DEPS_DEV}/v3/systems/NPM/packages/${encodeURIComponent(pkgName)}`,
  );
  const defaultVersion = pkg?.versions?.find((v) => v.isDefault)?.versionKey?.version;
  if (!defaultVersion) return null;
  const deps = await fetchJson<DepsDevDependents>(
    `${DEPS_DEV}/v3alpha/systems/NPM/packages/${encodeURIComponent(pkgName)}/versions/${encodeURIComponent(defaultVersion)}:dependents`,
  );
  if (!deps || typeof deps.dependentCount !== "number") return null;
  return {
    direct: deps.directDependentCount ?? 0,
    total: deps.dependentCount,
    version: defaultVersion,
  };
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// Given search results, compute the top packages sorted by monthly downloads.
function topByDownloads(
  objects: NpmSearchObject[],
  limit = 5,
): Array<{ name: string; monthly: number; npmUrl: string }> {
  return objects
    .map((o) => ({
      name: o.package.name,
      monthly: o.downloads?.monthly ?? 0,
      npmUrl: o.package.links?.npm ?? `https://www.npmjs.com/package/${encodeURIComponent(o.package.name)}`,
    }))
    .sort((a, b) => b.monthly - a.monthly)
    .slice(0, limit);
}

function fmtDownloads(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export async function enrichWithNpm(
  ctx: EnricherContext,
  knownNpmUrls: string[],
): Promise<EnrichmentResult> {
  const empty: EnrichmentResult = { source: "npm", facts: [], citations: [] };

  // ── 1. Highest trust: caller supplied a confirmed npmjs.com/~<handle> URL. ──
  let handle = handleFromUrls(
    knownNpmUrls,
    /npmjs\.com\/~([A-Za-z0-9._-]+)/i,
  );
  let confirmedVia: "exa-url" | "author-name" | null = null;
  let searchResp: NpmSearchResp | null = null;

  if (handle) {
    searchResp = await searchByHandle(handle);
    if (searchResp && searchResp.total > 0) {
      confirmedVia = "exa-url";
    } else {
      // Handle exists in URL but has no packages — treat as not found.
      handle = null;
    }
  }

  // ── 2. Derived candidates — require author-name corroboration. ──
  if (!confirmedVia) {
    for (const cand of deriveHandleCandidates(ctx)) {
      const resp = await searchByHandle(cand);
      if (!resp || resp.total === 0) continue;

      // Corroborate: check if the top package's author.name overlaps the subject's name.
      const topPkg = resp.objects[0]?.package.name;
      if (!topPkg) continue;

      const authorName = await fetchPackageAuthorName(topPkg);
      if (!nameOverlaps(ctx.fullName, authorName)) {
        // No corroboration — this candidate's packages don't prove identity.
        continue;
      }

      handle = cand;
      searchResp = resp;
      confirmedVia = "author-name";
      break;
    }
  }

  if (!handle || !confirmedVia || !searchResp) return empty;

  // ── 3. Build facts. ──
  const facts: string[] = [];
  const totalPackages = searchResp.total;
  const top = topByDownloads(searchResp.objects, 5);
  const totalMonthly = top.reduce((sum, p) => sum + p.monthly, 0);
  const topPkg = top[0];

  // Identity lead.
  facts.push(
    `npm: @${handle} maintains ${totalPackages.toLocaleString("en-US")} package${totalPackages === 1 ? "" : "s"}.`,
  );

  // Download summary.
  if (totalMonthly > 0) {
    const dlLine = `~${fmtDownloads(totalMonthly)} monthly downloads across their top packages.` +
      (topPkg ? ` Top: ${topPkg.name} (${fmtDownloads(topPkg.monthly)}/mo).` : "");
    facts.push(dlLine);
  }

  // Top packages bullets (up to 3 beyond the first, already covered above).
  const furtherTop = top.slice(1, 4);
  if (furtherTop.length > 0) {
    const names = furtherTop.map((p) => `${p.name} (${fmtDownloads(p.monthly)}/mo)`).join(", ");
    facts.push(`Other popular packages: ${names}.`);
  }

  // Dependent count for the top package via deps.dev — much stronger OSS-
  // impact signal than downloads (which can be inflated by CI runs) or stars
  // (which measure intent, not actual usage). Skipped silently on failure.
  let dependentsRaw: { direct: number; total: number; version: string; pkg: string } | null = null;
  if (topPkg) {
    const dep = await fetchDependentCount(topPkg.name);
    if (dep && dep.direct > 0) {
      facts.push(
        `Top package '${topPkg.name}' has ${fmtCount(dep.direct)} direct npm dependents (${fmtCount(dep.total)} total incl. indirect, per deps.dev v${dep.version}).`,
      );
      dependentsRaw = { ...dep, pkg: topPkg.name };
    }
  }

  // ── 4. Citations. ──
  const citations: string[] = [`https://www.npmjs.com/~${handle}`];
  if (topPkg) citations.push(topPkg.npmUrl);

  // ── 5. Raw payload. ──
  const raw = {
    handle,
    confirmed_via: confirmedVia,
    package_count: totalPackages,
    total_monthly_downloads: totalMonthly,
    top_packages: top.map((p) => ({ name: p.name, monthly_downloads: p.monthly })),
    top_package_dependents: dependentsRaw,
  };

  return { source: "npm", facts, citations, raw };
}
