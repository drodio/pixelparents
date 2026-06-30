import { generatePkcePair, generateState, generateNonce } from "./pkce.js";
import { buildAuthorizeUrl } from "./authorize-url.js";
import { defaultEndpoints, fetchEndpoints, type ProviderEndpoints } from "./endpoints.js";
import { OAuthError, type AuthRequestState, type Scope } from "./types.js";

const DEFAULT_ISSUER = "https://pixelparents.org";
const STORAGE_PREFIX = "pp_auth:";

export type PixelParentsClientOptions = {
  clientId: string;
  redirectUri: string;
  /** Defaults to https://pixelparents.org. Set for self-hosted / preview deploys. */
  issuer?: string;
  /** Default scopes for signIn() if none are passed per-call. */
  scope?: readonly Scope[] | string;
  /** If true, fetch /.well-known/openid-configuration instead of deriving paths. */
  discover?: boolean;
};

export type SignInOptions = {
  scope?: readonly Scope[] | string;
  /** "redirect" (default) navigates the page; "popup" opens a window. */
  display?: "redirect" | "popup";
  extraParams?: Record<string, string>;
};

// What handleRedirectCallback returns: the raw code + the persisted request
// state. The caller hands these to a SERVER endpoint to do the secret-bearing
// token exchange (exchangeCode) — the secret must never reach the browser.
export type CallbackResult = {
  code: string;
  state: string;
  /** The values you persisted before redirecting — pass codeVerifier + redirectUri to the token exchange. */
  request: AuthRequestState;
};

// A browser-side helper around the Authorization Code + PKCE flow. It owns PKCE /
// state / nonce generation, persistence in sessionStorage, building the authorize
// URL, and reading the code back on the callback. It deliberately does NOT do the
// token exchange (that needs the client secret and must run server-side).
export class PixelParentsClient {
  private readonly clientId: string;
  private readonly redirectUri: string;
  private readonly issuer: string;
  private readonly defaultScope: readonly Scope[] | string;
  private readonly discover: boolean;
  private endpointsCache: ProviderEndpoints | null = null;

  constructor(opts: PixelParentsClientOptions) {
    if (!opts.clientId) throw new Error("PixelParentsClient: clientId is required.");
    if (!opts.redirectUri) throw new Error("PixelParentsClient: redirectUri is required.");
    this.clientId = opts.clientId;
    this.redirectUri = opts.redirectUri;
    this.issuer = (opts.issuer ?? DEFAULT_ISSUER).replace(/\/+$/, "");
    this.defaultScope = opts.scope ?? ["openid", "ohs_verified"];
    this.discover = opts.discover ?? false;
  }

  async getEndpoints(): Promise<ProviderEndpoints> {
    if (this.endpointsCache) return this.endpointsCache;
    this.endpointsCache = this.discover
      ? await fetchEndpoints(this.issuer, fetch)
      : defaultEndpoints(this.issuer);
    return this.endpointsCache;
  }

  // Build the authorize URL AND persist the PKCE verifier / state / nonce so the
  // callback can complete the flow. Returns { url, request }. Most callers use
  // signIn() instead; this is the seam for custom navigation.
  async createAuthorizeRequest(
    options: SignInOptions = {},
  ): Promise<{ url: string; request: AuthRequestState }> {
    const endpoints = await this.getEndpoints();
    const pkce = await generatePkcePair();
    const state = generateState();
    const nonce = generateNonce();
    const scope = options.scope ?? this.defaultScope;

    const url = buildAuthorizeUrl({
      authorizationEndpoint: endpoints.authorizationEndpoint,
      clientId: this.clientId,
      redirectUri: this.redirectUri,
      scope,
      state,
      nonce,
      codeChallenge: pkce.codeChallenge,
      extraParams: options.extraParams,
    });

    const request: AuthRequestState = {
      state,
      nonce,
      codeVerifier: pkce.codeVerifier,
      redirectUri: this.redirectUri,
      scope: Array.isArray(scope) ? scope.join(" ") : String(scope),
    };
    this.persist(state, request);
    return { url, request };
  }

