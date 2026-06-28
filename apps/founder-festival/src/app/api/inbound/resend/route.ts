import { NextResponse } from "next/server";
import { verifySvix } from "@/lib/svix-verify";
import { recordInboundReply, parseRequestNumber } from "@/lib/claim-thread";
import { reportServerError } from "@/lib/report-server-error";

export const runtime = "nodejs";

// POST /api/inbound/resend — Resend Inbound webhook. When a user replies to a
// claim email, the reply lands here. We pull the "(Request #NNNNN)" token out of
// the subject and append the reply to that claim's thread so the admin sees it
// in the Claim Review Console. Unknown / unmatched mail is acknowledged (200)
// and dropped — never erroring keeps Resend from retry-storming.
//
// SECURITY: verified with the Svix signature Resend sends (secret in
// RESEND_INBOUND_SIGNING_SECRET). If that secret isn't configured we reject all
// requests (fail closed) so this can't be spammed before setup is finished.

type InboundShape = {
  type?: string;
  data?: {
    from?: string | { address?: string; email?: string };
    to?: string | string[] | Array<{ address?: string; email?: string }>;
    subject?: string;
    text?: string;
    html?: string;
    // some payloads nest under email
    email?: { from?: string; to?: string | string[]; subject?: string; text?: string };
  };
};

function addrOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return addrOf(v[0]);
  if (v && typeof v === "object") {
    const o = v as { address?: string; email?: string };
    return o.address ?? o.email ?? "";
  }
  return "";
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_INBOUND_SIGNING_SECRET ?? "";
  const raw = await req.text();

  // Fail closed: no secret configured → don't accept anything yet.
  if (!secret) {
    return NextResponse.json({ error: "inbound not configured" }, { status: 503 });
  }
  const ok = verifySvix({
    secret,
    id: req.headers.get("svix-id"),
    timestamp: req.headers.get("svix-timestamp"),
    signatureHeader: req.headers.get("svix-signature"),
    rawBody: raw,
    nowSeconds: Date.now() / 1000,
  });
  if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 401 });

  let payload: InboundShape;
  try {
    payload = JSON.parse(raw) as InboundShape;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    const d = payload.data ?? {};
    const nested = d.email ?? {};
    const subject = d.subject ?? nested.subject ?? "";
    const fromEmail = addrOf(d.from ?? nested.from);
    const toEmail = addrOf(d.to ?? nested.to);
    const body = (d.text ?? nested.text ?? d.html ?? "").toString();

    const requestNumber = parseRequestNumber(subject);
    if (requestNumber == null) {
      // Not a claim reply (or token stripped) — acknowledge & drop.
      return NextResponse.json({ ok: true, matched: false });
    }
    const result = await recordInboundReply({
      requestNumber,
      fromEmail,
      toEmail,
      subject,
      body,
      providerEventId: req.headers.get("svix-id"),
    });
    // Always 200 so Resend doesn't retry-storm; `result` distinguishes recorded
    // vs. deduped redelivery vs. dropped (no thread / sender mismatch).
    return NextResponse.json({ ok: true, matched: result === "recorded", result });
  } catch (err) {
    await reportServerError(err, { route: "POST /api/inbound/resend" });
    // Still 200 so Resend doesn't retry-storm; we've logged + alerted.
    return NextResponse.json({ ok: true, matched: false });
  }
}
