// USPTO Open Data Portal (ODP) patent search — https://api.uspto.gov. Auth is the
// `X-API-KEY` header (USPTO_API_KEY). We search patent applications by inventor
// name; the response is file-wrapper-centric (`patentFileWrapperDataBag`). Each
// wrapper's `applicationMetaData` carries the invention title, inventor list,
// applicant/assignee, status, and filing date. Best-effort: any failure → null.

const BASE = "https://api.uspto.gov/api/v1/patent/applications/search";

export type UsptoPatent = {
  title: string | null;
  inventors: string[];
  applicant: string | null; // the assignee company (corroboration anchor)
  granted: boolean; // status === "Patented Case"
  filingDate: string | null;
};

type Wrapper = {
  applicationMetaData?: {
    inventionTitle?: string | null;
    inventorBag?: Array<{ inventorNameText?: string | null }>;
    applicantBag?: Array<{ applicantNameText?: string | null }>;
    applicationStatusDescriptionText?: string | null;
    filingDate?: string | null;
  };
};

// The subject's LAST name, used as the broad search key. We search by surname
// (not the full name) because patents file the subject under varying forms —
// "Daniel Odio" vs "Daniel R. Odio" (middle initial) vs "Sam" vs "Samuel" — and a
// full-name phrase match misses those. The caller then strictly re-filters by
// first+last name AND assignee-company corroboration, so the broad search is safe.
export function lastNameForSearch(fullName: string): string | null {
  // BrightData names look like "DROdio - Daniel R. Odio"; take the real-name part.
  const real = fullName.includes(" - ") ? fullName.split(" - ").pop()! : fullName;
  const toks = real.trim().split(/\s+/).filter((t) => t.replace(/[^a-zA-Z]/g, "").length >= 2);
  return toks.length ? toks[toks.length - 1]!.replace(/[^a-zA-Z-]/g, "") : null;
}

// Search up to `limit` patent applications by the subject's SURNAME. Returns the
// trimmed records (or null on missing key / HTTP error). The caller corroborates
// each by strict first+last name match AND assignee-company match (surname alone is
// NOT enough — same-surname inventors are common).
export async function searchPatentsByInventor(
  fullName: string,
  limit = 80,
): Promise<UsptoPatent[] | null> {
  const key = process.env.USPTO_API_KEY;
  const lastName = lastNameForSearch(fullName);
  if (!key || !lastName) return null;
  try {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        q: `applicationMetaData.inventorBag.inventorNameText:"${lastName.replace(/"/g, "")}"`,
        pagination: { limit },
      }),
    });
    if (!res.ok) return res.status === 404 ? [] : null; // 404 = no matching records
    const j = (await res.json()) as { patentFileWrapperDataBag?: Wrapper[] };
    return (j.patentFileWrapperDataBag ?? []).map((w) => {
      const m = w.applicationMetaData ?? {};
      return {
        title: m.inventionTitle ?? null,
        inventors: (m.inventorBag ?? []).map((i) => i?.inventorNameText ?? "").filter(Boolean),
        applicant: (m.applicantBag ?? [])[0]?.applicantNameText ?? null,
        granted: (m.applicationStatusDescriptionText ?? "").toLowerCase().includes("patented"),
        filingDate: m.filingDate ?? null,
      };
    });
  } catch {
    return null;
  }
}
