import type { EnricherContext, EnrichmentResult } from "./types";
import { deriveHandleCandidates, handleFromUrls, nameOverlaps, textCorroborates } from "./identity";

// Hugging Face Hub — free public-read APIs; optional token raises rate limits.
//
//   User overview:   https://huggingface.co/api/users/<username>/overview
//     → { fullname, numModels, numDatasets, numLikes, ... }
//   Models by author: https://huggingface.co/api/models?author=<u>&limit=50&sort=downloads&direction=-1
//     → [{ id, downloads, likes }, ...]
//   Datasets by author: https://huggingface.co/api/datasets?author=<u>&limit=50
//
// Identity confirmation: if the handle came from a known huggingface.co/<username>
// URL (highest trust), accept immediately. For derived candidates, accept only if
// nameOverlaps(ctx.fullName, overview.fullname) passes — or textCorroborates on bio.
//
// A bare huggingface.co/<slug> with a single path segment that is NOT one of the
// reserved namespaces (models|datasets|spaces|docs|blog) is treated as a user handle.

const UA = "founder-festival-eval/1.0 (https://festival.so)";
const HF_API = "https://huggingface.co/api";

// Reserved top-level path segments that are NOT user handles.
const RESERVED = new Set(["models", "datasets", "spaces", "docs", "blog", "tasks", "papers"]);

type HfOverview = {
  fullname?: string | null;
  name?: string | null;
  bio?: string | null;
  numModels?: number;
  numDatasets?: number;
  numSpaces?: number;
  numLikes?: number;
};

