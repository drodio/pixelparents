import Link from "next/link";
import { notFound } from "next/navigation";
import { adminGate } from "@/lib/admin";
import { canAccessEvent } from "@/lib/ownership";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { getEventById, getEventBySlug } from "@/lib/events";
import { PersonalizedEval } from "@/components/admin/PersonalizedEval";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Admin eval: compare personalized post-event learnings generated via the AI
// Gateway vs Chief, side by side, with cost/latency metrics.
export default async function PersonalizedEvalPage({ params }: PageProps) {
  const gate = await adminGate();
  if (!gate.ok) return <NotAuthorized email={gate.email} />;
  const { id } = await params;
  // Accept either the event UUID or its public slug (querying a uuid column with a
  // non-UUID string throws), so /admin/events/<slug>/personalized works too.
  const event = UUID_RE.test(id) ? await getEventById(id) : await getEventBySlug(id);
  if (!event) notFound();
  if (!(await canAccessEvent(event.id))) return <NotAuthorized email={null} />;

  return (
    <main className="min-h-screen bg-[#151515] px-4 py-8 text-zinc-100 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <Link href={`/admin/events/${event.id}`} className="text-sm text-zinc-500 hover:text-zinc-300">
          ← Back to event
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold">Personalized learnings — eval</h1>
          <p className="text-sm text-zinc-400">
            {event.title} · compare AI Gateway vs Chief output + cost for one person.
          </p>
        </div>
        <PersonalizedEval eventId={event.id} />
      </div>
    </main>
  );
}
