// Connect mode — a flag-gated repurposing of this founder-scoring product into a
// Stanford OHS parent↔student/alumni/community CONNECTOR. A numeric score reads
// badly in a parent↔student context, so when this mode is ON the app stops
// computing/showing scores or rankings and instead presents as much aggregated
// *info* per person as possible (identity, a neutral bio, expertise tags, an
// "areas of expertise / how they can help" list, and the enrichment facts +
// data-sources roster).
//
// DEFAULT OFF. When OFF the app behaves EXACTLY as today — festival.so is
// unaffected. This is additive + gated, never a deletion of the scoring paths.
//
// Two flags, one meaning:
//   - CONNECT_MODE             (server) — gates the eval pipeline + server
//     components (which compute, persist, and render the profile/directory).
//   - NEXT_PUBLIC_CONNECT_MODE (client) — same boolean, exposed to the browser
//     so client components (LeaderboardClient, etc.) can branch their UI.
// Keep the two in sync in your environment; they describe the same on/off state.

// Parse the project's standard boolean-env convention (see
// welcome-email-sweep.ts / admin-credit-enforcement.ts): trimmed, lowercased,
// truthy on "on" | "1" | "true". Everything else (including unset) is false.
function parseFlag(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "on" || v === "1" || v === "true";
}

// Server-side check. Use in the eval pipeline, route handlers, and server
// components. Read at call time (not module load) so tests can toggle the env.
export function isConnectMode(): boolean {
  return parseFlag(process.env.CONNECT_MODE);
}

// Client-side constant. `NEXT_PUBLIC_*` vars are inlined at build time, so this
// must be referenced as a static `process.env.NEXT_PUBLIC_CONNECT_MODE` member
// access (Next.js replaces it textually) — do NOT compute the key dynamically.
export const CONNECT_MODE_CLIENT: boolean = parseFlag(
  process.env.NEXT_PUBLIC_CONNECT_MODE,
);
