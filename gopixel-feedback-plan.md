# GoPixel feedback backlog (Ava doc + Aug 14 walkthroughs)

Sources: "Go Pixel Changes" doc (Ava Notes / Ava Changes / Sofia Changes / To-Do's)
+ two Aug 14 Chief walkthroughs (student onboarding, parent platform run-through).

## A. Bugs
- [ ] A1 Events: "Open event" appears to do nothing on some entries
- [ ] A2 Student signup asks for PARENT info before the student's own info
- [ ] A3 Alum signup does the same, and shouldn't mention parents at all
- [ ] A4 Family shows duplicate accounts (self listed as an existing parent; mom twice)
- [ ] A5 Link approval status stale: one side says pending, other says approved
- [ ] A6 Sign-in "couldn't find your account" for an account already family-linked
- [x] A7 OHS in-person/online tags wrong (PTC, Back to School Night) — fixed earlier
- [x] A8 Family visibility panel shows parent-only fields to students (#206)
- [ ] A9 Parent profile shows interests she never entered (TypeScript, Java, GitHub)

## B. Copy / small UI
- [x] B1 Signup: drop "this tailors the next step to you"; merge the two role boxes (already done)
- [x] B2 LinkedIn: "this really helps other parents" -> "this helps other parents" (already done)
- [x] B3 Family link request should show the full name ("Ava Yu") (#205)
- [ ] B4 Sidebar order: Community, Resources, Events, Directory, Family, Developers

## C. UX
- [ ] C1 Collapse detailed filters behind "More filters" (Community, Directory)
- [ ] C2 Bigger asks/offers/filter buttons on small screens
- [ ] C3 Upvote and "I'd join this too" should stand out from the filters
- [x] C4 Phone: international numbers + country detection/formatting (#207)
- [ ] C5 Encourage a profile picture (consider making one image required)

## D. Features
- [ ] D1 Daily digest: relevant posts/resources/events from the last 3-4 days
- [ ] D2 Site-wide search (events, resources, people) for untagged content
- [ ] D3 Event tags + "who it's for" filter
- [ ] D4 Attach a resource board to a community answer
- [ ] D5 Post audience targeting + visibility (parents->students only, students->exclude parents)
- [ ] D6 Event organiser contact / link to their profile
- [ ] D7 Directory relevance ranking (surface aligned profiles first)
- [ ] D8 Certification badges (regional director, original poster, certified group chat)
- [ ] D9 Notes on calendar/holiday entries ("details to come")
- [ ] D10 Surface posts by profile interests even when filter wording differs
- [ ] D11 Closed offers: "I'm still interested" that notifies the poster
- [ ] D12 Landing page explaining the purpose + a creators page (Sofia); less word-dense
- [ ] D13 Explain "hot" vs "top" sorting

## E. Needs Ansh's call
- [ ] E1 LIGHT MODE. Ava reports parents literally can't read the dark UI. Ansh
      previously said "no light mode". Conflict — needs an explicit decision.
- [ ] E2 Recolour to match OHS branding
- [ ] E3 Instagram/TikTok links on profiles

## Verified-already-done (checked against current code, Aug 15)
- Merged "Who's signing up?" role box (single question, sr-only legend)
- LinkedIn helper copy
- OHS in-person/online classification incl. PTC and Back to School Night
- WeChat ID field with its own share toggle, separate from phone

## Next up (highest value first)
1. A5/A6 — link approval status looks stale across accounts, and sign-in says
   "couldn't find your account" for an already-linked account. Same walkthrough,
   likely the same root cause. Needs reproduction against real data.
2. C1 — "More filters" collapse on Community + Directory. Asked for three times
   across the doc and both walkthroughs; the single most-repeated request.
3. D5 — post audience targeting and visibility (parents->students only,
   students->exclude parents). Biggest feature ask from the parent run-through.
4. A9 — parent profile showing interests she never entered. Likely the
   enrichment engine writing without consent; worth treating as a privacy bug.
5. D12 — Sofia's landing page + creators page, less word-dense.
