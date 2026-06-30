import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The directory has been MERGED into the community showcase at /community (one
// consolidated, filterable member grid + a compact map + condensed stats, with
// in-tab profile views). This route is kept only so old links / bookmarks keep
// working — it permanently forwards to /community.
export default function DirectoryRedirect() {
  redirect("/community");
}
