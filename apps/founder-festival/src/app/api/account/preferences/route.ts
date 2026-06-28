import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// 10 per-channel boolean prefs + 4 legacy columns (kept for back-compat with
// the older form). New UI only writes the per-channel set.
type Body = Partial<{
  // Legacy
  prefInviteEvents: boolean;
  prefFestivalUpdates: boolean;
  prefSponsorIntros: boolean;
  prefTextAlerts: boolean;
  // Per-channel
  prefEmailInviteEvents: boolean;
  prefTextInviteEvents: boolean;
  prefEmailFestivalUpdates: boolean;
  prefTextFestivalUpdates: boolean;
  prefEmailInvestorIntros: boolean;
  prefTextInvestorIntros: boolean;
  prefEmailFounderIntros: boolean;
  prefTextFounderIntros: boolean;
  prefEmailSponsorIntros: boolean;
  prefTextSponsorIntros: boolean;
  // Event logistics (updates, reminders) — the channel a member receives event
  // blasts on. Default on; the email unsubscribe footer links here.
  prefEmailEventLogistics: boolean;
  prefTextEventLogistics: boolean;
}>;

const FIELDS = [
  "prefInviteEvents",
  "prefFestivalUpdates",
  "prefSponsorIntros",
  "prefTextAlerts",
  "prefEmailInviteEvents",
  "prefTextInviteEvents",
  "prefEmailFestivalUpdates",
  "prefTextFestivalUpdates",
  "prefEmailInvestorIntros",
  "prefTextInvestorIntros",
  "prefEmailFounderIntros",
  "prefTextFounderIntros",
  "prefEmailSponsorIntros",
  "prefTextSponsorIntros",
  "prefEmailEventLogistics",
  "prefTextEventLogistics",
] as const;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const updates: Record<string, boolean> = {};
  for (const k of FIELDS) {
    const v = body[k];
    if (typeof v === "boolean") updates[k] = v;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkUserId, userId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(users).values({ clerkUserId: userId, ...updates });
  } else {
    await db.update(users).set(updates).where(eq(users.clerkUserId, userId));
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const [row] = await db
    .select({
      prefInviteEvents: users.prefInviteEvents,
      prefFestivalUpdates: users.prefFestivalUpdates,
      prefSponsorIntros: users.prefSponsorIntros,
      prefTextAlerts: users.prefTextAlerts,
      prefEmailInviteEvents: users.prefEmailInviteEvents,
      prefTextInviteEvents: users.prefTextInviteEvents,
      prefEmailFestivalUpdates: users.prefEmailFestivalUpdates,
      prefTextFestivalUpdates: users.prefTextFestivalUpdates,
      prefEmailInvestorIntros: users.prefEmailInvestorIntros,
      prefTextInvestorIntros: users.prefTextInvestorIntros,
      prefEmailFounderIntros: users.prefEmailFounderIntros,
      prefTextFounderIntros: users.prefTextFounderIntros,
      prefEmailSponsorIntros: users.prefEmailSponsorIntros,
      prefTextSponsorIntros: users.prefTextSponsorIntros,
      prefEmailEventLogistics: users.prefEmailEventLogistics,
      prefTextEventLogistics: users.prefTextEventLogistics,
    })
    .from(users)
    .where(eq(users.clerkUserId, userId))
    .limit(1);

  // Return defaults when no users row yet — matches the schema defaults.
  return NextResponse.json(
    row ?? {
      prefInviteEvents: true,
      prefFestivalUpdates: true,
      prefSponsorIntros: true,
      prefTextAlerts: true,
      prefEmailInviteEvents: true,
      prefTextInviteEvents: true,
      prefEmailFestivalUpdates: true,
      prefTextFestivalUpdates: false,
      prefEmailInvestorIntros: true,
      prefTextInvestorIntros: false,
      prefEmailFounderIntros: true,
      prefTextFounderIntros: false,
      prefEmailSponsorIntros: true,
      prefTextSponsorIntros: false,
      prefEmailEventLogistics: true,
      prefTextEventLogistics: true,
    },
  );
}
