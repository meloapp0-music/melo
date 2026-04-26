import { useMemo, useState, useRef, useEffect } from 'react';
import { useApp } from '../App';
import { getArtistGradient, isAttended } from '../store';
import { fetchSongPreview } from '../api';

export default function Songs() {
  const { shows, getArtistImage } = useApp();
  const attended = shows.filter(isAttended);
  const [expanded, setExpanded] = useState(() => new Set());
  const [playing, setPlaying] = useState(null); // `${artist}|${song}` or null
  const [loading, setLoading] = useState(null);
  const audioRef = useRef(null);

  // Build per-artist map of unique songs + counts.
  const artistGroups = useMemo(() => {
    const groups = {};
    attended.forEach((show) => {
      if (!groups[show.artist]) {
        groups[show.artist] = { artist: show.artist, songs: {}, shows: 0 };
      }
      groups[show.artist].shows++;
      (show.setlist || []).forEach((song) => {
        const key = song.toLowerCase().trim();
        if (!key) return;
        if (!groups[show.artist].songs[key]) {
          groups[show.artist].songs[key] = { name: song, count: 0 };
        }
        groups[show.artist].songs[key].count++;
      });
    });
    return Object.values(groups)
      .map((g) => ({
        ...g,
        songList: Object.values(g.songs).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => b.songList.length - a.songList.length || b.shows - a.shows);
  }, [attended]);

  // Top-level stats
  const allSongs = useMemo(() => {
    const set = new Map();
    artistGroups.forEach((g) => {
      g.songList.forEach((s) => {
        const k = `${g.artist}|${s.name.toLowerCase()}`;
        set.set(k, { ...s, artist: g.artist });
      });
    });
    return [...set.values()];
  }, [artistGroups]);

  const totalSongs = allSongs.length;
  const heardMultiple = allSongs.filter((s) => s.count >= 2).length;
  const mostSeen = [...allSongs].sort((a, b) => b.count - a.count)[0];

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
    <div className="page page-top">
      <div className="songs-header">
        <h1>Songs</h1>
      </div>

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
                    {g.songList.length} song{g.songList.length === 1 ? '' : 's'} &middot; {g.shows} show{g.shows === 1 ? '' : 's'}
                  </div>
                </div>
                <svg className="songs-chevron" viewBox="0 0 24 24">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {isOpen && (
                <div className="songs-artist-tracks">
                  {g.songList.map((s) => {
                    const key = `${g.artist}|${s.name}`;
                    const isPlaying = playing === key;
                    const isLoading = loading === key;
                    return (
                      <div key={key} className={`songs-track-row ${isPlaying ? 'playing' : ''}`}>
                        <button
                          className="songs-play-btn"
                          onClick={() => playPreview(g.artist, s.name)}
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
                          <div className="songs-track-name">{s.name}</div>
                          {s.count > 1 && (
                            <div className="songs-track-count">Heard {s.count}x</div>
                          )}
                        </div>
                        <a
                          className="songs-track-link"
                          href={`https://open.spotify.com/search/${encodeURIComponent(`${g.artist} ${s.name}`)}`}
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
                  {g.songList.length === 0 && (
                    <div className="songs-track-empty">No setlist logged for this artist yet.</div>
                  )}
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
  );
}
