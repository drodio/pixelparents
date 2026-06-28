## Progress Update as of 2026-06-10 (Pacific)
*(Most recent updates at top)*

### Summary of changes since last update
Fixed re-score wiping a profile's Industries. `reEvaluate` replaced `canonical_industries` with the fresh run's output; since the LLM `industries` field is optional and varies run-to-run, a re-score that inferred none blanked the badges (this is what happened on /drodio). Now preserved when the fresh set is empty — same preserve-on-empty rule already used for founder/investor status.

### Detail of changes made:
- `src/lib/eval-pipeline.ts` (`reEvaluate`): pull `canonicalIndustries` out of the write fields and only include it in the UPDATE when non-empty.

### Potential concerns to address:
- This PREVENTS future loss but does not retroactively restore an already-blanked profile. /drodio's industries need a re-score that infers them (or a manual seed from his companies' Crunchbase sectors: AI/ML, Enterprise Software, Mobile Apps).
