// Renders the daily-metrics snapshot into an email {subject, html}. Pure: takes
// a DailyMetrics object, returns strings — no network, no env. Tested in
// tests/lib/daily-metrics-email.test.ts. Inline styles only (email clients
// strip <style> blocks and external CSS).

import {
  formatValue,
  deltaBadge,
  lcpRating,
  type DailyMetrics,
  type HeadlineMetric,
} from "./daily-metrics";

const POSTHOG_DASHBOARD = "https://us.posthog.com/project/0";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function deltaCell(m: HeadlineMetric): string {
  const b = deltaBadge(m.value, m.prev, m.direction);
  const color = b.positive === null ? "#888" : b.positive ? "#1a7f37" : "#cf222e";
  return `<span style="color:${color};font-weight:600;">${b.text}</span>`;
}

function headlineRow(m: HeadlineMetric): string {
  const value = formatValue(m.value, m.fmt);
  const avg = formatValue(m.avg7, m.fmt);
  let label = esc(m.label);
  // Annotate LCP with its Core Web Vitals rating.
  if (m.key === "lcp" && m.value > 0) {
    const r = lcpRating(m.value);
    const rc = r === "good" ? "#1a7f37" : r === "needs work" ? "#9a6700" : "#cf222e";
    label += ` <span style="color:${rc};font-size:11px;">(${r})</span>`;
  }
  return `<tr>
    <td style="padding:7px 10px;border-bottom:1px solid #eee;color:#222;">${label}</td>
    <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:700;font-family:monospace;">${value}</td>
    <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right;">${deltaCell(m)}</td>
    <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right;color:#888;font-family:monospace;">${avg}</td>
  </tr>`;
}

function breakdownTable(label: string, rows: { name: string; value: number }[]): string {
  if (rows.length === 0) return "";
  const body = rows
    .map(
      (r) =>
        `<tr><td style="padding:3px 10px;color:#333;">${esc(r.name)}</td><td style="padding:3px 10px;text-align:right;font-family:monospace;color:#555;">${r.value.toLocaleString("en-US")}</td></tr>`,
    )
    .join("");
  return `<div style="display:inline-block;vertical-align:top;width:48%;min-width:240px;margin:0 1% 16px 0;">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#888;margin-bottom:4px;">${esc(label)}</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fafafa;border-radius:6px;">${body}</table>
  </div>`;
}

export function renderDailyMetricsEmail(m: DailyMetrics): {
  subject: string;
  html: string;
} {
  const visitors = m.headline.find((h) => h.key === "visitors");
  const vBadge = visitors ? deltaBadge(visitors.value, visitors.prev, "up-good") : null;
  const vCount = visitors ? formatValue(visitors.value, "int") : "—";
  const subject = `📊 festival.so — ${vCount} visitors ${vBadge ? vBadge.text : ""} · ${m.reportLabel}`.trim();

  const headlineRows = m.headline.map(headlineRow).join("");
  const breakdowns = m.breakdowns.map((b) => breakdownTable(b.label, b.rows)).join("");

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:640px;margin:0 auto;color:#222;">
  <h1 style="font-size:18px;margin:0 0 2px;">📊 Founder Festival — daily snapshot</h1>
  <p style="margin:0 0 16px;color:#888;font-size:13px;">${esc(m.reportLabel)} (Pacific) · vs. prior day · 7-day avg</p>

  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead>
      <tr style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:.04em;">
        <th style="text-align:left;padding:0 10px 4px;">Metric</th>
        <th style="text-align:right;padding:0 10px 4px;">Yesterday</th>
        <th style="text-align:right;padding:0 10px 4px;">vs prior</th>
        <th style="text-align:right;padding:0 10px 4px;">7d avg</th>
      </tr>
    </thead>
    <tbody>${headlineRows}</tbody>
  </table>

  <div style="margin-top:22px;">${breakdowns}</div>

  <hr style="border:none;border-top:1px solid #eee;margin:20px 0 10px;">
  <p style="font-size:11px;color:#aaa;">
    Source: PostHog · day boundaries in America/Los_Angeles ·
    <a href="${POSTHOG_DASHBOARD}" style="color:#dfa43a;">open dashboard</a>
  </p>
</div>`;

  return { subject, html };
}
