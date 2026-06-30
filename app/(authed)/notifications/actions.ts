"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  type NotificationRow,
} from "@/lib/db/notifications";

// Server actions for the in-app notifications center + bell. Every action
// resolves the recipient ENTIRELY server-side from the Clerk session (never a
// client-supplied identity): currentUser → primaryEmail → signup row. The
// recipient_signup_id we read/write is always the caller's own signup id, so a
// client can never read or mutate someone else's notifications. Unlike the
// community/events surfaces these aren't gated on family verification — anyone
// with a signup can have (and read) notifications addressed to them.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolve the signed-in caller to their signup id, or null (no session / no
// email / no signup on file). This is the single identity source for every
// notification action.
async function callerSignupId(): Promise<string | null> {
  const user = await currentUser();
  if (!user) return null;
  const email = primaryEmail(user);
  if (!email) return null;
  const signup = await getSignupByEmail(email);
  return signup?.id ?? null;
}

// The bell's unread count. Best-effort: any failure resolves 0 (the bell just
// renders without a badge rather than erroring the shell).
export async function getMyUnreadCountAction(): Promise<number> {
  try {
    const id = await callerSignupId();
    if (!id) return 0;
    return await unreadCount(id);
  } catch (err) {
    console.error("getMyUnreadCountAction failed:", err);
    return 0;
  }
}

// The recipient's notifications, newest first. Returns [] when not signed in /
// no signup. The page also reads directly, but the dropdown uses this.
export async function getMyNotificationsAction(): Promise<NotificationRow[]> {
  try {
    const id = await callerSignupId();
    if (!id) return [];
    return await listNotifications(id);
  } catch (err) {
    console.error("getMyNotificationsAction failed:", err);
    return [];
  }
}

export type NotifActionResult = { ok: true } | { ok: false; error: string };

// Mark one notification read — scoped to the caller's own signup id (the data
// layer's WHERE is the authorization). Used on click-through from the list.
export async function markNotificationReadAction(input: {
  id: string;
}): Promise<NotifActionResult> {
  if (!UUID_RE.test(input.id)) return { ok: false, error: "Unknown notification." };
  const recipientId = await callerSignupId();
  if (!recipientId) return { ok: false, error: "You must be signed in." };
  try {
    await markRead(input.id, recipientId);
    revalidatePath("/notifications");
    return { ok: true };
  } catch (err) {
    console.error("markNotificationReadAction failed:", err);
    return { ok: false, error: "Couldn't update that notification." };
  }
}

// Mark all of the caller's notifications read.
export async function markAllNotificationsReadAction(): Promise<NotifActionResult> {
  const recipientId = await callerSignupId();
  if (!recipientId) return { ok: false, error: "You must be signed in." };
  try {
    await markAllRead(recipientId);
    revalidatePath("/notifications");
    return { ok: true };
  } catch (err) {
    console.error("markAllNotificationsReadAction failed:", err);
    return { ok: false, error: "Couldn't update your notifications." };
  }
}
