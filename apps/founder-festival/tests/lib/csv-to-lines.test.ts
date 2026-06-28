import { describe, it, expect } from "vitest";
import { parseCsv, csvToJobLines, parseCsvRows } from "@/lib/csv-to-lines";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("respects quoted commas", () => {
    expect(parseCsv('"a,b",c')).toEqual([["a,b", "c"]]);
  });

  it("respects quoted newlines", () => {
    expect(parseCsv('"a\nb",c')).toEqual([["a\nb", "c"]]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsv('"a""b",c')).toEqual([['a"b', "c"]]);
  });

  it("handles CRLF and a trailing newline", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("returns empty for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("csvToJobLines", () => {
  it("maps a name,company header to 'Name, Company' lines", () => {
    const out = csvToJobLines("name,company\nJane Doe,Acme\nJohn Smith,Globex");
    expect(out).toBe("Jane Doe, Acme\nJohn Smith, Globex");
  });

  it("emits the LinkedIn URL when a url column is present", () => {
    const out = csvToJobLines(
      "name,linkedin\nJane,https://linkedin.com/in/jane\nJohn,linkedin.com/in/john",
    );
    expect(out).toBe("https://linkedin.com/in/jane\nlinkedin.com/in/john");
  });

  it("combines first/last name columns", () => {
    const out = csvToJobLines("first name,last name,company\nJane,Doe,Acme");
    expect(out).toBe("Jane Doe, Acme");
  });

  it("treats a headerless file positionally (col0=name, col1=company)", () => {
    const out = csvToJobLines("Jane Doe,Acme\nJohn Smith,Globex");
    expect(out).toBe("Jane Doe, Acme\nJohn Smith, Globex");
  });

  it("detects a LinkedIn URL cell even without a url header", () => {
    const out = csvToJobLines("Jane Doe,https://www.linkedin.com/in/jane");
    expect(out).toBe("https://www.linkedin.com/in/jane");
  });

  it("emits a name with no company when only one column is present", () => {
    const out = csvToJobLines("name\nJane Doe\nJohn Smith");
    expect(out).toBe("Jane Doe\nJohn Smith");
  });

  it("skips blank rows and rows with no name", () => {
    const out = csvToJobLines("name,company\nJane,Acme\n\n,Globex\nJohn,Initech");
    expect(out).toBe("Jane, Acme\nJohn, Initech");
  });

  it("preserves a comma inside a quoted company field", () => {
    const out = csvToJobLines('name,company\nJane,"Acme, Inc"');
    expect(out).toBe("Jane, Acme, Inc");
  });

  it("returns empty string for empty input", () => {
    expect(csvToJobLines("")).toBe("");
  });

  it("strips the Founder Festival template boilerplate + header above the data", () => {
    const csv = [
      "Founder Festival CSV Template,,",
      '"NOTE: All columns are optional. The more data you fill in, the higher the chance of a match.",,',
      "The system is flexible so a CSV doesn't have to look exactly like this. Just try whatever you've got.,,",
      ",,",
      "Full Name,Company,LinkedIn",
      "Jane Doe,Acme,",
      "John Smith,Globex,",
    ].join("\n");
    expect(csvToJobLines(csv)).toBe("Jane Doe, Acme\nJohn Smith, Globex");
  });

  it("yields nothing for the blank template (boilerplate + header, no data rows)", () => {
    const csv = [
      "Founder Festival CSV Template,,",
      '"NOTE: All columns are optional. The more data you fill in, the higher the chance of a match.",,',
      "The system is flexible so a CSV doesn't have to look exactly like this. Just try whatever you've got.,,",
      ",,",
      "Full Name,Company,LinkedIn",
    ].join("\n");
    expect(csvToJobLines(csv)).toBe("");
  });
});

