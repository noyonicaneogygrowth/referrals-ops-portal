/**
 * Auth gate: restricts this site to real, verified skydo.com Google
 * Workspace accounts — not a check on whether the email string merely
 * contains "skydo" (which anyone could type), but a real, signed
 * assertion from Google that the signed-in account belongs to the
 * skydo.com Workspace.
 *
 * HOW IT ACTUALLY VERIFIES THIS (read before setup):
 * When someone signs in, Google hands back a signed token (a JWT) that
 * includes an "hd" (hosted domain) field — this is Google's own record
 * of which Workspace organization that account belongs to, set by
 * Google at sign-in time, not something the user can type or edit.
 * This script:
 *   1. Fetches Google's public signing keys.
 *   2. Cryptographically verifies the token's signature against them,
 *      confirming Google actually issued it and it hasn't been tampered with.
 *   3. Only then checks that the "hd" field equals "skydo.com" and that
 *      Google has confirmed the email is verified.
 * Only after all of that passes does the page unlock.
 *
 * WHAT THIS CAN AND CAN'T DO — please read this part:
 * This site has no server (it's plain files on GitHub Pages), so this
 * check runs entirely in the visitor's own browser. That means it stops
 * casual access very well — someone can't get in by guessing a link or
 * typing a fake @skydo.com email. But it cannot stop someone who
 * deliberately opens their browser's developer tools and disables or
 * rewrites this script on their own machine — no purely static,
 * server-less site can prevent that. If you ever need protection against
 * a deliberate, technical bypass attempt (not just casual access), the
 * content would need to be served by an actual server that checks
 * identity before sending the page at all — which GitHub Pages can't do.
 * For an internal ops tool, the level of protection here is a large,
 * meaningful step up from nothing — just not an absolute guarantee.
 *
 * SETUP:
 * 1. In Google Cloud Console (console.cloud.google.com), create an OAuth
 *    2.0 Client ID: APIs & Services > Credentials > Create Credentials >
 *    OAuth client ID > Application type: Web application.
 * 2. Under "Authorized JavaScript origins," add your GitHub Pages URL,
 *    e.g. https://noyonicaneogygrowth.github.io (no trailing slash, no path).
 * 3. Copy the Client ID it gives you and paste it below.
 * 4. Include this script on every page, before assets/portal.js.
 */

const AUTH_CONFIG = {
  clientId: 'PASTE_YOUR_GOOGLE_OAUTH_CLIENT_ID_HERE',
  allowedHostedDomain: 'skydo.com',
  // How long a verified session is trusted before asking to sign in again.
  // 12 hours means someone signing in each morning won't be asked again
  // for the rest of a normal working day.
  sessionHours: 12,
};

