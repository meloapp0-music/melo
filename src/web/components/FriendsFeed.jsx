import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../App';
import { listFriends } from '../lib/db/friendships';
import { listFriendsShows, attendeesForShows, friendsShowStats } from '../lib/db/shows';
import { reactionSummary, commentCounts, setReaction, notifyInteraction } from '../lib/db/social';
import { getProfilesByIds } from '../lib/db/profiles';
import { getArtistGradient, formatDate, isAttended, isGoing, isWishlist, daysUntil, SHOW_STATUS, generateId } from '../store';

// Session-lived cache so the feed renders synchronously on every Home
// remount (no layout pop-in above the fold) and refreshes in the
// background. Keyed by owner so a sign-out → different-user sign-in on
// the same device can't flash account A's feed to account B.
let feedCache = null;
let feedCacheOwner = null;

export function resetFeedCache() {
  feedCache = null;
  feedCacheOwner = null;
}

const MAX_PER_FRIEND = 4;
const MAX_ITEMS = 20;
// Show-count milestones worth celebrating in the feed.
const MILESTONES = new Set([10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000]);
const RECAP_MIN = 5;   // shows this year before a friend earns a recap card
const MAX_RECAPS = 2;  // cap recap cards so they don't crowd the feed

// Compact relative time for the activity recency ("2d", "3h").
function relTime(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  const h = Math.floor(s / 3600);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  return `${Math.floor(d / 30)}mo`;
}

