/*!
 * Sign in with GoPixel — drop-in button (Tier 1, zero npm).
 *
 * Usage (anywhere on your page):
 *
 *   <script src="https://gopixel.org/sign-in-with-pixelparents.js" async></script>
 *   <div data-pixelparents-signin
 *        data-client-id="ppc_live_…"
 *        data-redirect-uri="https://your-app.com/callback"
 *        data-scope="openid ohs_verified"></div>
 *
 * On click it runs the OAuth 2.0 Authorization Code + PKCE (S256) flow: it
 * generates a code_verifier/code_challenge plus state + nonce, stores them in
 * sessionStorage, and redirects to /oauth/authorize. After the user signs in and
 * consents, they return to your redirect_uri with ?code=…&state=… — exchange the
 * code on YOUR server (it needs your client secret). See the docs for the
 * server-side step.
 *
 * No dependencies, no build step. Pure Web Crypto + DOM.
 */
(function () {
  "use strict";

  var DEFAULT_ISSUER = "https://gopixel.org";
  var DEFAULT_SCOPE = "openid ohs_verified";
  var STORAGE_PREFIX = "pp_auth:";

  // --- small crypto helpers (Web Crypto; works in all modern browsers) --------

  function base64Url(bytes) {
    var bin = "";
    var arr = new Uint8Array(bytes);
    for (var i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function randomUrlSafe(numBytes) {
    var buf = new Uint8Array(numBytes || 32);
    crypto.getRandomValues(buf);
    return base64Url(buf.buffer);
  }

  function sha256Base64Url(str) {
    var data = new TextEncoder().encode(str);
    return crypto.subtle.digest("SHA-256", data).then(function (digest) {
      return base64Url(digest);
    });
  }

  function normalizeIssuer(issuer) {
    return (issuer || DEFAULT_ISSUER).replace(/\/+$/, "");
  }

  function normalizeScope(scope) {
    var list = (scope || DEFAULT_SCOPE).split(/\s+/).filter(Boolean);
    if (list.indexOf("openid") === -1) list.unshift("openid");
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (!seen[list[i]]) {
        seen[list[i]] = true;
        out.push(list[i]);
      }
    }
    return out.join(" ");
  }

  // --- start the flow ---------------------------------------------------------

  function startSignIn(cfg) {
    var verifier = randomUrlSafe(32);
    var state = randomUrlSafe(16);
    var nonce = randomUrlSafe(16);
    return sha256Base64Url(verifier).then(function (challenge) {
      // Persist what the callback needs to complete the exchange.
      try {
        sessionStorage.setItem(
          STORAGE_PREFIX + state,
          JSON.stringify({
            state: state,
            nonce: nonce,
            codeVerifier: verifier,
            redirectUri: cfg.redirectUri,
            scope: cfg.scope
          })
        );
      } catch (_e) {
        /* sessionStorage may be unavailable (private mode); flow still works if
           the developer stashes the verifier another way. */
        void _e;
      }
      var p = new URLSearchParams({
        response_type: "code",
        client_id: cfg.clientId,
        redirect_uri: cfg.redirectUri,
        scope: cfg.scope,
        state: state,
        nonce: nonce,
        code_challenge: challenge,
        code_challenge_method: "S256"
      });
      window.location.assign(cfg.issuer + "/oauth/authorize?" + p.toString());
    });
  }

  // --- branded button rendering ----------------------------------------------

  // The pixel mascot mark: a compact amber pixel-art glyph, inline SVG so there's
  // no extra asset request.
  var MARK_SVG =
    '<svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" focusable="false" style="display:block">' +
    '<g fill="#0a0a0a">' +
    '<rect x="5" y="2" width="6" height="2"/>' +
    '<rect x="3" y="4" width="2" height="6"/>' +
    '<rect x="11" y="4" width="2" height="6"/>' +
    '<rect x="5" y="4" width="6" height="2"/>' +
    '<rect x="6" y="6" width="1" height="2"/>' +
    '<rect x="9" y="6" width="1" height="2"/>' +
    '<rect x="5" y="10" width="2" height="2"/>' +
    '<rect x="9" y="10" width="2" height="2"/>' +
    '<rect x="4" y="12" width="3" height="2"/>' +
    '<rect x="9" y="12" width="3" height="2"/>' +
    "</g></svg>";

  var STYLE_ID = "pixelparents-signin-style";
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      ".pp-signin-btn{" +
      "display:inline-flex;align-items:center;gap:10px;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;" +
      "font-size:14px;font-weight:600;line-height:1;letter-spacing:.01em;" +
      "padding:10px 18px;border-radius:9999px;cursor:pointer;border:1px solid transparent;" +
      "background:#fbbf24;color:#0a0a0a;transition:background-color .15s ease,transform .05s ease;" +
      "-webkit-font-smoothing:antialiased;text-decoration:none;user-select:none;" +
      "}" +
      ".pp-signin-btn:hover{background:#fcd34d}" +
      ".pp-signin-btn:active{transform:translateY(1px)}" +
      ".pp-signin-btn:focus-visible{outline:2px solid #fbbf24;outline-offset:2px}" +
      ".pp-signin-btn[disabled]{opacity:.6;cursor:default}" +
      ".pp-signin-btn .pp-mark{display:flex;align-items:center;justify-content:center;" +
      "width:24px;height:24px;border-radius:6px;background:#fff}" +
      // Dark variant for amber-on-dark surfaces.
      ".pp-signin-btn.pp-dark{background:#171717;color:#fbbf24;border-color:#fbbf24}" +
      ".pp-signin-btn.pp-dark:hover{background:#262626}" +
      ".pp-signin-btn.pp-dark .pp-mark{background:#fbbf24}";
    var el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  function render(host) {
    if (host.getAttribute("data-pp-rendered") === "1") return;

    var clientId = host.getAttribute("data-client-id");
    var redirectUri = host.getAttribute("data-redirect-uri");
    if (!clientId || !redirectUri) {
      console.error(
        "[sign-in-with-pixelparents] data-client-id and data-redirect-uri are required."
      );
      return;
    }
    var cfg = {
      clientId: clientId,
      redirectUri: redirectUri,
      scope: normalizeScope(host.getAttribute("data-scope")),
      issuer: normalizeIssuer(host.getAttribute("data-issuer"))
    };

    injectStyles();

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pp-signin-btn";
    if (host.getAttribute("data-theme") === "dark") btn.className += " pp-dark";
    var label = host.getAttribute("data-label") || "Sign in with GoPixel";
    btn.setAttribute("aria-label", label);
    btn.innerHTML = '<span class="pp-mark">' + MARK_SVG + "</span><span>" + escapeHtml(label) + "</span>";

    btn.addEventListener("click", function () {
      btn.setAttribute("disabled", "true");
      startSignIn(cfg)["catch"](function (err) {
        console.error("[sign-in-with-pixelparents] failed to start sign-in:", err);
        btn.removeAttribute("disabled");
      });
    });

    host.setAttribute("data-pp-rendered", "1");
    host.appendChild(btn);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderAll() {
    var hosts = document.querySelectorAll("[data-pixelparents-signin]");
    for (var i = 0; i < hosts.length; i++) render(hosts[i]);
  }

  // Expose a tiny programmatic API for advanced callers / SPAs.
  window.GoPixelSignIn = {
    render: renderAll,
    renderElement: render,
    // Start the flow imperatively (no button), e.g. from a custom element.
    signIn: function (opts) {
      return startSignIn({
        clientId: opts.clientId,
        redirectUri: opts.redirectUri,
        scope: normalizeScope(opts.scope),
        issuer: normalizeIssuer(opts.issuer)
      });
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderAll);
  } else {
    renderAll();
  }
})();
