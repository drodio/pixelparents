import Link from "next/link";
import type { IconType } from "react-icons";
import { FiBarChart2, FiCalendar } from "react-icons/fi";
import { adminGate } from "@/lib/admin";
import { NotAuthorized } from "@/components/admin/NotAuthorized";

export const dynamic = "force-dynamic";

export default async function AdminIndex() {
  const gate = await adminGate();
  if (!gate.ok) return <NotAuthorized email={gate.email} />;

  return (
    <div className="min-h-full flex items-center">
      <div className="mx-auto w-full max-w-4xl grid grid-cols-1 sm:grid-cols-2 gap-8">
        <HubCard
          href="/admin/profiles/new"
          icon={FiBarChart2}
          title="Bulk Score Founders & Investors"
          body="Paste a list or upload a CSV of people you'd like to generate scores for."
        />
        <HubCard
          href="/admin/events"
          icon={FiCalendar}
          title="Manage Events"
          body="Add, modify or delete events and manage event registration. (Including Luma)"
        />
      </div>
    </div>
  );
}

function HubCard({
  href,
  icon: Icon,
  title,
  body,
}: {
  href: string;
  icon: IconType;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-5 rounded-xl border border-zinc-800 bg-zinc-950 p-10 min-h-[26rem] hover:border-zinc-600 transition-colors">
      <Icon className="text-[#dfa43a]" size={40} aria-hidden />
      <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
      <p className="text-zinc-400 text-sm leading-relaxed max-w-xs">{body}</p>
      <Link
        href={href}
        className="inline-flex items-center justify-center rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-semibold px-8 py-3 text-sm transition-colors"
      >
        Enter
      </Link>
    </div>
  );
}
