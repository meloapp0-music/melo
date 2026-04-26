import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useApp } from '../App';
import { getArtistGradient, formatDate, VIBES, isAttended } from '../store';
import { MeloIcon, MeloWordmark } from '../components/MeloLogo';

// Each slide picks a tonal overlay so the artist photo behind it stays
// readable but the slide still has its own personality.
const SLIDE_OVERLAYS = [
  'linear-gradient(180deg, rgba(26,5,51,0.55) 0%, rgba(232,87,58,0.85) 100%)',
  'linear-gradient(180deg, rgba(10,22,40,0.45) 0%, rgba(0,0,0,0.85) 100%)',
  'linear-gradient(180deg, rgba(13,40,24,0.55) 0%, rgba(45,138,86,0.8) 100%)',
  'linear-gradient(180deg, rgba(45,17,23,0.5) 0%, rgba(232,87,58,0.85) 100%)',
  'linear-gradient(180deg, rgba(10,25,48,0.55) 0%, rgba(37,99,235,0.78) 100%)',
  'linear-gradient(180deg, rgba(45,17,69,0.5) 0%, rgba(217,70,168,0.78) 100%)',
  'linear-gradient(180deg, rgba(26,26,46,0.55) 0%, rgba(232,87,58,0.85) 100%)',
  'linear-gradient(180deg, rgba(10,5,25,0.65) 0%, rgba(26,5,51,0.92) 100%)',
];

