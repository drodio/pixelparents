import { checkBotId } from "botid/server";

// Bot check that OBSERVES instead of blocking.
//
// WHY THIS IS FAIL-OPEN
//
// Vercel BotID proves a request is human via an `x-is-human` header that its
// CLIENT-side script attaches. If that script never runs the server sees no
// proof and classifies the request as a bot. The script is a third-party
// request, so it is routinely killed by ad/tracker blockers, Brave's shields,
// Safari private relay, corporate proxies, and VPNs.
//
// That is not a hypothetical: a real OHS parent testing signup hit
// "blocked" and could not create an account at all. The failure mode is
// backwards — a privacy-conscious parent is MORE likely to be blocked than an
// actual bot, and the person locked out has no way to diagnose it.
//
// Weighed against that, the downside of letting a bot through is small: signups
// land as unverified draft rows behind an admin approval gate and an OHS student
// email verification, so a spam row is an admin nuisance, not a breach.
//
// So we never block. We record the verdict (see `logEvent` callers) so real
// abuse is still visible and we can tighten this deliberately, with data,
// rather than by silently locking out families.

export type BotVerdict = {
  // True when BotID positively identified a bot. Informational ONLY — callers
  // must not use this to reject a request.
  isBot: boolean;
  isHuman: boolean;
  isVerifiedBot: boolean;
  verifiedBotName?: string;
  // Why BotID decided what it did, when it tells us.
  reason?: string;
  // True when the check itself threw. Treated exactly like "not a bot".
  errored: boolean;
};

export async function observeBot(): Promise<BotVerdict> {
  try {
    const v = await checkBotId();
    // checkBotId returns a union: the dev-bypass shape omits verifiedBotName /
    // classificationReason, so read those defensively rather than asserting.
    const extra = v as Partial<{ verifiedBotName: string; classificationReason: string }>;
    return {
      isBot: Boolean(v.isBot),
      isHuman: Boolean(v.isHuman),
      isVerifiedBot: Boolean(v.isVerifiedBot),
      verifiedBotName: extra.verifiedBotName,
      reason: extra.classificationReason,
      errored: false,
    };
  } catch {
    // BotID being unavailable must never take signup down with it.
    return { isBot: false, isHuman: true, isVerifiedBot: false, errored: true };
  }
}
