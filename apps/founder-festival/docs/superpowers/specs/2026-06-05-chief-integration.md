# Weaving Chief into Founder Festival — capabilities + integration ideas

**Date:** 2026-06-05
**Status:** brainstorm / durable reference (not yet a build plan). Chief is
DROdio's company (chief.bot); he can expose additional API endpoints. Goal: weave
Chief into as much of Founder Festival as possible.
**Source:** `https://dev.chief.bot` + `https://dev.chief.bot/llms.txt` (read
2026-06-05).

## What Chief is (the primitives)
Chief is an **API-driven agent platform**, not just a chatbot. Its building
blocks map almost 1:1 onto Founder Festival's needs:

| Chief primitive | What it does | FF mapping |
|---|---|---|
| **Chats** | Run an agent on a prompt async (kickoff → poll → multi-turn); returns `response` + `prompt` | The scoring/research **engine** |
| **Actions** | Scheduled (cron) or **trigger**-driven prompt runs | Live monitoring / refresh |
| **Skills / Personas** | Pluggable capabilities + voices; scopes `project`/`user`/`system`, categories `skill`/`persona` | The enrichers + the advisor voice |
| **Memories** | Persistent context: `identity`/`fact`/`preference`/`context`/`instruction`, with importance + optional `project` scope | A compounding knowledge graph per founder/investor |
| **Assets + Labels** | 3-step signed-URL upload → ingest (`ingesting`/`ready`/`failed`); labels w/ color/icon | Founder-supplied private docs (deck, resume, thesis) |
| **Sessions** | Transcripts of agent runs (`turns[]`) | Transparency / audit / debugging |

Infra: Personal Access Tokens (project-scoped), stable error codes, cursor
pagination, OpenAPI spec, MCP server (Claude/Cursor/Codex), Go SDK, `chief` CLI.

**Net:** Chief is a memory-having, skill-extensible, schedulable research agent
callable over an API — which is exactly what FF's scoring pipeline hand-rolls
today (Exa + ~16 fixed enrichers + one Opus call in `src/lib/eval-pipeline.ts`).

## Integration ideas (expansive)

1. **Chief as the scoring research engine (the big one).** Replace/augment the
   fixed enricher list with a **Chief chat per profile** ("research + score this
   person against this rubric"). The agent digs *agentically* (follows leads,
   cross-references) instead of running a fixed list — fixing the recall gaps we
   keep hitting (Sam Odio's HN, company-vs-individual technical depth). Each FF
   enricher becomes a Chief **Skill**.

2. **Individual technical depth (the live problem).** Tell a Chief agent to
   isolate *the person, not the company*: find their **own** commits (not the
   org's), their own HN comments' technical substance, their own talks/writing/
   papers, and rate **their personal** technical depth separately from credit for
   founding a technical company. Solves the "founded a famous company ≠
   personally technical" fidelity problem the fixed pipeline can't.

3. **Memories = profiles that compound, not re-research from scratch.** Write
   confirmed facts to Chief Memories; each rescore *adds* to the graph (cheaper,
   faster — helps the eval-timeout — and more accurate). The **claim flow** writes
   founder-verified facts as high-importance memories; disputes update them.

4. **Actions = a live founder-intelligence platform.** Cron action: refresh top-N
   profiles (augment `scoring-tick`). Trigger action: on a raise/exit/launch/post,
   auto-rescore + notify. FF stops being a one-time snapshot.

5. **Recommendations become a real advisor (Chief Persona).** "What you likely
   need" → a Chief persona grounded in the person's memories; better, make it a
   **conversational** "Ask Chief" chat embedded on the profile.

6. **Assets = founders enrich their own profiles privately.** Claimed founder
   uploads deck/resume → Chief ingests → folds private, consented context into the
   score. Investors upload thesis/portfolio.

7. **Industries + interests (the layer being built) sourced by Chief.** The
   canonical-industry taxonomy (`src/lib/industries.ts`) gets *populated* by a
   Chief research pass that derives true industries + interests; feeds the
   leaderboard badges.

8. **Events + Relationship Matrix as agent reasoning.** "Events I qualify for" and
   "Most Like You / Most Complimentary" via Chief reasoning over memories; can
   **proactively** notify + draft warm intros (the "intros" rec → a Chief action).

9. **Transparency via Sessions.** Show the agent's research transcript ("here's how
   we scored you") — a trust feature and a debugging goldmine (would have surfaced
   Sam's HN miss instantly).

## What I'd want Chief to expose (API gaps)
The current Chats API returns text; FF needs:
1. **Schema-constrained / structured output** — return the scoring breakdown as
   validated JSON (FF's `SCORING_SCHEMA`). The #1 unlock for Chief-as-engine.
2. **Per-call skill selection + tool-use visibility** — run a chat with a chosen
   skill set, and report which skills/sources the agent used (for FF citations/
   attribution).
3. **Streaming / progress events + webhooks on completion** — power FF's live
   "waterfall" and avoid polling; async kickoff + webhook also dodges the function
   timeout entirely.
4. **Per-chat cost/usage** — FF tracks scoring cost today.
5. **Memory search by relevance/subject** — fetch memories relevant to a person.
6. Confirm/expose **web research + browsing** as a first-class skill.

## Recommended starting point (lowest-risk, highest-learning)
Route **one** hard signal — the **individual technical-depth research** — through a
Chief chat returning structured JSON, run **in parallel** with the existing
pipeline, compared, not yet trusted (behind a flag). Proves the structured-output
+ skill model, fixes a real gap, de-risks the bigger "Chief as the whole engine"
move. If it works, expand enricher-by-enricher until Chief *is* the research core
and FF is the rubric + product surface.
