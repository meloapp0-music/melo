import { useState, useEffect, useRef } from 'react';
import { useApp } from '../App';
import { getArtistGradient, formatDate, vibeStyle, isAttended, ticketmasterSearchUrl, SHOW_STATUS, getShowStatus, daysUntil, festivalKey } from '../store';
import { fetchArtistBio, lookupVenueUrl, venueSearchUrl, venueOverrideUrl } from '../api';
import ShowDayInfo from './ShowDayInfo';
import { track } from '../lib/analytics';
import { listAttendees, friendsMatchingShows, revokeShareToken } from '../lib/db/shows';
import { getProfilesByIds } from '../lib/db/profiles';
import PlayableSetlist from './PlayableSetlist';
import PhotoGallery from './PhotoGallery';
import ShowSocial from './ShowSocial';
import ShareCardView from './ShareCardView';
import { canRecap } from '../lib/recap';
import { buildCut, DEFAULT_CUT } from '../lib/recapCuts';

// Rough "how long ago" label for the pre-show card. Years once it's
// been 12+ months, otherwise months. Good enough for "you last saw
// them 2 years ago" — no need for day precision.
function timeAgoLabel(dateStr) {
  const then = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(then.getTime())) return '';
  const now = new Date();
  let months = (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
  if (months < 1) return 'less than a month ago';
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export default function ShowDetail({ show, onClose }) {
  const { deleteShow, buddies, getArtistImage, setCompareShow, setLogEditTarget, updateShow, shows, showToast, profile, setSelectedUserId , setRecapShow } = useApp();

  // Whose show is this? fromRow always populates userId now, so this is
  // a straight match. Non-owners get a view-only detail (no edit /
  // delete / favorite / status controls) but full reactions + comments.
  // The `|| !show.userId` fallback covers any hand-built show object
  // (none today) defensively resolving to "mine".
  const isOwner = !show.userId || show.userId === profile?.id;

  // Share this show — canvas card via the native share sheet. Status
  // The redesigned share flow opens the full-screen ShareCardView builder, which
  // owns the export + share-to-story. The share event (status enum only, never
  // artist names) is logged via onShared when a post completes.
  const [shareCardOpen, setShareCardOpen] = useState(false);

  // Delete confirmation — in-app sheet instead of a raw browser confirm().
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Public share page (migration 0016). `shareToken` is minted lazily the first
  // time the card is shared, so a local mirror keeps this row in sync without
  // re-fetching the show.
  const [sharedOverride, setSharedOverride] = useState(null);
  const [stopping, setStopping] = useState(false);
  const isShared = sharedOverride ?? !!show.shareToken;
  const stopSharing = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      await revokeShareToken(show.id, show.userId || profile?.id);
      setSharedOverride(false);
      showToast?.('Public page removed');
    } catch {
      showToast?.('Could not stop sharing — try again');
    } finally {
      setStopping(false);
    }
  };

  // Status upgrade — local mirror so the button reflects the change
  // instantly (the parent holds `selectedShow` as a separate object).
  // Wishlist → Going when the user buys tickets.
  const [statusOverride, setStatusOverride] = useState(null);
  const effectiveStatus = statusOverride || getShowStatus(show);

  // Tagged co-attendees — the real friends you're going WITH. They were only
  // ever shown in the feed's "with …" line; surface them UP FRONT on the card.
  //
  // OWNER-ONLY, and deliberately so. This block is first-person ("You were there
  // with …"), which is only true on your own show — ShowDetail also opens for a
  // FRIEND'S show straight from the feed. It would be a privacy leak besides:
  // `listAttendees` is gated by can_view_show_id, so on Claire's show it returns
  // everyone CLAIRE tagged, and they only have to be HER accepted friends — so a
  // stranger's real name and avatar would render on a show you weren't even at.
  // On your own show the same call can only return people you tagged, who must
  // be your own accepted friends.
  const [coFriends, setCoFriends] = useState([]);
  const [coAnon, setCoAnon] = useState(0);
  useEffect(() => {
    if (!isOwner) { setCoFriends([]); setCoAnon(0); return undefined; }
    let cancelled = false;
    // "Going with" = tagged co-attendees ∪ friends who logged the SAME show
    // (artist+date, matching status) independently — not just people you tagged.
    const status = isAttended(show) ? 'attended' : 'going';
    Promise.all([
      listAttendees(show.id).catch(() => []),
      friendsMatchingShows([{ artist: show.artist, date: show.date, festival: show.festival }], status).catch(() => new Map()),
    ])
      .then(async ([rows, indMap]) => {
        // Festival act → match anyone at the same festival (any day); else exact.
        const key = festivalKey(show) || `${(show.artist || '').toLowerCase().trim()}|${show.date}`;
        const ids = [...new Set([...rows.map((r) => r.user_id), ...(indMap.get(key) || [])])]
          .filter((id) => id && id !== profile?.id);
        if (!ids.length) { if (!cancelled) { setCoFriends([]); setCoAnon(0); } return; }
        const profs = await getProfilesByIds(ids).catch(() => new Map());
        if (cancelled) return;
        // An id RLS won't resolve stays ANONYMOUS — a placeholder "Friend" avatar
        // is a fake identity and taps through to an empty profile. Same treatment
        // the feed gives them: fold into a "+N" count.
        const resolved = ids.map((id) => [id, profs.get(id)]).filter(([, p]) => p);
        setCoFriends(resolved.map(([id, p]) => ({
          userId: id,
          name: p.displayName || p.username,
          avatarUrl: p.avatarUrl,
          avatarColor: p.avatarColor,
        })));
        setCoAnon(ids.length - resolved.length);
      })
      .catch(() => { if (!cancelled) { setCoFriends([]); setCoAnon(0); } });
    return () => { cancelled = true; };
  }, [isOwner, show.id, show.artist, show.date, show.festival, profile?.id]);

  const coNames = coFriends.map((f) => f.name);
  const coTotal = coNames.length + coAnon;
  const goingWithLabel = coNames.length === 0
    ? `${coAnon} ${coAnon === 1 ? 'other' : 'others'}`
    : coTotal <= 2
      ? coNames.join(' & ')
      : `${coNames.slice(0, 2).join(', ')} & ${coTotal - Math.min(coNames.length, 2)} more`;
  const markGoing = () => {
    setStatusOverride(SHOW_STATUS.GOING);
    try { updateShow(show.id, { status: SHOW_STATUS.GOING }); } catch { /* optimistic */ }
    if (showToast) showToast({ message: `🎟️ ${show.artist} moved to Going` });
  };

  // Pre-show intel — for an upcoming (Going / Wishlist) show, find the
  // user's most recent past show for the same artist. Per
  // docs/initiatives/2026-05-08-pre-show-toolkit.md (Phase 1).
  const lastSeen = (() => {
    if (isAttended(show)) return null;
    const name = (show.artist || '').trim().toLowerCase();
    if (!name) return null;
    const prior = shows
      .filter((s) => s.id !== show.id && isAttended(s) && s.date &&
        (s.artist || '').trim().toLowerCase() === name)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    return prior[0] || null;
  })();

  // Auto-resolve the official venue website on open. We keep a local
  // mirror so the pill flips from "Loading…" → live link without forcing
  // the parent to refetch. State machine:
  //   idle      — URL is final (either a saved good URL, or we tried + missed)
  //   loading   — Wikidata lookup in flight
  //   not_found — lookup completed with no result; pill falls back to search
  // Stale Ticketmaster URLs from the very first venue-links cut are
  // detected and re-resolved here so dev installs heal automatically.
  //
  // CRITICAL: this effect runs ONCE per show.id change, not on every
  // re-render. Earlier we depended on `updateShow` (an unstable ref
  // from App.jsx) which created an infinite loop when the persist call
  // failed (App.jsx's updateShow refetches on error → state churn →
  // effect re-fires → resolves → persist fails → refetch → loop). With
  // a stable ref for updateShow + show.id-only deps, a failed save
  // logs and stops.
  const [venueUrl, setVenueUrl] = useState('');
  const [venueLookupState, setVenueLookupState] = useState('idle');
  const updateShowRef = useRef(updateShow);
  useEffect(() => { updateShowRef.current = updateShow; }, [updateShow]);

  // ★ Favorite. Local mirror so the star flips instantly — the parent
  // holds `selectedShow` as a separate object that updateShow() doesn't
  // re-push into this component. Per the v1.0.5 favorite initiative.
  const [isFavorite, setIsFavorite] = useState(!!show.isFavorite);
  const toggleFavorite = () => {
    const next = !isFavorite;
    setIsFavorite(next);
    try { updateShow(show.id, { isFavorite: next }); } catch { /* optimistic */ }
  };

  useEffect(() => {
    let cancelled = false;
    const isStale = (url) =>
      !url || url.includes('ticketmaster.com') || url.includes('setlist.fm');

    if (!show.venue) {
      setVenueUrl('');
      setVenueLookupState('idle');
      return;
    }

    // A curated override wins over everything — including a previously
    // cached wrong URL — so a venue the heuristic got wrong heals on
    // next open.
    const override = venueOverrideUrl(show.venue);
    if (override) {
      setVenueUrl(override);
      setVenueLookupState('idle');
      // Persist only on your OWN show — a write to a friend's show row
      // fails RLS and triggers a spurious refetch of your shows.
      if (isOwner && show.venueUrl !== override) {
        try { updateShowRef.current(show.id, { venueUrl: override }); } catch {}
      }
      return;
    }

    if (show.venueUrl && !isStale(show.venueUrl)) {
      setVenueUrl(show.venueUrl);
      setVenueLookupState('idle');
      return;
    }

    // No saved URL or saved-but-stale → resolve from Wikipedia/Wikidata.
    setVenueUrl('');
    setVenueLookupState('loading');
    lookupVenueUrl(show.venue, show.city).then((resolved) => {
      if (cancelled) return;
      if (resolved) {
        setVenueUrl(resolved);
        setVenueLookupState('idle');
        // Best-effort persist (own show only — see override branch). The
        // in-memory pill still works for friends' shows this session.
        if (isOwner) {
          try { updateShowRef.current(show.id, { venueUrl: resolved }); } catch {}
        }
      } else {
        setVenueLookupState('not_found');
      }
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show.id]);
  // --- Show Day intel (upcoming shows only) ---
  // The full "Know Before You Go" panel is its own self-contained component
  // (ShowDayInfo) — showtime, weather, venue/artist Instagram, and the official
  // Ticketmaster info. It does its own module-cached fetching.
  const upcoming = !isAttended(show) && !Number.isNaN(daysUntil(show.date)) && daysUntil(show.date) >= 0;

  const artistImage = getArtistImage(show.artist);
  const gradient = getArtistGradient(show.artist);

  // MusicBrainz artist bio
  const [bio, setBio] = useState(null);
  const [bioLoading, setBioLoading] = useState(true);

  useEffect(() => {
    setBioLoading(true);
    fetchArtistBio(show.artist)
      .then((data) => setBio(data))
      .catch(() => setBio(null))
      .finally(() => setBioLoading(false));
  }, [show.artist]);

  // Hero priority: user's own photo > Deezer artist image > generated
  // gradient. Their concert photos make the page personal — fall back
  // to the canonical artist art only when the user hasn't uploaded any.
  const heroPhoto = show.photos?.[0] || null;
  const heroStyle = (heroPhoto || artistImage)
    ? { backgroundImage: `url(${heroPhoto || artistImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: gradient };

  const getVibeStyle = (name) => {
    const v = vibeStyle(name);
    return v.bg ? { background: v.bg, color: v.color } : {};
  };

  const getBuddyColor = (name) => {
    const b = buddies.find((bd) => bd.name === name);
    return b ? b.color : '#999';
  };

  return (
    <div className="detail-overlay">
      <div className="detail-backdrop" onClick={onClose} />
      <div className="detail-sheet">
        <div className="detail-hero">
          <div className="gradient-bg" style={heroStyle} />
          <div className="detail-hero-overlay" />
          <div className="detail-hero-info">
            {/* Countdown chip — upcoming shows only ("Tonight" through
                "In N days"); attended shows skip it. */}
            {!isAttended(show) && (() => {
              const d = daysUntil(show.date);
              if (Number.isNaN(d) || d < 0) return null;
              const label =
                d === 0 ? 'Tonight' :
                  d === 1 ? 'Tomorrow' :
                    `In ${d} days`;
              return <div className="detail-countdown">{label}</div>;
            })()}
            <div className="detail-artist">{show.artist}</div>
            <div className="detail-meta">
              {formatDate(show.date)} &middot; {show.venue}, {show.city}
            </div>
            {show.openers && show.openers.length > 0 && (
              <div className="detail-openers">
                with {show.openers.join(', ')}
              </div>
            )}
            {show.festival && (
              <div className="detail-festival-badge">
                <span aria-hidden="true">🎪</span>
                <span>{show.festival}</span>
              </div>
            )}
          </div>
          {show.score > 0 && (
            <div className="detail-hero-score">
              {Number.isInteger(show.score) ? show.score : show.score.toFixed(1)}
            </div>
          )}
          {isOwner && (
            <button
              className={`detail-fav ${isFavorite ? 'active' : ''}`}
              onClick={toggleFavorite}
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={isFavorite}
            >
              <svg viewBox="0 0 24 24">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
          )}
          {isOwner && (
            <button
              className="detail-del-top"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete show"
            >
              <svg viewBox="0 0 24 24">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
          )}
          <button className="detail-close" onClick={onClose}>
            <svg viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="detail-body">
          {/* Going with — tagged friends, surfaced up front. Owner-only: see the
              coFriends effect. `coTotal` counts the anonymous ones too, so a
              lone unresolvable co-attendee still reads "with 1 other". */}
          {coTotal > 0 && (
            <div className="detail-goingwith">
              <div className="detail-goingwith-avatars">
                {coFriends.slice(0, 4).map((f) => (
                  <button
                    key={f.userId}
                    type="button"
                    className="detail-goingwith-avatar"
                    onClick={() => setSelectedUserId?.(f.userId)}
                    aria-label={`View ${f.name}`}
                    style={f.avatarUrl
                      ? { backgroundImage: `url(${f.avatarUrl})` }
                      : { background: f.avatarColor || '#E8573A' }}
                  >
                    {!f.avatarUrl && f.name[0].toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="detail-goingwith-text">
                {isAttended(show) ? 'You were there with ' : 'Going with '}
                <b>{goingWithLabel}</b>
              </div>
            </div>
          )}

          {/* Tickets / find-tickets — only for shows the user hasn't been to
              yet. For attended shows, the ticketing flow is over. */}
          {!isAttended(show) && (
            <a
              className="detail-tickets-btn"
              href={ticketmasterSearchUrl(show)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="detail-tickets-icon" aria-hidden="true">🎟️</span>
              <span>Find tickets on Ticketmaster</span>
              <span className="detail-tickets-arrow" aria-hidden="true">↗</span>
            </a>
          )}

          {/* Show Day card — everything you need before heading out:
              showtime (TM), weather (Open-Meteo), directions (Apple
              Maps), and the venue's entry/bag rules. The day-of push
              deep-links here. Upcoming shows only. */}
          {upcoming && (
            <div className="showday-card">
              <div className="showday-label">Know Before You Go</div>
              <ShowDayInfo show={show} />
            </div>
          )}

          {/* Wishlist → Going upgrade — "I bought tickets". Only on your
              own Wishlist show; once moved, it becomes a Going show. */}
          {isOwner && effectiveStatus === SHOW_STATUS.WISHLIST && (
            <button className="detail-upgrade-btn" onClick={markGoing}>
              <span aria-hidden="true">🎟️</span>
              <span>I got tickets — I'm Going</span>
            </button>
          )}

          {/* melo made you a recap — a per-show story reel. Own shows only, and
              only when there's enough (setlist / media / a rating) to make it
              sing (canRecap). */}
          {/* THE ARRIVAL — the handoff's "Recap ready" state (§2.1). The recap is
              a post-log GIFT, not a button you hunt for: an in-the-books chip, a
              poster card with the shimmer badge, the runtime, and one CTA. */}
          {isOwner && canRecap(show) && (() => {
            const secs = Math.round(buildCut(DEFAULT_CUT, show).reduce((a, sc) => a + sc.dur, 0));
            const poster = (show.photos || [])[0] || getArtistImage(show.artist) || '';
            return (
              <div className="recapready">
                <div className="recapready-chip">🎉 {show.artist} is in the books</div>
                <button
                  className="recapready-card"
                  onClick={() => setRecapShow(show)}
                  style={poster
                    ? { backgroundImage: `url("${poster}")` }
                    : { background: getArtistGradient(show.artist) }}
                >
                  <span className="recapready-scrim" aria-hidden="true" />
                  <span className="recapready-badge">✨ melo made you a recap</span>
                  <span className="recapready-body">
                    <span className="recapready-head">Your {secs}s recap is ready.</span>
                    <span className="recapready-cta">▶  Watch &amp; share</span>
                  </span>
                </button>
              </div>
            );
          })()}

          {/* Share this show — own shows only (the card says "I was
              there / my rating", so sharing a friend's show would
              misattribute it). The footer QR is the install loop. */}
          {isOwner && (
            <button className="detail-share-btn" onClick={() => setShareCardOpen(true)}>
              <span aria-hidden="true">📣</span>
              <span>Share this show</span>
            </button>
          )}

          {/* Public page control — only once the show has actually been shared.
              Copy is deliberately "removes the page", NOT "deletes": the token
              kills the page, but photos/videos live in public-read Storage, so
              anyone holding a saved media URL keeps it. Real revocation needs a
              signed-URL redesign (see the public-share-pages initiative). Do not
              let this copy over-promise — it's a privacy commitment. */}
          {isOwner && isShared && (
            <div className="detail-sharelink">
              <div className="detail-sharelink-row">
                <span className="detail-sharelink-txt">
                  🔗 This show has a public page
                </span>
                <button
                  className="detail-sharelink-stop"
                  onClick={stopSharing}
                  disabled={stopping}
                >
                  {stopping ? '…' : 'Stop sharing'}
                </button>
              </div>
              <div className="detail-sharelink-hint">
                Anyone with the link can see it. Stopping removes the page — photos
                and videos already downloaded can’t be recalled.
              </div>
            </div>
          )}
          {isOwner && shareCardOpen && (
            <ShareCardView
              show={show}
              handle={profile?.username}
              onShared={() => track('show_card_shared', { status: getShowStatus(show) })}
              onClose={() => setShareCardOpen(false)}
            />
          )}

          {/* Reactions + comments — for your shows and friends' alike. */}
          <ShowSocial show={show} />

          {/* Pre-show card — only on upcoming (Going / Wishlist) shows.
              Surfaces the user's last time seeing this artist. Per
              docs/initiatives/2026-05-08-pre-show-toolkit.md. */}
          {!isAttended(show) && (
            <div className="preshow-card">
              <div className="preshow-card-label">Pre-show</div>
              {lastSeen ? (
                <>
                  <div className="preshow-title">
                    You last saw {show.artist} {timeAgoLabel(lastSeen.date)}
                  </div>
                  <div className="preshow-detail">
                    {[
                      [lastSeen.venue, lastSeen.city].filter(Boolean).join(', '),
                      formatDate(lastSeen.date),
                    ].filter(Boolean).join(' · ')}
                  </div>
                  {lastSeen.score > 0 && (
                    <div className="preshow-score-row">
                      <span className="preshow-score">
                        {Number.isInteger(lastSeen.score)
                          ? lastSeen.score
                          : lastSeen.score.toFixed(1)}
                      </span>
                      <span className="preshow-score-label">
                        your rating that night
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="preshow-title">
                  First time seeing {show.artist} ✨
                </div>
              )}
            </div>
          )}

          {show.vibes && show.vibes.length > 0 && (
            <div className="detail-vibes-row">
              {show.vibes.map((v) => (
                <span key={v} className="detail-vibe" style={getVibeStyle(v)}>
                  {v}
                </span>
              ))}
            </div>
          )}

          {/* Venue links card. Pill label = the venue name itself, so the
              user knows where they're going before they tap. The pill is
              ALWAYS clickable — preferred URL is the official site
              resolved via Wikipedia/Wikidata, fallback is a Google
              search for "{venue} {city} official site" so the user
              always lands somewhere useful. Future phases add artist
              merch + tour merch pills here. Per
              docs/initiatives/2026-05-05-venue-and-merch-links.md. */}
          {show.venue && (
            <div className="detail-links-row">
              <a
                className={
                  'detail-link-pill' +
                  (venueLookupState === 'loading' ? ' detail-link-pill-loading' : '')
                }
                href={venueUrl || venueSearchUrl(show.venue, show.city)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track('venue_link_tapped', { resolved: !!venueUrl })}
              >
                <span aria-hidden="true">📍</span>
                <span className="detail-link-pill-name">{show.venue}</span>
                <span className="detail-link-arrow" aria-hidden="true">
                  {venueLookupState === 'loading' ? '…' : venueUrl ? '↗' : '🔍'}
                </span>
              </a>
            </div>
          )}

          {show.photos && show.photos.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-title">Photos ({show.photos.length})</div>
              <PhotoGallery
                photos={show.photos}
                onRemove={isOwner ? (url) => updateShow(show.id, { photos: show.photos.filter((p) => p !== url) }) : undefined}
              />
            </div>
          )}

          {/* Videos — short clips logged with the show (migration 0014).
              Tap-to-play, never autoplay: saves data and battery.
              #t=0.01 nudges iOS WKWebView to paint the first frame as
              the poster instead of a black rectangle. */}
          {show.videos && show.videos.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-title">Videos ({show.videos.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {show.videos.map((url) => (
                  <video
                    key={url}
                    src={`${url}#t=0.01`}
                    controls
                    playsInline
                    preload="metadata"
                    style={{ width: '100%', borderRadius: 14, background: '#17120C' }}
                  />
                ))}
              </div>
            </div>
          )}

          {show.notes && (
            <div className="detail-section">
              <div className="detail-section-title">Notes</div>
              <p className="detail-notes">{show.notes}</p>
            </div>
          )}

          {show.setlist && show.setlist.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-title">Setlist ({show.setlist.length} songs)</div>
              <PlayableSetlist
                artist={show.artist}
                songs={show.setlist}
                numbered
              />
              {/* Setlist.fm requires visible attribution + CC-BY-SA notice
                  on every surface that displays their data. */}
              <div className="legal-attribution">
                Setlist data via{' '}
                <a href="https://setlist.fm" target="_blank" rel="noopener">setlist.fm</a>
                {' '}(CC BY-SA)
              </div>
            </div>
          )}

          {show.buddies && show.buddies.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-title">Went With</div>
              <div className="detail-buddies">
                {show.buddies.map((name) => (
                  <div key={name} className="detail-buddy">
                    <div
                      className="detail-buddy-avatar"
                      style={{ background: getBuddyColor(name) }}
                    >
                      {name[0]}
                    </div>
                    <span className="detail-buddy-name">{name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {show.genre && (
            <div className="detail-section">
              <div className="detail-section-title">Genre</div>
              <span className="filter-chip active" style={{ cursor: 'default' }}>
                {show.genre}
              </span>
            </div>
          )}

          {/* Artist Bio from MusicBrainz */}
          <div className="detail-section">
            <div className="detail-section-title">About the Artist</div>
            {bioLoading ? (
              <div className="bio-loading">Loading artist info...</div>
            ) : bio ? (
              <div className="bio-card">
                <div className="bio-header">
                  <div
                    className="bio-avatar"
                    style={
                      artistImage
                        ? { backgroundImage: `url(${artistImage})` }
                        : { background: gradient }
                    }
                  />
                  <div>
                    <div className="bio-name">{bio.name}</div>
                    <div className="bio-type">
                      {bio.type || 'Artist'}
                      {bio.country ? ` · ${bio.country}` : ''}
                      {bio.beginYear ? ` · Since ${bio.beginYear}` : ''}
                      {bio.active === false && bio.endYear ? ` – ${bio.endYear}` : ''}
                    </div>
                  </div>
                </div>
                {bio.disambiguation && (
                  <p className="bio-desc">{bio.disambiguation}</p>
                )}
                {bio.genres && bio.genres.length > 0 && (
                  <div className="bio-genres">
                    {bio.genres.map((g) => (
                      <span key={g} className="bio-genre-pill">{g}</span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bio-loading" style={{ opacity: 0.5 }}>
                No artist info available
              </div>
            )}
          </div>

          {/* Owner-only controls — hidden when viewing a friend's show. */}
          {isOwner && (
            <>
              <button
                className="detail-compare-btn"
                onClick={() => { onClose(); setLogEditTarget(show); }}
              >
                Edit show
              </button>

              <button
                className="detail-compare-btn"
                onClick={() => { onClose(); setCompareShow(show); }}
              >
                ⚔️ Compare with another show
              </button>

              <button
                className="detail-delete"
                onClick={() => setConfirmDelete(true)}
              >
                Delete Show
              </button>
            </>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div className="detail-confirm-scrim" onClick={() => setConfirmDelete(false)}>
          <div className="detail-confirm-card" onClick={(e) => e.stopPropagation()}>
            <div className="detail-confirm-title">Delete this show?</div>
            <div className="detail-confirm-body">This can't be undone.</div>
            <div className="detail-confirm-actions">
              <button
                className="detail-confirm-cancel"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
              <button
                className="detail-confirm-delete"
                onClick={() => { deleteShow(show.id); setConfirmDelete(false); }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
