import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { generateApiKey } from "@/lib/api-keys";

export const dynamic = "force-dynamic";

const MAX_ACTIVE_KEYS = 5;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const keys = await db
    .select({
      id: apiKeys.id,
      prefix: apiKeys.keyPrefix,
      label: apiKeys.label,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.clerkUserId, userId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
  return NextResponse.json({ keys });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { label?: string } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const label = (body.label ?? "").toString().trim().slice(0, 60) || "default";

  const active = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.clerkUserId, userId), isNull(apiKeys.revokedAt)));
  if (active.length >= MAX_ACTIVE_KEYS) {
    return NextResponse.json(
      { error: "key_limit", message: `You can have at most ${MAX_ACTIVE_KEYS} active keys. Revoke one first.` },
      { status: 409 },
    );
  }

  const { raw, hash, prefix } = generateApiKey();
  const [row] = await db
    .insert(apiKeys)
    .values({ clerkUserId: userId, keyHash: hash, keyPrefix: prefix, label })
    .returning({ id: apiKeys.id, createdAt: apiKeys.createdAt });
  // raw is returned exactly once — the client must show it now; we only store the hash.
  return NextResponse.json({ id: row!.id, raw, prefix, label, createdAt: row!.createdAt });
}
