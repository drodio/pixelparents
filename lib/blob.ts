import { issueSignedToken, presignUrl } from "@vercel/blob";

// Family photos are stored as PRIVATE blobs, so their raw `.url` can't be
// loaded by a browser. Mint short-lived presigned GET URLs so a server-rendered
// page (the secret share page, the thanks-page editor) can display them. One
// delegation token covers every photo. Best-effort: a failed sign yields "".
export async function signedPhotoUrls(pathnames: string[]): Promise<string[]> {
  if (pathnames.length === 0) return [];
  try {
    const token = await issueSignedToken({
      pathname: "*",
      operations: ["get"],
      // 10 min is plenty — pages that show photos are dynamic (re-render per load).
      validUntil: Date.now() + 10 * 60 * 1000,
    });
    return await Promise.all(
      pathnames.map(async (pathname) => {
        try {
          const { presignedUrl } = await presignUrl(token, {
            operation: "get",
            pathname,
            // `access` is honored by the SDK impl but missing from its public type.
            access: "private",
          } as unknown as Parameters<typeof presignUrl>[1]);
          return presignedUrl;
        } catch {
          return "";
        }
      }),
    );
  } catch (err) {
    console.error("signedPhotoUrls failed:", err);
    return pathnames.map(() => "");
  }
}
