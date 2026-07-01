import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { changelogSubscribers } from "@/lib/db/schema/changelog";
import { ensureChangelogTables } from "@/lib/changelog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The real result of trying to unsubscribe. Drives which page we render so we
// never tell a user "you're unsubscribed" when nothing was actually changed.
//   - "unsubscribed": a subscriber row was marked unsubscribed by this request.
//   - "not-found":    no matching subscriber (stale/malformed link, 0 rows).
//   - "error":        DB unavailable or the update threw.
export type UnsubscribeOutcome = "unsubscribed" | "not-found" | "error";

// Pure helper (exported for tests): given the identifiers and a run() that
// performs the update and reports how many subscriber rows it changed, decide
// the outcome. No DB access here so the branching logic is unit testable.
export async function resolveUnsubscribe(
  input: { token: string; email: string; hasDb: boolean },
  run: (by: { token: string } | { email: string }) => Promise<number>,
): Promise<UnsubscribeOutcome> {
  const { token, email, hasDb } = input;
  const emailOk = /^\S+@\S+\.\S+$/.test(email);
  if (!hasDb || !(token || emailOk)) return "error";
  try {
    const changed = token ? await run({ token }) : await run({ email });
    return changed > 0 ? "unsubscribed" : "not-found";
  } catch (err) {
    console.error("unsubscribe failed:", err);
    return "error";
  }
}

function page(outcome: UnsubscribeOutcome): string {
  const shell = (title: string, heading: string, body: string) =>
    `<!doctype html><meta charset="utf-8"><title>${title} — Pixel Parents</title>` +
    `<body style="background:#000;color:#fff;font-family:system-ui;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center">` +
    `<div><h1 style="font-weight:600">${heading}</h1>` +
    `<p style="color:#9ca3af">${body}</p>` +
    `<p><a style="color:#fbbf24" href="/changelog">Back to the changelog</a></p></div>`;

  if (outcome === "unsubscribed") {
    return shell(
      "Unsubscribed",
      "You're unsubscribed",
      "You won't receive any more Pixel Parents changelog emails.",
    );
  }
  if (outcome === "not-found") {
    return shell(
      "Link expired",
      "We couldn't process that link",
      "This unsubscribe link is expired or invalid. If you're still getting emails, use the unsubscribe link in your most recent Pixel Parents email.",
    );
  }
  return shell(
    "Something went wrong",
    "Something went wrong",
    "We couldn't process your unsubscribe request. Please try the link again in a moment, or use the unsubscribe link in a recent email.",
  );
}

// One-click unsubscribe (linked per-recipient from every changelog email).
// Prefers a per-subscriber capability token (?token=…) so the link doesn't
// expose an email address and can't be used to unsubscribe arbitrary people;
// falls back to ?email=… for older links already sent.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const token = params.get("token")?.trim() ?? "";
  const email = params.get("email")?.trim().toLowerCase() ?? "";

  const outcome = await resolveUnsubscribe(
    { token, email, hasDb: hasDatabase() },
    async (by) => {
      await ensureChangelogTables();
      const db = getDb();
      const rows = await db
        .update(changelogSubscribers)
        .set({ unsubscribedAt: new Date() })
        .where(
          "token" in by
            ? eq(changelogSubscribers.unsubscribeToken, by.token)
            : eq(changelogSubscribers.email, by.email),
        )
        .returning({ id: changelogSubscribers.id });
      return rows.length;
    },
  );

  return new NextResponse(page(outcome), {
    status: outcome === "unsubscribed" ? 200 : outcome === "not-found" ? 410 : 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
