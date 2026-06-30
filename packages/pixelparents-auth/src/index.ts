// @pixelparents/auth — "Sign in with Pixel Parents" client SDK.
//
// OAuth 2.0 Authorization Code + PKCE (S256) + OpenID Connect against the Pixel
// Parents provider. The headline feature is a signed `ohs_verified` claim: a
// cryptographic assertion that the user is a verified Stanford OHS student or
// parent — something Google/Apple/GitHub can't give you.
//
// Two halves:
//   • Browser:  PixelParentsClient (signIn / handleRedirectCallback / popup).
//               Generates PKCE + state + nonce, builds the authorize URL.
//   • Server:   exchangeCode (code → tokens) + verifyIdToken (JWKS/RS256 + nonce).
//               These carry the client_secret and verify signatures, so keep them
//               server-side.

export { PixelParentsClient, postCallbackToOpener } from "./browser.js";
export type {
  PixelParentsClientOptions,
  SignInOptions,
  CallbackResult,
} from "./browser.js";

export {
  generatePkcePair,
  deriveS256Challenge,
  generateState,
  generateNonce,
  randomUrlSafe,
} from "./pkce.js";
export type { PkcePair } from "./pkce.js";

export { buildAuthorizeUrl, normalizeScope } from "./authorize-url.js";
export type { BuildAuthorizeUrlOptions } from "./authorize-url.js";

export { exchangeCode, verifyIdToken, decodeJwtUnsafe } from "./token.js";
export type { ExchangeCodeOptions, VerifyIdTokenOptions } from "./token.js";

export { defaultEndpoints, fetchEndpoints, normalizeIssuer } from "./endpoints.js";
export type { ProviderEndpoints } from "./endpoints.js";

export { OAuthError, MVP_SCOPES } from "./types.js";
export type {
  Scope,
  MvpScope,
  IdTokenClaims,
  TokenResponse,
  AuthRequestState,
} from "./types.js";
