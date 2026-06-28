import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { isAdmin } from "@/lib/admin";
import { requestAdminAccess } from "@/lib/admin-access";

export const runtime = "nodejs";

// A signed-in, non-admin user requests admin access. Touches ONLY the caller's
// own row (keyed on their Clerk user id) — there is no way to request on behalf
// of anyone else, so this needs no admin gate. Already-admins are a no-op.
export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (await isAdmin()) {
    return NextResponse.json({ status: "approved" });
  }
  const user = await currentUser().catch(() => null);
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;
  const status = await requestAdminAccess({
    clerkUserId: userId,
    email,
    name: user?.fullName ?? null,
    imageUrl: user?.imageUrl ?? null,
  });
  return NextResponse.json({ status });
}
