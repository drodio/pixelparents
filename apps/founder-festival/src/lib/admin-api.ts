import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/db";
import { adminAuditLog } from "@/db/schema";
import { isSuperAdmin } from "@/lib/admin";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";

// Secure entry point for the super-admin API surface (the native app and any
// bearer-token admin call). The transport is Clerk: `clerkMiddleware` already
// resolves a Clerk session token sent as `Authorization: Bearer <token>` into
// `auth()` / `currentUser()` (same as the web cookie), so this guard works
// identically for the web and the app. The only secret on the device is a
// short-lived (~60s) auto-refreshing Clerk session token — never a long-lived key.
//
// Authorization reuses the canonical `isSuperAdmin()` (hardcoded SUPER_ADMIN_EMAILS,
// verified-email-only). Every call — granted or denied — is written to the
// append-only audit log.

// Per-super-admin daily call cap. Generous: a legitimate app session makes many
// calls; this is only an abuse backstop. Env-tunable.
const PER_DAY_LIMIT = Number(process.env.ADMIN_API_PER_DAY_LIMIT) || 50000;

export type TokenType = "bearer" | "cookie";

export type RequestMeta = {
  method: string;
  path: string;
  ip: string | null;
  userAgent: string | null;
  tokenType: TokenType;
};

export type AdminApiContext = RequestMeta & {
  userId: string;
  email: string | null;
  name: string | null;
};

// A request carrying an Authorization header authenticated via bearer token (the
// native app / API); otherwise it's the web cookie session.
export function tokenTypeOf(req: Request): TokenType {
  return req.headers.get("authorization") ? "bearer" : "cookie";
}

export function requestMeta(req: Request): RequestMeta {
  let path = "";
  try {
    path = new URL(req.url).pathname;
  } catch {
    path = req.url;
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  return {
    method: req.method,
    path,
    ip,
    userAgent: req.headers.get("user-agent"),
    tokenType: tokenTypeOf(req),
  };
}

// Append one row to the audit trail. BEST-EFFORT: a logging failure (including the
// table not existing yet) must never fail the underlying request — same rule as
// `verifyApiKey`'s `last_used_at` touch. Never throws.
export async function logAdminAction(entry: {
  clerkUserId: string | null;
  email: string | null;
  status: number;
  meta?: Record<string, unknown>;
  req?: Request;
  request?: RequestMeta;
}): Promise<void> {
  try {
    const m = entry.request ?? (entry.req ? requestMeta(entry.req) : null);
    await db.insert(adminAuditLog).values({
      clerkUserId: entry.clerkUserId,
      email: entry.email,
      method: m?.method ?? "",
      path: m?.path ?? "",
      status: entry.status,
      tokenType: m?.tokenType ?? "unknown",
      ip: m?.ip ?? null,
      userAgent: m?.userAgent ?? null,
      meta: entry.meta ?? {},
    });
  } catch (err) {
    // Non-critical telemetry: swallow so the request still succeeds.
    console.error("[admin-api] audit write failed", err);
  }
}

function firstVerifiedEmail(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  const verified = (user?.emailAddresses ?? []).find(
    (e) => e.verification?.status === "verified",
  );
  return verified?.emailAddress ?? user?.primaryEmailAddress?.emailAddress ?? null;
}

// Resolve + authorize a super-admin API request. Returns the caller context on
// success, or a ready-to-return NextResponse (401 / 403 / 429) on failure.
// Denied attempts are audited here; the SUCCESS audit is the caller's job (it
// knows the final status + action metadata) — use `logAdminAction` with the
// returned context.
export async function requireSuperAdminApi(
  req: Request,
): Promise<AdminApiContext | NextResponse> {
  const meta = requestMeta(req);

  const { userId } = await auth();
  if (!userId) {
    await logAdminAction({ clerkUserId: null, email: null, status: 401, request: meta });
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Per-user abuse backstop (keyed on the Clerk user id, not the token).
  if (!(await checkAndIncrementRateLimit(`admin-api:${userId}`, PER_DAY_LIMIT))) {
    await logAdminAction({ clerkUserId: userId, email: null, status: 429, request: meta });
    return NextResponse.json(
      { error: "rate_limit", limit: PER_DAY_LIMIT, resetsAt: "midnight UTC" },
      { status: 429 },
    );
  }

  const user = await currentUser().catch(() => null);
  const email = firstVerifiedEmail(user);
  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.username || null;

  if (!(await isSuperAdmin())) {
    await logAdminAction({ clerkUserId: userId, email, status: 403, request: meta });
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return { ...meta, userId, email, name };
}
