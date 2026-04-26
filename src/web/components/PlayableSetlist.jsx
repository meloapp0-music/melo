import { useState, useRef, useEffect } from 'react';
import { fetchSongPreview } from '../api';

// Shared setlist row with inline 30-sec previews + Spotify/Apple Music links.
// Used by ShowDetail (numbered) and any future surface that wants tappable
// songs. Single shared <audio> element across rows so only one preview plays
// at a time.
export default function PlayableSetlist({ artist, songs, numbered = false }) {
  const [playing, setPlaying] = useState(null); // index of playing row, or null
  const [loading, setLoading] = useState(null);
  const audioRef = useRef(null);

  // Stop audio when the component unmounts (e.g. modal close).
  useEffect(() => () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  const playPreview = async (i, song) => {
    // Tap currently-playing → stop
    if (playing === i) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlaying(null);
      return;
    }

    // Stop any other audio first
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setLoading(i);
    try {
      const preview = await fetchSongPreview(artist, song);
      if (!preview?.previewUrl) {
        setLoading(null);
        // Graceful fallback: open Spotify search in a new tab.
        window.open(
          `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${song}`)}`,
          '_blank'
        );
        return;
      }
      const audio = new Audio(preview.previewUrl);
      audio.volume = 0.85;
      audio.addEventListener('ended', () => setPlaying(null));
      audio.addEventListener('error', () => { setPlaying(null); setLoading(null); });
      await audio.play();
      audioRef.current = audio;
      setPlaying(i);
    } catch {
      setPlaying(null);
    } finally {
      setLoading(null);
    }
  };

  const spotifyUrl = (song) =>
    `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${song}`)}`;
  const appleMusicUrl = (song) =>
    `https://music.apple.com/us/search?term=${encodeURIComponent(`${artist} ${song}`)}`;

  if (!songs || songs.length === 0) return null;

  return (
    <div className="playable-setlist">
      {/* iTunes Search API attribution — Apple requires visible
          credit when their preview audio is presented to the user. */}
      {songs.map((song, i) => {
        const isPlaying = playing === i;
        const isLoading = loading === i;
        return (
          <div
            key={`${song}-${i}`}
            className={`playable-setlist-row ${isPlaying ? 'playing' : ''}`}
          >
            {numbered && (
              <span className="playable-setlist-num">{i + 1}</span>
            )}

            <button
              className="songs-play-btn"
              onClick={() => playPreview(i, song)}
              aria-label={isPlaying ? 'Stop' : 'Play preview'}
            >
              {isLoading ? (
                <span className="songs-play-spinner" />
              ) : isPlaying ? (
                <svg viewBox="0 0 24 24">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24">
                  <polygon points="6 4 20 12 6 20 6 4" />
                </svg>
              )}
            </button>

            <div className="playable-setlist-name">{song}</div>

            <a
              className="songs-track-link"
              href={spotifyUrl(song)}
              target="_blank"
              rel="noopener"
              aria-label="Open in Spotify"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Spotify mark */}
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm4.6 14.3a.6.6 0 01-.85.2c-2.33-1.42-5.27-1.74-8.72-.95a.6.6 0 11-.27-1.18c3.78-.86 7.04-.49 9.65 1.07.3.18.4.55.19.86zm1.23-2.74a.78.78 0 01-1.07.26c-2.67-1.64-6.74-2.12-9.9-1.16a.78.78 0 01-.46-1.5c3.62-1.1 8.1-.56 11.16 1.32.36.22.48.7.27 1.08zm.1-2.85c-3.2-1.9-8.48-2.07-11.53-1.14a.93.93 0 01-.55-1.78c3.5-1.07 9.33-.86 13.02 1.32a.93.93 0 11-.95 1.6z"/>
              </svg>
            </a>

            <a
              className="songs-track-link playable-setlist-applemusic"
              href={appleMusicUrl(song)}
              target="_blank"
              rel="noopener"
              aria-label="Open in Apple Music"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Apple Music mark — circular note */}
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm3.45 14.65c-.5.46-1.34.5-2 .27-.7-.23-1.06-.93-.97-1.67.07-.62.5-1.13 1.07-1.36.32-.13.66-.18 1-.18l.55-.04V8.07c-.06-.6-.5-.79-1.04-.66l-4.62 1c-.46.1-.66.34-.66.84v6.18c.03.7-.4 1.34-1.05 1.55-.66.22-1.45.05-1.94-.39-.67-.6-.7-1.7-.07-2.34.36-.36.85-.55 1.34-.55.27 0 .54.04.79.12V8.34c0-.83.5-1.4 1.27-1.57l5.22-1.13c.78-.16 1.47.4 1.47 1.18v7.95c.04.78-.4 1.55-1.07 1.88z"/>
              </svg>
            </a>
          </div>
        );
      })}
      <div className="legal-attribution legal-attribution-inline">
        30-sec previews via Apple Music
      </div>
    </div>
  );
}
