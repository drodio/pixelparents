// The signed-in user's primary email (or first, or null). Structural type so we
// don't depend on Clerk's exported types. Shared by the /p gate and share actions
// so the owner-identity logic can't diverge.
type ClerkUserLike = {
  emailAddresses: { id: string; emailAddress: string }[];
  primaryEmailAddressId: string | null;
} | null;

export function primaryEmail(user: ClerkUserLike): string | null {
  return (
    user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    null
  );
}
