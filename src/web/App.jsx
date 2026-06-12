import { useState, useEffect, createContext, useContext, useCallback, useMemo, useRef } from 'react';
import { prefetchArtistImages, getCachedImage } from './api';
import { useSession, signOut } from './lib/auth';
import { getMyProfile, updateMyProfile } from './lib/db/profiles';
import { getSettings, updateSettings as dbUpdateSettings } from './lib/db/settings';
import * as showsDb from './lib/db/shows';
import { registerForPush, onPushTap } from './lib/push';
import { identify, resetAnalytics, track } from './lib/analytics';
import { isGoing, daysUntil } from './store';
import NavBar from './components/NavBar';
import ShowDetail from './components/ShowDetail';
import HypeCard from './components/HypeCard';
import RatePromptCard from './components/RatePromptCard';
import ShowComparison from './components/ShowComparison';
import UserProfileView from './pages/UserProfileView';
import QuickLog from './components/QuickLog';
import AuthGate from './components/AuthGate';
import Home from './pages/Home';
import LogShow from './pages/LogShow';
import MyShows from './pages/MyShows';
import Rankings from './pages/Rankings';
import ConcertMap from './pages/ConcertMap';
import Songs from './pages/Songs';
import Buddies from './pages/Buddies';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Wrapped from './pages/Wrapped';
import Festivals from './pages/Festivals';
import Artists from './pages/Artists';
import Legal from './pages/Legal';
import ImportFromCalendar from './pages/ImportFromCalendar';
import Onboarding from './pages/auth/Onboarding';
import ResetPassword from './pages/auth/ResetPassword';
import { MeloIcon } from './components/MeloLogo';

export const AppContext = createContext();
export const useApp = () => useContext(AppContext);

// Supabase creates temp usernames of the form `user_xxxxxxxx` during signup.
// Treat those as "not yet onboarded" so we show the onboarding screen.
const isTempUsername = (u) => !u || /^user_[0-9a-f]{8}$/i.test(u);

