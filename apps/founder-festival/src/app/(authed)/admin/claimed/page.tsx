import { adminGate } from "@/lib/admin";
import { can } from "@/lib/grants";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { loadClaimedProfiles } from "@/lib/admin-claimed";
import { ClaimedProfilesTable } from "@/components/admin/ClaimedProfilesTable";

export const dynamic = "force-dynamic";

// Claimed Profiles — a leaderboard-style roster of everyone who has claimed a
// profile, with FULL admin visibility into members-only data. Each row expands
// in place to show family/pets, event answers, and emails (loaded lazily);
// clicking the name opens the user's real public profile.
export default async function AdminClaimedPage() {
  const gate = await adminGate();
  if (!gate.ok) return <NotAuthorized email={gate.email} />;
  if (!(await can("view_profiles"))) return <NotAuthorized email={null} />;

  const rows = await loadClaimedProfiles();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Claimed Profiles</h1>
        <p className="text-sm text-zinc-500 mt-1 tabular-nums">
          {rows.length.toLocaleString("en-US")} claimed {rows.length === 1 ? "profile" : "profiles"} · full
          visibility into members-only data
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500 italic">No profiles have been claimed yet.</p>
      ) : (
        <ClaimedProfilesTable rows={rows} />
      )}
    </div>
  );
}