type HfModel = {
  id: string;
  downloads?: number;
  likes?: number;
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const headers: Record<string, string> = {
      "user-agent": UA,
      accept: "application/json",
    };
    const token = process.env["HUGGING_FACE_TOKEN"];
    if (token) headers["authorization"] = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function fetchOverview(username: string): Promise<HfOverview | null> {
  return fetchJson<HfOverview>(
    `${HF_API}/users/${encodeURIComponent(username)}/overview`,
  );
}

function fetchModels(username: string): Promise<HfModel[] | null> {
  return fetchJson<HfModel[]>(
    `${HF_API}/models?author=${encodeURIComponent(username)}&limit=50&sort=downloads&direction=-1`,
  );
}

function fetchDatasets(username: string): Promise<HfModel[] | null> {
  return fetchJson<HfModel[]>(
    `${HF_API}/datasets?author=${encodeURIComponent(username)}&limit=50`,
  );
}

// Extract a user handle from a bare huggingface.co/<username> URL, skipping
// reserved namespaces (models, datasets, spaces, ...).
function handleFromHfUrls(urls: string[]): string | null {
  for (const u of urls) {
    try {
      const parsed = new URL(u);
      if (!parsed.hostname.endsWith("huggingface.co")) continue;
      // Path looks like /<segment> or /<segment>/ — exactly one segment.
      const parts = parsed.pathname.replace(/^\//, "").replace(/\/$/, "").split("/");
      if (parts.length === 1 && parts[0] && !RESERVED.has(parts[0].toLowerCase())) {
        return parts[0];
      }
    } catch {
      // Malformed URL — try regex fallback.
      const m = u.match(/huggingface\.co\/([A-Za-z0-9_.-]+)\/?(?:[?#].*)?$/);
      if (m && m[1] && !RESERVED.has(m[1].toLowerCase())) return m[1];
    }
  }
  return null;
}

export async function enrichWithHuggingFace(
  ctx: EnricherContext,
  knownHfUrls: string[],
): Promise<EnrichmentResult> {
  const empty: EnrichmentResult = { source: "huggingface", facts: [], citations: [] };

  // 1. Highest trust: known huggingface.co/<username> URL (Exa already tied it).
  //    Also accept explicit profile links like /api/users/<u> or query-param style.
  let handle =
    handleFromHfUrls(knownHfUrls) ??
    handleFromUrls(knownHfUrls, /huggingface\.co\/([A-Za-z0-9_.-]+)\/?(?:[?#].*)?/i);

  let confirmedVia: "exa-url" | "name-match" | "bio" | null = null;
  let overview: HfOverview | null = null;

  if (handle) {
    overview = await fetchOverview(handle);
    if (overview) confirmedVia = "exa-url";
  }

  // 2. Fallback: probe derived candidates; accept only if fullname matches or bio corroborates.
  if (!overview) {
    for (const cand of deriveHandleCandidates(ctx)) {
      const ov = await fetchOverview(cand);
      if (!ov) continue;
      if (nameOverlaps(ctx.fullName, ov.fullname ?? ov.name)) {
        overview = ov;
        handle = cand;
        confirmedVia = "name-match";
        break;
      }
      if (textCorroborates(ctx, ov.bio ?? "", knownHfUrls)) {
        overview = ov;
        handle = cand;
        confirmedVia = "bio";
        break;
      }
    }
  }

  if (!overview || !handle || !confirmedVia) return empty;

  // Fetch models (already sorted by downloads desc); optionally datasets.
  const [models, datasets] = await Promise.all([
    fetchModels(handle),
    fetchDatasets(handle),
  ]);

  const facts: string[] = [];
  const citations: string[] = [`https://huggingface.co/${handle}`];

  // --- Identity line ---
  const displayName = overview.fullname ?? overview.name ?? handle;
  const numModels = overview.numModels ?? models?.length ?? 0;
  const numDatasets = overview.numDatasets ?? datasets?.length ?? 0;
  const numLikes = overview.numLikes ?? 0;

  const identityParts: string[] = [];
  if (numModels > 0) identityParts.push(`${numModels} model${numModels !== 1 ? "s" : ""}`);
  if (numDatasets > 0) identityParts.push(`${numDatasets} dataset${numDatasets !== 1 ? "s" : ""}`);

  facts.push(
    `Hugging Face: @${handle} (${displayName})` +
      (identityParts.length > 0 ? ` — ${identityParts.join(", ")}.` : "."),
  );

  // --- Download + likes summary ---
  const totalDownloads = (models ?? []).reduce((s, m) => s + (m.downloads ?? 0), 0);
  const totalModelLikes = (models ?? []).reduce((s, m) => s + (m.likes ?? 0), 0);
  const effectiveLikes = numLikes > 0 ? numLikes : totalModelLikes;

  const summaryParts: string[] = [];
  if (totalDownloads > 0) {
    summaryParts.push(`${totalDownloads >= 1_000_000 ? `${(totalDownloads / 1_000_000).toFixed(1)}M` : totalDownloads.toLocaleString("en-US")} total model downloads`);
  }
  if (effectiveLikes > 0) {
    summaryParts.push(`${effectiveLikes.toLocaleString("en-US")} likes`);
  }
  if (summaryParts.length > 0) {
    facts.push(`${summaryParts.join(", ")}.`);
  }

  // --- Top model ---
  const topModel = (models ?? []).find((m) => (m.downloads ?? 0) > 0);
  if (topModel) {
    const topId = topModel.id.includes("/") ? topModel.id.split("/").slice(1).join("/") : topModel.id;
    const topParts: string[] = [];
    if (topModel.downloads) topParts.push(`${topModel.downloads >= 1_000_000 ? `${(topModel.downloads / 1_000_000).toFixed(1)}M` : topModel.downloads.toLocaleString("en-US")} downloads`);
    if (topModel.likes) topParts.push(`${topModel.likes.toLocaleString("en-US")} likes`);
    facts.push(
      `Top model: ${topId}` +
        (topParts.length > 0 ? ` (${topParts.join(", ")}).` : "."),
    );
    citations.push(`https://huggingface.co/${topModel.id}`);
  }

  return {
    source: "huggingface",
    facts,
    citations,
    raw: {
      handle,
      confirmed_via: confirmedVia,
      fullname: displayName,
      num_models: numModels,
      num_datasets: numDatasets,
      num_likes: effectiveLikes,
      total_downloads: totalDownloads,
      top_models: (models ?? [])
        .slice(0, 5)
        .map((m) => ({ id: m.id, downloads: m.downloads ?? 0, likes: m.likes ?? 0 })),
    },
  };
}
