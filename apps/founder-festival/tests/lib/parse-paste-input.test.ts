import { describe, it, expect } from "vitest";
import { parsePasteInput } from "@/lib/parse-paste-input";

describe("parsePasteInput — line-based input (existing behavior)", () => {
  it("parses LinkedIn URLs", () => {
    const r = parsePasteInput("https://linkedin.com/in/jane-doe\nlinkedin.com/in/john");
    expect(r).toEqual([
      { kind: "url", raw: "https://linkedin.com/in/jane-doe", linkedinUrl: "https://linkedin.com/in/jane-doe" },
      { kind: "url", raw: "linkedin.com/in/john", linkedinUrl: "https://linkedin.com/in/john" },
    ]);
  });

  it("parses Name, Company", () => {
    const r = parsePasteInput("Jane Doe, Acme\nJohn Smith");
    expect(r).toEqual([
      { kind: "nameCompany", raw: "Jane Doe, Acme", name: "Jane Doe", company: "Acme" },
      { kind: "nameCompany", raw: "John Smith", name: "John Smith", company: null },
    ]);
  });

  it("skips comments and blank lines", () => {
    const r = parsePasteInput("# header\n\nJane Doe, Acme\n");
    expect(r).toEqual([
      { kind: "nameCompany", raw: "Jane Doe, Acme", name: "Jane Doe", company: "Acme" },
    ]);
  });
});

describe("parsePasteInput — inline email extraction", () => {
  it("pulls an email out of a 3-part line (name, company, email)", () => {
    const r = parsePasteInput("Jane Doe, Acme, jane@acme.com");
    expect(r).toEqual([
      { kind: "nameCompany", raw: "Jane Doe, Acme, jane@acme.com", name: "Jane Doe", company: "Acme", email: "jane@acme.com" },
    ]);
  });
  it("email as the 2nd field does NOT become the company", () => {
    const r = parsePasteInput("Jane Doe, jane@acme.com");
    expect(r).toEqual([
      { kind: "nameCompany", raw: "Jane Doe, jane@acme.com", name: "Jane Doe", company: null, email: "jane@acme.com" },
    ]);
  });
  it("lowercases the email", () => {
    expect((parsePasteInput("Jane Doe, Acme, Jane@Acme.COM")[0] as { email?: string }).email).toBe("jane@acme.com");
  });
  it("a line with no email is unchanged (no email key)", () => {
    const r = parsePasteInput("Jane Doe, Acme");
    expect(r[0]).not.toHaveProperty("email");
  });
  it("attaches a trailing email to a URL line", () => {
    const r = parsePasteInput("https://linkedin.com/in/jane jane@acme.com");
    expect(r[0]).toMatchObject({ kind: "url", linkedinUrl: "https://linkedin.com/in/jane", email: "jane@acme.com" });
  });
});

describe("parsePasteInput — inline phone extraction", () => {
  it("pulls email + phone out, leaving a clean name", () => {
    const r = parsePasteInput("Daniel Odio, drodio@gmail.com, +16502747647");
    expect(r[0]).toMatchObject({
      kind: "nameCompany",
      name: "Daniel Odio",
      company: null,
      email: "drodio@gmail.com",
      phone: "+16502747647",
    });
  });
  it("normalizes a 10-digit US phone to +1", () => {
    expect((parsePasteInput("Jane Doe, 650-274-7647")[0] as { phone?: string }).phone).toBe("+16502747647");
  });
  it("keeps an explicit +country phone as-is (digits only)", () => {
    expect((parsePasteInput("Jane Doe, +44 20 7946 0958")[0] as { phone?: string }).phone).toBe("+442079460958");
  });
  it("no phone key when the line has none (and a year isn't a phone)", () => {
    expect(parsePasteInput("Jane Doe, Acme 2024")[0]).not.toHaveProperty("phone");
  });
});