function CountUp({ end, duration = 1500, prefix = '', suffix = '', decimals = 0 }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf;
    let startTs;
    const animate = (ts) => {
      if (!startTs) startTs = ts;
      const progress = Math.min((ts - startTs) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(end * eased);
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [end, duration]);
  const display = decimals > 0 ? val.toFixed(decimals) : Math.round(val);
  return <span>{prefix}{display}{suffix}</span>;
}

function generatePersonality(topGenre, topVibe) {
  const g = {
    Indie: 'an Indie Night Owl', Electronic: 'a Bass Devotee', Alternative: 'an Alt-Rock Pilgrim',
    'Hip-Hop': 'a Hip-Hop Connoisseur', 'R&B': 'a Soul Searcher', Pop: 'a Pop Visionary',
    Rock: 'a Rock Purist', Jazz: 'a Jazz Wanderer', Folk: 'a Folk Poet', Metal: 'a Metal Warrior',
    Country: 'a Country Storyteller', Classical: 'a Classical Soul', Punk: 'a Punk Spirit',
  };
  const v = {
    Intimate: 'who lives for small rooms', 'High Energy': 'who thrives in the chaos',
    Euphoric: 'chasing euphoric highs', Emotional: 'who cries at every encore',
    Dreamy: 'lost in the dreamscape', Transcendent: 'seeking transcendence',
    Spiritual: 'on a spiritual quest', Raw: 'who craves raw energy',
    Nostalgic: 'haunted by the melodies', Groovy: 'who never stops moving',
    Chill: 'floating through the vibes', 'Mind-Blowing': 'always chasing the next high',
    Legendary: 'witnessing history', Chaotic: 'who loves the beautiful chaos',
  };
  return `You're ${g[topGenre] || 'a Music Explorer'} ${v[topVibe] || 'who lives for the live experience'}`;
}

function getVibeEmoji(name) {
  const map = {
    Euphoric: '🌟', Intimate: '🕯️', 'High Energy': '⚡', Chill: '🧊', Emotional: '💧',
    'Mind-Blowing': '🤯', Rowdy: '🔥', Transcendent: '✨', Nostalgic: '🥀', Groovy: '🪩',
    Raw: '🎸', Dreamy: '☁️', Chaotic: '🌪️', Spiritual: '🙏', Legendary: '👑',
  };
  return map[name] || '🎵';
}

// Reusable slide background: full-bleed image with Ken-Burns zoom, plus
// a tonal gradient overlay. Falls back to artist gradient if no image.
function SlideBg({ image, overlay, fallbackArtist, key }) {
  const bgStyle = image
    ? { backgroundImage: `url(${image})` }
    : { background: getArtistGradient(fallbackArtist || 'melo') };
  return (
    <>
      <div className="wrapped-bg-img" style={bgStyle} />
      <div className="wrapped-bg-overlay" style={{ background: overlay }} />
    </>
  );
}

export default function Wrapped({ year, onClose }) {
  const { shows, getArtistImage } = useApp();
  const [slide, setSlide] = useState(0);
  const [entered, setEntered] = useState(false);
  const touchRef = useRef({ startX: 0, startY: 0 });
  const containerRef = useRef(null);

  useEffect(() => { setTimeout(() => setEntered(true), 80); }, []);

  const yearShows = useMemo(() =>
    shows.filter((s) => isAttended(s) && new Date(s.date + 'T00:00:00').getFullYear() === year)
      .sort((a, b) => new Date(a.date) - new Date(b.date)),
    [shows, year]
  );

  const data = useMemo(() => {
    if (yearShows.length === 0) return null;
    const artistCounts = {};
    const venueCounts = {};
    const vibeCounts = {};
    const genreCounts = {};
    const cities = new Set();

    yearShows.forEach((s) => {
      artistCounts[s.artist] = (artistCounts[s.artist] || 0) + 1;
      if (s.venue) venueCounts[`${s.venue}|${s.city}|${s.artist}`] = (venueCounts[`${s.venue}|${s.city}|${s.artist}`] || 0) + 1;
      if (s.city) cities.add(s.city);
      (s.vibes || []).forEach((v) => { vibeCounts[v] = (vibeCounts[v] || 0) + 1; });
      if (s.genre) genreCounts[s.genre] = (genreCounts[s.genre] || 0) + 1;
    });

    // Aggregate top venues by venue+city only (artist was just a hint for photo).
    const venueAgg = {};
    Object.entries(venueCounts).forEach(([k, v]) => {
      const [venue, city] = k.split('|');
      const id = `${venue}|${city}`;
      venueAgg[id] = (venueAgg[id] || 0) + v;
    });
    const topVenueEntry = Object.entries(venueAgg).sort((a, b) => b[1] - a[1])[0];
    const [topVenue, topVenueCity] = (topVenueEntry?.[0] || '|').split('|');

    // Find an artist who played the top venue this year — for the photo.
    const topVenueArtist = yearShows.find(
      (s) => s.venue === topVenue && s.city === topVenueCity,
    )?.artist;

    const topArtistEntry = Object.entries(artistCounts).sort((a, b) => b[1] - a[1])[0];
    const topVibes = Object.entries(vibeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0];
    const highestRated = [...yearShows].filter((s) => s.score != null).sort((a, b) => b.score - a.score)[0];
    const avgScore = yearShows.reduce((s, x) => s + (x.score || 0), 0) / yearShows.length;
    const totalSongs = yearShows.reduce((s, x) => s + (x.setlist?.length || 0), 0);

    // Pick a few artist photos for the personality collage.
    const collageArtists = Object.entries(artistCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([a]) => a);

    // First user-uploaded photo for each "hero" slide subject. When
    // present, these beat the canonical Deezer artist art for that
    // year-in-review slide — your own crowd shot tells a better story
    // than a press photo. `null` falls through to the artist-image
    // path below.
    const photoForArtist = (artist) =>
      yearShows.find((s) => s.artist === artist && s.photos?.length)?.photos?.[0] || null;
    const topArtistPhoto = photoForArtist(topArtistEntry?.[0]);
    const topVenuePhoto = yearShows.find(
      (s) => s.venue === topVenue && s.city === topVenueCity && s.photos?.length,
    )?.photos?.[0] || null;
    const highestRatedPhoto = highestRated?.photos?.[0] || null;

    return {
      total: yearShows.length,
      topArtist: topArtistEntry?.[0],
      topArtistCount: topArtistEntry?.[1] || 0,
      topArtistPhoto,
      topVenue,
      topVenueCity,
      topVenueArtist,
      topVenueCount: topVenueEntry?.[1] || 0,
      topVenuePhoto,
      highestRated,
      highestRatedPhoto,
      cities: [...cities],
      topVibes,
      topGenre: topGenre?.[0] || '',
      topVibe: topVibes[0]?.[0] || '',
      avgScore,
      totalSongs,
      collageArtists,
      personality: generatePersonality(topGenre?.[0], topVibes[0]?.[0]),
    };
  }, [yearShows]);

  const totalSlides = 8;

  const handleTouchStart = (e) => {
    touchRef.current.startX = e.touches[0].clientX;
    touchRef.current.startY = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - touchRef.current.startX;
    const dy = e.changedTouches[0].clientY - touchRef.current.startY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0 && slide < totalSlides - 1) setSlide(slide + 1);
      if (dx > 0 && slide > 0) setSlide(slide - 1);
    }
  };

  const handleClick = useCallback((e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    if (x > rect.width * 0.6) { if (slide < totalSlides - 1) setSlide(slide + 1); }
    else if (x < rect.width * 0.4) { if (slide > 0) setSlide(slide - 1); }
  }, [slide]);

  if (!data) return null;

  // Prefer the user's own photos for the per-subject hero slides.
  // Falls back to Deezer artist art (which falls back to a gradient
  // inside SlideBg).
  const artistImg = data.topArtistPhoto || getArtistImage(data.topArtist);
  const highImg = data.highestRatedPhoto
    || (data.highestRated ? getArtistImage(data.highestRated.artist) : null);
  const venueImg = data.topVenuePhoto || getArtistImage(data.topVenueArtist || data.topArtist);
  const collageImgs = data.collageArtists.map((a) => getArtistImage(a)).filter(Boolean);

  return (
    <div className={`wrapped-overlay ${entered ? 'entered' : ''}`}>
      <button className="wrapped-close" onClick={onClose}>
        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <div
        ref={containerRef}
        className="wrapped-slides"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        style={{ transform: `translateX(-${slide * 100}%)` }}
      >
        {/* Slide 1 — Year Intro */}
        <div className={`wrapped-slide ${slide === 0 ? 'is-active' : ''}`}>
          <SlideBg image={artistImg} overlay={SLIDE_OVERLAYS[0]} fallbackArtist={data.topArtist} />
          <div className="wrapped-slide-content">
            <div className="wrapped-year-big wrapped-stagger" style={{ animationDelay: '0.05s' }}>{year}</div>
            <h1 className="wrapped-title wrapped-stagger" style={{ animationDelay: '0.2s' }}>Your Year in Music</h1>
            <div className="wrapped-count-big wrapped-stagger" style={{ animationDelay: '0.4s' }}>
              {slide === 0 && <CountUp end={data.total} duration={1400} />}
            </div>
            <p className="wrapped-subtitle wrapped-stagger" style={{ animationDelay: '0.65s' }}>shows attended</p>
          </div>
        </div>

        {/* Slide 2 — Top Artist */}
        <div className={`wrapped-slide ${slide === 1 ? 'is-active' : ''}`}>
          <SlideBg image={artistImg} overlay={SLIDE_OVERLAYS[1]} fallbackArtist={data.topArtist} />
          <div className="wrapped-slide-content">
            <p className="wrapped-label wrapped-stagger" style={{ animationDelay: '0.1s' }}>YOUR TOP ARTIST</p>
            <div
              className="wrapped-artist-img wrapped-stagger"
              style={{ ...(artistImg ? { backgroundImage: `url(${artistImg})` } : { background: getArtistGradient(data.topArtist || '') }), animationDelay: '0.25s' }}
            />
            <h1 className="wrapped-title wrapped-stagger" style={{ animationDelay: '0.45s' }}>{data.topArtist}</h1>
            <p className="wrapped-subtitle wrapped-stagger" style={{ animationDelay: '0.6s' }}>
              You saw them {data.topArtistCount} time{data.topArtistCount > 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Slide 3 — Top Venue */}
        <div className={`wrapped-slide ${slide === 2 ? 'is-active' : ''}`}>
          <SlideBg image={venueImg} overlay={SLIDE_OVERLAYS[2]} fallbackArtist={data.topVenueArtist} />
          <div className="wrapped-slide-content">
            <p className="wrapped-label wrapped-stagger" style={{ animationDelay: '0.1s' }}>YOUR TOP VENUE</p>
            <div className="wrapped-pin-mark wrapped-stagger" style={{ animationDelay: '0.25s' }}>
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z"/>
              </svg>
            </div>
            <h1 className="wrapped-title wrapped-stagger" style={{ animationDelay: '0.4s' }}>{data.topVenue}</h1>
            <p className="wrapped-subtitle wrapped-stagger" style={{ animationDelay: '0.55s' }}>{data.topVenueCity}</p>
            <p className="wrapped-subtitle-sm wrapped-stagger" style={{ animationDelay: '0.7s' }}>
              {data.topVenueCount} visit{data.topVenueCount > 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Slide 4 — Highest Rated */}
        <div className={`wrapped-slide ${slide === 3 ? 'is-active' : ''}`}>
          <SlideBg image={highImg} overlay={SLIDE_OVERLAYS[3]} fallbackArtist={data.highestRated?.artist} />
          <div className="wrapped-slide-content">
            <p className="wrapped-label wrapped-stagger" style={{ animationDelay: '0.1s' }}>HIGHEST RATED SHOW</p>
            {data.highestRated && (
              <>
                <div className="wrapped-score-huge wrapped-stagger" style={{ animationDelay: '0.25s' }}>
                  {slide === 3 && (
                    <CountUp
                      end={data.highestRated.score}
                      duration={1300}
                      decimals={Number.isInteger(data.highestRated.score) ? 0 : 1}
                    />
                  )}
                </div>
                <div className="wrapped-rated-card wrapped-stagger" style={{ animationDelay: '0.5s' }}>
                  <div
                    className="wrapped-rated-img"
                    style={highImg ? { backgroundImage: `url(${highImg})` } : { background: getArtistGradient(data.highestRated.artist) }}
                  />
                  <div>
                    <h2 className="wrapped-rated-artist">{data.highestRated.artist}</h2>
                    <p className="wrapped-rated-venue">{data.highestRated.venue}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Slide 5 — Cities */}
        <div className={`wrapped-slide ${slide === 4 ? 'is-active' : ''}`}>
          <SlideBg image={artistImg} overlay={SLIDE_OVERLAYS[4]} fallbackArtist={data.topArtist} />
          <div className="wrapped-slide-content">
            <p className="wrapped-label wrapped-stagger" style={{ animationDelay: '0.1s' }}>CITIES VISITED</p>
            <div className="wrapped-count-big wrapped-stagger" style={{ animationDelay: '0.25s' }}>
              {slide === 4 && <CountUp end={data.cities.length} duration={1100} />}
            </div>
            <div className="wrapped-cities-list">
              {data.cities.map((c, i) => (
                <span
                  key={c}
                  className="wrapped-city-tag wrapped-stagger"
                  style={{ animationDelay: `${0.5 + i * 0.05}s` }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Slide 6 — Vibes */}
        <div className={`wrapped-slide ${slide === 5 ? 'is-active' : ''}`}>
          <SlideBg image={artistImg} overlay={SLIDE_OVERLAYS[5]} fallbackArtist={data.topArtist} />
          <div className="wrapped-slide-content">
            <p className="wrapped-label wrapped-stagger" style={{ animationDelay: '0.1s' }}>YOUR VIBE</p>
            <div className="wrapped-vibes-grid">
              {data.topVibes.map(([name], i) => (
                <div
                  key={name}
                  className="wrapped-vibe-item wrapped-stagger"
                  style={{ animationDelay: `${0.25 + i * 0.08}s` }}
                >
                  <div className="wrapped-vibe-emoji">{getVibeEmoji(name)}</div>
                  <div className="wrapped-vibe-name">{name}</div>
                </div>
              ))}
            </div>
            <p
              className="wrapped-subtitle wrapped-stagger"
              style={{ marginTop: 24, animationDelay: '0.85s' }}
            >
              You chase the {data.topVibe.toLowerCase()} shows
            </p>
          </div>
        </div>

        {/* Slide 7 — Personality (collage of artist photos) */}
        <div className={`wrapped-slide ${slide === 6 ? 'is-active' : ''}`}>
          <div className="wrapped-bg-collage">
            {collageImgs.length > 0
              ? collageImgs.slice(0, 6).map((img, i) => (
                  <div key={i} className="wrapped-collage-tile" style={{ backgroundImage: `url(${img})` }} />
                ))
              : <div className="wrapped-bg-img" style={{ background: getArtistGradient(data.topArtist) }} />}
          </div>
          <div className="wrapped-bg-overlay" style={{ background: SLIDE_OVERLAYS[6] }} />
          <div className="wrapped-slide-content">
            <p className="wrapped-label wrapped-stagger" style={{ animationDelay: '0.1s' }}>YOUR MUSIC PERSONALITY</p>
            <div className="wrapped-emoji wrapped-stagger" style={{ animationDelay: '0.25s' }}>🎭</div>
            <h1 className="wrapped-personality wrapped-stagger" style={{ animationDelay: '0.45s' }}>
              {data.personality}
            </h1>
          </div>
        </div>

        {/* Slide 8 — Summary */}
        <div className={`wrapped-slide ${slide === 7 ? 'is-active' : ''}`}>
          <SlideBg image={artistImg} overlay={SLIDE_OVERLAYS[7]} fallbackArtist={data.topArtist} />
          <div className="wrapped-slide-content wrapped-summary">
            <div className="wrapped-summary-logo wrapped-stagger" style={{ animationDelay: '0.05s' }}>
              <MeloIcon size={48} />
              <MeloWordmark size={32} color="#fff" />
            </div>
            <div className="wrapped-summary-year wrapped-stagger" style={{ animationDelay: '0.18s' }}>
              {year} Wrapped
            </div>
            <div className="wrapped-summary-grid">
              {[
                { num: data.total, label: 'Shows' },
                { num: data.cities.length, label: 'Cities' },
                { num: data.avgScore.toFixed(1), label: 'Avg Score' },
                { num: data.totalSongs, label: 'Songs' },
              ].map((s, i) => (
                <div
                  key={s.label}
                  className="wrapped-summary-stat wrapped-stagger"
                  style={{ animationDelay: `${0.3 + i * 0.08}s` }}
                >
                  <div className="wrapped-summary-num">{s.num}</div>
                  <div className="wrapped-summary-label">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="wrapped-summary-highlights wrapped-stagger" style={{ animationDelay: '0.7s' }}>
              <p>Top Artist: <strong>{data.topArtist}</strong></p>
              <p>Top Venue: <strong>{data.topVenue}</strong></p>
              {data.highestRated && (
                <p>Best Show: <strong>{data.highestRated.artist}</strong> ({data.highestRated.score})</p>
              )}
            </div>
            <p className="wrapped-summary-personality wrapped-stagger" style={{ animationDelay: '0.85s' }}>
              {data.personality}
            </p>
            <p className="wrapped-summary-footer wrapped-stagger" style={{ animationDelay: '1s' }}>
              Share your year in music
            </p>
          </div>
        </div>
      </div>

      {/* Dot indicators */}
      <div className="wrapped-dots">
        {Array.from({ length: totalSlides }).map((_, i) => (
          <div
            key={i}
            className={`wrapped-dot ${i === slide ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setSlide(i); }}
          />
        ))}
      </div>
    </div>
  );
}
