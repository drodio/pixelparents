"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { isFamilyVerified } from "@/lib/directory";
import type { SignupRow } from "@/lib/db/schema/signups";
import { createNotification } from "@/lib/db/notifications";
import {
  createBoard,
  deleteBoard,
  updateBoard,
  countBoardsByAuthorSince,
  createContribution,
  deleteContribution,
  updateContribution,
  setContributionPinned,
  getContributionBoardId,
  countContributionsByAuthorSince,
  toggleBoardUpvote,
  toggleContributionUpvote,
  toggleBoardFollow,
  listBoardFollowerIds,
  getBoard,
} from "@/lib/db/resources";
import {
  validateBoardTitle,
  validateBoardDescription,
  validateContributionTitle,
  validateContributionBody,
  validateResourceUrl,
  normalizeResourceTags,
  isContributionKind,
  autoLabelBoard,
  type ContributionKind,
} from "@/lib/resources-label";

// Server actions for the OHS "Resource Boards" — a Reddit-like, OHS-only,
// permanent, community-curated library. Every action authorizes ENTIRELY
// server-side from the Clerk session (never a client-supplied identity), and
// every actor must be a VERIFIED OHS family. Anyone verified (parent OR student)
// can create a board, contribute, upvote, and follow; only the author can delete
// their own board/contribution. Inputs are validated/sanitized; auto-labeling
// NEVER blocks board creation.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Per-author rate limits over a rolling window.
const BOARD_RATE_LIMIT = 8;
const CONTRIBUTION_RATE_LIMIT = 25;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

async function verifiedCaller(): Promise<{ user: SignupRow; clerkId: string } | null> {
  const user = await currentUser();
  if (!user) return null;
  const email = primaryEmail(user);
  if (!email) return null;
  const signup = await getSignupByEmail(email);
  if (!signup) return null;
  if (!isFamilyVerified(signup)) return null;
  return { user: signup, clerkId: user.id };
}

// -------------------------------------------------------------------------
// Boards
// -------------------------------------------------------------------------

// Create a board. Title required; description optional. Topic tags are
// auto-generated server-side (the author's hint tags merged in, then capped);
// auto-labeling can NEVER block creation (heuristic fallback on any AI failure).
export async function createBoardAction(input: {
  title: string;
  description: string;
  tags?: string[];
}): Promise<ActionResult> {
  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS member to create a board." };

  const title = validateBoardTitle(input.title);
  if (!title.ok) return { ok: false, error: title.error };
  const description = validateBoardDescription(input.description);
  if (!description.ok) return { ok: false, error: description.error };

  const recent = await countBoardsByAuthorSince(caller.user.id, Date.now() - RATE_WINDOW_MS);
  if (recent >= BOARD_RATE_LIMIT) {
    return { ok: false, error: "You've created a lot of boards recently — please try again later." };
  }

  let tags: string[] = [];
  try {
    tags = await autoLabelBoard({ title: title.value, description: description.value });
  } catch {
    tags = [];
  }
  const merged = normalizeResourceTags([...(input.tags ?? []), ...tags]);

  try {
    const row = await createBoard({
      authorSignupId: caller.user.id,
      authorClerkId: caller.clerkId,
      title: title.value,
      description: description.value || null,
      tags: merged,
    });
    revalidatePath("/resources");
    return { ok: true, id: row.id };
  } catch (err) {
    console.error("createBoardAction failed:", err);
    return { ok: false, error: "Couldn't create this board. Please try again." };
  }
}

export async function deleteBoardAction(input: { id: string }): Promise<ActionResult> {
  if (!UUID_RE.test(input.id)) return { ok: false, error: "Unknown board." };
  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS member." };
  try {
    const ok = await deleteBoard({ id: input.id, authorSignupId: caller.user.id });
    if (!ok) return { ok: false, error: "You can only remove boards you created." };
    revalidatePath("/resources");
    return { ok: true };
  } catch (err) {
    console.error("deleteBoardAction failed:", err);
    return { ok: false, error: "Couldn't remove this board. Please try again." };
  }
}

// Edit a board — OWNER ONLY (the data fn scopes the UPDATE to author_signup_id,
// so a non-owner edit matches 0 rows and returns null). Title + description are
// re-validated with the same validators as create; tags are sanitized. Unlike
// create we do NOT re-run the AI auto-labeler — the owner is curating tags by
// hand here, so we honor exactly what they pass (sanitized + capped).
export async function updateBoardAction(input: {
  boardId: string;
  title: string;
  description: string;
  tags?: string[];
}): Promise<ActionResult> {
  if (!UUID_RE.test(input.boardId)) return { ok: false, error: "Unknown board." };
  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS member." };

  const title = validateBoardTitle(input.title);
  if (!title.ok) return { ok: false, error: title.error };
  const description = validateBoardDescription(input.description);
  if (!description.ok) return { ok: false, error: description.error };
  const tags = normalizeResourceTags(input.tags ?? []);

  try {
    const row = await updateBoard({
      id: input.boardId,
      authorSignupId: caller.user.id,
      title: title.value,
      description: description.value || null,
      tags,
    });
    if (!row) return { ok: false, error: "You can only edit boards you created." };
    revalidatePath(`/resources/${input.boardId}`);
    revalidatePath("/resources");
    return { ok: true, id: row.id };
  } catch (err) {
    console.error("updateBoardAction failed:", err);
    return { ok: false, error: "Couldn't save this board. Please try again." };
  }
}

