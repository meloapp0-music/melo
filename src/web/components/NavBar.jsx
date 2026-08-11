// NavBar — ported from the Sleek design (project e0ITdp4pfIU).
// ============================================================
// The bar is drawn identically on every export, so it's taken from the newest
// (Home v29) and confirmed against Shows, You and Leaderboard.
//
// FIVE SLOTS, not four. Which screen each one owns was read off the exports
// rather than guessed — each screen lights its own icon:
//
//   shows.html       -> ph:ticket-fill      Shows / The Drawer
//   you.html         -> ph:user-fill        You
//   leaderboard.html -> ph:chart-bar-fill   Leaderboard
//
// So the design promotes Leaderboard to a top-level tab. That reverses part of
// the IA work, which deliberately collapsed to three tabs plus the FAB and made
// rankings a drill-in under You. It's a deliberate reversal on the design's
// part, not an accident: it's consistent across every screen, and the ranking
// system became a headline feature after that collapse was decided.
//
// NOT position:fixed, and this is the one place the port must not be faithful.
// The export uses `fixed bottom-0 ... backdrop-blur-xl`, but iOS WKWebView kept
// detaching the fixed bar on scroll — even portaled to <body> with the blur
// removed. This stays a flex-shrink:0 sibling at the bottom of the .app column,
// which physically cannot scroll away. The design's LOOK is ported; its
// positioning is not.
//
// The blur goes with it: backdrop-filter on a non-fixed bar has nothing
// scrolling underneath to blur, and it was a measurable scroll cost on iOS.

import { useApp } from '../App';
import Icon from './Icon';

const TABS = [
  { id: 'home', label: 'Home', icon: 'ph:house-simple', active: 'ph:house-simple-fill' },
  { id: 'shows', label: 'Drawer', icon: 'ph:ticket', active: 'ph:ticket-fill' },
  { id: 'plus' },
  { id: 'rankings', label: 'Ranks', icon: 'ph:chart-bar', active: 'ph:chart-bar-fill' },
  { id: 'you', label: 'You', icon: 'ph:user', active: 'ph:user-fill' },
];

// Which tab stays lit while you're inside a drill-in page. `rankings` has left
// this map — it's a tab in its own right now, so mapping it to `you` would
// light the wrong icon on its own screen.
const SUBPAGE_PARENT = {
  artists: 'you', venues: 'you', songs: 'you',
  map: 'you', buddies: 'you', 'music-taste': 'you',
  settings: 'you', legal: 'you',
  festivals: 'home',
};

export default function NavBar() {
  const { tab, subPage, navigate, openOverlay, shows } = useApp();
  const activeKey = (subPage ? SUBPAGE_PARENT[subPage] : null) || tab;
  // First-run nudge: gently pulse the + until the first show is logged.
  const firstTime = (shows?.length || 0) === 0;

  return (
    <nav className="nav-bar min-h-28 bg-background border-t border-border flex items-center justify-around px-8 shrink-0 relative z-[100]">
      {TABS.map((t) => {
        if (t.id === 'plus') {
          return (
            <button
              key="plus"
              type="button"
              onClick={() => openOverlay('quicklog', {})}
              aria-label="Log a show"
              className="flex-1 flex justify-center -mt-12 active:scale-95 transition-transform"
            >
              <div
                // NOTE the space before ${…}. Tailwind scans raw source text,
                // so a class butted straight against an interpolation is read
                // as `border-[var(--background)]${` and silently dropped — the
                // ring then falls through to currentColor (white) instead of
                // paper. Nothing warns; it just renders the wrong colour.
                className={`size-16 bg-accent rounded-full flex items-center justify-center text-white shadow-2xl shadow-accent/40 border-4 border-[var(--background)] ${
                  firstTime ? 'nav-plus-pulse' : ''
                }`}
              >
                <Icon name="ph:plus-bold" size={28} />
              </div>
            </button>
          );
        }
        const on = activeKey === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => navigate(t.id)}
            aria-label={t.label}
            aria-current={on ? 'page' : undefined}
            className={`flex-1 flex justify-center active:scale-95 transition-transform ${
              on ? 'text-accent' : 'text-foreground opacity-20'
            }`}
          >
            <Icon name={on ? t.active : t.icon} size={28} />
          </button>
        );
      })}
    </nav>
  );
}
