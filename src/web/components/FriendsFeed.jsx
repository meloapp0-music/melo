import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../App';
import { listFriends } from '../lib/db/friendships';
import { listFriendsShows, attendeesForShows, friendsShowStats } from '../lib/db/shows';
import { reactionSummary, commentCounts, setReaction, notifyInteraction } from '../lib/db/social';
import { getProfilesByIds } from '../lib/db/profiles';
// getArtistGradient, not artistBackground: the ported rows use the artist's
// colour as a thin spine in the gutter rather than as a photo backdrop, so the
// gradient is wanted on its own.
import { getArtistGradient, formatDate, isAttended, isGoing, isWishlist, daysUntil, SHOW_STATUS, generateId } from '../store';
import Icon from './Icon';

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
// How many feed items show before the "See more" reveal — keeps Home from
// running long when a user has many active friends.
const FEED_VISIBLE = 6;
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
  const [expanded, setExpanded] = useState(false);

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

  // Upcoming shows I'M going to → lets a group card lead with "You + …".
  const myGoing = useMemo(
    () => new Set(shows.filter((s) => isGoing(s) && daysUntil(s.date) >= 0).map(showKey)),
    [shows]
  );

  // Collapse multiple friends GOING to the same upcoming show into ONE group
  // card ("You + Julia + Claire are going to Noah Kahan") instead of a stack of
  // near-identical "You + <friend>" cards — even when those friends aren't
  // friends with each other. Attended cards are never merged (each carries its
  // own review/score). A group sits at its most-recent member's feed position.
  const displayItems = useMemo(() => {
    if (!items) return items;
    const isUpcomingGoing = (s) => isGoing(s) && !isAttended(s) && daysUntil(s.date) >= 0;
    const groups = new Map();
    const out = [];
    for (const it of items) {
      if (it.type !== 'show' || !isUpcomingGoing(it.show)) { out.push(it); continue; }
      const k = `${(it.show.artist || '').toLowerCase().trim()}|${it.show.date}`;
      let g = groups.get(k);
      if (!g) { g = { type: 'goingGroup', key: k, members: [] }; groups.set(k, g); out.push(g); }
      g.members.push(it);
    }
    // A group of one is just a normal card — keep today's "You + <friend>" render.
    return out.map((it) => (it.type === 'goingGroup' && it.members.length === 1 ? it.members[0] : it));
  }, [items, shows]);

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

  const list = displayItems || [];
  const visibleItems = expanded ? list : list.slice(0, FEED_VISIBLE);
  const hiddenCount = list.length - visibleItems.length;

  // The design gives every entry a spine in the artist's colour, bleeding into
  // the page's 32px gutter. It's the one place per-artist colour appears off a
  // ticket stub, and it's what stops a long feed reading as undifferentiated
  // text. Requires the parent section to have px-8.
  const Spine = ({ artist }) => (
    <div
      className="absolute left-[-32px] top-0 bottom-0 w-1.5"
      style={{ background: getArtistGradient(artist) }}
      aria-hidden="true"
    />
  );

  // Avatars are photos in the design, greyscaled so the page's only colour
  // stays the artist spines. Melo's fall back to a colour + initial.
  const Avatar = ({ friend, onOpen }) => {
    const n = friend.displayName || friend.username || '?';
    return (
      <button
        type="button"
        aria-label={`View ${n}`}
        onClick={(e) => { e.stopPropagation(); onOpen(friend.userId); }}
        className="size-10 rounded-full grayscale border border-border shrink-0 bg-cover bg-center flex items-center justify-center text-white text-sm font-bold"
        style={friend.avatarUrl
          ? { backgroundImage: `url(${friend.avatarUrl})` }
          : { background: friend.avatarColor || 'var(--accent)' }}
      >
        {!friend.avatarUrl && n[0].toUpperCase()}
      </button>
    );
  };

  const META = 'font-sans uppercase tracking-[0.4em] text-[9px] font-black text-muted-foreground';
  const PRINT = 'bg-white p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.06)] border border-border inline-block';

  return (
    <div className="space-y-0 fade-in">
      {visibleItems.map((item, idx) => {
        // Alternating tilt, so a run of prints looks laid down by hand rather
        // than pasted. Keyed on index so it's stable across renders.
        const tilt = ['rotate-3', '-rotate-2', 'rotate-1', '-rotate-3'][idx % 4];

        // Year-recap card — the one ember element the feed is allowed.
        if (item.type === 'recap') {
          const rn = item.friend.displayName || item.friend.username;
          return (
            <div key={`recap-${item.friend.userId}`} className="py-10 border-t border-border">
              <div className="flex items-center gap-6">
                <div className="size-12 rounded-full bg-accent flex items-center justify-center text-white shrink-0">
                  <Icon name="ph:sparkle-fill" size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-sans font-black text-accent uppercase tracking-[0.2em] leading-tight">
                    {rn}’s {item.year} so far
                  </p>
                  <p className="font-sans text-[11px] text-muted-foreground mt-1">
                    {item.count} shows{item.cities > 0 ? ` · ${item.cities} ${item.cities === 1 ? 'city' : 'cities'}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedUserId(item.friend.userId)}
                  className="px-6 py-2.5 bg-accent text-background rounded-full font-sans font-black uppercase tracking-[0.4em] text-[8px] shadow-lg shadow-accent/20 active:scale-95 transition-transform shrink-0"
                >
                  View
                </button>
              </div>
            </div>
          );
        }

        // 2+ friends going to the same upcoming show.
        if (item.type === 'goingGroup') {
          const rep = item.members[0];
          const gshow = rep.show;
          const gfriends = item.members.map((m) => m.friend);
          const gnames = gfriends.map((f) => f.displayName || f.username);
          const userGoing = myGoing.has(item.key);
          const shown = gnames.slice(0, 2);
          const extra = gnames.length - shown.length;
          const lead = (userGoing ? ['You', ...shown] : shown).join(' with ');

          return (
            <div
              key={`grp-${item.key}`}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedShow(gshow)}
              onKeyDown={(e) => { if (e.key === 'Enter') setSelectedShow(gshow); }}
              className="py-12 border-t border-border flex gap-8 relative overflow-visible active:scale-[0.99] transition-transform"
            >
              <Spine artist={gshow.artist} />
              <div className="shrink-0 flex flex-col -space-y-6">
                {gfriends.slice(0, 2).map((f) => (
                  <Avatar key={f.userId} friend={f} onOpen={setSelectedUserId} />
                ))}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] text-foreground leading-tight">
                  {lead}{extra > 0 ? ` & ${extra} others` : ''} are going to{' '}
                  <span className="font-serif italic font-semibold">{gshow.artist}</span>
                </p>
                <p className={`${META} mt-1`}>
                  {[gshow.venue, gshow.city].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
          );
        }

        const { show, friend, coAttendees, coAnon, milestone } = item;
        const name = friend.displayName || friend.username;
        const attended = isAttended(show);
        const upcoming = isGoing(show) && daysUntil(show.date) >= 0;
        const note = attended ? snippet(show.notes) : '';
        const photo = show.photos?.[0] || null;
        const d = daysUntil(show.date);

        // Milestone gets its own compact row rather than a badge inside a card.
        if (milestone) {
          return (
            <div
              key={show.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedShow(show)}
              onKeyDown={(e) => { if (e.key === 'Enter') setSelectedShow(show); }}
              className="py-10 border-t border-border flex items-center gap-8"
            >
              <Avatar friend={friend} onOpen={setSelectedUserId} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">
                  <span className="font-bold">{name}</span> logged their{' '}
                  <span className="font-sans font-extrabold tabular-nums">{milestone}</span>th show.
                </p>
                <p className={`${META} mt-1`}>Milestone achieved</p>
              </div>
            </div>
          );
        }

        // An upcoming show with nothing written yet is a plan, not a memory —
        // compact row, no quote, no print.
        if (upcoming) {
          return (
            <div
              key={show.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedShow(show)}
              onKeyDown={(e) => { if (e.key === 'Enter') setSelectedShow(show); }}
              className="py-10 border-t border-border flex items-center gap-8"
            >
              <Avatar friend={friend} onOpen={setSelectedUserId} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">
                  <span className="font-bold">{name}</span> is going to{' '}
                  <span className="font-serif italic font-semibold">{show.artist}</span>
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-sans font-extrabold text-[10px] text-foreground tabular-nums">
                    {d === 0 ? '' : d}
                  </span>
                  <span className="font-sans uppercase tracking-[0.4em] text-[8px] font-black text-muted-foreground">
                    {d === 0 ? 'Tonight' : d === 1 ? 'Day to go' : 'Days to go'}
                  </span>
                </div>
              </div>
            </div>
          );
        }

        // The main event: a logged show.
        return (
          <div
            key={show.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedShow(show)}
            onKeyDown={(e) => { if (e.key === 'Enter') setSelectedShow(show); }}
            className="py-12 border-t border-border flex gap-8 relative overflow-visible active:scale-[0.99] transition-transform"
          >
            <Spine artist={show.artist} />
            <Avatar friend={friend} onOpen={setSelectedUserId} />
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline gap-4 mb-1">
                <p className="text-[15px] text-foreground leading-none min-w-0 truncate">
                  {name} preserved{' '}
                  <span className="font-serif italic font-semibold">{show.artist}</span>
                </p>
                {show.score > 0 && (
                  // The RAW entered score, not the derived one. `rankings` is
                  // RLS self-only, so a friend's order is invisible by design —
                  // showing our own scale on their show would be wrong.
                  <span className="font-serif italic text-xl text-muted-foreground/40 shrink-0">
                    {Number.isInteger(show.score) ? show.score : show.score.toFixed(1)}
                  </span>
                )}
              </div>
              <p className={META}>
                {[show.venue, show.city].filter(Boolean).join(' · ')}
                {show.date ? ` · ${formatDate(show.date)}` : ''}
              </p>

              {(coAttendees.length > 0 || coAnon > 0) && (
                <p className={`${META} mt-2`}>
                  with {coAttendees.slice(0, 2).map((c) => c.name).join(', ')}
                  {(coAttendees.length + coAnon) > 2 ? ` +${(coAttendees.length + coAnon) - 2}` : ''}
                </p>
              )}

              {note && (
                <blockquote className="mt-6 font-serif italic text-2xl text-foreground leading-snug">
                  “{note}”
                </blockquote>
              )}

              {photo && (
                <div className="mt-8">
                  <div className={`${PRINT} ${tilt} transform`}>
                    <img src={photo} alt="" className="h-40 w-56 object-cover" />
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {hiddenCount > 0 && (
        <div className="py-16 border-t border-border flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="font-sans font-black uppercase tracking-[0.4em] text-[10px] text-muted-foreground active:scale-95 transition-transform"
          >
            See More Records
          </button>
        </div>
      )}
    </div>
  );
}