// Trim a note to a feed-sized snippet.
function snippet(text, max = 90) {
  const t = (text || '').trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// Friends activity feed — the Beli-style home stream. Each item is a
// friend's show ("Claire went to Mumford & Sons") with:
//   • who they're going WITH (tagged co-attendees, incl. friends-of-
//     friends who are discoverable — tappable to add)
//   • reaction + comment counts (tap the card to open & interact)
//   • "I'm going too" on upcoming shows (a friend's plan → yours)
// Per docs/initiatives/2026-06-14-social-feed-likes-comments.md.
export default function FriendsFeed() {
  const {
    shows, profile, selectedUserId, setSelectedUserId, setSelectedShow,
    getArtistImage, prefetchImages, addShow, showToast, navigate,
  } = useApp();
  const meId = profile?.id;
  // Only trust the cache if it belongs to the current user.
  const [items, setItems] = useState(feedCacheOwner === meId ? feedCache : null);
  const [noFriends, setNoFriends] = useState(false);
  const [addedIds, setAddedIds] = useState(() => new Set());

  useEffect(() => {
    if (selectedUserId) return; // refresh only when no profile overlay is open
    let cancelled = false;
    (async () => {
      try {
        const friends = await listFriends();
        if (friends.length === 0) {
          feedCache = []; feedCacheOwner = meId;
          if (!cancelled) { setItems([]); setNoFriends(true); }
          return;
        }
        if (!cancelled) setNoFriends(false);
        const byId = Object.fromEntries(friends.map((f) => [f.userId, f]));
        const rows = await listFriendsShows(friends.map((f) => f.userId), 100);

        // Cap per friend so a bulk import can't flood the feed.
        const perFriend = {};
        const picked = [];
        for (const s of rows) {
          if (isWishlist(s)) continue;
          if (!byId[s.userId]) continue;
          perFriend[s.userId] = (perFriend[s.userId] || 0) + 1;
          if (perFriend[s.userId] > MAX_PER_FRIEND) continue;
          picked.push(s);
          if (picked.length >= MAX_ITEMS) break;
        }

        const showIds = picked.map((s) => s.id);
        // Batch the social + co-attendee + full-history lookups together.
        const [reactions, comments, attendees, stats] = await Promise.all([
          reactionSummary(showIds).catch(() => new Map()),
          commentCounts(showIds).catch(() => new Map()),
          attendeesForShows(showIds).catch(() => new Map()),
          friendsShowStats(friends.map((f) => f.userId)).catch(() => new Map()),
        ]);

        // Per-friend attended dates (sorted, for Nth-show ordinals) and
        // this-year totals (for recap cards).
        const thisYear = String(new Date().getFullYear());
        const attendedRows = new Map(); // uid → [{id, date}] of attended shows
        const yearStat = new Map();
        for (const [uid, rs] of stats) {
          const att = rs.filter(isAttended).filter((r) => r.date);
          attendedRows.set(uid, att);
          const yr = att.filter((r) => r.date.startsWith(thisYear));
          yearStat.set(uid, { count: yr.length, cities: new Set(yr.map((r) => r.city).filter(Boolean)).size });
        }

        // Resolve co-attendee profiles (RLS drops non-discoverable
        // non-friends → they stay anonymous "+N").
        const coIds = [...new Set(
          [...attendees.values()].flat().filter((uid) => !byId[uid])
        )];
        const coProfiles = coIds.length ? await getProfilesByIds(coIds).catch(() => new Map()) : new Map();

        if (cancelled) return;
        const showItems = picked.map((s) => {
          // Drop the show owner AND the viewer from co-attendees (the
          // viewer shows up as "You were there too", not in "with …").
          const tagged = (attendees.get(s.id) || []).filter((uid) => uid !== s.userId && uid !== meId);
          const named = [];
          let anon = 0;
          for (const uid of tagged) {
            const p = byId[uid] || coProfiles.get(uid);
            if (p) named.push({ userId: uid, name: p.displayName || p.username || 'Someone' });
            else anon += 1;
          }
          // Milestone: this show's rank in the friend's attended history.
          // Rank by (date, id) so same-date shows get UNIQUE ordinals
          // (a date-only count would double-badge or skip a milestone).
          let milestone = null;
          if (isAttended(s)) {
            const ordinal = (attendedRows.get(s.userId) || []).filter(
              (r) => r.date < s.date || (r.date === s.date && r.id <= s.id)
            ).length;
            if (MILESTONES.has(ordinal)) milestone = ordinal;
          }
          return {
            type: 'show',
            show: s,
            friend: byId[s.userId],
            reactions: reactions.get(s.id) || null,
            comments: comments.get(s.id) || 0,
            coAttendees: named,
            coAnon: anon,
            milestone,
          };
        });

        // Year-recap cards — friends having a big year, capped + deduped.
        const recaps = friends
          .map((f) => ({ friend: f, ...(yearStat.get(f.userId) || { count: 0, cities: 0 }) }))
          .filter((r) => r.count >= RECAP_MIN)
          .sort((a, b) => b.count - a.count)
          .slice(0, MAX_RECAPS)
          .map((r) => ({ type: 'recap', friend: r.friend, count: r.count, cities: r.cities, year: thisYear }));

        const feed = [...recaps, ...showItems];
        feedCache = feed;
        feedCacheOwner = meId;
        setItems(feed);
        prefetchImages([...new Set(picked.map((s) => s.artist).filter(Boolean))]);
      } catch {
        if (!cancelled && !feedCache) setItems([]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId]);

  const mine = useMemo(
    () => new Set(shows.filter(isAttended).map((s) => `${(s.artist || '').toLowerCase().trim()}|${s.date}`)),
    [shows]
  );
  // Every show I already have (any status) by artist+date — so "I'm
  // going too" never creates a duplicate of a show I've already logged.
  const myShowKeys = useMemo(
    () => new Set(shows.map((s) => `${(s.artist || '').toLowerCase().trim()}|${s.date}`)),
    [shows]
  );
  const showKey = (s) => `${(s.artist || '').toLowerCase().trim()}|${s.date}`;

  // Patch one show item's reaction summary in both live state and the
  // session cache (so navigating away and back keeps the like).
  const patchReactions = (showId, reactions) => {
    setItems((cur) => {
      if (!cur) return cur;
      const next = cur.map((it) => (it.type === 'show' && it.show.id === showId ? { ...it, reactions } : it));
      feedCache = next;
      return next;
    });
  };

  // One-tap ❤️ from the feed (optimistic; reverts on failure).
  const toggleLike = async (ev, item) => {
    ev.stopPropagation();
    const showId = item.show.id;
    const prev = item.reactions || { count: 0, byEmoji: {}, mine: null };
    const dec = (m, e) => { const n = { ...m }; n[e] = Math.max(0, (n[e] || 1) - 1); if (!n[e]) delete n[e]; return n; };
    const inc = (m, e) => ({ ...m, [e]: (m[e] || 0) + 1 });
    let next;
    if (prev.mine === '❤️') {
      next = { count: Math.max(0, prev.count - 1), byEmoji: dec(prev.byEmoji, '❤️'), mine: null };
    } else if (prev.mine) {
      // swap a different reaction → ❤️ (count unchanged)
      next = { count: prev.count, byEmoji: inc(dec(prev.byEmoji, prev.mine), '❤️'), mine: '❤️' };
    } else {
      next = { count: prev.count + 1, byEmoji: inc(prev.byEmoji, '❤️'), mine: '❤️' };
    }
    patchReactions(showId, next);
    try {
      const result = await setReaction(showId, '❤️');
      if (result) notifyInteraction(showId, 'reaction');
    } catch {
      patchReactions(showId, prev); // revert
    }
  };

  const goToo = (ev, show) => {
    ev.stopPropagation();
    if (addedIds.has(show.id) || myShowKeys.has(showKey(show))) return;
    addShow({
      id: generateId(),
      artist: show.artist, date: show.date, venue: show.venue, city: show.city,
      genre: '', score: 0, vibes: [], notes: '', setlist: [], buddies: [],
      status: SHOW_STATUS.GOING, wishlist: false,
      createdAt: new Date().toISOString(),
    });
    setAddedIds((prev) => new Set(prev).add(show.id));
    showToast?.({ message: `🎟️ Added ${show.artist} to your shows` });
  };

  // No friends yet → a discoverable prompt instead of a dead-end null,
  // so the whole social feature isn't invisible from Home.
  if (noFriends) {
    // Brand-new users (no shows yet) get the "add friends" nudge from the
    // Home Get Started checklist — don't double-prompt here. Once they've
    // logged a show, the feed is relevant and this teaching card earns its place.
    if (shows.length === 0) return null;
    return (
      <div className="feed-section fade-in">
        <button type="button" className="feed-find-friends" onClick={() => navigate('buddies')}>
          <div className="feed-find-icon" aria-hidden="true">👋</div>
          <div className="feed-find-body">
            <div className="feed-find-title">Find your friends on Melo</div>
            <div className="feed-find-sub">See their shows, ratings & who they’re going with.</div>
          </div>
          <span className="feed-find-arrow" aria-hidden="true">→</span>
        </button>
      </div>
    );
  }

  if (!items || items.length === 0) return null;

  return (
    <div className="feed-section fade-in">
      <div className="home-section-title"><h3>Friends</h3></div>
      <div className="feed-list">
        {items.map((item) => {
          // Year-recap card ("Claire's 2026 so far").
          if (item.type === 'recap') {
            const rn = item.friend.displayName || item.friend.username;
            return (
              <button
                key={`recap-${item.friend.userId}`}
                type="button"
                className="feed-recap"
                onClick={() => setSelectedUserId(item.friend.userId)}
              >
                <div className="feed-recap-icon" aria-hidden="true">🎉</div>
                <div className="feed-recap-body">
                  <div className="feed-recap-title">{rn}’s {item.year} so far</div>
                  <div className="feed-recap-sub">
                    {item.count} shows{item.cities > 0 ? ` · ${item.cities} ${item.cities === 1 ? 'city' : 'cities'}` : ''}
                  </div>
                </div>
                <span className="feed-recap-arrow" aria-hidden="true">→</span>
              </button>
            );
          }

          const { show, friend, reactions, comments, coAttendees, coAnon, milestone } = item;
          const name = friend.displayName || friend.username;
          const attended = isAttended(show);
          const verb = attended ? 'went to' : 'is going to';
          const together = attended && mine.has(showKey(show));
          const alreadyHave = myShowKeys.has(showKey(show));
          const upcoming = isGoing(show) && daysUntil(show.date) >= 0 && !alreadyHave;
          const added = addedIds.has(show.id);

          // Hero is photo-first: the friend's own concert photo (the
          // show-photos bucket is public), else the artist image, else a
          // gradient. Always visual.
          const heroPhoto = show.photos?.[0] || null;
          const artistImg = getArtistImage(show.artist);
          const heroStyle = (heroPhoto || artistImg)
            ? { backgroundImage: `url(${heroPhoto || artistImg})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: getArtistGradient(show.artist) };

          const liked = reactions?.mine === '❤️';
          const likeCount = reactions?.count || 0;
          const noteText = attended ? snippet(show.notes) : '';
          const vibeList = attended ? (show.vibes || []).slice(0, 3) : [];
          const d = daysUntil(show.date);
          const countdown = d === 0 ? 'Tonight' : d === 1 ? 'Tomorrow' : `In ${d} days`;

          return (
            <div
              key={show.id}
              className="feed-card-v2"
              role="button"
              tabIndex={0}
              onClick={() => setSelectedShow(show)}
              onKeyDown={(e) => { if (e.key === 'Enter') setSelectedShow(show); }}
            >
              <div className="feedv2-hero" style={heroStyle}>
                <div className="feedv2-hero-overlay" />
                {attended && show.score > 0 && (
                  <div className="feedv2-score">
                    {Number.isInteger(show.score) ? show.score : show.score.toFixed(1)}
                  </div>
                )}
                {upcoming && <div className="feedv2-countdown">{countdown}</div>}
                {together && <div className="feedv2-together">🎸 You were there too</div>}
              </div>

              <div className="feedv2-foot">
                <button
                  className="feed-avatar"
                  aria-label={`View ${name}`}
                  onClick={(e) => { e.stopPropagation(); setSelectedUserId(friend.userId); }}
                  style={
                    friend.avatarUrl
                      ? { backgroundImage: `url(${friend.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                      : { background: friend.avatarColor || '#E8573A' }
                  }
                >
                  {!friend.avatarUrl && (name || '?')[0].toUpperCase()}
                </button>

                <div className="feed-body">
                  <div className="feed-text">
                    <b>{name}</b> {verb} <b>{show.artist}</b>
                  </div>
                  <div className="feed-meta-row">
                    <span className="feed-meta">
                      {[show.venue, show.city].filter(Boolean).join(', ')}
                      {show.date ? ` · ${formatDate(show.date)}` : ''}
                    </span>
                    {show.createdAt && <span className="feed-when">{relTime(show.createdAt)}</span>}
                  </div>

                  {milestone && <div className="feed-milestone">🎉 Their {milestone}th show!</div>}

                  {(coAttendees.length > 0 || coAnon > 0) && (() => {
                    const shownNames = Math.min(coAttendees.length, 2);
                    const hidden = (coAttendees.length + coAnon) - shownNames;
                    if (shownNames === 0) {
                      return <div className="feed-with">with {coAnon} {coAnon === 1 ? 'other' : 'others'}</div>;
                    }
                    return (
                      <div className="feed-with">
                        with{' '}
                        {coAttendees.slice(0, shownNames).map((c, i) => (
                          <span key={c.userId}>
                            <button className="feed-with-name" onClick={(e) => { e.stopPropagation(); setSelectedUserId(c.userId); }}>
                              {c.name}
                            </button>
                            {i < shownNames - 1 ? ', ' : ''}
                          </span>
                        ))}
                        {hidden > 0 && ` +${hidden}`}
                      </div>
                    );
                  })()}

                  {(noteText || vibeList.length > 0) && (
                    <div className="feedv2-take">
                      {noteText && <span className="feedv2-note">“{noteText}”</span>}
                      {vibeList.length > 0 && (
                        <span className="feedv2-vibes">
                          {vibeList.map((v) => <span key={v} className="feedv2-vibe">{v}</span>)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="feedv2-bar">
                <button
                  className={`feedv2-like ${liked ? 'active' : ''}`}
                  onClick={(e) => toggleLike(e, item)}
                  aria-label={liked ? 'Remove your like' : 'Like this show'}
                >
                  <span className="feedv2-like-emoji">{liked ? '❤️' : '🤍'}</span>
                  {likeCount > 0 && <span>{likeCount}</span>}
                </button>
                <button
                  className="feedv2-cmt"
                  onClick={(e) => { e.stopPropagation(); setSelectedShow(show); }}
                  aria-label="Comment"
                >
                  💬{comments > 0 ? ` ${comments}` : ''}
                </button>
                {(upcoming || added) && (
                  <button
                    className={`feed-gotoo ${added ? 'added' : ''}`}
                    onClick={(e) => goToo(e, show)}
                    disabled={added}
                  >
                    {added ? '✓ Going' : "+ I'm going too"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
