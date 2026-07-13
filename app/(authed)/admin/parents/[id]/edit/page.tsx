import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { signups } from "@/lib/db/schema/signups";
import { isAdminEmail } from "@/lib/admin";
import { Breadcrumb } from "../../../breadcrumb";
import EditForm from "./edit-form";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditParentPage({
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

  const [row] = await getDb().select().from(signups).where(eq(signups.id, id)).limit(1);
  if (!row) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-white/60">That submission no longer exists.</p>
        <Link href="/admin" className="text-sm text-amber-400 hover:underline">← Back to Parents</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Breadcrumb
          items={[
            { label: "GoPixel Admin", href: "/admin" },
            { label: "Parents", href: "/admin" },
            { label: `${row.firstName} ${row.lastName}` },
          ]}
        />
        <h2 className="text-xl font-semibold">
          Edit — {row.firstName} {row.lastName}
        </h2>
      </div>
      <EditForm row={row} />
    </div>
  );
}
