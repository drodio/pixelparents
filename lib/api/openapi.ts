import { API_VERSION } from "./http";
import {
  OHS_AFFILIATIONS,
  TECHNICAL_DEPTH,
  SKILLSETS,
  TIME_COMMITMENT,
  GRADES,
  BUILDER_INTEREST,
  COUNTRIES,
} from "@/lib/options";

// Machine-readable OpenAPI 3.1 description of the public v1 API, served at
// /api/v1/openapi.json so consumers can generate typed clients. Kept in one
// place so the spec and the taxonomies can't drift.

const countMap = {
  type: "object",
  additionalProperties: { type: "integer" },
  description: "Map of dimension value -> count.",
} as const;

const filterParams = [
  ["state", "US state (full name or USPS abbreviation, e.g. CA)"],
  ["country", "Country", COUNTRIES],
  ["affiliation", "OHS affiliation", OHS_AFFILIATIONS],
  ["tech_depth", "Self-described technical depth", TECHNICAL_DEPTH],
  ["time_commitment", "Weekly time commitment", TIME_COMMITMENT],
  ["skillset", "Skillset tag", SKILLSETS],
  ["grade", "Child grade", GRADES],
  ["builder_interest", "Interest in building Pixel Parents software", BUILDER_INTEREST],
].map(([name, description, en]) => ({
  name,
  in: "query",
  required: false,
  description: `Filter the population by ${description}. Filtered counts below 5 are suppressed.`,
  schema: en ? { type: "string", enum: [...(en as readonly string[])] } : { type: "string" },
}));

const authed = { security: [{ bearerAuth: [] }] };
const ok = (ref: string) => ({
  "200": {
    description: "OK",
    content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } },
  },
});

export function openapiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Pixel Parents API",
      version: API_VERSION,
      description:
        "High-level, non-PII community stats for the Pixel Parents (Stanford OHS) builder community. Returns counts and taxonomies only — never names, emails, phones, or photos. Request access at /developers.",
      contact: { name: "Pixel Parents", url: "https://pixelparents.org/developers" },
    },
    servers: [{ url: "https://pixelparents.org", description: "Production" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "Approved API key." },
      },
      schemas: {
        Error: {
          type: "object",
          properties: { error: { type: "string" }, messages: { type: "array", items: { type: "string" } } },
        },
        Health: {
          type: "object",
          properties: {
            status: { type: "string" },
            version: { type: "string" },
            database: { type: "string", enum: ["ready", "pending"] },
            time: { type: "string", format: "date-time" },
          },
        },
        Stats: {
          type: "object",
          properties: {
            total_signups: { type: ["integer", "null"] },
            total_families: { type: ["integer", "null"] },
            total_children: { type: ["integer", "null"] },
            suppressed: { type: "boolean" },
            updated_at: { type: "string", format: "date-time" },
            database: { type: "string", enum: ["ready", "pending"] },
          },
        },
        Breakdowns: {
          type: "object",
          properties: {
            signups_by_state: countMap,
            signups_by_country: countMap,
            signups_by_affiliation: countMap,
            signups_by_tech_depth: countMap,
            signups_by_time_commitment: countMap,
            signups_by_skillset: countMap,
            signups_by_builder_interest: countMap,
            signups_by_grade: countMap,
            skillsets_by_tech_depth: {
              type: "object",
              additionalProperties: countMap,
              description: "Skillset counts nested within each technical-depth tier.",
            },
            top_interests: {
              type: "array",
              items: {
                type: "object",
                properties: { interest: { type: "string" }, count: { type: "integer" } },
              },
            },
            updated_at: { type: "string", format: "date-time" },
            database: { type: "string", enum: ["ready", "pending"] },
          },
        },
        Trends: {
          type: "object",
          properties: {
            interval: { type: "string", enum: ["week", "month"] },
            points: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  period: { type: "string" },
                  signups: { type: "integer" },
                  cumulative: { type: "integer" },
                },
              },
            },
            updated_at: { type: "string", format: "date-time" },
            database: { type: "string", enum: ["ready", "pending"] },
          },
        },
        Options: { type: "object", description: "Static taxonomies + live interests pool." },
      },
    },
    paths: {
      "/api/v1": {
        get: { summary: "API discovery index", security: [], responses: { "200": { description: "OK" } } },
      },
      "/api/v1/health": {
        get: { summary: "Liveness + version", security: [], responses: ok("Health") },
      },
      "/api/v1/openapi.json": {
        get: { summary: "This spec", security: [], responses: { "200": { description: "OK" } } },
      },
      "/api/v1/me": {
        get: { summary: "Confirm key validity", ...authed, responses: { "200": { description: "OK" } } },
      },
      "/api/v1/stats": {
        get: {
          summary: "Community totals (filterable)",
          ...authed,
          parameters: filterParams,
          responses: { ...ok("Stats"), "400": { description: "Invalid filter", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } },
        },
      },
      "/api/v1/breakdowns": {
        get: {
          summary: "Counts by dimension (filterable)",
          ...authed,
          parameters: filterParams,
          responses: ok("Breakdowns"),
        },
      },
      "/api/v1/trends": {
        get: {
          summary: "Signups over time",
          ...authed,
          parameters: [
            { name: "interval", in: "query", required: false, schema: { type: "string", enum: ["week", "month"] } },
          ],
          responses: ok("Trends"),
        },
      },
      "/api/v1/options": {
        get: { summary: "Taxonomies + interests pool", ...authed, responses: ok("Options") },
      },
      "/api/mcp": {
        post: {
          summary: "MCP server (JSON-RPC 2.0) — AI-agent tools over the same data",
          ...authed,
          responses: { "200": { description: "JSON-RPC response" } },
        },
      },
    },
  };
}
