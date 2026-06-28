import Link from "next/link";
import { isSuperAdmin } from "@/lib/admin";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { listAllTickets } from "@/lib/support";
import { LocalTime } from "@/components/LocalTime";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  if (!(await isSuperAdmin())) return <NotAuthorized email={null} />;
  const tickets = await listAllTickets();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4 text-sm">
        <Link href="/admin" className="link text-sm">← Admin home</Link>
      </div>
      <h1 className="font-display text-3xl font-bold tracking-tight">Support</h1>
      <p className="-mt-2 text-sm text-zinc-400">
        Tickets filed by claimed members from <code>/docs/support</code>. Open first.
      </p>

      {tickets.length === 0 ? (
        <p className="text-sm text-zinc-500 italic">No support tickets yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-800 rounded-lg border border-zinc-800">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link
                href={`/admin/support/${t.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.03]"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-zinc-100">{t.subject}</div>
                  <div className="text-xs text-zinc-500">
                    {t.email ?? "—"} · <LocalTime iso={t.updatedAt} />
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
                    t.status === "open"
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                      : "border-zinc-700 bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {t.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
