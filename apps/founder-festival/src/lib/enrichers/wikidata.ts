import type { EnricherContext, EnrichmentResult } from "./types";
import { nameOverlaps } from "./identity";

// Wikidata — free, no auth required.
// Strategy: resolve a known wikidata.org/wiki/Q... URL (highest trust) OR
// search by full name with a precision gate (P31=Q5 human + relevance desc).
// Returns structured facts: occupation, employer, education, awards.

const UA = "founder-festival-eval/1.0 (https://festival.so)";
const API = "https://www.wikidata.org/w/api.php";

// Wikidata property IDs we care about.
const P_INSTANCE_OF = "P31";
const P_OCCUPATION = "P106";
const P_EMPLOYER = "P108";
const P_OWNER_OF = "P1830";
const P_EDUCATED_AT = "P69";
const P_AWARD = "P166";
const Q_HUMAN = "Q5";

const RELEVANT_DESC =
  /founder|co-?founder|ceo|investor|entrepreneur|executive|businessperson|programmer|computer scientist/i;

type WbSearchEntity = { id: string; label: string; description?: string };
type WbSearchResp = { search: WbSearchEntity[] };
type WbClaim = { mainsnak: { snaktype: string; datavalue?: { value: { id?: string } | string } } };
type WbEntity = {
  id: string;
  labels?: { en?: { value: string } };
  descriptions?: { en?: { value: string } };
  claims?: Record<string, WbClaim[]>;
};
type WbEntitiesResp = { entities: Record<string, WbEntity> };

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Extract Qid from a wikidata URL like https://www.wikidata.org/wiki/Q12345
function qidFromUrl(url: string): string | null {
  const m = url.match(/wikidata\.org\/(?:wiki|entity)\/(Q\d+)/i);
  return m ? m[1]! : null;
}

// Pull the Qid values out of a set of claims for a given property.
function claimQids(entity: WbEntity, prop: string): string[] {
  const claims = entity.claims?.[prop] ?? [];
  const ids: string[] = [];
  for (const c of claims) {
    const val = c.mainsnak.datavalue?.value;
    if (val && typeof val === "object" && val.id) ids.push(val.id);
  }
  return ids;
}

// Resolve a batch of Qids → English labels. Returns a map Qid → label.
async function resolveLabels(qids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (qids.length === 0) return map;
  // Batch up to 50 per request (Wikidata limit is generous; we cap at 50).
  const batch = qids.slice(0, 50);
  const resp = await fetchJson<WbEntitiesResp>(
    `${API}?action=wbgetentities&ids=${encodeURIComponent(batch.join("|"))}&props=labels&languages=en&format=json&origin=*`,
  );
  if (!resp?.entities) return map;
  for (const [qid, ent] of Object.entries(resp.entities)) {
    const label = ent.labels?.en?.value;
    if (label) map.set(qid, label);
  }
  return map;
}

// Fetch a single Wikidata entity by Qid.
async function fetchEntity(qid: string): Promise<WbEntity | null> {
  const resp = await fetchJson<WbEntitiesResp>(
    `${API}?action=wbgetentities&ids=${encodeURIComponent(qid)}&format=json&props=claims|labels|descriptions&languages=en&origin=*`,
  );
  return resp?.entities?.[qid] ?? null;
}

export async function enrichWithWikidata(
  ctx: EnricherContext,
  knownWikidataUrls: string[],
): Promise<EnrichmentResult> {
  const empty: EnrichmentResult = { source: "wikidata", facts: [], citations: [] };
  if (!ctx.fullName) return empty;

  let qid: string | null = null;
  let description: string | undefined;

  // 1. Highest trust: a Wikidata URL already linked to the subject.
  for (const url of knownWikidataUrls) {
    const q = qidFromUrl(url);
    if (q) {
      qid = q;
      break;
    }
  }

  // 2. Fallback: name search with precision gate.
  if (!qid) {
    const search = await fetchJson<WbSearchResp>(
      `${API}?action=wbsearchentities&search=${encodeURIComponent(ctx.fullName)}&language=en&type=item&format=json&origin=*`,
    );
    for (const candidate of search?.search ?? []) {
      // Name must overlap.
      if (!nameOverlaps(ctx.fullName, candidate.label)) continue;
      // Description must look like a tech/business person.
      if (!candidate.description || !RELEVANT_DESC.test(candidate.description)) continue;
      // Will confirm P31=Q5 after fetching the entity; tentatively pick first match.
      qid = candidate.id;
      description = candidate.description;
      break;
    }
  }

  if (!qid) return empty;

  const entity = await fetchEntity(qid);
  if (!entity) return empty;

  // Confirm it's a human (P31 = Q5). If we came from a known URL skip this gate
  // (the URL is already trusted); for name-search always check.
  const isFromKnownUrl = knownWikidataUrls.some((u) => qidFromUrl(u) === qid);
  if (!isFromKnownUrl) {
    const instanceQids = claimQids(entity, P_INSTANCE_OF);
    if (!instanceQids.includes(Q_HUMAN)) return empty;
  }

  const entityDescription = entity.descriptions?.en?.value ?? description ?? "";
  const entityLabel = entity.labels?.en?.value ?? ctx.fullName;
  const entityUrl = `https://www.wikidata.org/wiki/${qid}`;

  // Collect all Qids we need to resolve into labels.
  const occupationQids = claimQids(entity, P_OCCUPATION).slice(0, 5);
  const employerQids = claimQids(entity, P_EMPLOYER).slice(0, 5);
  const ownerOfQids = claimQids(entity, P_OWNER_OF).slice(0, 5);
  const educationQids = claimQids(entity, P_EDUCATED_AT).slice(0, 5);
  const awardQids = claimQids(entity, P_AWARD).slice(0, 5);

  const allQids = [
    ...occupationQids,
    ...employerQids,
    ...ownerOfQids,
    ...educationQids,
    ...awardQids,
  ];

  const labels = await resolveLabels([...new Set(allQids)]);

  const toLabels = (qids: string[]): string[] =>
    qids.map((q) => labels.get(q) ?? q).filter(Boolean);

  const occupations = toLabels(occupationQids);
  const employers = toLabels(employerQids);
  const ownerOf = toLabels(ownerOfQids);
  const education = toLabels(educationQids);
  const awards = toLabels(awardQids);

  // Build human-readable fact bullets.
  const facts: string[] = [];
  facts.push(
    `Wikidata entity exists (${qid}) — notability signal. Described as: ${entityDescription || entityLabel}.`,
  );
  if (occupations.length > 0) {
    facts.push(`Occupations: ${occupations.join(", ")}.`);
  }
  if (employers.length > 0 || ownerOf.length > 0) {
    const combined = [...new Set([...employers, ...ownerOf])];
    facts.push(`Employer / owner of: ${combined.join(", ")}.`);
  }
  if (education.length > 0) {
    facts.push(`Education: ${education.join(", ")}.`);
  }
  if (awards.length > 0) {
    facts.push(`Awards: ${awards.join(", ")}.`);
  }

  return {
    source: "wikidata",
    facts,
    citations: [entityUrl],
    raw: {
      qid,
      description: entityDescription,
      occupations,
      employers,
      owner_of: ownerOf,
      education,
      awards,
    },
  };
}
