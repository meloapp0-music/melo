import { useState, useEffect, useRef } from 'react';
import { useApp } from '../App';
import { getArtistGradient, formatDate, vibeStyle, festivalKey, isAttended } from '../store';
import PhotoGallery from './PhotoGallery';
import PhotoPicker from './PhotoPicker';
import VideoPicker from './VideoPicker';
import { getFestivalMedia, setFestivalMedia } from '../lib/db/festivalMedia';
import { friendsMatchingShows } from '../lib/db/shows';
import { getProfilesByIds } from '../lib/db/profiles';

// A full detail page for a whole festival outing — the acts you saw, who you
// were with, vibes, photos, an overall score — the festival's own "show card".
// Opened from the festival card in My Shows. Members are derived from the LIVE
// shows so deleting an act (or the festival) updates in place.
export default function FestivalDetail({ outing, onClose, onOpenShow }) {
  const { shows, deleteShow, getArtistImage, showToast, session, setSelectedUserId } = useApp();
  const [confirmFest, setConfirmFest] = useState(false);
  const [pendingAct, setPendingAct] = useState(null);
  // General festival-level media (crowd/grounds shots, not tied to one act).
  const [fmPhotos, setFmPhotos] = useState([]);
  const [fmVideos, setFmVideos] = useState([]);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const mediaRef = useRef({ photos: [], videos: [] });
  // Friends who were at this festival too — matched at the festival level, so
  // it counts even if you didn't overlap on the same day / same acts.
  const [festFriends, setFestFriends] = useState([]);

  const members = shows
    .filter((s) => festivalKey(s) === outing.key)
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.artist || '').localeCompare(b.artist || ''));

  // Close when the festival no longer has any sets (all removed).
  useEffect(() => {
    if (members.length === 0) onClose();
  }, [members.length, onClose]);

  // Load this festival's saved general media.
  useEffect(() => {
    let cancelled = false;
    setMediaLoaded(false);
    getFestivalMedia(outing.key).then((m) => {
      if (cancelled) return;
      setFmPhotos(m.photos);
      setFmVideos(m.videos);
      mediaRef.current = { photos: m.photos, videos: m.videos };
      setMediaLoaded(true);
    });
    return () => { cancelled = true; };
  }, [outing.key]);

  // Load friends who were at this festival (any day).
  useEffect(() => {
    let cancelled = false;
    const mems = shows.filter((s) => festivalKey(s) === outing.key);
    if (!mems.length) { setFestFriends([]); return undefined; }
    const status = mems.some(isAttended) ? 'attended' : 'going';
    const date = mems.find((s) => s.date)?.date || outing.date || '';
    friendsMatchingShows([{ festival: outing.festival, date }], status)
      .then(async (map) => {
        const ids = (map.get(outing.key) || []).filter((id) => id && id !== session?.user?.id);
        if (!ids.length) { if (!cancelled) setFestFriends([]); return; }
        const profs = await getProfilesByIds(ids).catch(() => new Map());
        if (cancelled) return;
        setFestFriends(ids.map((id) => {
          const p = profs.get(id);
          return { userId: id, name: p?.displayName || p?.username || 'Friend', avatarUrl: p?.avatarUrl, avatarColor: p?.avatarColor };
        }));
      })
      .catch(() => { if (!cancelled) setFestFriends([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outing.key, outing.festival]);

  if (members.length === 0) return null;

  const rated = members.filter((s) => s.score > 0);
  const score = rated.length ? rated.reduce((a, s) => a + s.score, 0) / rated.length : 0;
  const actPhotos = members.flatMap((s) => s.photos || []); // aggregated per-act
  const vibes = [...new Set(members.flatMap((s) => s.vibes || []))];
  const buddies = [...new Set(members.flatMap((s) => s.buddies || []))];
  const dates = members.map((s) => s.date).filter(Boolean).sort();
  const dateRange =
    dates.length && dates[0] !== dates[dates.length - 1]
      ? `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}`
      : formatDate(dates[0] || outing.date);

  const venue = members.find((s) => s.venue)?.venue || outing.venue || '';
  const city = members.find((s) => s.city)?.city || outing.city || '';

  // Festival-level media: upload to the show-photos/-videos buckets under a
  // festival-scoped folder; persist the URL list to festival_media (mediaRef
  // holds the latest so a photo save and a video save can't clobber each other).
  const userId = session?.user?.id || null;
  const festFolder = `fest-${(outing.key || '').replace(/[^a-z0-9]+/gi, '-')}`;
  const savePhotos = (next) => {
    setFmPhotos(next);
    mediaRef.current = { ...mediaRef.current, photos: next };
    setFestivalMedia(outing.key, outing.festival, userId, mediaRef.current);
  };
  const saveVideos = (next) => {
    setFmVideos(next);
    mediaRef.current = { ...mediaRef.current, videos: next };
    setFestivalMedia(outing.key, outing.festival, userId, mediaRef.current);
  };

  const wasThere = members.some(isAttended);
  const fNames = festFriends.map((f) => f.name);
  const festFriendsLabel = fNames.length <= 2
    ? fNames.join(' & ')
    : `${fNames.slice(0, 2).join(', ')} & ${fNames.length - 2} more`;

  const thumbStyle = (artist) => {
    const img = getArtistImage(artist);
    const grad = getArtistGradient(artist);
    return img ? { background: `url("${img}") center / cover no-repeat, ${grad}` } : { background: grad };
  };
  const heroImg = members.map((s) => getArtistImage(s.artist)).find(Boolean);
  const heroStyle = heroImg
    ? { background: `url("${heroImg}") center / cover no-repeat, ${getArtistGradient(outing.festival)}` }
    : { background: getArtistGradient(outing.festival) };

  const buddyColor = (name) => {
    const palette = ['#E8573A', '#F4A261', '#9B8A7E', '#6BA292', '#C05780', '#5B7DB1'];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  };

  const removeFestival = async () => {
    const ids = members.map((s) => s.id);
    onClose();
    for (const id of ids) await deleteShow(id);
    showToast?.({ message: `Deleted ${outing.festival}` });
  };
  const removeAct = async (s) => {
    setPendingAct(null);
    await deleteShow(s.id);
    showToast?.({ message: `Removed ${s.artist}` });
  };

  return (
    <div className="detail-overlay">
      <div className="detail-backdrop" onClick={onClose} />
      <div className="detail-sheet">
        <div className="detail-hero">
          <div className="gradient-bg" style={heroStyle} />
          <div className="detail-hero-overlay" />
          <div className="detail-hero-info">
            <div className="detail-festival-badge" style={{ marginBottom: 8 }}>
              <span aria-hidden="true">🎪</span><span>Festival</span>
            </div>
            <div className="detail-artist">{outing.festival}</div>
            <div className="detail-meta">
              {dateRange}{venue ? ` · ${venue}` : ''}{city ? `, ${city}` : ''}
            </div>
            <div className="detail-openers">
              {members.length} {members.length === 1 ? 'set' : 'sets'}
              {rated.length > 0 ? ` · ${rated.length} rated` : ''}
            </div>
          </div>
          {score > 0 && (
            <div className="detail-hero-score">
              {Number.isInteger(score) ? score : score.toFixed(1)}
            </div>
          )}
          <button className="detail-del-top" onClick={() => setConfirmFest(true)} aria-label="Delete festival">
            <svg viewBox="0 0 24 24">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
          <button className="detail-close" onClick={onClose}>
            <svg viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="detail-body">
          {/* Friends who were at this festival too — any day, not just the acts
              you shared. Surfaced up front. */}
          {festFriends.length > 0 && (
            <div className="detail-goingwith">
              <div className="detail-goingwith-avatars">
                {festFriends.slice(0, 4).map((f) => (
                  <button
                    key={f.userId}
                    type="button"
                    className="detail-goingwith-avatar"
                    onClick={() => setSelectedUserId?.(f.userId)}
                    aria-label={`View ${f.name}`}
                    style={f.avatarUrl ? { backgroundImage: `url(${f.avatarUrl})` } : { background: f.avatarColor || '#E8573A' }}
                  >
                    {!f.avatarUrl && f.name[0].toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="detail-goingwith-text">
                {wasThere ? 'You were there with ' : 'Going with '}
                <b>{festFriendsLabel}</b>
              </div>
            </div>
          )}

          <div className="detail-section">
            <div className="detail-section-title">Sets you saw ({members.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {members.map((s) => (
                <div key={s.id} className="show-list-item" onClick={() => onOpenShow(s)}>
                  <div className="show-list-thumb" style={thumbStyle(s.artist)} />
                  <div className="show-list-info">
                    <div className="show-list-artist">{s.artist}</div>
                    <div className="show-list-meta">{formatDate(s.date)}</div>
                  </div>
                  {s.score > 0 && (
                    <div className="show-list-score">
                      {Number.isInteger(s.score) ? s.score : s.score.toFixed(1)}
                    </div>
                  )}
                  <button
                    className="show-del-btn"
                    aria-label={`Remove ${s.artist}`}
                    onClick={(e) => { e.stopPropagation(); setPendingAct(s); }}
                  >✕</button>
                </div>
              ))}
            </div>
          </div>

          {buddies.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-title">Who you were with</div>
              <div className="detail-buddies">
                {buddies.map((name) => (
                  <div key={name} className="detail-buddy">
                    <div className="detail-buddy-avatar" style={{ background: buddyColor(name) }}>{name[0]}</div>
                    <span className="detail-buddy-name">{name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {vibes.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-title">Vibes</div>
              <div className="detail-vibes-row">
                {vibes.map((v) => (
                  <span key={v} className="detail-vibe" style={vibeStyle(v)}>{v}</span>
                ))}
              </div>
            </div>
          )}

          {/* General festival media — the crowd, the grounds, the whole vibe.
              Uploads to a festival-scoped folder, persisted to festival_media. */}
          {userId && mediaLoaded && (
            <>
              <div className="detail-section">
                <div className="detail-section-title">Festival photos</div>
                <PhotoPicker photos={fmPhotos} onChange={savePhotos} userId={userId} showId={festFolder} />
              </div>
              <div className="detail-section">
                <div className="detail-section-title">
                  Festival videos <span className="detail-section-hint">short clips</span>
                </div>
                <VideoPicker videos={fmVideos} onChange={saveVideos} userId={userId} showId={festFolder} />
              </div>
            </>
          )}

          {actPhotos.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-title">From your sets ({actPhotos.length})</div>
              <PhotoGallery photos={actPhotos} />
            </div>
          )}

          <button className="detail-delete" onClick={() => setConfirmFest(true)}>
            Delete festival
          </button>
        </div>
      </div>

      {pendingAct && (
        <div className="detail-confirm-scrim" onClick={() => setPendingAct(null)}>
          <div className="detail-confirm-card" onClick={(e) => e.stopPropagation()}>
            <div className="detail-confirm-title">Remove {pendingAct.artist}?</div>
            <div className="detail-confirm-body">Removes this set from the festival. This can&rsquo;t be undone.</div>
            <div className="detail-confirm-actions">
              <button className="detail-confirm-cancel" onClick={() => setPendingAct(null)}>Cancel</button>
              <button className="detail-confirm-delete" onClick={() => removeAct(pendingAct)}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {confirmFest && (
        <div className="detail-confirm-scrim" onClick={() => setConfirmFest(false)}>
          <div className="detail-confirm-card" onClick={(e) => e.stopPropagation()}>
            <div className="detail-confirm-title">Delete {outing.festival}?</div>
            <div className="detail-confirm-body">Removes all {members.length} sets. This can&rsquo;t be undone.</div>
            <div className="detail-confirm-actions">
              <button className="detail-confirm-cancel" onClick={() => setConfirmFest(false)}>Cancel</button>
              <button className="detail-confirm-delete" onClick={removeFestival}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
