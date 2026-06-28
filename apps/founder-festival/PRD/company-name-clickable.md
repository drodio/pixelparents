# Branch: `company-name-clickable` — progress log

Branched from `main` (post PR #38).

## Progress Update as of 2026-05-26 9:35 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
On the leaderboard, the company name next to each person is now a
link to the company's website that opens in a new tab. Falls back to
plain text when no domain is available (e.g. partnerAtFirm-only rows
where the VC firm name was captured but no domain).

### Detail of changes made:
- `src/lib/leaderboard.ts`:
  - New field `companyUrl: string | null` on `LeaderboardRow`.
  - Computed inline: `https://<primaryCompanyDomain>` when the eval's
    profile blob carries a non-empty `primaryCompanyDomain`, null
    otherwise.
- `src/components/LeaderboardTable.tsx`:
  - When `row.companyUrl` is set, the `companyName` renders as
    `<a target="_blank" rel="noopener noreferrer">` with a subtle
    hover underline. Otherwise it renders as plain text.
  - `title` attribute on the link exposes the full URL on hover for
    debugging / visibility.
