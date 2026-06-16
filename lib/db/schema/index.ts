// Schema barrel. Each domain owns its own file and is re-exported here so the
// Drizzle client and drizzle-kit see one unified schema. The in-flight signup
// feature should add its `signups` / `children` tables as sibling files and
// re-export them here too.
export * from "./api-keys";
export * from "./signups";
export * from "./admins";
