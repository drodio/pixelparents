import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

// Recap & content was merged into the main event admin page. Keep this route as
// a permanent redirect so old bookmarks / links (e.g. "📸 Recap & content →")
// still land in the right place.
export default async function AdminEventRecapRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/admin/events/${id}`);
}
