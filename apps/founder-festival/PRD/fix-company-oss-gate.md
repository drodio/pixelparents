## Progress Update as of 2026-06-05 10:15 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fix: a non-technical designer/CEO of a consumer-marketplace company scored 100th-percentile
Technical Depth from a single +129 row — "Founded the company behind
a flagship OSS repo (148k★)" — i.e. the v0.0.8 company-flagship OSS bonus, which
fired for ANY founder regardless of personal technical involvement. Gated it on
the founder being personally technical.

### Detail of changes made:
- `scoring.ts`: new `technicalFounder` boolean field + prompt — is the INDIVIDUAL
  an engineer/technical builder vs a business/design/ops founder of a technical
  company? Founding a technical company does NOT make someone technical. Tolerant
  (.nullable().catch(null)).
- `eval-pipeline.ts`: `addCompanyGithubBonus` now returns early unless
  `scoring.technicalFounder === true`. A framework-creating technical founder and
  a payments-company founder who wrote the early code keep the bonus; the
  marketplace founder does not.
- Doc → v0.0.10 + the company-OSS bonus section notes the gate. tsc clean; 39 tests pass.

### Potential concerns to address:
- Takes effect on RESCORE (technicalFounder is an LLM field; existing rows lack it
  until rescored). Default when null/false → bonus skipped (conservative).
