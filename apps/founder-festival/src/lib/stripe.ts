import Stripe from "stripe";

let cached: Stripe | null = null;

// Lazy singleton. Throws only when actually used without a key (so importing
// this module never crashes builds where Stripe isn't configured yet).
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  // Pin the API version so a Stripe account-level version bump can't silently
  // change webhook payload shapes under us. Update deliberately, in a PR, after
  // reviewing the changelog. Must match the stripe-node version pinned in
  // pnpm-lock.yaml (the lockfile Vercel builds with) — currently 22.1.1.
  cached = new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
  return cached;
}
