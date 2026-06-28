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
  const ycPaste = `Joe Gebbia
W09
Founder/CPO at
Airbnb (W09)
Jan 2008 - Present
·
United States
·
Previously at
Chronicle Books
,
7 more
Brian Chesky
Brian Chesky
W09
Founder/CEO at
Airbnb (W09)
Sep 2007 - Present
·
San Francisco, CA, USA
·
Previously at
Brian Chesky
,
1 more
Andy Fang
Andy Fang
S13
Founder at
DoorDash (S13)
Jan 2013 - Present
·
San Francisco, CA, USA
·
Previously at
Stanford University
,
2 more
Tony Xu
Tony Xu
S13
Founder/CEO at
DoorDash (S13)
May 2013 - Present
·
San Francisco, CA, USA
·
Previously at
Square
,
5 more
Stanley Tang
Stanley Tang
S13
Founder at
DoorDash (S13)
Dec 2012 - Present
·
San Francisco, CA, USA
·
Previously at
Facebook
Brian Armstrong
Brian Armstrong
S12
Founder/CEO at
Coinbase (S12)
May 2012 - Present
·
Los Angeles, CA, USA
·
Previously at
Airbnb (W09)
,
3 more
Neeraj Singh
Neeraj Singh
W18
Founder at
Groww (W18)
Bengaluru, India
·
Previously at
Ivy Comptech
Ishan Bansal
Ishan Bansal
W18
Founder at
Groww (W18)
Apr 2016 - Present
·
Bengaluru, KA, India
·
Previously at
Groww (W18)
,
7 more
Harsh Jain
Harsh Jain
W18
Founder/COO at
Groww (W18)
Apr 2016 - Present
·
Bengaluru, India
·
Previously at
Groww (W18)`;

  it("extracts (name, company) for every entry", () => {
    const r = parsePasteInput(ycPaste);
    const pairs = r.map((p) =>
      p.kind === "nameCompany" ? { name: p.name, company: p.company } : null,
    );
    expect(pairs).toEqual([
      { name: "Joe Gebbia", company: "Airbnb" },
      { name: "Brian Chesky", company: "Airbnb" },
      { name: "Andy Fang", company: "DoorDash" },
      { name: "Tony Xu", company: "DoorDash" },
      { name: "Stanley Tang", company: "DoorDash" },
      { name: "Brian Armstrong", company: "Coinbase" },
      { name: "Neeraj Singh", company: "Groww" },
      { name: "Ishan Bansal", company: "Groww" },
      { name: "Harsh Jain", company: "Groww" },
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
    const r = parsePasteInput("Mayank Mehta\tMayank\tMehta\tmayank@pulse.qa");
    expect(r).toEqual([
      {
        kind: "nameCompany",
        raw: "Mayank Mehta\tMayank\tMehta\tmayank@pulse.qa",
        name: "Mayank Mehta",
        company: null,
        email: "mayank@pulse.qa",
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
