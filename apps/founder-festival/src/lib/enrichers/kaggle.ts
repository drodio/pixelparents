import type { EnricherContext, EnrichmentResult } from "./types";
import { deriveHandleCandidates, nameOverlaps } from "./identity";
import { listUserDatasets, listUserKernels, type KaggleDataset, type KaggleKernel } from "../kaggle";

// Kaggle enricher — a data-science / ML credibility signal (FOUNDER-rubric, like
// [github] / [huggingface]). Measures the datasets + notebooks the subject has
// published on Kaggle and the community votes/downloads they earned.
//
// Identity (precision over recall — a stranger's Kaggle reputation must never be
// attributed to the subject):
//   1. Highest trust: a kaggle.com/<username> profile URL Exa already surfaced
//      near the subject → accept that handle directly.
//   2. Fallback: probe derived handle candidates; accept ONLY if a returned
//      dataset's creatorName / notebook's author name-matches the subject.
// Kaggle has no public "user profile" endpoint, so the creator/author display
// name on each published item is what we confirm against.

const RESERVED = new Set([
  "datasets", "code", "kernels", "competitions", "c", "learn", "discussions",
  "models", "organizations", "o", "t", "account", "notebooks", "search", "rankings",
  "general", "getting-started", "product-feedback", "questions-and-answers", "work",
]);

// Pull a Kaggle username from a bare kaggle.com/<username> profile URL (single
// path segment that isn't a reserved namespace). Dataset/notebook URLs have ≥2
// segments (kaggle.com/<user>/<slug>) and are intentionally skipped here.
export function handleFromKaggleUrls(urls: string[]): string | null {
  for (const u of urls) {
    let path: string | null = null;
    try {
      const parsed = new URL(u);
      if (!parsed.hostname.endsWith("kaggle.com")) continue;
      path = parsed.pathname;
    } catch {
      const m = u.match(/kaggle\.com\/([A-Za-z0-9_.-]+)\/?(?:[?#].*)?$/i);
      if (m) path = `/${m[1]}`;
    }
    if (!path) continue;
    const parts = path.replace(/^\//, "").replace(/\/$/, "").split("/");
    if (parts.length === 1 && parts[0] && !RESERVED.has(parts[0].toLowerCase())) {
      return parts[0];
    }
  }
  return null;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`.replace(".0k", "k");
  return n.toLocaleString("en-US");
}

// Confirm a probed handle is the subject's by matching any returned item's
// creator/author display name against the subject's full name.
function itemsConfirmSubject(
  fullName: string | null,
  datasets: KaggleDataset[] | null,
  kernels: KaggleKernel[] | null,
): boolean {
  if (datasets?.some((d) => nameOverlaps(fullName, d.creatorName))) return true;
  if (kernels?.some((k) => nameOverlaps(fullName, k.author))) return true;
  return false;
}

export async function enrichWithKaggle(
  ctx: EnricherContext,
  knownKaggleUrls: string[],
): Promise<EnrichmentResult> {
  const empty: EnrichmentResult = { source: "kaggle", facts: [], citations: [] };
  if (!process.env.KAGGLE_API_TOKEN) return empty;

  let handle = handleFromKaggleUrls(knownKaggleUrls);
  let datasets: KaggleDataset[] | null = null;
  let kernels: KaggleKernel[] | null = null;
  let confirmedVia: "exa-url" | "name-match" | null = null;

  // 1. Trusted handle from an Exa-surfaced profile URL.
  if (handle) {
    [datasets, kernels] = await Promise.all([listUserDatasets(handle), listUserKernels(handle)]);
    confirmedVia = "exa-url";
  }

  // 2. Fallback: probe derived candidates; accept only on a creator-name match.
  if (!confirmedVia) {
    for (const cand of deriveHandleCandidates(ctx, { max: 4 })) {
      const [ds, ks] = await Promise.all([listUserDatasets(cand), listUserKernels(cand)]);
      if (itemsConfirmSubject(ctx.fullName, ds, ks)) {
        handle = cand;
        datasets = ds;
        kernels = ks;
        confirmedVia = "name-match";
        break;
      }
    }
  }

  if (!handle || !confirmedVia) return empty;

  const ds = datasets ?? [];
  const ks = kernels ?? [];
  const numDatasets = ds.length;
  const numKernels = ks.length;
  if (numDatasets === 0 && numKernels === 0) return empty; // profile exists but nothing published → no signal

  const datasetVotes = ds.reduce((s, d) => s + d.voteCount, 0);
  const kernelVotes = ks.reduce((s, k) => s + k.totalVotes, 0);
  const totalVotes = datasetVotes + kernelVotes;
  const totalDownloads = ds.reduce((s, d) => s + d.downloadCount, 0);

  const facts: string[] = [];
  const citations: string[] = [`https://www.kaggle.com/${handle}`];

  // Identity / output line.
  const published: string[] = [];
  if (numDatasets > 0) published.push(`${numDatasets} dataset${numDatasets !== 1 ? "s" : ""}`);
  if (numKernels > 0) published.push(`${numKernels} notebook${numKernels !== 1 ? "s" : ""}`);
  facts.push(`Kaggle: @${handle} — published ${published.join(" and ")} (data-science / ML practitioner).`);

  // Community reputation summary.
  const repParts: string[] = [];
  if (totalVotes > 0) repParts.push(`${fmt(totalVotes)} community upvotes`);
  if (totalDownloads > 0) repParts.push(`${fmt(totalDownloads)} dataset downloads`);
  if (repParts.length) facts.push(`${repParts.join(", ")} across their Kaggle work (peer-recognized ML reputation).`);

  // Top item by votes (dataset or notebook).
  const topDataset = ds.slice().sort((a, b) => b.voteCount - a.voteCount)[0];
  const topKernel = ks.slice().sort((a, b) => b.totalVotes - a.totalVotes)[0];
  const topIsDataset = (topDataset?.voteCount ?? 0) >= (topKernel?.totalVotes ?? 0);
  const top = topIsDataset ? topDataset : topKernel;
  if (top) {
    const votes = topIsDataset ? topDataset!.voteCount : topKernel!.totalVotes;
    const kind = topIsDataset ? "dataset" : "notebook";
    if (votes > 0 && top.title) {
      facts.push(`Top ${kind}: "${top.title}" (${fmt(votes)} upvotes).`);
      if (top.ref) citations.push(`https://www.kaggle.com/${topIsDataset ? "datasets/" : "code/"}${top.ref}`);
    }
  }

  return {
    source: "kaggle",
    facts,
    citations,
    raw: {
      handle,
      confirmed_via: confirmedVia,
      num_datasets: numDatasets,
      num_notebooks: numKernels,
      total_votes: totalVotes,
      total_downloads: totalDownloads,
      top_datasets: ds.slice(0, 5).map((d) => ({ title: d.title, votes: d.voteCount, downloads: d.downloadCount })),
      top_notebooks: ks.slice(0, 5).map((k) => ({ title: k.title, votes: k.totalVotes })),
    },
  };
}
