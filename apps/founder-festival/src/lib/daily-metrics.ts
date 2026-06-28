// Gathers the daily site-health snapshot from PostHog: ~15 metrics for the
// reporting day (the most recent COMPLETE day, in Pacific) plus the prior day
// and a trailing 7-day average for context. The cron at /api/cron/daily-metrics
// renders this into the morning email to drodio@festival.so.
//
// Day boundaries are Pacific (America/Los_Angeles) so "yesterday" matches how a
// person reading the email at 8am thinks about it. PostHog stores UTC; every
// query buckets with toTimeZone(...) and we pick days by their Pacific date
// string. The query runner is injected so the pure shaping/delta logic is unit
// testable without hitting the network (see tests/lib/daily-metrics.test.ts).

import { phQuery, type HogQLRow } from "./posthog-query";

const TZ = "America/Los_Angeles";
const DAY_MS = 86_400_000;

// ---------- pure helpers (exported for tests) ----------

/** YYYY-MM-DD for the given instant, in Pacific. en-CA formats as YYYY-MM-DD. */
export function laDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** "Mon Jun 9" style label for the given instant, in Pacific. */
export function laLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(d);
}

/** Build a {dateString -> number} map from a [day, value] series. */
export function seriesToMap(rows: HogQLRow[], valueIdx = 1): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const day = String(r[0]);
    const v = Number(r[valueIdx] ?? 0);
    m.set(day, Number.isFinite(v) ? v : 0);
  }
  return m;
}

export function pick(map: Map<string, number>, day: string): number {
  return map.get(day) ?? 0;
}

