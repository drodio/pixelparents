import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { subscribeToChangelog, unsubscribeFromChangelog } from "@/lib/changelog";

// Subscribe the signed-in Clerk user to changelog emails. No profile claim
// required — any account can subscribe. The email is read server-side from the
// Clerk session (the client never sends it).
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "sign in to subscribe" }, { status: 401 });
  const user = await currentUser().catch(() => null);
  const email =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;
  if (!email) return NextResponse.json({ error: "no email on account" }, { status: 400 });
  await subscribeToChangelog(userId, email);
  return NextResponse.json({ ok: true, subscribed: true });
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  await unsubscribeFromChangelog(userId);
  return NextResponse.json({ ok: true, subscribed: false });
}