// -------------------------------------------------------------------------
// Contributions
// -------------------------------------------------------------------------

// Add a contribution to a board. `kind` determines which fields are required:
//   link → url required; file → filePath+fileName required; text → body required.
// On success, followers of the board (except the contributor) get notified.
export async function createContributionAction(input: {
  boardId: string;
  kind: ContributionKind | string;
  title: string;
  url?: string;
  filePath?: string;
  fileName?: string;
  body?: string;
}): Promise<ActionResult> {
  if (!UUID_RE.test(input.boardId)) return { ok: false, error: "Unknown board." };
  if (!isContributionKind(input.kind)) return { ok: false, error: "Pick a contribution type." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS member to contribute." };

  const title = validateContributionTitle(input.title);
  if (!title.ok) return { ok: false, error: title.error };

  // Per-kind required fields.
  let url: string | null = null;
  let filePath: string | null = null;
  let fileName: string | null = null;
  let body: string | null = null;

  if (input.kind === "link") {
    const u = validateResourceUrl(input.url);
    if (!u.ok) return { ok: false, error: u.error };
    url = u.value;
  } else if (input.kind === "file") {
    // The file was uploaded client-side via /api/blob/upload; we store the
    // returned path + display name. Both must be present.
    const p = typeof input.filePath === "string" ? input.filePath.trim() : "";
    const n = typeof input.fileName === "string" ? input.fileName.trim().slice(0, 200) : "";
    if (!p || !n) return { ok: false, error: "Upload a file first." };
    // Defense in depth: only accept the app's own blob host as a file path.
    try {
      const parsed = new URL(p);
      if (parsed.protocol !== "https:" || !/\.public\.blob\.vercel-storage\.com$/.test(parsed.hostname)) {
        return { ok: false, error: "That file couldn't be verified." };
      }
    } catch {
      return { ok: false, error: "That file couldn't be verified." };
    }
    filePath = p;
    fileName = n;
  } else {
    const b = validateContributionBody(input.body);
    if (!b.ok) return { ok: false, error: b.error };
    if (!b.value) return { ok: false, error: "Add some text for this contribution." };
    body = b.value;
  }

  const recent = await countContributionsByAuthorSince(caller.user.id, Date.now() - RATE_WINDOW_MS);
  if (recent >= CONTRIBUTION_RATE_LIMIT) {
    return { ok: false, error: "You've contributed a lot recently — please try again later." };
  }

  try {
    const row = await createContribution({
      boardId: input.boardId,
      authorSignupId: caller.user.id,
      authorClerkId: caller.clerkId,
      kind: input.kind,
      title: title.value,
      url,
      filePath,
      fileName,
      body,
    });

    // Notify followers (best-effort, never blocks the contribution).
    try {
      const board = await getBoard({ id: input.boardId, viewerSignupId: caller.user.id });
      const followers = await listBoardFollowerIds({
        boardId: input.boardId,
        excludeSignupId: caller.user.id,
      });
      const boardTitle = board?.title ?? "a board";
      await Promise.all(
        followers.map((recipientSignupId) =>
          createNotification({
            recipientSignupId,
            type: "board_contribution",
            title: `New contribution in “${boardTitle}”`,
            body: title.value,
            link: `/resources/${input.boardId}`,
          }),
        ),
      );
    } catch (err) {
      console.error("board_contribution notifications failed:", err);
    }

    revalidatePath(`/resources/${input.boardId}`);
    revalidatePath("/resources");
    return { ok: true, id: row.id };
  } catch (err) {
    console.error("createContributionAction failed:", err);
    return { ok: false, error: "Couldn't add this contribution. Please try again." };
  }
}

export async function deleteContributionAction(input: { id: string }): Promise<ActionResult> {
  if (!UUID_RE.test(input.id)) return { ok: false, error: "Unknown contribution." };
  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS member." };
  try {
    const boardId = await getContributionBoardId(input.id);
    const ok = await deleteContribution({ id: input.id, authorSignupId: caller.user.id });
    if (!ok) return { ok: false, error: "You can only remove contributions you added." };
    if (boardId) revalidatePath(`/resources/${boardId}`);
    return { ok: true };
  } catch (err) {
    console.error("deleteContributionAction failed:", err);
    return { ok: false, error: "Couldn't remove this contribution. Please try again." };
  }
}

// Edit a contribution — AUTHOR ONLY (the data fn scopes the UPDATE to
// author_signup_id). The kind is fixed at create time; the caller edits the
// title (always) plus the one kind-relevant field. We re-validate exactly the
// fields that kind allows and ignore the rest:
//   link → url required; text → body required; file → title only.
export async function updateContributionAction(input: {
  id: string;
  kind: ContributionKind | string;
  title: string;
  url?: string;
  body?: string;
}): Promise<ActionResult> {
  if (!UUID_RE.test(input.id)) return { ok: false, error: "Unknown contribution." };
  if (!isContributionKind(input.kind)) return { ok: false, error: "Pick a contribution type." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS member." };

  const title = validateContributionTitle(input.title);
  if (!title.ok) return { ok: false, error: title.error };

  let url: string | null = null;
  let body: string | null = null;
  if (input.kind === "link") {
    const u = validateResourceUrl(input.url);
    if (!u.ok) return { ok: false, error: u.error };
    url = u.value;
  } else if (input.kind === "text") {
    const b = validateContributionBody(input.body);
    if (!b.ok) return { ok: false, error: b.error };
    if (!b.value) return { ok: false, error: "Add some text for this contribution." };
    body = b.value;
  }
  // kind === "file" → title only; nothing else to validate (uploads aren't
  // re-handled on edit, the stored file_path is left untouched).

  try {
    const boardId = await getContributionBoardId(input.id);
    const row = await updateContribution({
      id: input.id,
      authorSignupId: caller.user.id,
      title: title.value,
      url,
      body,
    });
    if (!row) return { ok: false, error: "You can only edit contributions you added." };
    if (boardId) revalidatePath(`/resources/${boardId}`);
    revalidatePath("/resources");
    return { ok: true, id: row.id };
  } catch (err) {
    console.error("updateContributionAction failed:", err);
    return { ok: false, error: "Couldn't save this contribution. Please try again." };
  }
}

// Pin / unpin a contribution — BOARD OWNER ONLY. We resolve the contribution's
// board, confirm the caller owns that board, then flip pinned_at. Multiple pins
// are allowed; ordering (pinned_at ASC) is handled by listContributions.
export async function setContributionPinnedAction(input: {
  contributionId: string;
  pinned: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID_RE.test(input.contributionId)) return { ok: false, error: "Unknown contribution." };
  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS member." };
  try {
    const boardId = await getContributionBoardId(input.contributionId);
    if (!boardId) return { ok: false, error: "Unknown contribution." };
    const board = await getBoard({ id: boardId, viewerSignupId: caller.user.id });
    if (!board || board.authorSignupId !== caller.user.id) {
      return { ok: false, error: "Only the board owner can pin contributions." };
    }
    const ok = await setContributionPinned({
      contributionId: input.contributionId,
      boardId,
      pinned: input.pinned,
    });
    if (!ok) return { ok: false, error: "Couldn't update this contribution." };
    revalidatePath(`/resources/${boardId}`);
    return { ok: true };
  } catch (err) {
    console.error("setContributionPinnedAction failed:", err);
    return { ok: false, error: "Couldn't update the pin. Please try again." };
  }
}

// -------------------------------------------------------------------------
// Upvotes + follow (optimistic toggles)
// -------------------------------------------------------------------------

export async function toggleBoardUpvoteAction(input: {
  boardId: string;
}): Promise<{ ok: true; upvoted: boolean; count: number } | { ok: false; error: string }> {
  if (!UUID_RE.test(input.boardId)) return { ok: false, error: "Unknown board." };
  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS member." };
  try {
    const res = await toggleBoardUpvote({ boardId: input.boardId, signupId: caller.user.id });
    return { ok: true, ...res };
  } catch (err) {
    console.error("toggleBoardUpvoteAction failed:", err);
    return { ok: false, error: "Couldn't record your vote. Please try again." };
  }
}

export async function toggleContributionUpvoteAction(input: {
  contributionId: string;
}): Promise<{ ok: true; upvoted: boolean; count: number } | { ok: false; error: string }> {
  if (!UUID_RE.test(input.contributionId)) return { ok: false, error: "Unknown contribution." };
  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS member." };
  try {
    const res = await toggleContributionUpvote({
      contributionId: input.contributionId,
      signupId: caller.user.id,
    });
    return { ok: true, ...res };
  } catch (err) {
    console.error("toggleContributionUpvoteAction failed:", err);
    return { ok: false, error: "Couldn't record your vote. Please try again." };
  }
}

export async function toggleBoardFollowAction(input: {
  boardId: string;
}): Promise<{ ok: true; following: boolean } | { ok: false; error: string }> {
  if (!UUID_RE.test(input.boardId)) return { ok: false, error: "Unknown board." };
  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS member." };
  try {
    const res = await toggleBoardFollow({ boardId: input.boardId, signupId: caller.user.id });
    return { ok: true, ...res };
  } catch (err) {
    console.error("toggleBoardFollowAction failed:", err);
    return { ok: false, error: "Couldn't update follow. Please try again." };
  }
}
