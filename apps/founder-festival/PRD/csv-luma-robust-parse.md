# Branch: `csv-luma-robust-parse` — progress log

## Progress Update as of 2026-06-02
*(Most recent updates at top)*

### Summary
A real Luma event-guest CSV failed with "no valid lines in input". Three causes,
all fixed in `src/lib/csv-to-lines.ts`:
1. Non-LinkedIn URL column (Luma `qr_code_url`) was grabbed as the "LinkedIn URL"
   → failed to canonicalize → rows dropped. Now LinkedIn-specific detection
   (`linkedin.com/in/`), ignoring unrelated URLs.
2. Verbose survey headers ("What is your LinkedIn profile?", "What company do you
   work for?", "Work Email Address") weren't recognized. Added a substring
   fallback for linkedin/company/email after exact-token matching.
3. Leading UTF-8 BOM corrupted the first header. `parseCsv` now strips it.
Also: rows capture name + company ALONGSIDE the URL (not either/or) → more data
per person. Real file now parses 117 rows (89 LinkedIn, 117 email, 95 company).

Also (`NewJobForm.tsx`): when input can't be parsed into usable rows, show
"I wasn't able to process that CSV. Please send it to DROdio@Festival.so to
troubleshoot." — DROdio@Festival.so is a mailto (subject "CSV won't process").

tsc + eslint clean; 28 csv-to-lines tests pass.