// Detect the Supabase password-recovery redirect. When a user clicks the
// reset email, Supabase appends `type=recovery` to the URL hash.
const isPasswordRecovery = () =>
  typeof window !== 'undefined' && /[#&?]type=recovery(&|$)/.test(window.location.hash + window.location.search);

// Local-calendar day key. The iOS webview survives overnight in the app
// switcher, so anything date-derived (countdowns, the hype card) must
// key off this and refresh on foreground — not just on mount.
const localDayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

export default function App() {
  const session = useSession();

  // App-level state — only populated once signed in.
  const [tab, setTab] = useState('home');
  const [shows, setShows] = useState([]);
  const [settings, setSettings] = useState({ setlistFmKey: '', hasSetlistFmKey: false });
  const [profile, setProfile] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [showLog, setShowLog] = useState(false);
  // When set, LogShow opens in edit mode for this existing record. Used
  // by Home's "How was [show]?" CTA on past Going shows so the user
  // lands directly in the score/vibes editor with all fields prefilled.
  const [logEditTarget, setLogEditTarget] = useState(null);
  const [selectedShow, setSelectedShow] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [subPage, setSubPage] = useState(null);
  const [artistImages, setArtistImages] = useState({});
  const [wrappedYear, setWrappedYear] = useState(null);
  const [compareShow, setCompareShow] = useState(null);
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(isPasswordRecovery());

  const userId = session.user?.id;
  const hasCleanedLegacyRef = useRef(false);

  // ---- Load cloud data once signed in ----
  useEffect(() => {
    if (session.status !== 'signedIn' || !userId) {
      setShows([]);
      setSettings({ setlistFmKey: '', hasSetlistFmKey: false });
      setProfile(null);
      return;
    }
    let cancelled = false;
    setDataLoading(true);
    (async () => {
      try {
        const [p, s, sh] = await Promise.all([
          getMyProfile(),
          getSettings(),
          showsDb.listMyShows(),
        ]);
        if (cancelled) return;
        setProfile(p);
        setSettings(s);
        setShows(sh);

        // One-time cleanup of legacy sample-data keys from pre-auth days.
        if (!hasCleanedLegacyRef.current) {
          ['melo_shows', 'melo_buddies', 'melo_rankings', 'melo_settings'].forEach((k) => {
            try { localStorage.removeItem(k); } catch {}
          });
          hasCleanedLegacyRef.current = true;
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[Melo] Failed to load cloud data', err);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session.status, userId]);

  // ---- Register for push notifications (iOS native only) ----
  // Fire once per signed-in session. registerForPush() no-ops on web
  // and handles permission + token-upsert internally; we don't gate
  // any UI on the result.
  useEffect(() => {
    if (session.status !== 'signedIn' || !userId) return;
    registerForPush().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[Melo] registerForPush threw', err);
    });
  }, [session.status, userId]);

  // ---- Day stamp ----
  // Re-derives on every foreground (visibilitychange fires when the
  // webview resumes from the app switcher) so countdowns and the moment
  // pop-ups roll over at midnight instead of freezing at mount time.
  // Declared before the push effect below, which lists it as a dep.
  const [dayStamp, setDayStamp] = useState(localDayKey);
  useEffect(() => {
    const refresh = () =>
      setDayStamp((prev) => {
        const k = localDayKey();
        return prev === k ? prev : k;
      });
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, []);

  // One moment pop-up (hype / rate prompt) max per day — any dismissal
  // or push-tap snoozes both until dayStamp rolls over.
  const [momentSnoozedDay, setMomentSnoozedDay] = useState(null);

  // ---- Notification-tap deep linking ----
  // A tap stashes the push payload here; the effect below resolves it
  // once the signed-in data is loaded (a cold-start tap fires before
  // shows exist). Per docs/initiatives/2026-06-10-preshow-postshow-experience.md.
  const [pushNav, setPushNav] = useState(null);
  useEffect(() => {
    onPushTap((data) => setPushNav(data || {}));
  }, []);

  useEffect(() => {
    // `profile` is only set once the initial cloud load finishes, so it
    // doubles as a "shows are loaded" gate — a cold-start tap otherwise
    // races the first fetch and misses its show.
    if (!pushNav || session.status !== 'signedIn' || dataLoading || !profile) return;
    const kind = String(pushNav.kind || '');
    const done = () => setPushNav(null);
    track('push_opened', { kind });
    // A push-opened session has the user's attention on a specific
    // destination — keep the moment pop-ups (hype / rate prompt) out of
    // the way until tomorrow (or the next cold start). Always snooze
    // with dayStamp (the day being RENDERED) so the snooze comparison
    // can never disagree with the memos across midnight.
    setMomentSnoozedDay(dayStamp);

    // Pre-show reminders, showtime changes + post-show rate prompt →
    // that exact show.
    if (kind.startsWith('preshow') || kind === 'postshow_rate' || kind === 'showtime_change') {
      const show = shows.find((s) => s.id === pushNav.showId);
      setSubPage(null);
      setTab('home');
      if (show) {
        if (kind === 'postshow_rate') setLogEditTarget(show);
        else setSelectedShow(show);
      }
      return done();
    }
    // Tour / city alerts → there's no local show yet; offer the tickets
    // link via a tappable toast so the user stays in the app.
    if (kind === 'tour_alert' || kind === 'city_match') {
      if (pushNav.ticketUrl) {
        const url = pushNav.ticketUrl;
        showToast({
          message: `🎟️ ${pushNav.artist || 'Tickets'} — tap to get tickets`,
          onClick: () => { try { window.open(url, '_blank'); } catch {} },
          durationMs: 8000,
        });
      } else {
        setSubPage('festivals');
      }
      return done();
    }
    if (kind === 'friend_request') {
      setSubPage(null);
      setTab('buddies');
      return done();
    }
    done();
  }, [pushNav, session.status, dataLoading, profile, shows, dayStamp]);

  // ---- Moment pop-ups (hype + post-show rate prompt) ----
  // dayStamp + momentSnoozedDay are declared above the push effect.
  // Per-show repeat-protection lives in localStorage; the day-level
  // snooze re-arms when dayStamp rolls over.

  // Pre-show hype: a Going show 0–2 days out, once per show per
  // countdown-day (`melo_hype_<id>_<d>`).
  const hype = useMemo(() => {
    if (momentSnoozedDay === dayStamp || session.status !== 'signedIn') return null;
    const candidates = shows
      .filter(isGoing)
      .map((s) => ({ show: s, d: daysUntil(s.date) }))
      .filter(({ d }) => d >= 0 && d <= 2)
      .sort((a, b) => a.d - b.d);
    for (const c of candidates) {
      try {
        if (!localStorage.getItem(`melo_hype_${c.show.id}_${c.d}`)) return c;
      } catch {
        return c;
      }
    }
    return null;
  }, [shows, momentSnoozedDay, dayStamp, session.status]);

  const dismissHype = useCallback(() => {
    if (hype) {
      try { localStorage.setItem(`melo_hype_${hype.show.id}_${hype.d}`, '1'); } catch {}
    }
    // Snooze with dayStamp (the rendered day) — localDayKey() here
    // could disagree across midnight and leave an undismissable card.
    setMomentSnoozedDay(dayStamp);
  }, [hype, dayStamp]);

  // Post-show rate prompt: a Going show whose date passed 1–3 days ago
  // and still isn't rated. Once per day per show (`melo_rate_<id>_<day>`)
  // until rated (rating flips status → attended, removing it) or it
  // ages out. Takes priority over hype — locking in last night's score
  // beats hyping the next one.
  const ratePrompt = useMemo(() => {
    if (momentSnoozedDay === dayStamp || session.status !== 'signedIn') return null;
    const candidates = shows
      .filter(isGoing)
      .map((s) => ({ show: s, d: daysUntil(s.date) }))
      .filter(({ d }) => d >= -3 && d <= -1)
      .sort((a, b) => b.d - a.d); // most recent show first
    for (const c of candidates) {
      try {
        if (!localStorage.getItem(`melo_rate_${c.show.id}_${dayStamp}`)) return c;
      } catch {
        return c;
      }
    }
    return null;
  }, [shows, momentSnoozedDay, dayStamp, session.status]);

  const dismissRatePrompt = useCallback(() => {
    if (ratePrompt) {
      // Same dayStamp the memo reads — write and read keys always agree.
      try { localStorage.setItem(`melo_rate_${ratePrompt.show.id}_${dayStamp}`, '1'); } catch {}
    }
    setMomentSnoozedDay(dayStamp);
  }, [ratePrompt, dayStamp]);

  // ---- Tie analytics events to the signed-in user ----
  // identify() on sign-in so events attribute to a stable Supabase
  // user_id; resetAnalytics() on sign-out so the next user's events
  // don't merge into the previous profile. user_id only — never email
  // or name. See docs/initiatives/2026-05-15-product-analytics.md.
  useEffect(() => {
    if (session.status === 'signedIn' && userId) {
      identify(userId);
    } else if (session.status === 'signedOut') {
      resetAnalytics();
    }
  }, [session.status, userId]);

  // ---- Prefetch artist images (Deezer) ----
  useEffect(() => {
    const artists = [...new Set(shows.map((s) => s.artist))];
    const cached = {};
    artists.forEach((a) => {
      const url = getCachedImage(a);
      if (url) cached[a] = url;
    });
    if (Object.keys(cached).length > 0) {
      setArtistImages((prev) => ({ ...prev, ...cached }));
    }
    prefetchArtistImages(artists, (updated) => {
      setArtistImages((prev) => ({ ...prev, ...updated }));
    });
  }, [shows.length]);

  const getArtistImage = useCallback(
    (artist) => artistImages[artist] || getCachedImage(artist) || null,
    [artistImages]
  );

  // Lazy image fetcher — pages that surface artists outside the user's
  // own show list (Home's "Upcoming Shows" and "You Might Like" come
  // from Ticketmaster, so the artists aren't in the boot-time prefetch)
  // call this with the artist names they're rendering so the gradient
  // placeholder gets replaced by a real Deezer photo as soon as it
  // arrives. `prefetchArtistImages` is already cache-aware, so calling
  // this with names we already have is a no-op.
  const prefetchImages = useCallback((artistNames) => {
    if (!artistNames || artistNames.length === 0) return;
    prefetchArtistImages(artistNames, (updated) => {
      setArtistImages((prev) => ({ ...prev, ...updated }));
    });
  }, []);

  // ---- Mutation helpers (optimistic; reconcile with server result) ----
  const addShow = async (show) => {
    if (!userId) return null;
    try {
      const created = await showsDb.createShow(show, userId);
      setShows((prev) => [created, ...prev]);
      return created;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Melo] addShow failed', err);
      return null;
    }
  };

  // Batch add — used by the festival finder's multi-select log. One
  // DB round-trip; prepends all created shows to state.
  const addShows = async (showsToAdd) => {
    if (!userId || !Array.isArray(showsToAdd) || showsToAdd.length === 0) return [];
    try {
      const created = await showsDb.createShows(showsToAdd, userId);
      setShows((prev) => [...created, ...prev]);
      return created;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Melo] addShows failed', err);
      return [];
    }
  };

  const updateShow = async (id, updates) => {
    if (!userId) return;
    // Optimistic patch
    setShows((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
    try {
      await showsDb.updateShow(id, updates, userId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Melo] updateShow failed', err);
      // Re-fetch to recover the correct state.
      try { setShows(await showsDb.listMyShows()); } catch {}
    }
  };

  const deleteShow = async (id) => {
    if (!userId) return;
    const prev = shows;
    setShows((p) => p.filter((s) => s.id !== id));
    setSelectedShow(null);
    try {
      await showsDb.deleteShow(id, userId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Melo] deleteShow failed', err);
      setShows(prev); // rollback
    }
  };

  const updateSettings = async (updates) => {
    const next = { ...settings, ...updates };
    setSettings(next);
    if (!userId) return;
    try {
      const saved = await dbUpdateSettings(updates, userId);
      setSettings((cur) => ({ ...cur, ...saved }));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Melo] updateSettings failed', err);
    }
  };

  // Profile mutator — used by Profile.jsx for avatar upload + future
  // display-name / bio / privacy edits. Optimistic patch + DB roundtrip.
  // Toast — small slide-down banner used for "✓ Logged X" confirmations
  // and the like. Singleton (only one toast at a time). Auto-dismisses
  // after `durationMs` (default 3s); calling showToast() while one is
  // already up replaces it and resets the timer.
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = useCallback((opts) => {
    if (!opts || !opts.message) return;
    const id = Date.now() + Math.random();
    setToast({ id, message: opts.message, onClick: opts.onClick || null });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToast((cur) => (cur && cur.id === id ? null : cur));
    }, opts.durationMs || 3000);
  }, []);
  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(null);
  }, []);

  const updateProfile = async (patch) => {
    if (!profile) return;
    setProfile((cur) => (cur ? { ...cur, ...patch } : cur));
    try {
      const saved = await updateMyProfile(patch);
      if (saved) setProfile(saved);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Melo] updateProfile failed', err);
      // Re-fetch to recover authoritative state.
      try { setProfile(await getMyProfile()); } catch {}
    }
  };

  const navigate = (page) => {
    if (page === 'log') {
      setShowLog(true);
    } else if (['home', 'shows', 'map', 'songs', 'profile', 'buddies'].includes(page)) {
      setSubPage(null);
      setTab(page);
    } else {
      setSubPage(page);
    }
  };

  // Buddies — Phase 1 keeps buddies as free-text labels embedded in each
  // show's `buddies` array. The dedicated friendships table arrives in
  // Phase 2 (see docs/initiatives/). Expose a derived list so the Buddies
  // page keeps working.
  const buddies = [...new Set(shows.flatMap((s) => s.buddies || []))]
    .map((name) => ({ id: `label:${name}`, name, color: '#E8573A' }));
  const setBuddies = () => {
    // no-op in Phase 1 — buddies are derived from shows
  };

  const ctx = {
    shows,
    buddies,
    tab,
    settings,
    profile,
    session,
    dayStamp,
    addShow,
    addShows,
    updateShow,
    deleteShow,
    setBuddies,
    setShowLog,
    setLogEditTarget,
    setSelectedShow,
    selectedUserId,
    setSelectedUserId,
    subPage,
    navigate,
    updateSettings,
    updateProfile,
    showToast,
    getArtistImage,
    prefetchImages,
    setWrappedYear,
    setCompareShow,
    setShowQuickLog,
    signOut,
  };

  // ---------------- Render gates ----------------

  if (recoveryMode && session.status === 'signedIn') {
    return (
      <ResetPassword
        onDone={() => {
          setRecoveryMode(false);
          try { window.history.replaceState({}, '', window.location.pathname); } catch {}
        }}
      />
    );
  }

  if (session.status === 'loading') {
    return <AppSplash />;
  }

  if (session.status === 'signedOut') {
    return <AuthGate />;
  }

  // Signed in but never finished onboarding (temp username)
  if (profile && isTempUsername(profile.username)) {
    return (
      <Onboarding
        onComplete={async () => {
          const p = await getMyProfile();
          setProfile(p);
        }}
      />
    );
  }

  // Profile still loading — the initial fetch hasn't returned yet
  if (!profile) {
    return <AppSplash />;
  }

  const renderPage = () => {
    if (subPage === 'rankings') return <Rankings />;
    if (subPage === 'festivals') return <Festivals />;
    if (subPage === 'artists') return <Artists />;
    if (subPage === 'settings') return <Settings />;
    if (subPage === 'legal') return <Legal />;
    if (subPage === 'import-calendar') return <ImportFromCalendar onDone={() => setSubPage('settings')} />;
    switch (tab) {
      case 'home': return <Home />;
      case 'shows': return <MyShows />;
      case 'buddies': return <Buddies />;
      case 'map': return <ConcertMap />;
      case 'songs': return <Songs />;
      case 'profile': return <Profile />;
      default: return <Home />;
    }
  };

  return (
    <AppContext.Provider value={ctx}>
      <div className="app">
        {renderPage()}
        {(showLog || logEditTarget) && (
          <LogShow
            editingShow={logEditTarget}
            onClose={() => { setShowLog(false); setLogEditTarget(null); }}
          />
        )}
        {selectedShow && (
          <ShowDetail show={selectedShow} onClose={() => setSelectedShow(null)} />
        )}
        {selectedUserId && (
          <UserProfileView
            userId={selectedUserId}
            onClose={() => setSelectedUserId(null)}
          />
        )}
        {wrappedYear && (
          <Wrapped year={wrappedYear} onClose={() => setWrappedYear(null)} />
        )}
        {compareShow && (
          <ShowComparison showA={compareShow} onClose={() => setCompareShow(null)} />
        )}
        {showQuickLog && (
          <QuickLog
            onClose={() => setShowQuickLog(false)}
            onOpenFull={() => { setShowQuickLog(false); setShowLog(true); }}
          />
        )}
        {/* Moment pop-ups — only when nothing else is open and no
            notification deep-link is about to land somewhere else.
            Rate prompt outranks hype; one card max per day. */}
        {ratePrompt && !pushNav && !selectedShow && !showLog && !logEditTarget &&
          !selectedUserId && !wrappedYear && !compareShow && !showQuickLog && (
          <RatePromptCard
            show={ratePrompt.show}
            daysAgo={-ratePrompt.d}
            onRate={() => {
              // No snooze on the action path: rating flips the show to
              // attended (candidate disappears on its own), and a
              // same-day "TONIGHT" hype card for a back-to-back show
              // can still surface afterward.
              setLogEditTarget(ratePrompt.show);
            }}
            onClose={dismissRatePrompt}
          />
        )}
        {!ratePrompt && hype && !pushNav && !selectedShow && !showLog && !logEditTarget &&
          !selectedUserId && !wrappedYear && !compareShow && !showQuickLog && (
          <HypeCard show={hype.show} daysLeft={hype.d} onClose={dismissHype} />
        )}
        <NavBar />
        {dataLoading && shows.length === 0 && (
          <div className="app-data-loading">Loading your shows…</div>
        )}
        {toast && (
          <button
            type="button"
            className={`app-toast ${toast.onClick ? 'app-toast-tappable' : ''}`}
            onClick={() => {
              if (toast.onClick) toast.onClick();
              dismissToast();
            }}
          >
            <span>{toast.message}</span>
          </button>
        )}
      </div>
    </AppContext.Provider>
  );
}

function AppSplash() {
  return (
    <div className="app-splash">
      <MeloIcon size={72} />
      <div className="app-splash-dot" />
    </div>
  );
}
