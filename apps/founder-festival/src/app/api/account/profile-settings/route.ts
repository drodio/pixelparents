import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { evaluations, profileSlugAliases, users } from "@/db/schema";
import {
  validateNickname,
  validateSlug,
  validateSlugKind,
  validateWebsiteUrl,
  type NicknameValidationError,
  type SlugValidationError,
  type WebsiteUrlValidationError,
} from "@/lib/profile-slug-validate";

export const dynamic = "force-dynamic";

type Body = Partial<{
  nickname: string | null;
  slugKind: string;
  slug: string;
  websiteUrl: string | null;
}>;

type FieldError =
  | { field: "nickname"; error: NicknameValidationError }
  | { field: "slug"; error: SlugValidationError | "slug_taken" }
  | { field: "role"; error: "role_invalid" }
  | { field: "websiteUrl"; error: WebsiteUrlValidationError };

// Postgres unique-violation SQLSTATE. Caught when two concurrent slug
// edits race; converted to a typed slug_taken error.
const PG_UNIQUE_VIOLATION = "23505";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Look up the claimed user + their evaluation row.
  const [userRow] = await db
    .select({
      id: users.id,
      nickname: users.nickname,
      websiteUrl: users.websiteUrl,
      evaluationId: users.evaluationId,
    })
    .from(users)
    .where(eq(users.clerkUserId, userId))
    .limit(1);

  if (!userRow || !userRow.evaluationId) {
    return NextResponse.json({ error: "not_claimed" }, { status: 403 });
  }

  const [evalRow] = await db
    .select({
      id: evaluations.id,
      slug: evaluations.slug,
      slugKind: evaluations.slugKind,
    })
    .from(evaluations)
    .where(eq(evaluations.id, userRow.evaluationId))
    .limit(1);

  if (!evalRow) {
    return NextResponse.json({ error: "evaluation_missing" }, { status: 500 });
  }

  // Validate each field if it was provided.
  let nextNickname: string | null | undefined;
  if ("nickname" in body) {
    const r = validateNickname(body.nickname);
    if (!r.ok) {
      return fieldError({ field: "nickname", error: r.error });
    }
    nextNickname = r.value;
  }

  let nextSlugKind: "founder" | "investor" | undefined;
  if ("slugKind" in body) {
    const r = validateSlugKind(body.slugKind);
    if (!r.ok) {
      return fieldError({ field: "role", error: r.error });
    }
    nextSlugKind = r.value;
  }

  let nextSlug: string | undefined;
  if ("slug" in body) {
    const r = validateSlug(body.slug);
    if (!r.ok) {
      return fieldError({ field: "slug", error: r.error });
    }
    nextSlug = r.value;
  }

  let nextWebsiteUrl: string | null | undefined;
  if ("websiteUrl" in body) {
    const r = validateWebsiteUrl(body.websiteUrl);
    if (!r.ok) {
      return fieldError({ field: "websiteUrl", error: r.error });
    }
    nextWebsiteUrl = r.value;
  }

  // Determine what's actually changing.
  const slugChanging = nextSlug !== undefined && nextSlug !== evalRow.slug;
  const slugKindChanging = nextSlugKind !== undefined && nextSlugKind !== evalRow.slugKind;
  const nicknameChanging = nextNickname !== undefined && nextNickname !== userRow.nickname;
  const websiteUrlChanging = nextWebsiteUrl !== undefined && nextWebsiteUrl !== userRow.websiteUrl;

  // Pre-flight uniqueness check on the new slug. Race with concurrent
  // edits is defended by the UPDATE catch below, but the pre-check gives
  // the user a clean error message in the common case.
  if (slugChanging && nextSlug) {
    const evalConflict = await db
      .select({ id: evaluations.id })
      .from(evaluations)
      .where(and(eq(evaluations.slug, nextSlug), ne(evaluations.id, evalRow.id)))
      .limit(1);
    if (evalConflict.length > 0) {
      return fieldError({ field: "slug", error: "slug_taken" });
    }
    const aliasConflict = await db
      .select({ aliasSlug: profileSlugAliases.aliasSlug })
      .from(profileSlugAliases)
      .where(
        and(
          eq(profileSlugAliases.aliasSlug, nextSlug),
          ne(profileSlugAliases.evaluationId, evalRow.id),
        ),
      )
      .limit(1);
    if (aliasConflict.length > 0) {
      return fieldError({ field: "slug", error: "slug_taken" });
    }
  }

  // Write the slug change. UPDATE the evaluation first so a unique-index
  // violation surfaces here (caught and converted); only insert the alias
  // after the UPDATE succeeds so we never leave an orphan alias row.
  if (slugChanging) {
    try {
      await db
        .update(evaluations)
        .set({
          slug: nextSlug!,
          // If role is ALSO changing, write both in one statement.
          ...(slugKindChanging ? { slugKind: nextSlugKind } : {}),
        })
        .where(eq(evaluations.id, evalRow.id));
    } catch (e) {
      if (isPgUniqueViolation(e)) {
        return fieldError({ field: "slug", error: "slug_taken" });
      }
      throw e;
    }
    if (evalRow.slug) {
      // Park the previous slug as an alias so old URLs 301-redirect to
      // the new canonical. If the same alias already exists for this
      // evalId (e.g. this user is renaming back to a previous name),
      // ignore the unique-violation and move on.
      try {
        await db.insert(profileSlugAliases).values({
          aliasSlug: evalRow.slug,
          evaluationId: evalRow.id,
        });
      } catch (e) {
        if (!isPgUniqueViolation(e)) throw e;
      }
    }
  } else if (slugKindChanging) {
    await db
      .update(evaluations)
      .set({ slugKind: nextSlugKind })
      .where(eq(evaluations.id, evalRow.id));
  }

  // nickname + websiteUrl both live on the users row — write in one UPDATE.
  if (nicknameChanging || websiteUrlChanging) {
    await db
      .update(users)
      .set({
        ...(nicknameChanging ? { nickname: nextNickname } : {}),
        ...(websiteUrlChanging ? { websiteUrl: nextWebsiteUrl } : {}),
      })
      .where(eq(users.id, userRow.id));
  }

  return NextResponse.json({
    ok: true,
    nickname: nicknameChanging ? nextNickname : userRow.nickname,
    slug: slugChanging ? nextSlug : evalRow.slug,
    slugKind: slugKindChanging ? nextSlugKind : evalRow.slugKind,
    websiteUrl: websiteUrlChanging ? nextWebsiteUrl : userRow.websiteUrl,
  });
}

function fieldError(err: FieldError) {
  return NextResponse.json({ error: err.error, field: err.field }, { status: 400 });
}

function isPgUniqueViolation(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const code = (e as { code?: unknown }).code;
  return code === PG_UNIQUE_VIOLATION;
}
