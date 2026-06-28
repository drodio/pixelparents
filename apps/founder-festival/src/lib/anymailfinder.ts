import { fetchWithTimeout } from "@/lib/fetch-timeout";
// AnyMailFinder person-email lookup.
// POST https://api.anymailfinder.com/v5.1/find-email/person
// Accepts linkedin_url alone, or name + company (domain/company_name), or all.
// AnyMailFinder bills ONE credit ONLY when email_status === "valid"; risky,
// not_found, and blacklisted are free. We mirror that: a "hit" === "valid".

export type AmfStatus = "valid" | "risky" | "not_found" | "blacklisted";
export type AmfResult = { email: string | null; status: AmfStatus };

const ENDPOINT = "https://api.anymailfinder.com/v5.1/find-email/person";

export async function findPersonEmail(input: {
  apiKey: string;
  linkedinUrl?: string | null;
  fullName?: string | null;
  domain?: string | null;
}): Promise<AmfResult> {
  const body: Record<string, string> = {};
  if (input.linkedinUrl) body.linkedin_url = input.linkedinUrl;
  if (input.fullName) body.full_name = input.fullName;
  if (input.domain) body.domain = input.domain;

  const res = await fetchWithTimeout(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` },
    body: JSON.stringify(body),
  });

  if (res.status === 401) throw new Error("anymailfinder: unauthorized (bad API key)");
  if (res.status === 402) throw new Error("anymailfinder: out of credits (402)");
  // 400 = not enough/!valid input for THIS profile — treat as a miss, not a crash,
  // so one bad row never aborts a batch.
  if (!res.ok) return { email: null, status: "not_found" };

  const data = (await res.json()) as { valid_email?: string | null; email?: string | null; email_status?: AmfStatus };
  const status: AmfStatus = data.email_status ?? "not_found";
  return { email: status === "valid" ? data.valid_email ?? data.email ?? null : null, status };
}