(function () {
  "use strict";

  var STORAGE_KEY = 'skydo_auth_session_v1';

  function getSession() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var session = JSON.parse(raw);
      if (!session || !session.expiresAt || Date.now() > session.expiresAt) return null;
      return session;
    } catch (e) { return null; }
  }

  function setSession(email) {
    var session = { email: email, expiresAt: Date.now() + AUTH_CONFIG.sessionHours * 3600 * 1000 };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch (e) {}
  }

  function clearSession() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  function base64UrlToUint8Array(base64Url) {
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var pad = base64.length % 4;
    if (pad) base64 += '='.repeat(4 - pad);
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function base64UrlDecodeJson(base64Url) {
    var bytes = base64UrlToUint8Array(base64Url);
    var text = new TextDecoder('utf-8').decode(bytes);
    return JSON.parse(text);
  }

  var jwksCache = null;
  function getGoogleJwks() {
    if (jwksCache) return jwksCache;
    jwksCache = fetch('https://www.googleapis.com/oauth2/v3/certs')
      .then(function (r) { return r.json(); })
      .then(function (j) { return j.keys; });
    return jwksCache;
  }

  // Cryptographically verifies the JWT signature using Google's public keys.
  // Returns the decoded, TRUSTED payload on success, or null if anything
  // about the token or its signature doesn't check out.
  function verifyGoogleIdToken(idToken) {
    var parts = idToken.split('.');
    if (parts.length !== 3) return Promise.resolve(null);

    var header, payload;
    try {
      header = base64UrlDecodeJson(parts[0]);
      payload = base64UrlDecodeJson(parts[1]);
    } catch (e) { return Promise.resolve(null); }

    if (header.alg !== 'RS256') return Promise.resolve(null);
    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') return Promise.resolve(null);
    if (payload.aud !== AUTH_CONFIG.clientId) return Promise.resolve(null);
    if (!payload.exp || Date.now() / 1000 > payload.exp) return Promise.resolve(null);

    return getGoogleJwks().then(function (keys) {
      var jwk = keys.filter(function (k) { return k.kid === header.kid; })[0];
      if (!jwk) return null;

      return crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      ).then(function (cryptoKey) {
        var signedData = new TextEncoder().encode(parts[0] + '.' + parts[1]);
        var signature = base64UrlToUint8Array(parts[2]);
        return crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, signedData);
      }).then(function (isValid) {
        return isValid ? payload : null;
      });
    }).catch(function () { return null; });
  }

  function isAllowed(payload) {
    return !!payload &&
      payload.email_verified === true &&
      payload.hd === AUTH_CONFIG.allowedHostedDomain;
  }

  function showGate(onCredential) {
    var overlay = document.createElement('div');
    overlay.id = 'auth-gate-overlay';
    overlay.innerHTML =
      '<div class="ag-card">' +
        '<div class="ag-logo">Skydo</div>' +
        '<h1>Referrals Ops Portal</h1>' +
        '<p>Sign in with your <b>@' + AUTH_CONFIG.allowedHostedDomain + '</b> Google account to continue.</p>' +
        '<div id="ag-btn"></div>' +
        '<p class="ag-err" id="ag-err" style="display:none">That account isn\'t on the ' + AUTH_CONFIG.allowedHostedDomain + ' Workspace, so access is restricted. Try signing in with your Skydo Google account.</p>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    var style = document.createElement('style');
    style.textContent =
      '#auth-gate-overlay{position:fixed; inset:0; z-index:99999; background:#0f172acc; backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; font-family:"Inter",-apple-system,sans-serif}' +
      '.ag-card{background:#fff; border-radius:20px; padding:40px 36px; max-width:380px; width:calc(100% - 40px); text-align:center; box-shadow:0 24px 60px rgba(15,23,42,.35)}' +
      '.ag-logo{font-weight:800; font-size:15px; color:#4F46E5; letter-spacing:.4px; margin-bottom:14px}' +
      '.ag-card h1{font-size:20px; margin:0 0 8px; color:#0F172A}' +
      '.ag-card p{font-size:14px; color:#64748B; margin:0 0 20px; line-height:1.5}' +
      '#ag-btn{display:flex; justify-content:center}' +
      '.ag-err{color:#DC2626 !important; margin-top:16px !important}';
    document.head.appendChild(style);

    document.documentElement.style.overflow = 'hidden';

    google.accounts.id.initialize({
      client_id: AUTH_CONFIG.clientId,
      callback: onCredential,
    });
    google.accounts.id.renderButton(document.getElementById('ag-btn'), {
      theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with',
    });
  }

  function hideGate() {
    var overlay = document.getElementById('auth-gate-overlay');
    if (overlay) overlay.remove();
    document.documentElement.style.overflow = '';
  }

  function showDenied() {
    var err = document.getElementById('ag-err');
    if (err) err.style.display = '';
  }

  function boot() {
    var cached = getSession();
    if (cached) return; // already verified recently — let the page render normally

    // Hide the real content immediately so it never flashes before the check completes.
    document.documentElement.style.visibility = 'hidden';

    var script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = function () {
      document.documentElement.style.visibility = '';
      showGate(function (response) {
        verifyGoogleIdToken(response.credential).then(function (payload) {
          if (isAllowed(payload)) {
            setSession(payload.email);
            hideGate();
          } else {
            clearSession();
            showDenied();
          }
        });
      });
    };
    document.head.appendChild(script);
  }

  if (AUTH_CONFIG.clientId.indexOf('PASTE_') !== -1) {
    // Not configured yet — don't lock people out of a half-set-up gate.
    return;
  }
  boot();
})();
