// Smart cleanup of the DEFERRED duplicate profiles: same-person pairs (shared
// email) where BOTH twins were name-resolved, so neither LinkedIn is human-
// verified. For each pair we gather everything we know (handle, scored company/
// identity, the shared email's domain, data richness, claim status) and ask an
// LLM judge which LinkedIn is genuinely this person's — deleting the wrong/thin
// twin ONLY when confidence is high. Lower-confidence pairs are left for review.
//
//   npx tsx scripts/dedupe-cleanup.ts --target=prod            # DRY-RUN (plan only)
//   npx tsx scripts/dedupe-cleanup.ts --target=prod --execute  # delete high-confidence twins
import { readFileSync } from "node:fs";

const target = (process.argv.find((a) => a.startsWith("--target="))?.split("=")[1] ?? "dev") as "dev" | "prod";
const EXECUTE = process.argv.includes("--execute");
if (!process.env.DATABASE_URL) {
  const file = target === "prod" ? "/Users/drodio/Projects/founder-festival/.env.prod.local" : "/Users/drodio/Projects/founder-festival/.env.local";
  const env = readFileSync(file, "utf8");
  const pick = (k: string) => { const m = env.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : ""; };
  process.env.DATABASE_URL = pick("DATABASE_URL") || pick("POSTGRES_URL_NON_POOLING") || pick("POSTGRES_URL");
  for (const line of env.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) { const v = m[2].trim().replace(/^["']|["']$/g, ""); if (v && !process.env[m[1]]) process.env[m[1]] = v; } }
}

const FREE = /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|mac|proton|protonmail|aol|gmx|hey|qq|163|126)\.|privaterelay\.appleid\.com/i;
const emailRe = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

type Row = {
  id: string; slug: string; slug_kind: string; full_name: string | null; linkedin_url: string;
  score: number; founder_score: number; investor_score: number; claimed: number; url_sourced: boolean;
  identity: Record<string, unknown> | null; inputs: string | null;
  freasons: string[] | null; ireasons: string[] | null;
  _f?: string; _l?: string; _emails?: Set<string>;
};

async function main() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  const { deleteEvaluationsCascade } = await import("@/lib/profile-delete-cascade");
  const { nameTokens } = await import("@/lib/name-match");
  const { generateText } = await import("ai");

  console.error(`target=${target} host=${new URL(process.env.DATABASE_URL!).host.split(".")[0]}  execute=${EXECUTE}`);

  const res = await db.execute(sql`
    select e.id, e.slug, e.slug_kind, e.full_name, e.linkedin_url, e.score, e.founder_score, e.investor_score,
      e.profile->'identity' as identity,
      (select count(*)::int from users u where u.evaluation_id=e.id) as claimed,
      coalesce((select bool_or(ji.input_raw ilike 'http%') from scoring_job_items ji where ji.evaluation_id=e.id), false) as url_sourced,
      (select string_agg(distinct lower(coalesce(ji.input_email,'')||' '||coalesce(ji.input_name,'')||' '||coalesce(ji.input_raw,'')),' ')
         from scoring_job_items ji where ji.evaluation_id=e.id) as inputs,
      (select jsonb_agg(t.reason) from (select reason from jsonb_to_recordset(coalesce(e.breakdown->'founder','[]'::jsonb)) as r(reason text) limit 3) t) as freasons,
      (select jsonb_agg(t.reason) from (select reason from jsonb_to_recordset(coalesce(e.breakdown->'investor','[]'::jsonb)) as r(reason text) limit 2) t) as ireasons
    from evaluations e`);
  const rows = (Array.isArray(res) ? res : (res as unknown as { rows: Row[] }).rows) as Row[];

  const firstMatch = (a: string, b: string) => a === b || (a.length >= 3 && b.startsWith(a)) || (b.length >= 3 && a.startsWith(b));
  const evals: Row[] = [];
  for (const r of rows) {
    const t = nameTokens(r.full_name ?? "");
    if (!t.length) continue;
    r._f = t[0]; r._l = t[t.length - 1];
    r._emails = new Set([...(r.inputs ?? "").matchAll(emailRe)].map((m) => m[0].toLowerCase()));
    evals.push(r);
  }
  // Same name-cluster → shared-full-email subclusters → DEFERRED = no url-sourced/claimed member.
  const byLast = new Map<string, Row[]>();
  for (const e of evals) (byLast.get(e._l!) ?? byLast.set(e._l!, []).get(e._l!)!).push(e);
  const deferred: Row[][] = [];
  for (const [, list] of byLast) {
    const used = new Array(list.length).fill(false);
    for (let i = 0; i < list.length; i++) {
      if (used[i]) continue;
      const g = [list[i]!]; used[i] = true;
      for (let j = i + 1; j < list.length; j++) if (!used[j] && firstMatch(list[i]!._f!, list[j]!._f!)) { g.push(list[j]!); used[j] = true; }
      if (g.length < 2) continue;
      const sub: Row[][] = [];
      for (const m of g) { let placed = false; for (const s of sub) if (s.some((x) => [...x._emails!].some((e) => m._emails!.has(e)))) { s.push(m); placed = true; break; } if (!placed) sub.push([m]); }
      for (const s of sub) {
        if (s.length < 2 || new Set(s.map((x) => x.linkedin_url)).size < 2) continue;
        if (s.some((x) => x.url_sourced || x.claimed > 0)) continue; // those were auto-handled
        deferred.push(s);
      }
    }
  }
  console.error(`deferred groups: ${deferred.length}`);

  const handle = (u: string) => (u.match(/in\/([^/?#]+)/i)?.[1] ?? "").toLowerCase();
  const sharedDomains = (g: Row[]) => {
    const d = new Set<string>();
    for (const m of g) for (const e of m._emails!) { const at = e.split("@")[1]; if (at && !FREE.test("@" + at)) d.add(at.split(".")[0]!); }
    return [...d];
  };
  const describe = (m: Row) => {
    const id = (m.identity ?? {}) as Record<string, any>;
    const parts = [
      `slug=${m.slug}`, `handle=${handle(m.linkedin_url)}`, `score=${m.score}(F${m.founder_score}/I${m.investor_score})`,
      id.companyName ? `company=${id.companyName}` : "", id.websiteUrl ? `site=${id.websiteUrl}` : "",
      id.jobTitle ? `title=${id.jobTitle}` : "", id.ycBatch ? `yc=${id.ycBatch}` : "",
      id.github?.username ? `github=${id.github.username}` : "",
      (m.freasons ?? []).length ? `founderFacts=[${(m.freasons ?? []).join(" | ")}]` : "",
      (m.ireasons ?? []).length ? `investorFacts=[${(m.ireasons ?? []).join(" | ")}]` : "",
    ].filter(Boolean);
    return parts.join("  ");
  };

  const toDelete: { keep: Row; drop: Row; conf: string; reason: string }[] = [];
  const review: { group: Row[]; conf: string; reason: string }[] = [];

  let n = 0;
  for (const g of deferred) {
    n++;
    const emails = [...new Set(g.flatMap((m) => [...m._emails!]))].join(", ");
    const doms = sharedDomains(g);
    const prompt = `Two (or more) "Founder Festival" profiles below almost certainly belong to the SAME person — they share the email(s): ${emails}. Each was auto-resolved from a name to a LinkedIn handle, and one may be WRONG (resolved to a different same-named person).

Person name: ${g[0]!.full_name}
Shared non-free email domain(s) (these usually name the person's real company): ${doms.join(", ") || "(none — only free email)"}

Candidates (data we scored from each LinkedIn):
${g.map((m, i) => `[${i}] ${describe(m)}`).join("\n")}

Decide which ONE candidate to KEEP and which to DELETE:
- KEEP the candidate whose LinkedIn handle + scored company/role/identity genuinely match this person (e.g. the email domain's company appears in its data, or the handle clearly derives from the name).
- DELETE a candidate that is a wrong resolution to a DIFFERENT person, OR a thinner/older duplicate account of the same person (keep the richer, more complete one).
- If you cannot tell with HIGH confidence which is correct, say confidence "low".

Reply with ONLY a JSON object: {"keep_slug": "...", "delete_slug": "...", "confidence": "high"|"medium"|"low", "reason": "one sentence"}`;

    let verdict: { keep_slug?: string; delete_slug?: string; confidence?: string; reason?: string } = {};
    try {
      const gen = await generateText({ model: "anthropic/claude-sonnet-4-6", temperature: 0, maxOutputTokens: 300, messages: [{ role: "user", content: prompt }] });
      const m = gen.text.match(/\{[\s\S]*\}/);
      if (m) verdict = JSON.parse(m[0]);
    } catch (e) { verdict.reason = `judge error: ${(e as Error).message}`; }

    // Tolerant identification of the keeper (the model sometimes returns a
    // handle-suffixed slug or the handle itself). Once the keeper is known in a
    // 2-way group, the drop is simply the OTHER twin — no need to parse delete_slug.
    const findCand = (v?: string) => {
      if (!v) return undefined;
      const lv = v.toLowerCase();
      return (
        g.find((x) => x.slug.toLowerCase() === lv) ??
        g.find((x) => handle(x.linkedin_url) === lv) ??
        g.find((x) => x.slug.toLowerCase().startsWith(lv) || lv.startsWith(x.slug.toLowerCase()) || lv.includes(handle(x.linkedin_url)))
      );
    };
    const keep = findCand(verdict.keep_slug);
    const drop = keep && g.length === 2 ? g.find((x) => x.id !== keep.id) : undefined;
    const ok = verdict.confidence === "high" && !!keep && !!drop && drop.claimed === 0;
    if (ok) {
      toDelete.push({ keep: keep!, drop: drop!, conf: verdict.confidence!, reason: verdict.reason ?? "" });
      console.log(`[${n}] HIGH  keep /${keep!.slug_kind}/${keep!.slug}  ·  DELETE /${drop!.slug_kind}/${drop!.slug}  — ${verdict.reason}`);
    } else {
      review.push({ group: g, conf: verdict.confidence ?? "?", reason: verdict.reason ?? "" });
      console.log(`[${n}] ${(verdict.confidence ?? "?").toUpperCase().padEnd(6)} REVIEW ${g.map((x) => x.slug).join(" vs ")} — ${verdict.reason ?? "no verdict"}`);
    }
  }

  console.log(`\nSUMMARY: ${toDelete.length} high-confidence deletions; ${review.length} left for review (of ${deferred.length} groups).`);
  if (EXECUTE && toDelete.length) {
    const ids = toDelete.map((d) => d.drop.id);
    console.log(`\nEXECUTING ${ids.length} deletions…`);
    await deleteEvaluationsCascade(ids);
    console.log("Done.");
  } else if (toDelete.length) {
    console.log("\n(DRY-RUN — re-run with --execute to delete the high-confidence twins.)");
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
