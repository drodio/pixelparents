import Link from "next/link";
import { notFound } from "next/navigation";
import { isSuperAdmin } from "@/lib/admin";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { getTicket, listMessages } from "@/lib/support";
import { SupportThread } from "@/components/docs/SupportThread";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function AdminSupportTicketPage({ params }: PageProps) {
  if (!(await isSuperAdmin())) return <NotAuthorized email={null} />;
  const { id } = await params;
  const ticket = await getTicket(id);
  if (!ticket) notFound();
  const messages = await listMessages(id);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/support" className="text-sm text-zinc-400 hover:underline">
        ← Support
      </Link>
      <div className="text-xs text-zinc-500">From: {ticket.email ?? "—"}</div>
      <SupportThread
        ticketId={ticket.id}
        subject={ticket.subject}
        status={ticket.status}
        messages={messages}
        actor="admin"
      />
    </div>
  );
}
