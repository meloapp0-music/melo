import { useMemo, useState, useRef, useEffect } from 'react';
import { useApp } from '../App';
import { getArtistGradient, formatDate, isAttended } from '../store';
import { fetchSongPreview } from '../api';

export default function Songs() {
  const { shows, getArtistImage } = useApp();
  const attended = shows.filter(isAttended);
  const [expanded, setExpanded] = useState(() => new Set());
  const [playing, setPlaying] = useState(null); // `${artist}|${song}` or null
  const [loading, setLoading] = useState(null);
  const audioRef = useRef(null);

  // Build per-artist groups, with each show kept as its own setlist
  // (date / venue / festival / songs in setlist order). This mirrors the
  // user's mental model — "every song from this artist, organized by
  // the show I heard it at."
  const artistGroups = useMemo(() => {
    const groups = {};
    attended.forEach((show) => {
      const songsInShow = (show.setlist || []).filter((s) => s && s.trim());
      if (songsInShow.length === 0) return;
      if (!groups[show.artist]) {
        groups[show.artist] = {
          artist: show.artist,
          showsList: [],
          uniqueSongs: new Map(), // key=lower(name) → { name, count }
        };
      }
      groups[show.artist].showsList.push({
        id: show.id,
        date: show.date,
        venue: show.venue,
        city: show.city,
        festival: show.festival || '',
        setlist: songsInShow,
      });
      songsInShow.forEach((song) => {
        const k = song.toLowerCase().trim();
        const cur = groups[show.artist].uniqueSongs.get(k);
        if (cur) cur.count += 1;
        else groups[show.artist].uniqueSongs.set(k, { name: song, count: 1 });
      });
    });
    return Object.values(groups)
      .map((g) => ({
        artist: g.artist,
        // Show-level breakdown — newest show first.
        showsList: g.showsList.sort((a, b) => new Date(b.date) - new Date(a.date)),
        // Aggregate counts for the artist subtitle + per-song repeat badge.
        uniqueCount: g.uniqueSongs.size,
        showsCount: g.showsList.length,
        // Map of lower(songName) → { name, count } for fast badge lookup.
        repeatMap: g.uniqueSongs,
      }))
      // Most-prolific artist first (most unique songs, then most shows).
      .sort((a, b) => b.uniqueCount - a.uniqueCount || b.showsCount - a.showsCount);
  }, [attended]);

  // Aggregate stats for the top card — sum across all artists.
  const { totalSongs, heardMultiple, mostSeen } = useMemo(() => {
    let unique = 0;
    let repeats = 0;
    let topSong = null;
    artistGroups.forEach((g) => {
      unique += g.uniqueCount;
      g.repeatMap.forEach((v) => {
        if (v.count >= 2) repeats += 1;
        if (!topSong || v.count > topSong.count) {
          topSong = { ...v, artist: g.artist };
        }
      });
    });
    return { totalSongs: unique, heardMultiple: repeats, mostSeen: topSong };
  }, [artistGroups]);

  // Top-N artist images for the hero collage. Falls back to a branded
  // gradient when the user hasn't logged enough setlists for us to have
  // any artist images cached yet.
  const heroImages = useMemo(() => {
    return artistGroups
      .map((g) => getArtistImage(g.artist))
      .filter(Boolean)
      .slice(0, 6);
  }, [artistGroups, getArtistImage]);

  const toggle = (artist) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(artist) ? next.delete(artist) : next.add(artist);
      return next;
    });
  };

  // Stop audio when component unmounts
  useEffect(() => () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  const playPreview = async (artist, song) => {
    const key = `${artist}|${song}`;

    // Tap currently-playing → stop
    if (playing === key) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlaying(null);
      return;
    }

    // Stop any other audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setLoading(key);
    try {
      const preview = await fetchSongPreview(artist, song);
      if (!preview?.previewUrl) {
        setLoading(null);
        // Fallback: open Spotify search in a new tab
        window.open(`https://open.spotify.com/search/${encodeURIComponent(`${artist} ${song}`)}`, '_blank');
        return;
      }
      const audio = new Audio(preview.previewUrl);
      audio.volume = 0.85;
      audio.addEventListener('ended', () => setPlaying(null));
      audio.addEventListener('error', () => { setPlaying(null); setLoading(null); });
      await audio.play();
      audioRef.current = audio;
      setPlaying(key);
    } catch {
      // playback rejected (autoplay policy etc.)
      setPlaying(null);
    } finally {
      setLoading(null);
    }
  };

  const artistBg = (artist) => {
    const img = getArtistImage(artist);
    return img
      ? { backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: getArtistGradient(artist) };
  };

  return (
    // Zero only top/sides for the full-bleed hero; KEEP the class's
    // padding-bottom so the last content clears the floating nav bar.
    <div className="page" style={{ paddingLeft: 0, paddingRight: 0, paddingTop: 0 }}>
      {/* Hero — artist-photo collage backdrop with the title + a one-line
          summary overlaid on a darkening gradient. Falls back to a
          branded gradient when the user has no artist images yet. */}
      <div className={`songs-hero ${heroImages.length === 0 ? 'songs-hero-empty' : ''}`}>
        {heroImages.length > 0 && (
          <div className="songs-hero-bg" aria-hidden="true">
            {heroImages.map((img, i) => (
              <div
                key={i}
                className="songs-hero-tile"
                style={{ backgroundImage: `url(${img})` }}
              />
            ))}
          </div>
        )}
        <div className="songs-hero-overlay" aria-hidden="true" />
        <div className="songs-hero-content">
          <h1 className="songs-hero-title">Songs</h1>
          <p className="songs-hero-sub">
            {totalSongs > 0
              ? `${totalSongs} unique song${totalSongs === 1 ? '' : 's'} from ${artistGroups.length} artist${artistGroups.length === 1 ? '' : 's'}`
              : 'Every song you’ve heard live, in one place.'}
          </p>
        </div>
      </div>

      <div style={{ padding: '0 20px' }}>

      <div className="songs-stats">
        <div className="songs-stat-card">
          <div className="songs-stat-num">{totalSongs}</div>
          <div className="songs-stat-label">Heard Live</div>
        </div>
        <div className="songs-stat-card">
          <div className="songs-stat-num">{artistGroups.length}</div>
          <div className="songs-stat-label">Artists</div>
        </div>
        <div className="songs-stat-card">
          <div className="songs-stat-num">{heardMultiple}</div>
          <div className="songs-stat-label">Heard 2x+</div>
        </div>
      </div>

      {mostSeen && (
        <div className="songs-spotlight">
          <div className="songs-spotlight-label">Most Seen</div>
          <div className="songs-spotlight-title">{mostSeen.name}</div>
          <div className="songs-spotlight-meta">
            Heard {mostSeen.count}x &middot; {mostSeen.artist}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <h3>By Artist</h3>
      </div>

      <div className="songs-artist-list">
        {artistGroups.map((g) => {
          const isOpen = expanded.has(g.artist);
          return (
            <div key={g.artist} className={`songs-artist-card ${isOpen ? 'open' : ''}`}>
              <button className="songs-artist-header" onClick={() => toggle(g.artist)}>
                <div className="songs-artist-thumb" style={artistBg(g.artist)} />
                <div className="songs-artist-meta">
                  <div className="songs-artist-name">{g.artist}</div>
                  <div className="songs-artist-sub">
                    {g.uniqueCount} song{g.uniqueCount === 1 ? '' : 's'} &middot; {g.showsCount} show{g.showsCount === 1 ? '' : 's'}
                  </div>
                </div>
                <svg className="songs-chevron" viewBox="0 0 24 24">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {isOpen && (
                <div className="songs-artist-tracks">
                  {g.showsList.map((sh) => (
                    <div key={sh.id} className="songs-show-group">
                      <div className="songs-show-header">
                        <div className="songs-show-date">{formatDate(sh.date)}</div>
                        <div className="songs-show-venue">
                          {sh.festival ? `🎪 ${sh.festival}` : (sh.venue || sh.city || '')}
                        </div>
                      </div>
                      {sh.setlist.map((song, idx) => {
                        const key = `${g.artist}|${song}|${sh.id}|${idx}`;
                        const playKey = `${g.artist}|${song}`;
                        const isPlaying = playing === playKey;
                        const isLoading = loading === playKey;
                        const repeats = g.repeatMap.get(song.toLowerCase().trim())?.count || 1;
                        return (
                          <div key={key} className={`songs-track-row ${isPlaying ? 'playing' : ''}`}>
                            <button
                              className="songs-play-btn"
                              onClick={() => playPreview(g.artist, song)}
                              aria-label={isPlaying ? 'Stop' : 'Play preview'}
                            >
                              {isLoading ? (
                                <span className="songs-play-spinner" />
                              ) : isPlaying ? (
                                <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                              ) : (
                                <svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4" /></svg>
                              )}
                            </button>
                            <div className="songs-track-info">
                              <div className="songs-track-name">{song}</div>
                              {repeats > 1 && (
                                <div className="songs-track-count">Heard {repeats}x across all shows</div>
                              )}
                            </div>
                            <a
                              className="songs-track-link"
                              href={`https://open.spotify.com/search/${encodeURIComponent(`${g.artist} ${song}`)}`}
                              target="_blank"
                              rel="noopener"
                              aria-label="Open in Spotify"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm4.6 14.3a.6.6 0 01-.85.2c-2.33-1.42-5.27-1.74-8.72-.95a.6.6 0 11-.27-1.18c3.78-.86 7.04-.49 9.65 1.07.3.18.4.55.19.86zm1.23-2.74a.78.78 0 01-1.07.26c-2.67-1.64-6.74-2.12-9.9-1.16a.78.78 0 01-.46-1.5c3.62-1.1 8.1-.56 11.16 1.32.36.22.48.7.27 1.08zm.1-2.85c-3.2-1.9-8.48-2.07-11.53-1.14a.93.93 0 01-.55-1.78c3.5-1.07 9.33-.86 13.02 1.32a.93.93 0 11-.95 1.6z"/>
                              </svg>
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {artistGroups.length === 0 && (
          <div className="shows-empty">
            <div className="shows-empty-icon">&#9835;</div>
            <p>No songs logged yet. Add setlists to your shows!</p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
