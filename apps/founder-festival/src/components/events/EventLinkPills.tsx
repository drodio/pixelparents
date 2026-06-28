import Link from "next/link";

// A row of event pills, each linking to its public /events/<slug> page. Shared
// by the host/sponsor profile pages' "Events hosted / sponsored" section.
export function EventLinkPills({ events }: { events: { id: string; slug: string; title: string }[] }) {
  if (events.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {events.map((e) => (
        <Link
          key={e.id}
          href={`/events/${e.slug}`}
          title={e.title}
          className="block max-w-full truncate rounded-md border border-[#dfa43a]/50 bg-[#dfa43a]/10 px-2.5 py-1 text-sm text-[#dfa43a] transition-colors hover:bg-[#dfa43a]/20"
        >
          {e.title}
        </Link>
      ))}
    </div>
  );
}
