// Shared APNs HTTP/2 sender for Melo's Edge Functions.
// =====================================================
// Apple Push Notification service over HTTP/2, authenticated via a
// JWT signed with an Apple Push Auth Key (.p8). Deno's native fetch
// negotiates HTTP/2 to api.push.apple.com transparently, so this
// is just JWT signing + a POST.
//
// Required env (Supabase secrets):
//   APNS_KEY_ID      — 10-char Apple Key ID
//   APNS_TEAM_ID     — 10-char Apple Team ID
//   APNS_BUNDLE_ID   — e.g. com.melo.app  (= push topic)
//   APNS_AUTH_KEY    — full contents of AuthKey_XXXX.p8 (PEM block)
//
// Set APNS_USE_SANDBOX=1 (any truthy value) to target the sandbox
// gateway during development with a development build of the app.
//
// Token JWTs are valid for ~1 hour; we cache one per cold start.

const KEY_ID = Deno.env.get('APNS_KEY_ID');
const TEAM_ID = Deno.env.get('APNS_TEAM_ID');
const BUNDLE_ID = Deno.env.get('APNS_BUNDLE_ID');
const AUTH_KEY = Deno.env.get('APNS_AUTH_KEY');
const USE_SANDBOX = Deno.env.get('APNS_USE_SANDBOX');

const HOST = USE_SANDBOX
  ? 'https://api.sandbox.push.apple.com'
  : 'https://api.push.apple.com';

export function isApnsConfigured(): boolean {
  return !!(KEY_ID && TEAM_ID && BUNDLE_ID && AUTH_KEY);
}

export interface PushPayload {
  title: string;
  body: string;
  /** Custom data delivered alongside the alert. iOS puts these at the top level of the userInfo dict. */
  data?: Record<string, unknown>;
}

export interface PushResult {
  token: string;
  ok: boolean;
  status: number;
  reason?: string;
}

/** Send the same payload to many tokens. Returns per-token results so the
 *  caller can prune dead tokens (Unregistered / BadDeviceToken). */
export async function sendApnsBatch(
  tokens: string[],
  payload: PushPayload,
): Promise<PushResult[]> {
  if (!isApnsConfigured()) {
    console.warn('[apns] not configured — skipping send (would have sent to %d tokens)', tokens.length);
    return tokens.map((t) => ({ token: t, ok: false, status: 0, reason: 'apns-not-configured' }));
  }
  const jwt = await getCachedJwt();
  return Promise.all(tokens.map((t) => sendOne(t, payload, jwt)));
}

async function sendOne(
  token: string,
  payload: PushPayload,
  jwt: string,
): Promise<PushResult> {
  const body = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: 'default',
      badge: 1,
    },
    ...(payload.data || {}),
  });

  try {
    const res = await fetch(`${HOST}/3/device/${token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${jwt}`,
        'apns-topic': BUNDLE_ID!,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      },
      body,
    });
    if (res.ok) return { token, ok: true, status: res.status };
    let reason: string | undefined;
    try {
      const errBody = await res.json();
      reason = errBody?.reason;
    } catch { /* APNs sometimes returns empty body */ }
    return { token, ok: false, status: res.status, reason };
  } catch (err) {
    return { token, ok: false, status: 0, reason: String(err) };
  }
}

// -------------------- JWT signing --------------------
// APNs JWT spec: ES256 over header `{alg:"ES256",kid:KEY_ID}` and
// payload `{iss:TEAM_ID,iat:<unix-seconds>}`. Cache for ~50 minutes
// (Apple permits up to 60).

let cachedJwt: { token: string; exp: number } | null = null;

async function getCachedJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.exp > now + 60) return cachedJwt.token;
  const token = await signApnsJwt();
  cachedJwt = { token, exp: now + 50 * 60 };
  return token;
}

async function signApnsJwt(): Promise<string> {
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
  const payload = { iss: TEAM_ID, iat: Math.floor(Date.now() / 1000) };
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await importP8(AUTH_KEY!);
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(signingInput),
    ),
  );
  return `${signingInput}.${b64urlBytes(sig)}`;
}

async function importP8(pem: string): Promise<CryptoKey> {
  const stripped = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(stripped), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

function b64url(s: string): string {
  return b64urlBytes(new TextEncoder().encode(s));
}
function b64urlBytes(b: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
