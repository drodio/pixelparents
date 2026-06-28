// Kaggle public API (https://www.kaggle.com/api/v1) — used to measure a person's
// data-science / ML reputation: the datasets and notebooks ("kernels") they've
// published, with community votes + downloads. Auth is a single bearer token
// (KAGGLE_API_TOKEN, the newer "KGAT_…" format); the classic username+key pair is
// NOT needed. Read-only, best-effort: any failure → null so a score never blocks.
//
//   Datasets by user:  GET /datasets/list?user=<username>  (sorted by hotness)
//     → [{ titleNullable, voteCount, downloadCount, viewCount, creatorNameNullable,
//          creatorUrlNullable, usabilityRatingNullable }]
//   Notebooks by user: GET /kernels/list?user=<username>
//     → [{ title, totalVotes, author, ref }]
//
// There is no public "user profile / tier" endpoint, so we derive reputation from
// the published datasets + notebooks (count, total votes, total downloads, top item)
// and confirm identity from each record's creator/author display name.

const KAGGLE_API = "https://www.kaggle.com/api/v1";
const UA = "founder-festival-eval/1.0 (https://festival.so)";

export type KaggleDataset = {
  title: string | null;
  ref: string | null; // "<username>/<slug>"
  creatorName: string | null;
  creatorUrl: string | null; // the username
  voteCount: number;
  downloadCount: number;
  viewCount: number;
};

export type KaggleKernel = {
  title: string | null;
  ref: string | null; // "<username>/<slug>"
  author: string | null;
  totalVotes: number;
};

async function fetchJson<T>(path: string): Promise<T | null> {
  const token = process.env.KAGGLE_API_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`${KAGGLE_API}${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json", "user-agent": UA },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type RawDataset = {
  titleNullable?: string | null;
  urlNullable?: string | null;
  refNullable?: string | null;
  creatorNameNullable?: string | null;
  creatorUrlNullable?: string | null;
  voteCount?: number;
  downloadCount?: number;
  viewCount?: number;
};

type RawKernel = {
  title?: string | null;
  ref?: string | null;
  author?: string | null;
  totalVotes?: number;
};

export async function listUserDatasets(username: string): Promise<KaggleDataset[] | null> {
  const raw = await fetchJson<RawDataset[]>(`/datasets/list?user=${encodeURIComponent(username)}&pageSize=50`);
  if (!raw) return null;
  return raw.map((d) => ({
    title: d.titleNullable ?? null,
    ref: d.refNullable ?? null,
    creatorName: d.creatorNameNullable ?? null,
    creatorUrl: d.creatorUrlNullable ?? null,
    voteCount: Number(d.voteCount ?? 0),
    downloadCount: Number(d.downloadCount ?? 0),
    viewCount: Number(d.viewCount ?? 0),
  }));
}

export async function listUserKernels(username: string): Promise<KaggleKernel[] | null> {
  const raw = await fetchJson<RawKernel[]>(`/kernels/list?user=${encodeURIComponent(username)}&pageSize=50`);
  if (!raw) return null;
  return raw.map((k) => ({
    title: k.title ?? null,
    ref: k.ref ?? null,
    author: k.author ?? null,
    totalVotes: Number(k.totalVotes ?? 0),
  }));
}