describe("parsePasteInput — YC-style multi-line paste", () => {
  const ycPaste = `Avery Quinn
W09
Founder/CPO at
Skylight (W09)
Jan 2008 - Present
·
United States
·
Previously at
Chronicle Books
,
7 more
Jordan Blake
Jordan Blake
W09
Founder/CEO at
Skylight (W09)
Sep 2007 - Present
·
San Francisco, CA, USA
·
Previously at
Jordan Blake
,
1 more
Casey Tran
Casey Tran
S13
Founder at
Dashwave (S13)
Jan 2013 - Present
·
San Francisco, CA, USA
·
Previously at
Stanford University
,
2 more
Devon Park
Devon Park
S13
Founder/CEO at
Dashwave (S13)
May 2013 - Present
·
San Francisco, CA, USA
·
Previously at
Square
,
5 more
Riley Soto
Riley Soto
S13
Founder at
Dashwave (S13)
Dec 2012 - Present
·
San Francisco, CA, USA
·
Previously at
Facebook
Morgan Ellis
Morgan Ellis
S12
Founder/CEO at
Chainbase (S12)
May 2012 - Present
·
Los Angeles, CA, USA
·
Previously at
Skylight (W09)
,
3 more
Aarav Mehta
Aarav Mehta
W18
Founder at
Sprout (W18)
Bengaluru, India
·
Previously at
Ivy Comptech
Vikram Rao
Vikram Rao
W18
Founder at
Sprout (W18)
Apr 2016 - Present
·
Bengaluru, KA, India
·
Previously at
Sprout (W18)
,
7 more
Rohan Iyer
Rohan Iyer
W18
Founder/COO at
Sprout (W18)
Apr 2016 - Present
·
Bengaluru, India
·
Previously at
Sprout (W18)`;

  it("extracts (name, company) for every entry", () => {
    const r = parsePasteInput(ycPaste);
    const pairs = r.map((p) =>
      p.kind === "nameCompany" ? { name: p.name, company: p.company } : null,
    );
    expect(pairs).toEqual([
      { name: "Avery Quinn", company: "Skylight" },
      { name: "Jordan Blake", company: "Skylight" },
      { name: "Casey Tran", company: "Dashwave" },
      { name: "Devon Park", company: "Dashwave" },
      { name: "Riley Soto", company: "Dashwave" },
      { name: "Morgan Ellis", company: "Chainbase" },
      { name: "Aarav Mehta", company: "Sprout" },
      { name: "Vikram Rao", company: "Sprout" },
      { name: "Rohan Iyer", company: "Sprout" },
    ]);
  });

  it("dedupes identical (name, company) pairs", () => {
    const dup = `Jane Doe
W22
Founder at
Acme (W22)
Jane Doe
W22
Founder at
Acme (W22)`;
    const r = parsePasteInput(dup);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "nameCompany", name: "Jane Doe", company: "Acme" });
  });

  it("handles single entry without surrounding boilerplate", () => {
    const single = `Jane Doe
W22
Founder at
Acme (W22)`;
    const r = parsePasteInput(single);
    expect(r).toEqual([
      { kind: "nameCompany", raw: "Jane Doe, Acme", name: "Jane Doe", company: "Acme" },
    ]);
  });

  it("handles Co-Founder role variants", () => {
    const co = `Jane Doe
W22
Co-Founder/CEO at
Acme (W22)`;
    const r = parsePasteInput(co);
    expect(r).toEqual([
      { kind: "nameCompany", raw: "Jane Doe, Acme", name: "Jane Doe", company: "Acme" },
    ]);
  });
});

// Tab-separated rows are what you get pasting from Google Sheets / Excel / a TSV
// export. Previously the whole row collapsed into `name` (only commas were
// split), which corrupted LinkedIn resolution — see the duplicate-profile bug.
describe("parsePasteInput — tab-separated rows (Sheets/Excel paste)", () => {
  it("takes the first tab field as the name, not the whole row", () => {
    const r = parsePasteInput("Jordan Lee\tJordan\tLee\tjordan@northwind.io");
    expect(r).toEqual([
      {
        kind: "nameCompany",
        raw: "Jordan Lee\tJordan\tLee\tjordan@northwind.io",
        name: "Jordan Lee",
        company: null,
        email: "jordan@northwind.io",
      },
    ]);
  });

  it("treats a 2-column Name\\tCompany row as name + company", () => {
    const r = parsePasteInput("Jane Doe\tAcme");
    expect(r).toEqual([
      { kind: "nameCompany", raw: "Jane Doe\tAcme", name: "Jane Doe", company: "Acme" },
    ]);
  });

  it("does NOT treat a repeated first/last-name column as the company", () => {
    // Full Name, First, Last, Company, Email — only the real company survives.
    const r = parsePasteInput("Jane Doe\tJane\tDoe\tAcme\tjane@acme.com");
    expect(r).toEqual([
      {
        kind: "nameCompany",
        raw: "Jane Doe\tJane\tDoe\tAcme\tjane@acme.com",
        name: "Jane Doe",
        company: "Acme",
        email: "jane@acme.com",
      },
    ]);
  });
});
