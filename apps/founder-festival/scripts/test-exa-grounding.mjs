// Smoke-test the Exa-grounded facts layer (roadmap #1).
//   npx tsx --env-file=.env.local scripts/test-exa-grounding.mjs
// Verifies exa.answer() returns structured facts + third-party citations for
// the rubric's weakest, highest-point items (raised / exits / investments).

import { groundSubjectFacts, renderGroundedFacts } from "../src/lib/exa-grounding.ts";

const SUBJECTS = [
  ["Jordan Lee", "a startup"],
  ["Alex Kim", "a venture fund"], // investor-leaning
];

for (const [name, hint] of SUBJECTS) {
  console.log("=".repeat(72));
  console.log("Grounding:", name, hint ? `(${hint})` : "");
  const t0 = Date.now();
  const { facts, exaUsage } = await groundSubjectFacts(name, hint);
  console.log(`— ${Date.now() - t0}ms · exa cost $${exaUsage.costUsd.toFixed(4)}`);
  if (!facts) {
    console.log("  (no facts returned)");
    continue;
  }
  console.log("STRUCTURED:", JSON.stringify({ ...facts, citationUrls: `${facts.citationUrls.length} urls` }, null, 2));
  console.log("CITATION URLS:", facts.citationUrls.slice(0, 6));
  console.log("\nPROMPT BLOCK:\n" + renderGroundedFacts(facts));
}
console.log("=".repeat(72));
