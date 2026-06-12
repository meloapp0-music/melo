import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../App';
import { listFriends } from '../lib/db/friendships';
import { listFriendsShows } from '../lib/db/shows';
import { getArtistGradient, formatDate, isAttended, isGoing, isWishlist } from '../store';

// Session-lived cache so the feed renders synchronously on every Home
// remount (no layout pop-in above the fold) and refreshes in the
// background.
let feedCache = null;

// One friend's bulk import (festival multi-log, calendar import) stamps
// dozens of rows with near-identical created_at — without a cap they'd
// monopolize every feed slot.
const MAX_PER_FRIEND = 4;
const MAX_ITEMS = 20;

// Friends activity feed — the Beli-style home stream: "Claire went to
// Mumford & Sons". Items are friends' shows ordered by when they were
// LOGGED (created_at), so a freshly added show surfaces on top even if
// the concert was months ago. Tapping an item opens that friend's
// profile. Friends' shows live HERE and on their profile — never mixed
// into the user's own Recent Shows. Per
// docs/initiatives/2026-06-11-friends-feed-and-show-sharing.md.
export default function FriendsFeed() {
  const { shows, selectedUserId, setSelectedUserId, getArtistImage, prefetchImages } = useApp();
  const [items, setItems] = useState(feedCache); // null = never loaded

  // Load on mount AND whenever the profile overlay closes — a block or
  // unfriend performed from a feed-opened profile must drop that
  // person's items immediately, not on the next tab switch.
  useEffect(() => {
    if (selectedUserId) return; // wait until the overlay closes
    let cancelled = false;
    (async () => {
      try {
        const friends = await listFriends();
        if (friends.length === 0) {
          feedCache = [];
          if (!cancelled) setItems([]);
          return;
        }
        const byId = Object.fromEntries(friends.map((f) => [f.userId, f]));
        const rows = await listFriendsShows(friends.map((f) => f.userId), 100);
        if (cancelled) return;
        const perFriend = {};
        const feed = [];
        for (const s of rows) {
          if (isWishlist(s)) continue; // wishlist isn't feed-worthy activity
          const friend = byId[s.userId];
          if (!friend) continue;
          perFriend[s.userId] = (perFriend[s.userId] || 0) + 1;
          if (perFriend[s.userId] > MAX_PER_FRIEND) continue;
          feed.push({ show: s, friend });
          if (feed.length >= MAX_ITEMS) break;
        }
        feedCache = feed;
        setItems(feed);
        prefetchImages([...new Set(feed.map((it) => it.show.artist).filter(Boolean))]);
      } catch {
        if (!cancelled && !feedCache) setItems([]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId]);

  // "You were there too" — my attended shows keyed by artist+date.
  const mine = useMemo(
    () => new Set(
      shows.filter(isAttended).map((s) => `${(s.artist || '').toLowerCase().trim()}|${s.date}`)
    ),
    [shows]
  );

  if (!items || items.length === 0) return null;

  return (
    <div className="feed-section fade-in">
      <div className="home-section-title">
        <h3>Friends</h3>
      </div>
      <div className="feed-list">
        {items.map(({ show, friend }) => {
          const img = getArtistImage(show.artist);
          const thumbStyle = img
            ? { backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: getArtistGradient(show.artist) };
          const name = friend.displayName || friend.username;
          const verb = isAttended(show) ? 'went to' : isGoing(show) ? 'is going to' : 'wants to see';
          const together = isAttended(show) &&
            mine.has(`${(show.artist || '').toLowerCase().trim()}|${show.date}`);
          return (
            <button
              key={show.id}
              type="button"
              className="feed-card"
              onClick={() => setSelectedUserId(friend.userId)}
            >
              <div
                className="feed-avatar"
                aria-hidden="true"
                style={
                  friend.avatarUrl
                    ? { backgroundImage: `url(${friend.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : { background: friend.avatarColor || '#E8573A' }
                }
              >
                {!friend.avatarUrl && (name || '?')[0].toUpperCase()}
              </div>
              <div className="feed-body">
                <div className="feed-text">
                  <b>{name}</b> {verb} <b>{show.artist}</b>
                </div>
                <div className="feed-meta">
                  {[show.venue, show.city].filter(Boolean).join(', ')}
                  {show.date ? ` · ${formatDate(show.date)}` : ''}
                </div>
                {together && (
                  <div className="feed-together">🎸 You were there too</div>
                )}
              </div>
              {isAttended(show) && show.score > 0 && (
                <div className="feed-score">
                  {Number.isInteger(show.score) ? show.score : show.score.toFixed(1)}
                </div>
              )}
              <div className="feed-thumb" style={thumbStyle} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