/** Mean of the values at the given days that actually have data (0 if none). */
export function meanAt(map: Map<string, number>, days: string[]): number {
  const present = days.map((d) => map.get(d)).filter((v): v is number => v != null);
  if (present.length === 0) return 0;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

/** Percent change curr vs prev. null when prev is 0 (can't divide). */
export function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

export type Fmt = "int" | "pct" | "ratio" | "duration" | "ms";

export function formatValue(v: number, fmt: Fmt): string {
  switch (fmt) {
    case "int":
      return Math.round(v).toLocaleString("en-US");
    case "pct":
      return `${v.toFixed(1)}%`;
    case "ratio":
      return v.toFixed(1);
    case "ms":
      return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`;
    case "duration": {
      const s = Math.round(v);
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
    }
  }
}

// Whether "up" is good or bad colors the delta. Errors/bounce/rageclicks rising
// is bad; visitors rising is good. LCP (load time) rising is bad.
export type Direction = "up-good" | "up-bad";

export type DeltaBadge = {
  text: string; // e.g. "▲ 29%" or "—"
  positive: boolean | null; // true=green, false=red, null=neutral
};

export function deltaBadge(
  curr: number,
  prev: number,
  direction: Direction,
): DeltaBadge {
  const pct = pctDelta(curr, prev);
  if (pct === null || Math.abs(pct) < 0.5) {
    return { text: prev === 0 && curr > 0 ? "new" : "—", positive: null };
  }
  const up = pct > 0;
  const arrow = up ? "▲" : "▼";
  const good = direction === "up-good" ? up : !up;
  return { text: `${arrow} ${Math.abs(pct).toFixed(0)}%`, positive: good };
}

export function lcpRating(ms: number): "good" | "needs work" | "poor" {
  if (ms <= 2500) return "good";
  if (ms <= 4000) return "needs work";
  return "poor";
}

// ---------- metric model ----------

export type HeadlineMetric = {
  key: string;
  label: string;
  value: number;
  prev: number;
  avg7: number;
  fmt: Fmt;
  direction: Direction;
};

export type Breakdown = {
  key: string;
  label: string;
  rows: { name: string; value: number }[];
};

export type DailyMetrics = {
  reportDay: string; // YYYY-MM-DD (Pacific)
  reportLabel: string; // "Mon Jun 9"
  prevDay: string;
  headline: HeadlineMetric[];
  breakdowns: Breakdown[];
};

// ---------- internal-usage exclusion ----------
// Drop our own / test-account traffic so the digest reflects real visitors.
// Configurable via METRICS_EXCLUDE_EMAILS (comma-separated); defaults to the
// owner's identified PostHog email.
//
// We resolve the emails to their PostHog person_id(s) and exclude EVERY event
// from those persons — not just the events whose email property is set at query
// time. This matters because some of a signed-in user's pageviews are captured
// before the identify-merge resolves an email (null email at query time); an
// email-only filter would let those slip through and keep inflating volume. The
// person_id is stable post-merge, so the id-based filter removes them all.
// Truly anonymous visitors (no matching person) are always kept.

const DEFAULT_EXCLUDE = "drodio@gmail.com";

/** Parse the exclude list into clean, lowercased emails (quote-stripped). */
export function excludeEmails(
  raw: string | undefined = process.env.METRICS_EXCLUDE_EMAILS,
): string[] {
  const src = raw ?? DEFAULT_EXCLUDE;
  return src
    .split(",")
    .map((e) => e.trim().toLowerCase().replace(/['"]/g, ""))
    .filter((e) => e.includes("@"));
}

/**
 * A `where`-clause fragment (leading " and …") that excludes every event from
 * the persons behind the configured internal emails, or "" when the list is
 * empty. Lowercased compare so person-property casing can't let usage through.
 */
export function exclusionClause(emails: string[] = excludeEmails()): string {
  if (emails.length === 0) return "";
  const list = emails.map((e) => `'${e}'`).join(", ");
  return ` and person_id not in (select distinct person_id from events where lower(coalesce(person.properties.email, '')) in (${list}) and timestamp > now() - interval 90 day)`;
}

// ---------- queries ----------
// Series queries return [day, ...values] bucketed by Pacific day over a 12-day
// window (enough for a trailing 7-day average ending on the report day).
// `x` is the internal-usage exclusion fragment (see exclusionClause).

function headlineQueries(x: string) {
  return {
    head: `select toDate(toTimeZone(timestamp, '${TZ}')) as d,
  countIf(event = '$pageview') as pageviews,
  count(distinct if(event = '$pageview', person_id, null)) as visitors,
  count(distinct if(event = '$pageview', properties.$session_id, null)) as sessions,
  countIf(event = '$exception') as errors,
  countIf(event = '$rageclick') as rageclicks
from events
where timestamp > now() - interval 12 day${x}
group by d order by d`,

    neu: `select formatDateTime(toTimeZone(f, '${TZ}'), '%Y-%m-%d') as d, count() as n
from (
  select person_id, min(timestamp) as f
  from events
  where event = '$pageview' and timestamp > now() - interval 100 day${x}
  group by person_id
)
group by d order by d desc limit 14`,

    ids: `select toDate(toTimeZone(timestamp, '${TZ}')) as d, count(distinct person_id) as v
from events
where event = '$identify' and timestamp > now() - interval 12 day${x}
group by d order by d`,

    bounce: `select d, countIf(pv = 1) as singles, count() as total
from (
  select toDate(toTimeZone(timestamp, '${TZ}')) as d, properties.$session_id as s,
    countIf(event = '$pageview') as pv
  from events
  where timestamp > now() - interval 12 day and properties.$session_id is not null${x}
  group by d, s having pv > 0
)
group by d order by d`,

    dur: `select d, round(avg(dur)) as avg_dur
from (
  select toDate(toTimeZone(timestamp, '${TZ}')) as d, properties.$session_id as s,
    dateDiff('second', min(timestamp), max(timestamp)) as dur
  from events
  where timestamp > now() - interval 12 day and properties.$session_id is not null${x}
  group by d, s having dur > 0
)
group by d order by d`,

    lcp: `select toDate(toTimeZone(timestamp, '${TZ}')) as d,
  round(avg(toFloat(properties.$web_vitals_LCP_value))) as lcp
from events
where event = '$web_vitals' and properties.$web_vitals_LCP_value is not null
  and timestamp > now() - interval 12 day${x}
group by d order by d`,
  };
}

// Breakdown queries are scoped to the single report day. The day string is our
// own computed YYYY-MM-DD (validated by laDate), not user input. `x` is the
// internal-usage exclusion fragment.
function breakdownQueries(day: string, x: string) {
  const onDay = `event = '$pageview' and toDate(toTimeZone(timestamp, '${TZ}')) = '${day}'${x}`;
  return {
    pages: `select properties.$pathname as name, count() as c from events where ${onDay} group by name order by c desc limit 7`,
    referrers: `select properties.$referring_domain as name, count() as c from events where ${onDay} group by name order by c desc limit 6`,
    countries: `select properties.$geoip_country_name as name, count(distinct person_id) as c from events where ${onDay} group by name order by c desc limit 6`,
    devices: `select properties.$device_type as name, count(distinct person_id) as c from events where ${onDay} group by name order by c desc limit 5`,
    browsers: `select properties.$browser as name, count(distinct person_id) as c from events where ${onDay} group by name order by c desc limit 5`,
  };
}

function toBreakdownRows(rows: HogQLRow[]): { name: string; value: number }[] {
  return rows.map((r) => ({
    name: r[0] == null || r[0] === "" ? "(none)" : String(r[0]),
    value: Number(r[1] ?? 0),
  }));
}

// ---------- gather ----------

export type QueryRunner = (hogql: string) => Promise<HogQLRow[]>;

export async function gatherDailyMetrics(
  run: QueryRunner = phQuery,
  now: Date = new Date(),
): Promise<DailyMetrics> {
  const reportDate = new Date(now.getTime() - DAY_MS);
  const prevDate = new Date(now.getTime() - 2 * DAY_MS);
  const reportDay = laDate(reportDate);
  const prevDay = laDate(prevDate);
  // Trailing 7 Pacific days ending on the report day (inclusive).
  const last7 = Array.from({ length: 7 }, (_, i) =>
    laDate(new Date(reportDate.getTime() - i * DAY_MS)),
  );

  const x = exclusionClause();
  const q = headlineQueries(x);
  const bq = breakdownQueries(reportDay, x);
  const [head, neu, ids, bounce, dur, lcp, pages, refs, countries, devices, browsers] =
    await Promise.all([
      run(q.head),
      run(q.neu),
      run(q.ids),
      run(q.bounce),
      run(q.dur),
      run(q.lcp),
      run(bq.pages),
      run(bq.referrers),
      run(bq.countries),
      run(bq.devices),
      run(bq.browsers),
    ]);

  // Headline series → per-metric day maps.
  const pageviews = seriesToMap(head, 1);
  const visitors = seriesToMap(head, 2);
  const sessions = seriesToMap(head, 3);
  const errors = seriesToMap(head, 4);
  const rageclicks = seriesToMap(head, 5);
  const newVisitors = seriesToMap(neu, 1);
  const identified = seriesToMap(ids, 1);
  const avgDur = seriesToMap(dur, 1);
  const lcpMs = seriesToMap(lcp, 1);

  // Derived per-day series (computed from base maps, so deltas stay consistent).
  const bounceSingles = seriesToMap(bounce, 1);
  const bounceTotal = seriesToMap(bounce, 2);
  const bounceRate = new Map<string, number>();
  for (const [day, total] of bounceTotal)
    bounceRate.set(day, total > 0 ? (pick(bounceSingles, day) / total) * 100 : 0);

  const pagesPerSession = new Map<string, number>();
  for (const [day, s] of sessions)
    pagesPerSession.set(day, s > 0 ? pick(pageviews, day) / s : 0);

  const metric = (
    key: string,
    label: string,
    map: Map<string, number>,
    fmt: Fmt,
    direction: Direction,
  ): HeadlineMetric => ({
    key,
    label,
    value: pick(map, reportDay),
    prev: pick(map, prevDay),
    avg7: meanAt(map, last7),
    fmt,
    direction,
  });

  const headline: HeadlineMetric[] = [
    metric("visitors", "Unique visitors", visitors, "int", "up-good"),
    metric("pageviews", "Pageviews", pageviews, "int", "up-good"),
    metric("sessions", "Sessions", sessions, "int", "up-good"),
    metric("newVisitors", "New visitors", newVisitors, "int", "up-good"),
    metric("identified", "Signed-in / identified", identified, "int", "up-good"),
    metric("pagesPerSession", "Pages / session", pagesPerSession, "ratio", "up-good"),
    metric("bounceRate", "Bounce rate", bounceRate, "pct", "up-bad"),
    metric("avgDur", "Avg session length", avgDur, "duration", "up-good"),
    metric("lcp", "Avg LCP (load)", lcpMs, "ms", "up-bad"),
    metric("errors", "Errors", errors, "int", "up-bad"),
    metric("rageclicks", "Rage clicks", rageclicks, "int", "up-bad"),
  ];

  const breakdowns: Breakdown[] = [
    { key: "pages", label: "Top pages", rows: toBreakdownRows(pages) },
    { key: "referrers", label: "Top referrers", rows: toBreakdownRows(refs) },
    { key: "countries", label: "Top countries", rows: toBreakdownRows(countries) },
    { key: "devices", label: "Devices", rows: toBreakdownRows(devices) },
    { key: "browsers", label: "Browsers", rows: toBreakdownRows(browsers) },
  ];

  return {
    reportDay,
    reportLabel: laLabel(reportDate),
    prevDay,
    headline,
    breakdowns,
  };
}
