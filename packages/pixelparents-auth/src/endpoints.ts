// Endpoint resolution. By default we derive the endpoint URLs from the issuer
// using the live Pixel Parents path layout, which avoids an extra network round
// trip. Callers who prefer strict spec behaviour can pass `discover: true` to the
// client to fetch /.well-known/openid-configuration instead.

export type ProviderEndpoints = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
};

// Strip trailing slashes so we never produce a `//path`.
export function normalizeIssuer(issuer: string): string {
  return issuer.replace(/\/+$/, "");
}

// The real provider's path layout (see app/.well-known/openid-configuration):
//   authorization_endpoint: {issuer}/oauth/authorize
//   token_endpoint:         {issuer}/api/oauth/token
//   jwks_uri:               {issuer}/.well-known/jwks.json
export function defaultEndpoints(issuer: string): ProviderEndpoints {
  const base = normalizeIssuer(issuer);
  return {
    issuer: base,
    authorizationEndpoint: `${base}/oauth/authorize`,
    tokenEndpoint: `${base}/api/oauth/token`,
    jwksUri: `${base}/.well-known/jwks.json`,
  };
}

// The subset of the OIDC discovery document we rely on.
type DiscoveryDoc = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

// Fetch + validate the discovery document. Only used when `discover: true`.
export async function fetchEndpoints(
  issuer: string,
  fetchImpl: typeof fetch,
): Promise<ProviderEndpoints> {
  const base = normalizeIssuer(issuer);
  const res = await fetchImpl(`${base}/.well-known/openid-configuration`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch OIDC discovery document (${res.status}) from ${base}`);
  }
  const doc = (await res.json()) as Partial<DiscoveryDoc>;
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
    throw new Error("OIDC discovery document is missing required endpoints.");
  }
  // Guard against issuer mismatch (a misconfigured or spoofed discovery doc).
  if (doc.issuer && normalizeIssuer(doc.issuer) !== base) {
    throw new Error(
      `Discovery issuer "${doc.issuer}" does not match the configured issuer "${base}".`,
    );
  }
  return {
    issuer: base,
    authorizationEndpoint: doc.authorization_endpoint,
    tokenEndpoint: doc.token_endpoint,
    jwksUri: doc.jwks_uri,
  };
}