  // Start the sign-in. Redirect mode navigates the current page; popup mode opens
  // a window and resolves when the popup posts back its code+state (your callback
  // page must call postCallbackToOpener()).
  async signIn(options: SignInOptions = {}): Promise<CallbackResult | void> {
    const { url } = await this.createAuthorizeRequest(options);
    if (options.display === "popup") {
      return this.openPopup(url);
    }
    window.location.assign(url);
  }

  // Call this on your redirect_uri page (redirect mode). It reads ?code & ?state
  // from the URL, verifies state against what we persisted, and returns the code
  // plus the persisted request (whose codeVerifier + redirectUri you forward to
  // your server's token exchange). Throws OAuthError on ?error=... or state
  // mismatch.
  handleRedirectCallback(currentUrl: string = window.location.href): CallbackResult {
    const url = new URL(currentUrl);
    return this.consumeCallbackParams(url.searchParams);
  }

  // Shared parsing for redirect + popup callbacks.
  private consumeCallbackParams(params: URLSearchParams): CallbackResult {
    const error = params.get("error");
    const state = params.get("state");
    if (error) {
      this.clearPersisted(state);
      throw new OAuthError(error, params.get("error_description") ?? undefined);
    }
    const code = params.get("code");
    if (!code || !state) {
      throw new OAuthError("invalid_request", "Callback is missing code or state.");
    }
    const request = this.readPersisted(state);
    if (!request) {
      throw new OAuthError("invalid_state", "No matching sign-in request found (possible CSRF or expired flow).");
    }
    if (request.state !== state) {
      this.clearPersisted(state);
      throw new OAuthError("invalid_state", "state does not match the original request (possible CSRF).");
    }
    this.clearPersisted(state);
    return { code, state, request };
  }

  // --- popup mode -------------------------------------------------------------

  private openPopup(url: string): Promise<CallbackResult> {
    const w = 480;
    const h = 720;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(
      url,
      "pixelparents_signin",
      `width=${w},height=${h},left=${left},top=${top}`,
    );
    if (!popup) {
      return Promise.reject(new OAuthError("popup_blocked", "The sign-in popup was blocked."));
    }
    return new Promise<CallbackResult>((resolve, reject) => {
      // The callback page runs on the developer's own site (the redirect_uri),
      // which is same-origin with this opener, so we only trust our own origin.
      const expectedOrigin = window.location.origin;
      const onMessage = (ev: MessageEvent) => {
        if (ev.origin !== expectedOrigin) return;
        const data = ev.data as { type?: string; params?: string } | null;
        if (!data || data.type !== "pixelparents:callback" || typeof data.params !== "string") return;
        cleanup();
        try {
          resolve(this.consumeCallbackParams(new URLSearchParams(data.params)));
        } catch (e) {
          reject(e);
        }
      };
      const timer = window.setInterval(() => {
        if (popup.closed) {
          cleanup();
          reject(new OAuthError("popup_closed", "The sign-in popup was closed before completing."));
        }
      }, 500);
      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        window.clearInterval(timer);
        if (!popup.closed) popup.close();
      };
      window.addEventListener("message", onMessage);
    });
  }

  // --- sessionStorage persistence ---------------------------------------------

  private storage(): Storage | null {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }
  private key(state: string): string {
    return `${STORAGE_PREFIX}${state}`;
  }
  private persist(state: string, request: AuthRequestState): void {
    this.storage()?.setItem(this.key(state), JSON.stringify(request));
  }
  private readPersisted(state: string | null): AuthRequestState | null {
    if (!state) return null;
    const raw = this.storage()?.getItem(this.key(state));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthRequestState;
    } catch {
      return null;
    }
  }
  private clearPersisted(state: string | null): void {
    if (!state) return;
    this.storage()?.removeItem(this.key(state));
  }
}

// Call this from your callback page when using popup mode: it forwards the
// callback query string to the opener window and closes the popup.
export function postCallbackToOpener(currentUrl: string = window.location.href): void {
  const search = new URL(currentUrl).search.replace(/^\?/, "");
  if (window.opener) {
    window.opener.postMessage({ type: "pixelparents:callback", params: search }, window.location.origin);
  }
  window.close();
}
