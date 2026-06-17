#!/usr/bin/env node
/**
 * DB-aware PII leak gate (Layer 2). Cross-references repo changes against live
 * DB values and fails the check when real PII would land in this PUBLIC repo.
 *
 * Policy (per the design spec):
 *   - emails + phone numbers from the DB  -> BLOCK (exit 1)
 *   - full "First Last" names from the DB -> WARN only (names are noisy)
 *   - GitHub usernames are NOT matched     -> they're public, and "drodio" is the
 *                                             org/handle that appears everywhere
 *
 * Modes:
 *   - diff (default, PRs): scans only lines ADDED between BASE_SHA..HEAD_SHA
 *   - full (nightly):      scans every tracked file at HEAD
 *
 * Safety on a public repo: NEVER prints a matched value — only file:line, the
 * match type, and a short sha256 marker.
 *
 * Fails OPEN (exit 0 + loud warning) if DATABASE_URL is unset or the DB can't be
 * reached, so an infra hiccup never blocks every PR. Override a real block by
 * adding the `pii-reviewed` label to the PR (workflow sets PII_OVERRIDE=1).
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log(
    "ℹ️  DATABASE_URL not set — skipping DB-aware PII gate. Add the secret (read-only role) to enable.",
  );
  process.exit(0);
}

const MODE =
  process.env.MODE ||
  (process.env.GITHUB_EVENT_NAME === "schedule" ? "full" : "diff");
const OVERRIDE = process.env.PII_OVERRIDE === "1";

const norm = (s) => String(s ?? "").trim().toLowerCase();
const digitsOf = (s) => String(s ?? "").replace(/\D/g, "");
const mark = (v) => createHash("sha256").update(v).digest("hex").slice(0, 10);

// --- Pull match sets from the DB (kept in memory only). Fail open on error. ---
let emails = new Set();
let phones = new Set();
let names = [];
try {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(DATABASE_URL);
  const signups = await sql`select first_name, last_name, email, phone from signups`;
  const admins = await sql`select email from admins`;
  for (const r of signups) {
    if (r.email) emails.add(norm(r.email));
    const d = digitsOf(r.phone);
    if (d.length >= 10) phones.add(d.slice(-10));
    const f = norm(r.first_name);
    const l = norm(r.last_name);
    if (f.length >= 2 && l.length >= 2) names.push(`${f} ${l}`);
  }
  for (const r of admins) if (r.email) emails.add(norm(r.email));
} catch (err) {
  console.log(
    `⚠️  DB-aware PII gate could not read the database — failing OPEN (not blocking). ${err?.message ?? err}`,
  );
  process.exit(0);
}
names = [...new Set(names)];
console.log(
  `DB-aware PII gate: ${emails.size} emails, ${phones.size} phones, ${names.length} names in match set. Mode=${MODE}.`,
);

// --- Collect lines to scan: [{ file, line, text }] ---
const SKIP_FILE = (f) =>
  f === "package-lock.json" ||
  f === "scripts/pii-gate.mjs" ||
  f.startsWith(".github/workflows/") ||
  f.startsWith("node_modules/");

function addedLines() {
  const base = process.env.BASE_SHA;
  const head = process.env.HEAD_SHA || "HEAD";
  const range = base ? `${base}...${head}` : "HEAD~1...HEAD";
  let diff = "";
  try {
    diff = execSync(
      `git diff --unified=0 --no-color ${range} -- .`,
      { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
    );
  } catch (e) {
    console.log(`⚠️  could not compute diff (${e?.message ?? e}) — failing OPEN.`);
    process.exit(0);
  }
  const out = [];
  let file = null;
  let lineNo = 0;
  for (const ln of diff.split("\n")) {
    if (ln.startsWith("+++ b/")) {
      file = ln.slice(6);
      continue;
    }
    const m = ln.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (m) {
      lineNo = parseInt(m[1], 10);
      continue;
    }
    if (ln.startsWith("+") && !ln.startsWith("+++")) {
      if (file && !SKIP_FILE(file)) out.push({ file, line: lineNo, text: ln.slice(1) });
      lineNo++;
    }
  }
  return out;
}

function allTrackedLines() {
  const files = execSync("git ls-files", { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((f) => !SKIP_FILE(f));
  const out = [];
  for (const f of files) {
    let txt;
    try {
      txt = readFileSync(f, "utf8");
    } catch {
      continue; // binary / unreadable
    }
    txt.split("\n").forEach((t, i) => out.push({ file: f, line: i + 1, text: t }));
  }
  return out;
}

const lines = MODE === "full" ? allTrackedLines() : addedLines();

// --- Scan ---
const blocks = [];
const warns = [];
const seen = new Set();
for (const { file, line, text } of lines) {
  const low = text.toLowerCase();
  const dig = digitsOf(text);
  for (const e of emails) {
    if (low.includes(e)) {
      const k = `e:${file}:${line}:${e}`;
      if (!seen.has(k)) { seen.add(k); blocks.push({ file, line, type: "email", m: mark(e) }); }
    }
  }
  if (dig.length >= 10) {
    for (const p of phones) {
      if (dig.includes(p)) {
        const k = `p:${file}:${line}:${p}`;
        if (!seen.has(k)) { seen.add(k); blocks.push({ file, line, type: "phone", m: mark(p) }); }
      }
    }
  }
  for (const n of names) {
    if (low.includes(n)) {
      const k = `n:${file}:${line}:${n}`;
      if (!seen.has(k)) { seen.add(k); warns.push({ file, line, type: "name", m: mark(n) }); }
    }
  }
}

if (warns.length) {
  console.log(`\n⚠️  ${warns.length} possible name match(es) (warn-only — names are noisy):`);
  for (const w of warns) console.log(`    ${w.file}:${w.line}  name  sha:${w.m}`);
}

if (blocks.length) {
  console.log(`\n✖ ${blocks.length} DB-sourced PII match(es) (email/phone) in changes:`);
  for (const b of blocks) console.log(`    ${b.file}:${b.line}  ${b.type}  sha:${b.m}`);
  if (OVERRIDE) {
    console.log("\n'pii-reviewed' label present — overriding the block (exit 0).");
    process.exit(0);
  }
  console.log(
    "\nThis is real PII from the database. Remove it (use env / the DB / a placeholder).",
  );
  console.log("If this is a reviewed false positive, add the 'pii-reviewed' label to the PR.");
  process.exit(1);
}

console.log("\n✓ DB-aware PII gate: no DB emails/phones found in the scanned changes.");
process.exit(0);
