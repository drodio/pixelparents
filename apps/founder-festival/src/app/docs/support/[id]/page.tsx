import Link from "next/link";
import { notFound } from "next/navigation";
import { isSuperAdmin } from "@/lib/admin";
import { getViewerEvaluationId } from "@/lib/attendee";
import { getTicket, listMessages } from "@/lib/support";
import { SupportThread } from "@/components/docs/SupportThread";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function SupportTicketPage({ params }: PageProps) {
  const { id } = await params;
  const ticket = await getTicket(id);
  if (!ticket) notFound();

  // Owner (claimed evaluationId match) or super-admin only.
  const [viewerEval, superAdmin] = await Promise.all([getViewerEvaluationId(), isSuperAdmin()]);
  const isOwner = !!viewerEval && viewerEval === ticket.evaluationId;
  if (!isOwner && !superAdmin) notFound();

  const messages = await listMessages(id);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/docs/support" className="text-sm text-zinc-400 hover:underline">
        ← Support
      </Link>
      <SupportThread
        ticketId={ticket.id}
        subject={ticket.subject}
        status={ticket.status}
        messages={messages}
        actor="user"
      />
    </div>
  );
}
