// lib/overlays.js — the overlay stack.
// ====================================
// Melo's full-screen sheets (log, show detail, venue, artist, recap, wrapped,
// compare…) used to be thirteen separate useStates in App.jsx, three of which
// described the same overlay. They could contradict each other, nothing knew
// what was on top, and a push notification arriving over an open sheet left it
// stranded. This is one stack instead.
//
// Pure and dependency-free so it can be reasoned about — and tested — without
// mounting React. See docs/initiatives/2026-07-28-ia-simplification.md.

/** Every overlay App.jsx can render. Adding a sheet = adding a case here and
 *  a branch in the render map. */
export const OVERLAY_TYPES = [
  'log', 'quicklog', 'festival', 'venue', 'artist', 'show',
  'recap', 'firstCard', 'user', 'wrapped', 'compare',
];

// Monotonic, never reused. This is the React key: an array index would remount
// every overlay above one that closes, losing its scroll position and any local
// state (a half-typed comment, a scrolled photo gallery).
let uid = 0;
const stamp = (o) => ({ id: ++uid, props: {}, ...o });

/**
 * Actions:
 *   push      — put one overlay on top
 *   set       — replace the whole stack ATOMICALLY. The only way to open two
 *               overlays in one commit: `recap_ready` opens a show AND its
 *               reel, and a sequence of pushes can render the detail page with
 *               no reel, contradicting the notification that promised a recap.
 *   pop       — close the topmost (what a hardware-back handler would call)
 *   closeId   — close one specific overlay, even if it's buried
 *   closeType — close whichever overlay of this type is open; this is what the
 *               legacy `setSelectedShow(null)` style setters mean
 *   clear     — close everything, e.g. when a push notification arrives
 */
export function overlayReducer(state, action) {
  switch (action.type) {
    case 'push': return [...state, stamp({ type: action.overlay, props: action.props || {} })];
    case 'set': return (action.list || []).map(stamp);
    case 'pop': return state.length ? state.slice(0, -1) : state;
    case 'closeId': return state.filter((o) => o.id !== action.id);
    case 'closeType': return state.filter((o) => o.type !== action.overlay);
    // Return the SAME array when already empty so an unconditional clear (the
    // push handler fires one on every notification) can't trigger a re-render.
    case 'clear': return state.length ? [] : state;
    default: return state;
  }
}

/** Read one overlay's props off the stack — for the two the context still
 *  exposes as values (`recapShow`, `selectedUserId`). */
export const findOverlay = (state, type) => state.find((o) => o.type === type) || null;
