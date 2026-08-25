# feat/student-flow-order

Round 5 (Aug 24 doc), PR B of three. Stacked on feat/invited-landing (PR A) —
merge that first.

## Progress Update as of [August 24, 2026 — midday Pacific]

### Summary of changes since last update

First entry. A self-signup student's flow now ends on linking their parent —
after their own profile is complete — with the panel updating live while they
wait; the refer-a-family step is parents-only; and phone becomes optional for
students (required for parents, enforced on the role-aware side of BOTH
validators).

### Detail of changes made:

- **Step order (builder + tests):** self-signup student = verify → city →
  socials → interests → photos → share → **parent-link LAST** (round 5:
  "link their account to their parents as the very last step"). The
  refer-a-family "invite" step is filtered out for students entirely. Invited
  students end at share (no parent-link, no invite) — pinned by test.
- **Live status (round 5: "update in real time accordingly"):**
  StudentParentForm polls getStudentParentLinkStatus every 5s while no parent
  is linked; the family panel flips to "X is linked" the moment the parent
  approves or joins, no refresh. Poll stops once linked; a bad read never
  downgrades state. Waiting copy says the panel updates by itself.
- **Phone optional for students:** the shared signupSchema no longer enforces
  phone (it is role-blind); the requirement moved to completeSignup's
  role-aware checks (parents required, students not). The legacy no-JS path is
  parent-shaped, so phone stays required there via an explicit check — and its
  error-merge was restructured so a parse failure and the phone check report
  together (TS narrowing kept intact). The signup form's label reads
  "(optional)" for students. BOTH validators were touched deliberately — the
  repo's known trap is them disagreeing.

### Verification run

- typecheck / lint / test / build all exit 0 per-stage via pipestatus; counts
  1062 tests (builder order tests updated in place for the new flows).

### Potential concerns to address:

- Polling is 5s of extra load per waiting student — bounded (stops when
  linked, page navigation clears it) and trivial at current scale.
- The Finish gate in StudentParentForm still requires linked-or-invited; with
  parent-link now last AND skippable, a student can Skip past it to the wizard
  Finish without inviting anyone — the platform's verification/approval gates
  remain the real enforcement. If product wants a hard gate at the step, make
  it non-skippable (one flag).
- Students who already completed signup with a phone keep it; nothing clears.
