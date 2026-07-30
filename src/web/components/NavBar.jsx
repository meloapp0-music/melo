import { useApp } from '../App';

const tabs = [
  {
    id: 'home',
    label: 'Home',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
        <polyline points="9 21 9 14 15 14 15 21" />
      </svg>
    ),
  },
  {
    id: 'shows',
    label: 'Shows',
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  { id: 'plus' },
  {
    id: 'you',
    label: 'You',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

// Which tab stays lit while you're inside a drill-in page.
//
// This replaces TAB_ALIAS, which solved the opposite problem — it mapped
// orphan TABS (map/songs/buddies) onto a visible tab. Those are subPages now,
// so the mapping runs the other way. The old `activeKey = subPage || …` was
// also a live bug: on any subPage it resolved to a value matching no tab, so
// the whole bar went dark. See docs/initiatives/2026-07-28-ia-simplification.md.
const SUBPAGE_PARENT = {
  rankings: 'you', artists: 'you', venues: 'you', songs: 'you',
  map: 'you', buddies: 'you', 'music-taste': 'you',
  settings: 'you', legal: 'you',
  festivals: 'home',
};

export default function NavBar() {
  const { tab, subPage, navigate, openOverlay, shows } = useApp();
  const activeKey = (subPage ? SUBPAGE_PARENT[subPage] : null) || tab;
  // First-run nudge: gently pulse the + until the user logs their first show.
  const firstTime = (shows?.length || 0) === 0;

  // The bar is a normal flex-column sibling of the scrolling .page (.app is a
  // 100dvh flex column; .page is flex:1 / overflow-auto; this bar is flex-shrink:0
  // at the bottom) — NOT position:fixed. iOS WKWebView kept detaching the fixed bar
  // on scroll even when portaled to <body> with the blur removed; a flex item at
  // the bottom of the column physically cannot scroll away.
  return (
    <nav className="nav-bar">
      <div className="nav-tabs">
        {tabs.map((t) =>
          t.id === 'plus' ? (
            <div key="plus" className="nav-plus-slot">
              <button className={`nav-plus${firstTime ? ' nav-plus-pulse' : ''}`} onClick={() => openOverlay('quicklog', {})} aria-label="Log a show">
                <svg viewBox="0 0 24 24">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              key={t.id}
              className={`nav-tab ${activeKey === t.id ? 'active' : ''}`}
              onClick={() => navigate(t.id)}
              aria-label={t.label}
            >
              {t.icon}
              <span className="nav-tab-label">{t.label}</span>
              <span className="nav-dot" />
            </button>
          )
        )}
      </div>
    </nav>
  );
}
