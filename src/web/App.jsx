import { useState, useEffect, useReducer, createContext, useContext, useCallback, useMemo, useRef, Fragment } from 'react';
import { prefetchArtistImages, getCachedImage, getCachedVenueImage, prefetchVenueImages as prefetchVenueImagesUtil } from './api';
import { useSession, signOut } from './lib/auth';
import { getMyProfile, updateMyProfile } from './lib/db/profiles';
import { getSettings, updateSettings as dbUpdateSettings } from './lib/db/settings';
import * as showsDb from './lib/db/shows';
import { getPositions } from './lib/db/rankings';
import { registerForPush, onPushTap } from './lib/push';
import { resetFeedCache } from './components/FriendsFeed';
import { identify, resetAnalytics, track } from './lib/analytics';
import { overlayReducer, findOverlay } from './lib/overlays';
import { isGoing, isAttended, daysUntil, SHOW_STATUS } from './store';
import NavBar from './components/NavBar';
import ShowDetail from './components/ShowDetail';
import FestivalDetail from './components/FestivalDetail';
import VenueDetail from './components/VenueDetail';
import ArtistDetail from './components/ArtistDetail';
import RecapReel from './components/RecapReel';
import ShareCardView from './components/ShareCardView';
import HypeCard from './components/HypeCard';
import KnowBeforeYouGo from './components/KnowBeforeYouGo';
import RatePromptCard from './components/RatePromptCard';
import ShowComparison from './components/ShowComparison';
import RankDuel from './components/RankDuel';
import UserProfileView from './pages/UserProfileView';
import QuickLog from './components/QuickLog';
import AuthGate from './components/AuthGate';
import Home from './pages/Home';
import LogShow from './pages/LogShow';
import MyShows from './pages/MyShows';
import Rankings from './pages/Rankings';
import ConcertMap from './pages/ConcertMap';
import Venues from './pages/Venues';
import Songs from './pages/Songs';
import Buddies from './pages/Buddies';
import You from './pages/You';
import Settings from './pages/Settings';
import Wrapped from './pages/Wrapped';
import Festivals from './pages/Festivals';
import Artists from './pages/Artists';
import MusicTaste from './pages/MusicTaste';
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

// Four tabs. Everything else is a subPage reached from one of them.
const TABS = ['home', 'shows', 'you'];
// Legacy page names kept working rather than renamed across every call site.
const PAGE_ALIAS = { stats: 'you', profile: 'you' };

