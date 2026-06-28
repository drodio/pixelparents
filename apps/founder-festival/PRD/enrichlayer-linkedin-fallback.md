## Progress Update as of 2026-06-08 Pacific

### Summary
EnrichLayer (formerly Proxycurl) LinkedIn fallback. Fixes the "not enough
information" class: LinkedIn blocks Exa's content fetch for niche/investor profiles
→ low signal. EnrichLayer (structured LinkedIn API) fires only when Exa returns 0
chars. DROdio added ENRICHLAYER_API_KEY (verified on Bill Gates).

### Detail
- `src/lib/enrichlayer.ts` (NEW) — fetchEnrichLayerProfileText + pure buildProfileText
  (name/headline/experiences/education/honors/followers). 404s on private profiles.
- `src/lib/exa.ts` — researchLinkedinProfile falls back to EnrichLayer when
  page.text is empty; enrichLayerUsed flag in grounding.
- `tests/lib/enrichlayer.test.ts` (3). Live-verified.

### Notes
- Cost ~$0.10/call, fires only on empty-Exa profiles. NOT cost-tracked in pricing yet.
- Can't rescue PRIVATE profiles (e.g. pjlconsulting — her public visibility is off;
  no public API can read it). Those need claim/admin-entry.

### Note (resolution)
Resolved a changelog merge conflict on commit — kept both the EnrichLayer and the
concurrent GitHub-identity entries (newest on top).
