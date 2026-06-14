import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../App';
import { listFriends } from '../lib/db/friendships';
import { listFriendsShows, attendeesForShows } from '../lib/db/shows';
import { reactionSummary, commentCounts } from '../lib/db/social';
import { getProfilesByIds } from '../lib/db/profiles';
import { getArtistGradient, formatDate, isAttended, isGoing, isWishlist, daysUntil, SHOW_STATUS, generateId } from '../store';

// Session-lived cache so the feed renders synchronously on every Home
// remount (no layout pop-in above the fold) and refreshes in the
// background.
let feedCache = null;

const MAX_PER_FRIEND = 4;
const MAX_ITEMS = 20;

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
    getArtistImage, prefetchImages, addShow, showToast,
  } = useApp();
  const meId = profile?.id;
  const [items, setItems] = useState(feedCache);
  const [addedIds, setAddedIds] = useState(() => new Set());

  useEffect(() => {
    if (selectedUserId) return; // refresh only when no profile overlay is open
    let cancelled = false;
    (async () => {
      try {
        const friends = await listFriends();
        if (friends.length === 0) { feedCache = []; if (!cancelled) setItems([]); return; }
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
        // Batch the social + co-attendee lookups in parallel.
        const [reactions, comments, attendees] = await Promise.all([
          reactionSummary(showIds).catch(() => new Map()),
          commentCounts(showIds).catch(() => new Map()),
          attendeesForShows(showIds).catch(() => new Map()),
        ]);

        // Resolve co-attendee profiles (RLS drops non-discoverable
        // non-friends → they stay anonymous "+N").
        const coIds = [...new Set(
          [...attendees.values()].flat().filter((uid) => !byId[uid])
        )];
        const coProfiles = coIds.length ? await getProfilesByIds(coIds).catch(() => new Map()) : new Map();

        if (cancelled) return;
        const feed = picked.map((s) => {
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
          return {
            show: s,
            friend: byId[s.userId],
            reactions: reactions.get(s.id) || null,
            comments: comments.get(s.id) || 0,
            coAttendees: named,
            coAnon: anon,
          };
        });
        feedCache = feed;
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

  if (!items || items.length === 0) return null;

  return (
    <div className="feed-section fade-in">
      <div className="home-section-title"><h3>Friends</h3></div>
      <div className="feed-list">
        {items.map(({ show, friend, reactions, comments, coAttendees, coAnon }) => {
          const img = getArtistImage(show.artist);
          const thumbStyle = img
            ? { backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: getArtistGradient(show.artist) };
          const name = friend.displayName || friend.username;
          const verb = isAttended(show) ? 'went to' : 'is going to';
          const together = isAttended(show) &&
            mine.has(`${(show.artist || '').toLowerCase().trim()}|${show.date}`);
          const alreadyHave = myShowKeys.has(showKey(show));
          const upcoming = isGoing(show) && daysUntil(show.date) >= 0 && !alreadyHave;
          const added = addedIds.has(show.id);

          return (
            <div
              key={show.id}
              className="feed-card"
              role="button"
              tabIndex={0}
              onClick={() => setSelectedShow(show)}
              onKeyDown={(e) => { if (e.key === 'Enter') setSelectedShow(show); }}
            >
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
                <div className="feed-meta">
                  {[show.venue, show.city].filter(Boolean).join(', ')}
                  {show.date ? ` · ${formatDate(show.date)}` : ''}
                </div>

                {(coAttendees.length > 0 || coAnon > 0) && (() => {
                  const shownNames = Math.min(coAttendees.length, 2);
                  const hidden = (coAttendees.length + coAnon) - shownNames;
                  if (shownNames === 0) {
                    // Only anonymous (non-discoverable) co-attendees.
                    return <div className="feed-with">with {coAnon} {coAnon === 1 ? 'other' : 'others'}</div>;
                  }
                  return (
                    <div className="feed-with">
                      with{' '}
                      {coAttendees.slice(0, shownNames).map((c, i) => (
                        <span key={c.userId}>
                          <button
                            className="feed-with-name"
                            onClick={(e) => { e.stopPropagation(); setSelectedUserId(c.userId); }}
                          >
                            {c.name}
                          </button>
                          {i < shownNames - 1 ? ', ' : ''}
                        </span>
                      ))}
                      {hidden > 0 && ` +${hidden}`}
                    </div>
                  );
                })()}

                {together && <div className="feed-together">🎸 You were there too</div>}

                <div className="feed-actions">
                  {reactions && reactions.count > 0 && (
                    <span className="feed-stat">
                      {Object.keys(reactions.byEmoji)[0] || '❤️'} {reactions.count}
                    </span>
                  )}
                  {comments > 0 && <span className="feed-stat">💬 {comments}</span>}
                  {upcoming && (
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

              {isAttended(show) && show.score > 0 && (
                <div className="feed-score">
                  {Number.isInteger(show.score) ? show.score : show.score.toFixed(1)}
                </div>
              )}
              <div className="feed-thumb" style={thumbStyle} aria-hidden="true" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
