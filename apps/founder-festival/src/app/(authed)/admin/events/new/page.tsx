import { adminGate } from "@/lib/admin";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { NewEventForm } from "@/components/admin/EventCriteriaBuilder";

export default async function NewEventPage() {
  const gate = await adminGate();
  if (!gate.ok) return <NotAuthorized email={gate.email} />;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-bold tracking-tight">New event</h1>
      <NewEventForm />
    </div>
  );
}
