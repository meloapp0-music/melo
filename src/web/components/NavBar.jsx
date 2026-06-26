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
    id: 'buddies',
    label: 'Buddies',
    icon: (
      <svg viewBox="0 0 24 24">
        <circle cx="9" cy="8" r="3.5" />
        <circle cx="17" cy="9.5" r="2.5" />
        <path d="M3 20v-1a4 4 0 014-4h4a4 4 0 014 4v1" />
        <path d="M14.5 14.5h2a3 3 0 013 3V19" />
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

export default function NavBar() {
  const { tab, subPage, navigate, shows } = useApp();
  const activeKey = subPage || tab;
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