describe("parseCsvRows — structured rows with email + location", () => {
  it("maps name, company, email, city/state/country columns", () => {
    const csv =
      "Full Name,Company,Email,City,State,Country\n" +
      "Jane Doe,Acme,Jane@Acme.com,San Francisco,CA,USA";
    expect(parseCsvRows(csv)).toEqual([
      { name: "Jane Doe", company: "Acme", email: "jane@acme.com", city: "San Francisco", region: "CA", country: "USA" },
    ]);
  });

  it("captures LinkedIn URL AND name/email/location together (not either/or)", () => {
    const csv =
      "Name,LinkedIn,Email,Location\n" +
      "Jane Doe,https://linkedin.com/in/jane,jane@acme.com,\"Austin, TX, USA\"";
    expect(parseCsvRows(csv)).toEqual([
      { name: "Jane Doe", linkedinUrl: "https://linkedin.com/in/jane", email: "jane@acme.com", locationRaw: "Austin, TX, USA" },
    ]);
  });

  it("picks the LinkedIn URL, NOT another url column (e.g. Luma qr_code_url)", () => {
    const csv =
      "guest_id,name,first_name,last_name,email,qr_code_url,What is your LinkedIn profile?,What company do you work for?\n" +
      "gst-1,Jane Doe,Jane,Doe,jane@acme.com,https://luma.com/check-in/abc,https://linkedin.com/in/janedoe,Acme AI";
    expect(parseCsvRows(csv)).toEqual([
      { name: "Jane Doe", company: "Acme AI", linkedinUrl: "https://linkedin.com/in/janedoe", email: "jane@acme.com" },
    ]);
  });

  it("strips a leading BOM on the first header", () => {
    const csv = "﻿first_name,last_name,email\nErika,Anderson,erika@x.com";
    expect(parseCsvRows(csv)).toEqual([{ name: "Erika Anderson", email: "erika@x.com" }]);
  });

  it("maps verbose 'work email' / company headers via contains-fallback", () => {
    const csv = "Name,Company Name,Work Email Address\nJane Doe,Acme,jane@acme.com";
    expect(parseCsvRows(csv)).toEqual([{ name: "Jane Doe", company: "Acme", email: "jane@acme.com" }]);
  });

  it("captures phone (phone_number) and job title columns", () => {
    const csv = "name,email,phone_number,What is your job title?\nJane Doe,jane@acme.com,+12025550123,Founder & CEO";
    expect(parseCsvRows(csv)).toEqual([
      { name: "Jane Doe", email: "jane@acme.com", phone: "+12025550123", jobTitle: "Founder & CEO" },
    ]);
  });

  it("maps a free-text Location column to locationRaw (server splits it later)", () => {
    const csv = "Name,Location\nJane Doe,\"San Francisco Bay Area\"";
    expect(parseCsvRows(csv)).toEqual([{ name: "Jane Doe", locationRaw: "San Francisco Bay Area" }]);
  });

  it("positional fallback (no header) still yields name + company", () => {
    expect(parseCsvRows("Jane Doe,Acme")).toEqual([{ name: "Jane Doe", company: "Acme" }]);
  });

  it("strips template boilerplate rows", () => {
    const csv = "Founder Festival CSV Template\nName,Email\nJane Doe,jane@acme.com";
    expect(parseCsvRows(csv)).toEqual([{ name: "Jane Doe", email: "jane@acme.com" }]);
  });

  it("omits empty optional fields (no null keys)", () => {
    const rows = parseCsvRows("Name,Email\nJane Doe,");
    expect(rows[0]).toEqual({ name: "Jane Doe" });
  });

  it("recognizes underscore headers (first_name/last_name/email)", () => {
    const csv = "first_name,last_name,email\nErika,Anderson,erika@build.com";
    expect(parseCsvRows(csv)).toEqual([
      { name: "Erika Anderson", email: "erika@build.com" },
    ]);
  });

  it("recognizes hyphen/underscore variants (linkedin_url, work-email)", () => {
    const csv = "Full Name,linkedin_url,work-email\nJane Doe,https://linkedin.com/in/jane,jane@acme.com";
    expect(parseCsvRows(csv)).toEqual([
      { name: "Jane Doe", linkedinUrl: "https://linkedin.com/in/jane", email: "jane@acme.com" },
    ]);
  });
});

// Tab-separated (TSV) files / Google-Sheets exports use tabs, not commas, as the
// field delimiter. Splitting on commas only collapsed the whole row into one
// cell — the source of the duplicate-profile / wrong-LinkedIn bug.
describe("parseCsv — tab-delimited (TSV) input", () => {
  it("splits tab-separated rows into fields", () => {
    expect(parseCsv("a\tb\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps comma rows working (commas win when no tabs present)", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("parseCsvRows — TSV with headers maps columns correctly", () => {
  it("maps Full Name / First / Last / Email from a tab-delimited export", () => {
    const tsv = "Full Name\tFirst\tLast\tEmail\nJordan Lee\tJordan\tLee\tjordan@northwind.io";
    expect(parseCsvRows(tsv)).toEqual([
      { name: "Jordan Lee", email: "jordan@northwind.io" },
    ]);
  });
});
