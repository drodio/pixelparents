import { sendRawEmail } from "@/lib/email";
import type { ChangelogEntryView } from "./changelog";
import { CHANGE_TYPE_LABEL, categoryLabel } from "./changelog-constants";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://festival.so").replace(/\/$/, "");
const FROM = process.env.RESEND_FROM ?? "Founder Festival <hello@festival.so>";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The deep-link: lands on /changelog and scrolls to + expands THIS entry.
export function changelogItemUrl(slug: string): string {
  return `${SITE}/changelog?item=${encodeURIComponent(slug)}`;
}

const TYPE_COLOR: Record<string, string> = {
  feature: "#34d399",
  enhancement: "#38bdf8",
  bug_fix: "#fb7185",
};

// Self-contained, inline-styled email (email clients ignore <style>/external CSS).
// Dark, on-brand (#151515 bg, #dfa43a gold). No PII / no point values — the entry
// content was already curated for that on the way into the DB.
export function buildChangelogEmail(e: ChangelogEntryView): { subject: string; html: string } {
  const url = changelogItemUrl(e.slug);
  const typeLabel = CHANGE_TYPE_LABEL[e.changeType] ?? e.changeType;
  const typeColor = TYPE_COLOR[e.changeType] ?? "#dfa43a";
  const catChips = e.categories
    .map(
      (c) =>
        `<span style="display:inline-block;font:600 11px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#dfa43a;background:rgba(223,164,58,0.12);border:1px solid rgba(223,164,58,0.35);border-radius:999px;padding:1px 9px;margin:0 4px 4px 0;">${esc(
          categoryLabel(c),
        )}</span>`,
    )
    .join("");
  const bullets =
    e.bullets.length > 0
      ? `<ul style="margin:12px 0 0;padding-left:20px;color:#9ca3af;font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;">${e.bullets
          .map((b) => `<li style="margin:4px 0;">${esc(b)}</li>`)
          .join("")}</ul>`
      : "";

  const html = `<!doctype html><html><body style="margin:0;background:#0f0f0f;padding:24px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#151515;border:1px solid #262626;border-radius:14px;overflow:hidden;">
        <tr><td style="padding:20px 24px 0;">
          <div style="font:700 13px/1 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#dfa43a;">Founder Festival</div>
          <div style="font:600 12px/1 -apple-system,Segoe UI,Roboto,sans-serif;color:#6b7280;margin-top:6px;">New in the changelog</div>
        </td></tr>
        <tr><td style="padding:18px 24px 0;">
          <span style="display:inline-block;font:700 11px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:${typeColor};background:${typeColor}1a;border:1px solid ${typeColor}55;border-radius:999px;padding:1px 9px;margin:0 6px 6px 0;">${esc(
            typeLabel,
          )}</span>
          ${catChips}
        </td></tr>
        <tr><td style="padding:8px 24px 0;">
          <h1 style="margin:0;font:700 20px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:#f4f4f5;">${esc(
            e.title,
          )}</h1>
          <p style="margin:10px 0 0;font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#a1a1aa;">${esc(
            e.summary,
          )}</p>
          ${bullets}
        </td></tr>
        <tr><td style="padding:22px 24px 24px;">
          <a href="${url}" style="display:inline-block;background:#dfa43a;color:#151515;font:600 14px/1 -apple-system,Segoe UI,Roboto,sans-serif;text-decoration:none;border-radius:999px;padding:11px 20px;">View on the changelog &rarr;</a>
        </td></tr>
        <tr><td style="padding:0 24px 22px;border-top:1px solid #262626;">
          <p style="margin:16px 0 0;font:12px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#6b7280;">
            You're getting this because you subscribed to the Founder Festival changelog.
            <a href="${SITE}/changelog" style="color:#9ca3af;">Manage your subscription</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject: `${typeLabel}: ${e.title}`, html };
}

export async function sendChangelogEntryEmail(e: ChangelogEntryView, to: string): Promise<void> {
  const { subject, html } = buildChangelogEmail(e);
  await sendRawEmail({ from: FROM, to, subject, html });
}
