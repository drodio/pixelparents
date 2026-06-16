import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { children } from "@/lib/db/schema/signups";
import { isAdminEmail } from "@/lib/admin";
import ChildEditForm from "./edit-form";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditChildPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? undefined;
  if (!(await isAdminEmail(email))) return null;

  const { id } = await params;
  if (!hasDatabase() || !UUID_RE.test(id)) {
    return <p className="text-sm text-white/60">Record not found.</p>;
  }

  const [row] = await getDb().select().from(children).where(eq(children.id, id)).limit(1);
  if (!row) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-white/60">That child no longer exists.</p>
        <Link href="/admin/children" className="text-sm text-teal-300 hover:underline">
          ← Back to Children
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Edit child — {row.firstName}</h2>
        <Link href="/admin/children" className="text-sm text-teal-300 hover:underline">
          ← Back
        </Link>
      </div>
      <ChildEditForm row={row} />
    </div>
  );
}
