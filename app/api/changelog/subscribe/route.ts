import { NextResponse } from "next/server";
import { subscribeEmail } from "@/lib/changelog";

export const runtime = "nodejs";

// --- Lightweight per-IP rate limit (best-effort, in-memory) -------------------
// Mirrors app/report/actions.ts. This is a PUBLIC, unauthenticated endpoint that
// writes an email into changelog_subscribers, so without a cap a script could
// flood the table (or enroll many victims). In-memory means per-instance only,
// not a hard cross-serverless guarantee, but it cheaply stops a single client
// from hammering the form. A durable limiter + double opt-in confirmation is the
// fuller fix (see PRD note); this closes the easy-abuse hole.
const RATE_MAX = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  // Opportunistic cleanup so the map doesn't grow unbounded.
  if (hits.size > 5000) {
    for (const [k, ts] of hits) {
      if (ts.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k);
    }
  }
  return false;
}

function clientIp(request: Request): string {
  const h = request.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export async function POST(request: Request) {
  if (rateLimited(clientIp(request))) {
    return NextResponse.json(
      { error: "too many requests" },
      { status: 429 },
    );
  }

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 200) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }
  const ok = await subscribeEmail(email);
  if (!ok) {
    return NextResponse.json({ error: "could not subscribe" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
