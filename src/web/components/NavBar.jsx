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
    id: 'stats',
    label: 'Stats',
    icon: (
      <svg viewBox="0 0 24 24">
        <line x1="6" y1="20" x2="6" y2="12" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="18" y1="20" x2="18" y2="9" />
      </svg>
    ),
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

// Pages with no nav slot of their own fold onto the tab they launch from, so
// the bar shows an active tab instead of going dark. Cities (map) and Songs
// are Stats destinations; Buddies now lives under Profile.
const TAB_ALIAS = { map: 'stats', songs: 'stats', buddies: 'profile' };

export default function NavBar() {
  const { tab, subPage, navigate, shows } = useApp();
  const activeKey = subPage || TAB_ALIAS[tab] || tab;
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
              <button className={`nav-plus${firstTime ? ' nav-plus-pulse' : ''}`} onClick={() => navigate('log')} aria-label="Log a show">
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
