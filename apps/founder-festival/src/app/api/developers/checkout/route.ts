import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getStripe } from "@/lib/stripe";
import { packById } from "@/lib/credit-packs";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { packId?: string; returnTo?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const pack = body.packId ? packById(body.packId) : undefined;
  if (!pack) return NextResponse.json({ error: "invalid packId" }, { status: 400 });

  const origin = new URL(req.url).origin;
  // Return the buyer to wherever they started (e.g. the founder profile whose
  // dossier they want to run), not always /developers. Resolve the candidate
  // against our origin and require it to STAY same-origin — this rejects
  // "//host", "/\\host", absolute URLs, and control-char tricks — then keep only
  // its path+query. Defaults to the developers console (original top-up flow).
  let returnTo = "/developers";
  if (typeof body.returnTo === "string" && !/[\\\r\n]/.test(body.returnTo)) {
    try {
      const u = new URL(body.returnTo, origin);
      if (u.origin === origin) returnTo = u.pathname + u.search;
    } catch {
      /* malformed → keep default */
    }
  }
  const sep = returnTo.includes("?") ? "&" : "?";
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: pack.cents,
        product_data: { name: `Founder Festival API credits — ${pack.label}` },
      },
    }],
    metadata: { clerkUserId: userId, packId: pack.id, credits_cents: String(pack.cents) },
    payment_intent_data: { metadata: { clerkUserId: userId, credits_cents: String(pack.cents) } },
    success_url: `${origin}${returnTo}${sep}topup=success`,
    cancel_url: `${origin}${returnTo}${sep}topup=cancel`,
  });
  return NextResponse.json({ url: session.url });
}