export default function App() {
  const session = useSession();

  // App-level state — only populated once signed in.
  const [tab, setTab] = useState('home');
  const [shows, setShows] = useState([]);
  const [settings, setSettings] = useState({ setlistFmKey: '', hasSetlistFmKey: false });
  const [profile, setProfile] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  // ---- Overlays: ONE stack, not thirteen useStates ----------------------
  // Every full-screen sheet (log, show detail, venue, artist, recap, wrapped…)
  // used to be its own boolean/object here — thirteen of them, three of which
  // (showLog / logEditTarget / logPrefill) described the SAME overlay. They
  // could contradict each other, nothing knew what was on top, and a push
  // notification arriving over an open sheet left it stranded on screen.
  //
  // Now they're a stack of { id, type, props }. `id` is a monotonic counter
  // used as the React key — NEVER an array index, or closing a lower overlay
  // would remount the one above it and lose its scroll position.
  //
  // Consumers don't see any of this: the context still exposes setSelectedShow,
  // setRecapShow, setCompareShow … with their original signatures (see the
  // shims further down), so this landed without touching the 15 files that
  // call them. See docs/initiatives/2026-07-28-ia-simplification.md.
  const [overlays, dispatchOverlay] = useReducer(overlayReducer, []);
  const [subPage, setSubPage] = useState(null);
  // The user's ranked order, { showId: position }. Loaded once with everything
  // else and updated in place by RankDuel, so the leaderboard, the "Where it
  // ranks" recap cut and the receipt all read the same answer without each
  // re-fetching it.
  const [rankPositions, setRankPositions] = useState({});
  const [artistImages, setArtistImages] = useState({});
  const [venueImages, setVenueImages] = useState({}); // `${name}|${city}` -> photo record
  const [recoveryMode, setRecoveryMode] = useState(isPasswordRecovery());

  const userId = session.user?.id;
  const hasCleanedLegacyRef = useRef(false);

  // ---- Load cloud data once signed in ----
  // loadError + loadRetry drive a real error screen (instead of an
  // infinite splash) when the initial fetch fails on a flaky network.
  const [loadError, setLoadError] = useState(false);
  const [loadRetry, setLoadRetry] = useState(0);
  useEffect(() => {
    if (session.status !== 'signedIn' || !userId) {
      setShows([]);
      setSettings({ setlistFmKey: '', hasSetlistFmKey: false });
      setProfile(null);
      setRankPositions({});
      setLoadError(false);
      resetFeedCache(); // don't leak A's friends feed to the next account
      return;
    }
    let cancelled = false;
    setDataLoading(true);
    setLoadError(false);
    (async () => {
      try {
        const [p, s, sh, pos] = await Promise.all([
          getMyProfile(),
          getSettings(),
          showsDb.listMyShows(),
          // Never block the app on rankings — an empty map just means
          // "nothing placed yet", which is the correct starting state.
          getPositions().catch(() => ({})),
        ]);
        if (cancelled) return;
        setProfile(p);
        setSettings(s);
        setShows(sh);
        setRankPositions(pos || {});

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
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session.status, userId, loadRetry]);

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

    // Clear whatever was already open. A tapped notification is an explicit
    // "take me there", and before the overlay stack existed the destination
    // branches only reset `tab`/`subPage` — so a push arriving while a venue
    // sheet was up left that sheet stranded on top of the destination.
    dispatchOverlay({ type: 'clear' });

    // Show-targeted pushes (pre-show, showtime change, post-show rate,
    // and likes/comments on your show) → open that exact show. The
    // rate prompt opens the score editor; everything else opens the
    // show (where the reactions/comments live).
    if (
      kind.startsWith('preshow') || kind === 'postshow_rate' ||
      kind === 'showtime_change' || kind === 'show_comment' || kind === 'show_reaction'
    ) {
      const show = shows.find((s) => s.id === pushNav.showId);
      setSubPage(null);
      setTab('home');
      if (show) {
        dispatchOverlay({
          type: 'set',
          list: kind === 'postshow_rate'
            ? [{ type: 'log', props: { editingShow: show } }]
            : [{ type: 'show', props: { show } }],
        });
      }
      return done();
    }
    // Tour / city / genre alerts → there's no local show yet. Previously
    // this ONLY showed a tappable toast, which either got missed or (for
    // genre_alert, added later) wasn't handled at all — reported by a user
    // as "the notification didn't take me anywhere, just Home." Now it
    // opens Wishlist's Search view pre-searched for that artist — a real
    // screen with every upcoming date, not a toast that can vanish — while
    // still offering the direct tickets link as a fast-path toast on top.
    if (kind === 'tour_alert' || kind === 'city_match' || kind === 'genre_alert') {
      if (pushNav.artist) {
        dispatchOverlay({
          type: 'set',
          list: [{ type: 'log', props: { prefill: { status: SHOW_STATUS.WISHLIST, mode: 'tour', tourArtist: pushNav.artist } } }],
        });
      }
      if (pushNav.ticketUrl) {
        const url = pushNav.ticketUrl;
        showToast({
          message: `🎟️ ${pushNav.artist || 'Tickets'} — tap to get tickets`,
          onClick: () => { try { window.open(url, '_blank'); } catch {} },
          durationMs: 8000,
        });
      } else if (!pushNav.artist) {
        setSubPage('festivals');
      }
      return done();
    }
    // recap_ready — "melo made you a recap" the morning after a log. Opens the
    // show AND its reel: the notification promised a recap, so tapping it should
    // land ON the recap, not on a detail page with a button.
    if (kind === 'recap_ready') {
      const show = shows.find((s) => s.id === pushNav.showId);
      if (show) {
        setSubPage(null);
        // ONE atomic `set`, not two pushes: this is the only handler that opens
        // two overlays, and a partial commit would render the detail page with
        // no reel — contradicting the notification that just promised a recap.
        dispatchOverlay({
          type: 'set',
          list: [{ type: 'show', props: { show } }, { type: 'recap', props: { show } }],
        });
      }
      return done();
    }

    // daily_post — the founder/ops nudge from the `daily-post` cron. Opens the
    // screenshot-ready card at melo.show/tonight; falls back to Discover (whose
    // "Tonight in {city}" rail is the same data) if the payload has no url.
    if (kind === 'daily_post') {
      if (pushNav.url) {
        try { window.open(pushNav.url, '_blank'); } catch { setSubPage('festivals'); }
      } else {
        setSubPage('festivals');
      }
      return done();
    }
    if (kind === 'friend_request') {
      // Buddies is a subPage under You now, not a tab. setTab('buddies') would
      // fall through renderPage's switch to `default: <Home />` and silently
      // strand the tap on the wrong screen — the exact regression a user
      // already reported for genre alerts (see the tour_alert comment above).
      setTab('you');
      setSubPage('buddies');
      return done();
    }
    done();
  }, [pushNav, session.status, dataLoading, profile, shows, dayStamp]);

  // ---- Moment pop-ups (hype + post-show rate prompt) ----
  // dayStamp + momentSnoozedDay are declared above the push effect.
  // Per-show repeat-protection lives in localStorage; the day-level
  // snooze re-arms when dayStamp rolls over.

  // Know Before You Go: a Going show that's TODAY (daysUntil === 0), once per
  // show (`melo_kbyg_<id>_<dayStamp>`). Split out of the hype window so show
  // day gets the logistics card, not another "share the excitement" prompt.
  const kbyg = useMemo(() => {
    if (momentSnoozedDay === dayStamp || session.status !== 'signedIn') return null;
    for (const show of shows.filter(isGoing)) {
      if (daysUntil(show.date) !== 0) continue;
      try {
        if (!localStorage.getItem(`melo_kbyg_${show.id}_${dayStamp}`)) return { show };
      } catch {
        return { show };
      }
    }
    return null;
  }, [shows, momentSnoozedDay, dayStamp, session.status]);

  const dismissKbyg = useCallback(() => {
    if (kbyg) {
      try { localStorage.setItem(`melo_kbyg_${kbyg.show.id}_${dayStamp}`, '1'); } catch {}
    }
    setMomentSnoozedDay(dayStamp);
  }, [kbyg, dayStamp]);

  // Pre-show hype: a Going show 1–2 days out (show day itself is the KBYG card
  // above), once per show per countdown-day (`melo_hype_<id>_<d>`).
  const hype = useMemo(() => {
    if (momentSnoozedDay === dayStamp || session.status !== 'signedIn') return null;
    const candidates = shows
      .filter(isGoing)
      .map((s) => ({ show: s, d: daysUntil(s.date) }))
      .filter(({ d }) => d >= 1 && d <= 2)
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
    // Pass the songs the user logged per artist so ambiguous names (multiple
    // bands called "Goose") resolve to the act they actually saw, matched by
    // setlist against Deezer's catalog.
    const songsByArtist = {};
    shows.forEach((s) => {
      const list = (s.setlist || []).filter(Boolean);
      if (!s.artist || !list.length) return;
      (songsByArtist[s.artist] ||= []).push(...list);
    });
    prefetchArtistImages(artists, (updated) => {
      setArtistImages((prev) => ({ ...prev, ...updated }));
    }, songsByArtist);
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

  // Venue photos (Wikimedia). Same sync-getter + async-fill pattern as artist
  // images, but lazy — venues aren't in the boot prefetch, so the pages that
  // render them (Venues, VenueDetail) call prefetchVenueImages themselves.
  const getVenueImage = useCallback((name, city = '') => {
    if (!name) return null;
    const k = `${name}|${city}`.toLowerCase().trim();
    return venueImages[k] || getCachedVenueImage(name, city) || null;
  }, [venueImages]);

  const prefetchVenueImages = useCallback((venues) => {
    if (!venues || venues.length === 0) return;
    prefetchVenueImagesUtil(venues, (updated) => {
      setVenueImages((prev) => ({ ...prev, ...updated }));
    });
  }, []);

  // ---- Mutation helpers (optimistic; reconcile with server result) ----
  const addShow = async (show) => {
    if (!userId) return null;
    // Capture before the await: is this the user's very first show?
    const isFirstEver = shows.length === 0;
    try {
      const created = await showsDb.createShow(show, userId);
      setShows((prev) => [created, ...prev]);
      // Celebrate the first logged show with its share card — the "here's
      // your first Melo card" moment (and the start of the sharing loop).
      // Fires exactly once per user, after the log UI has settled.
      if (isFirstEver && created) {
        let shown = false;
        try { shown = !!localStorage.getItem('melo_first_card_shown'); } catch {}
        if (!shown) {
          try { localStorage.setItem('melo_first_card_shown', '1'); } catch {}
          track('first_show_logged');
          setTimeout(() => openOverlay('firstCard', { show: created }), 700);
        }
      }

      // "Which was better?" — place the new show in the ranked library while
      // the user is still thinking about it. Only for shows they've actually
      // BEEN to (ranking a wishlist entry is nonsense), and only when there's
      // something to compare against; the first show ever is #1 by definition
      // and gets the share card above instead. Both sheets close before their
      // addShow resolves, so this lands on a clean screen.
      const attendedCount = shows.filter(isAttended).length;
      if (created && isAttended(created) && attendedCount >= 1) {
        setTimeout(() => openOverlay('rank', { show: created }), 450);
      }
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
    // Deleting always happens from inside the show's own sheet, so closing
    // whatever ShowDetail is open is the right meaning here.
    closeOverlay('show');
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

  // Year scope carried from Stats into its destination pages. Stats' tiles are
  // year-scoped numbers ("3 Shows" in 2024), so the page they open must show
  // that year — not the all-time list. `navigate(page, { year })` sets it and
  // EVERY other navigate clears it, so the scope can't silently persist into a
  // page reached from the nav bar later.
  const [statsYear, setStatsYear] = useState(null);

  const openOverlay = useCallback((type, props) => dispatchOverlay({ type: 'push', overlay: type, props }), []);
  const closeOverlay = useCallback((type) => dispatchOverlay({ type: 'closeType', overlay: type }), []);

  const navigate = (page, opts = {}) => {
    // Set the year scope BEFORE resolving the alias — a legacy
    // navigate('stats', { year }) must not lose its scope on the way through.
    setStatsYear(opts.year ?? null);
    // 'stats' and 'profile' are the pre-merge names for the You tab. Aliasing
    // here means the call sites that still use them keep working, so the tab
    // restructure didn't have to be a mechanical rename across eight files.
    const p = PAGE_ALIAS[page] || page;
    if (p === 'log') {
      // "Log a show" means the fast path now. The full sheet is still one tap
      // further in, and anything that specifically needs it — the post-show
      // rate prompt, tour-alert deep links — opens it directly via
      // openOverlay('log', …) rather than coming through here.
      openOverlay('quicklog', {});
    } else if (TABS.includes(p)) {
      setSubPage(null);
      setTab(p);
    } else {
      // Everything else — including map / songs / buddies, which used to be
      // tabs — falls through to a subPage.
      setSubPage(p);
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

  // Two overlays are also READ by consumers, not just set. Derive them from the
  // stack so the context keeps exposing the same values it always did.
  const recapShow = findOverlay(overlays, 'recap')?.props.show || null;
  const selectedUserId = findOverlay(overlays, 'user')?.props.userId || null;

  // Is the screen free for an unprompted moment card?
  const quiet = overlays.length === 0 && !pushNav;

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

    // ---- Overlay API ----
    // The real one. New code should use these.
    openOverlay,
    closeOverlay,
    closeAllOverlays: () => dispatchOverlay({ type: 'clear' }),
    overlayCount: overlays.length,

    // Back-compat shims. Fifteen files call these with their original
    // signatures — `setX(value)` opens, `setX(null|false)` closes — so the
    // stack landed without touching any of them. They're not deprecated so
    // much as the ergonomic form: `setSelectedShow(show)` reads better at the
    // call site than `openOverlay('show', { show })`.
    setShowLog: (b) => (b ? openOverlay('log', {}) : closeOverlay('log')),
    setLogEditTarget: (s) => (s ? openOverlay('log', { editingShow: s }) : closeOverlay('log')),
    setSelectedShow: (s) => (s ? openOverlay('show', { show: s }) : closeOverlay('show')),
    setSelectedFestival: (o) => (o ? openOverlay('festival', { outing: o }) : closeOverlay('festival')),
    setSelectedVenue: (v) => (v ? openOverlay('venue', { venue: v }) : closeOverlay('venue')),
    setSelectedArtist: (a) => (a ? openOverlay('artist', { artist: a }) : closeOverlay('artist')),
    setRecapShow: (s) => (s ? openOverlay('recap', { show: s }) : closeOverlay('recap')),
    setSelectedUserId: (u) => (u ? openOverlay('user', { userId: u }) : closeOverlay('user')),
    setWrappedYear: (y) => (y ? openOverlay('wrapped', { year: y }) : closeOverlay('wrapped')),
    setCompareShow: (s) => (s ? openOverlay('compare', { showA: s }) : closeOverlay('compare')),
    setShowQuickLog: (b) => (b ? openOverlay('quicklog', {}) : closeOverlay('quicklog')),
    recapShow,
    selectedUserId,

    rankPositions,
    setRankPositions,
    subPage,
    navigate,
    statsYear,
    setStatsYear,
    updateSettings,
    updateProfile,
    showToast,
    getArtistImage,
    prefetchImages,
    getVenueImage,
    prefetchVenueImages,
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

  // Initial fetch failed (flaky network) — show a real error + retry
  // instead of stranding the user on the splash forever.
  if (!profile && loadError && !dataLoading) {
    return (
      <div className="app-error">
        <MeloIcon size={64} />
        <h2 className="app-error-title">Couldn’t connect</h2>
        <p className="app-error-sub">Check your connection and try again.</p>
        <button className="app-error-retry" onClick={() => setLoadRetry((n) => n + 1)}>
          Retry
        </button>
      </div>
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
    if (subPage === 'music-taste') return <MusicTaste />;
    if (subPage === 'venues') return <Venues />;
    if (subPage === 'legal') return <Legal />;
    // PARKED, not orphaned: nothing navigates here today because the Settings
    // link (Settings.jsx) and the Onboarding step (Onboarding.jsx) are both
    // commented out pending an @ebarooni/capacitor-calendar iOS bridge fix.
    // The route is the restore path — re-enable those two call sites and this
    // works again. Kept deliberately; the planned camera-roll backfill builds
    // on it. See docs/initiatives/2026-07-28-ia-simplification.md.
    if (subPage === 'import-calendar') return <ImportFromCalendar onDone={() => setSubPage('settings')} />;
    // Former tabs, now drill-ins from You.
    if (subPage === 'buddies') return <Buddies />;
    if (subPage === 'map') return <ConcertMap />;
    if (subPage === 'songs') return <Songs />;
    switch (tab) {
      case 'shows': return <MyShows />;
      case 'you': return <You />;
      default: return <Home />;
    }
  };

  return (
    <AppContext.Provider value={ctx}>
      <div className="app">
        {renderPage()}
        {/* The overlay stack. Render order IS stack order, which reproduces
            the old hand-written z-order exactly (festival → venue → artist →
            show → recap), because that's the real drill-in sequence. */}
        {overlays.map((o) => {
          const close = () => dispatchOverlay({ type: 'closeId', id: o.id });
          const p = o.props;
          const openShow = (s) => openOverlay('show', { show: s });
          return (
            <Fragment key={o.id}>
              {o.type === 'log' && (
                <LogShow editingShow={p.editingShow || null} prefill={p.prefill || null} onClose={close} />
              )}
              {o.type === 'quicklog' && (
                <QuickLog
                  onClose={close}
                  onOpenFull={(draft) => { close(); openOverlay('log', { prefill: draft || null }); }}
                />
              )}
              {o.type === 'festival' && <FestivalDetail outing={p.outing} onClose={close} onOpenShow={openShow} />}
              {o.type === 'venue' && <VenueDetail venue={p.venue} onClose={close} onOpenShow={openShow} />}
              {o.type === 'artist' && <ArtistDetail artist={p.artist} onClose={close} onOpenShow={openShow} />}
              {o.type === 'show' && <ShowDetail show={p.show} onClose={close} />}
              {o.type === 'recap' && <RecapReel show={p.show} onClose={close} />}
              {o.type === 'firstCard' && (
                <ShareCardView
                  show={p.show}
                  handle={profile?.username}
                  firstRun
                  onShared={() => track('first_show_card_shared')}
                  onClose={close}
                />
              )}
              {o.type === 'user' && <UserProfileView userId={p.userId} onClose={close} />}
              {o.type === 'wrapped' && <Wrapped year={p.year} onClose={close} />}
              {o.type === 'compare' && <ShowComparison showA={p.showA} onClose={close} />}
              {o.type === 'rank' && <RankDuel show={p.show} onClose={close} />}
            </Fragment>
          );
        })}
        {/* Moment pop-ups — only when nothing else is open and no notification
            deep-link is about to land somewhere else. Rate prompt outranks
            hype; one card max per day.

            `quiet` replaces three copies of a nine-term && chain that listed
            overlays by hand and MISSED four of them (festival, venue, artist,
            recap) — so a rate prompt could pop over an open VenueDetail. The
            stack knows what's open; asking it can't drift. */}
        {ratePrompt && quiet && (
          <RatePromptCard
            show={ratePrompt.show}
            daysAgo={-ratePrompt.d}
            onRate={() => {
              // Snooze for the day on the action path too, so canceling
              // out of the editor (without saving) doesn't immediately
              // re-surface this same prompt. Rating still removes the
              // candidate permanently; this only covers the cancel case.
              const s = ratePrompt.show;
              dismissRatePrompt();
              openOverlay('log', { editingShow: s });
            }}
            onClose={dismissRatePrompt}
          />
        )}
        {!ratePrompt && kbyg && quiet && (
          <KnowBeforeYouGo show={kbyg.show} onClose={dismissKbyg} />
        )}
        {!ratePrompt && !kbyg && hype && quiet && (
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
