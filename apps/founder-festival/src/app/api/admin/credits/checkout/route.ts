import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAdmin } from "@/lib/admin";
import { getStripe } from "@/lib/stripe";
import { packById } from "@/lib/credit-packs";

export const dynamic = "force-dynamic";

// Buy a credit pack as an admin. Same credit system, packs, and webhook as the
// developer flow (credits are keyed by clerkUserId, so an admin's credits ARE
// their account credits) — this route only differs in the gate (admin) and the
// post-checkout redirect (/admin/credits). Packs are real dollars (the cost
// multiplier inflates what scoring COSTS, not what a pack is worth).
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await isAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { packId?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const pack = body.packId ? packById(body.packId) : undefined;
  if (!pack) return NextResponse.json({ error: "invalid packId" }, { status: 400 });

  const origin = new URL(req.url).origin;
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: pack.cents,
        product_data: { name: `Founder Festival admin credits — ${pack.label}` },
      },
    }],
    metadata: { clerkUserId: userId, packId: pack.id, credits_cents: String(pack.cents) },
    payment_intent_data: { metadata: { clerkUserId: userId, credits_cents: String(pack.cents) } },
    success_url: `${origin}/admin/credits?topup=success`,
    cancel_url: `${origin}/admin/credits?topup=cancel`,
  });
  return NextResponse.json({ url: session.url });
}
