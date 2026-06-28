import { NextResponse } from "next/server";
import { requireSuperAdminApi, logAdminAction } from "@/lib/admin-api";

export const dynamic = "force-dynamic";

// GET /api/admin/me — whoami for the super-admin app. The app calls this right
// after Clerk sign-in to confirm the signed-in user is a super admin (and to
// gate its UI). 401 = not signed in, 403 = signed in but not a super admin.
export async function GET(req: Request) {
  const gate = await requireSuperAdminApi(req);
  if (gate instanceof NextResponse) return gate;

  await logAdminAction({
    clerkUserId: gate.userId,
    email: gate.email,
    status: 200,
    request: gate,
    meta: { action: "me" },
  });

  return NextResponse.json({
    super_admin: true,
    user_id: gate.userId,
    email: gate.email,
    name: gate.name,
    token_type: gate.tokenType,
  });
}
