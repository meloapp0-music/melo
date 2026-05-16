// Product analytics — a thin wrapper around PostHog.
// See docs/initiatives/2026-05-15-product-analytics.md.
//
// RULE: components and pages import { track } from this module ONLY.
// They must never import `posthog-js` directly — this mirrors the
// `src/web/lib/db/*` rule that keeps Supabase access in one place.
//
// Privacy spine (do not weaken):
//  - autocapture is OFF — we emit only the explicit named events below,
//    never automatic clicks/inputs
//  - session recording is OFF — concert notes/venues are personal
//  - we identify by Supabase user_id ONLY — never email, name, or any
//    user content (artist, venue, notes, buddies)
//  - event properties carry shape/metadata only (counts, booleans,
//    enums), never free text the user typed
//
// If VITE_POSTHOG_KEY is absent the whole module no-ops, so local dev
// and forks without a key still run clean with zero tracking.

import posthog from 'posthog-js';

const KEY = import.meta.env.VITE_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

let ready = false;

// Call once, at app boot (src/web/main.jsx), before anything renders.
export function initAnalytics() {
  if (ready || !KEY) return;
  try {
    posthog.init(KEY, {
      api_host: HOST,
      // Explicit events only — no automatic click/input capture.
      autocapture: false,
      // SPA: we have no server pageviews; navigation is in-app tabs.
      capture_pageview: false,
      // Never record sessions — user concert data is private.
      disable_session_recording: true,
      // localStorage survives the Capacitor webview better than cookies.
      persistence: 'localStorage',
    });
    ready = true;
  } catch (err) {
    // Analytics must NEVER break the app.
    // eslint-disable-next-line no-console
    console.warn('[Melo] analytics init failed', err);
  }
}

// Emit a named event. `props` should be shape/metadata only — counts,
// booleans, enums. Never pass user-typed content.
export function track(event, props) {
  if (!ready) return;
  try {
    posthog.capture(event, props);
  } catch {
    /* best-effort — swallow */
  }
}

// Tie subsequent events to a signed-in user. Pass the Supabase user id
// ONLY — no email, no name.
export function identify(userId) {
  if (!ready || !userId) return;
  try {
    posthog.identify(userId);
  } catch {
    /* best-effort — swallow */
  }
}

// Clear identity on sign-out so the next user's events aren't merged
// into the previous user's profile.
export function resetAnalytics() {
  if (!ready) return;
  try {
    posthog.reset();
  } catch {
    /* best-effort — swallow */
  }
}
