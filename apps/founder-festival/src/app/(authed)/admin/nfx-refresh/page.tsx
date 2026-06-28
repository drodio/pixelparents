import { notFound } from "next/navigation";
import { isSuperAdmin } from "@/lib/admin";
import { getTokenExpiry } from "@/lib/nfx-token";
import { getNfxToken, getNfxTokenUpdatedAt } from "@/lib/nfx-token-store";

export const dynamic = "force-dynamic";

// One-click NFX token refresh. The bookmarklet below, clicked on a logged-in
// signal.nfx.com tab, reads the long-lived id-token from the SIGNAL_ID_JWT cookie
// (non-httpOnly; authenticates against signal-api; ~6-month expiry) and POSTs it to
// /api/admin/nfx-token (secret-authed) — no DevTools, no copy-paste, no redeploy.

const REFRESH_ENDPOINT = "https://festival.so/api/admin/nfx-token";

// The bookmarklet: read the long-lived NFX id-token straight from the SIGNAL_ID_JWT
// cookie (NFX sets it non-httpOnly; it authenticates against signal-api and lasts
// ~6 months) and POST it to Festival. Cookie-read, not network interception — the
// app captures `fetch` before any bookmarklet can patch it, so interception never
// fired. Must be clicked on a signal.nfx.com tab (that's where the cookie lives).
function buildBookmarklet(secret: string): string {
  const js = `(function(){
var EP=${JSON.stringify(REFRESH_ENDPOINT)},S=${JSON.stringify(secret)};
var m=document.cookie.match(/(?:^|;\\s*)SIGNAL_ID_JWT=([^;]+)/);
if(!m){alert('No NFX session found on this page. Open signal.nfx.com, log in (associate account), then click this bookmark there.');return;}
fetch(EP,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:decodeURIComponent(m[1]),secret:S})})
.then(function(r){return r.json()})
.then(function(j){alert(j.ok?('\\u2705 NFX token refreshed!\\nExpires '+(''+j.expiresAt).slice(0,10)+' ('+j.daysLeft+' days left)'):('\\u274C Refresh failed: '+(j.error||'unknown')))})
.catch(function(e){alert('\\u274C Could not reach Festival: '+e)})})();`;
  return "javascript:" + encodeURIComponent(js);
}

function statusLine(): Promise<{ label: string; color: string; sub: string }> {
  return (async () => {
    const token = await getNfxToken();
    const info = getTokenExpiry(token);
    const updated = await getNfxTokenUpdatedAt();
    const updatedSub = updated ? `Last refreshed ${updated.toISOString().slice(0, 16).replace("T", " ")} UTC` : "Still on the env-var seed (never refreshed via bookmarklet)";
    if (!token) return { label: "MISSING", color: "#b91c1c", sub: "No token in DB or env — the NFX scraper is off." };
    if (!info) return { label: "UNREADABLE", color: "#b91c1c", sub: "Stored value isn't a readable JWT." };
    if (info.expired) return { label: "EXPIRED", color: "#b91c1c", sub: `Expired ${info.expiresAt.slice(0, 10)}. ${updatedSub}` };
    const days = Math.floor(info.daysLeft);
    const color = days <= 3 ? "#d97706" : "#15803d";
    return { label: `VALID — ${days} day${days !== 1 ? "s" : ""} left`, color, sub: `Expires ${info.expiresAt.slice(0, 10)}. ${updatedSub}` };
  })();
}

export default async function NfxRefreshPage() {
  if (!(await isSuperAdmin())) notFound();

  const secret = process.env.NFX_TOKEN_REFRESH_SECRET ?? "";
  const status = await statusLine();
  const bookmarklet = secret ? buildBookmarklet(secret) : "";

  // React strips javascript: hrefs from normal JSX, so render the draggable link as raw HTML.
  const linkHtml = bookmarklet
    ? `<a href="${bookmarklet.replace(/"/g, "&quot;")}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:8px;font-weight:600;text-decoration:none;cursor:grab">🔄 Refresh NFX token</a>`
    : `<span style="color:#b91c1c">NFX_TOKEN_REFRESH_SECRET is not set — add it to the environment.</span>`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">NFX token — one-click refresh</h1>
        <p className="mt-1 text-sm text-gray-600">
          Keeps the NFX Signal investor enricher authenticated. No DevTools, no copy-paste.
        </p>
      </div>

      <div className="rounded-lg border p-4">
        <div className="text-xs uppercase tracking-wide text-gray-500">Current token</div>
        <div className="mt-1 text-lg font-semibold" style={{ color: status.color }}>
          {status.label}
        </div>
        <div className="mt-1 text-sm text-gray-600">{status.sub}</div>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="font-semibold">Setup (once)</div>
        <p className="text-sm text-gray-700">
          Drag this button up to your browser&apos;s bookmarks bar:
        </p>
        <div dangerouslySetInnerHTML={{ __html: linkHtml }} />
        <p className="text-xs text-gray-500">
          (If your bookmarks bar is hidden, press ⌘/Ctrl-Shift-B to show it first.)
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-2">
        <div className="font-semibold">To refresh (when you get the expiry email)</div>
        <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-1">
          <li>Open <a className="text-blue-600 underline" href="https://signal.nfx.com" target="_blank" rel="noreferrer">signal.nfx.com</a> and make sure you&apos;re logged in (as the associate account).</li>
          <li>While on that tab, click the <strong>🔄 Refresh NFX token</strong> bookmark. You&apos;ll see a “✅ refreshed” confirmation in ~1 second.</li>
        </ol>
        <p className="text-xs text-gray-500">
          It reads the long-lived NFX session token (≈6-month expiry) from your logged-in
          signal.nfx.com tab and stores it here automatically — the scraper picks it up on
          the next score. Must be clicked on a signal.nfx.com tab.
        </p>
      </div>
    </div>
  );
}
