import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useApp } from '../App';
import { getArtistGradient, formatDate, VIBES, isAttended, wrappedLabel } from '../store';
import { MeloIcon, MeloWordmark } from '../components/MeloLogo';
import KineticVibe from '../components/KineticVibe';
import WrappedMapSlide from '../components/WrappedMapSlide';
import { track } from '../lib/analytics';
import { shareWrappedCard } from '../lib/shareCard';
import {
  resolveCities,
  totalMilesTraveled,
  venueDepth,
  geoSpread,
  mostVisitedVenue,
} from '../lib/geo';

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

// Returns { archetype, suffix, sentence } so the Personality slide can
// render the archetype name as a kinetic typography moment (big +
// motion-rich) with the suffix as a subtitle below. The full sentence
// is preserved for share cards / accessibility.
function generatePersonality(topGenre, topVibe) {
  // Archetype names — stripped of leading article so they render
  // cleanly in display type. KineticVibe's slug derivation
  // (lowercase + hyphens) maps these to their CSS classes.
  const g = {
    Indie: 'Indie Night Owl', Electronic: 'Bass Devotee', Alternative: 'Alt-Rock Pilgrim',
    'Hip-Hop': 'Hip-Hop Connoisseur', 'R&B': 'Soul Searcher', Pop: 'Pop Visionary',
    Rock: 'Rock Purist', Jazz: 'Jazz Wanderer', Folk: 'Folk Poet', Metal: 'Metal Warrior',
    Country: 'Country Storyteller', Classical: 'Classical Soul', Punk: 'Punk Spirit',
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
  // Vowel-aware article for the share-out sentence ("an Indie..." vs
  // "a Bass...") so the prose still reads correctly when shared.
  const archetype = g[topGenre] || 'Music Explorer';
  const suffix = v[topVibe] || 'who lives for the live experience';
  const article = /^[aeiou]/i.test(archetype) ? 'an' : 'a';
  return {
    archetype,
    suffix,
    sentence: `You're ${article} ${archetype} ${suffix}`,
  };
}

// (getVibeEmoji removed in v1.0.4 — vibes now render as kinetic
// typography via <KineticVibe />. Per
// docs/initiatives/2026-05-07-v1-0-4-wrapped-juice.md.)

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
  const { shows, getArtistImage, profile } = useApp();
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

  // Annual-anchor reach — does the user actually open Wrapped?
  useEffect(() => {
    track('wrapped_opened', { year, show_count: yearShows.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  // Prior-year attended shows — used for the venue depth slide to
  // distinguish "new this year" venues from "return visits."
  const priorYearsShows = useMemo(() =>
    shows.filter((s) => isAttended(s) && new Date(s.date + 'T00:00:00').getFullYear() < year),
    [shows, year]
  );

  // Resolve city → {lat, lng, state, country} for every unique city
  // in the year. CITY_DATA covers ~50 common cities synchronously;
  // anything else hits Nominatim once + caches in localStorage. We
  // do this in an effect (not useMemo) because it's async.
  const [geo, setGeo] = useState({});
  useEffect(() => {
    let cancelled = false;
    const cities = [...new Set(yearShows.map((s) => s.city).filter(Boolean))];
    if (cities.length === 0) return;
    resolveCities(cities).then((resolved) => {
      if (!cancelled) setGeo(resolved);
    });
    return () => { cancelled = true; };
  }, [yearShows]);

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

    // Top artist: primary signal is show count, but when two artists
    // are tied (e.g., 3 shows each), the user's Compare-battle wins
    // for those artists' shows break the tie. More-battled-and-won
    // = "this is the artist they care about most." Migration 0007.
    const artistBattleWins = {};
    yearShows.forEach((s) => {
      artistBattleWins[s.artist] = (artistBattleWins[s.artist] || 0) + (s.battleWins || 0);
    });
    const topArtistEntry = Object.entries(artistCounts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return (artistBattleWins[b[0]] || 0) - (artistBattleWins[a[0]] || 0);
    })[0];
    const topVibes = Object.entries(vibeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0];
    // Highest-rated show: primary signal is numeric score, then battle
    // wins as a tiebreaker (so when 5 shows are 10/10, the one the
    // user has actually picked-as-better in Compare wins), then date
    // descending so a more recent 10/10 wins over an older 10/10
    // when neither has been battled.
    const highestRated = [...yearShows]
      .filter((s) => s.score != null)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if ((b.battleWins || 0) !== (a.battleWins || 0)) {
          return (b.battleWins || 0) - (a.battleWins || 0);
        }
        return new Date(b.date) - new Date(a.date);
      })[0];
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

    // "Your Year in Photos" — a deduped, capped collection of every
    // photo across this year's attended shows. Per v1.0.6 initiative.
    const allPhotos = yearShows.flatMap((s) => s.photos || []).filter(Boolean);
    const photoWall = [...new Set(allPhotos)].slice(0, 20);
    const showsWithPhotos = yearShows.filter((s) => (s.photos || []).length > 0).length;

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
      photoWall,
      photoCount: allPhotos.length,
      showsWithPhotos,
    };
  }, [yearShows]);

  // Map-chapter stats. Recomputed when geo resolves so the slide
  // numbers update once Nominatim fills in any non-CITY_DATA cities.
  const mapData = useMemo(() => {
    if (!yearShows.length) return null;
    const depth = venueDepth(yearShows, priorYearsShows);
    const spread = geoSpread(yearShows, geo);
    const miles = totalMilesTraveled(yearShows, geo);
    const topVenueRepeat = mostVisitedVenue(yearShows);
    return { depth, spread, miles, topVenueRepeat };
  }, [yearShows, priorYearsShows, geo]);

  // 12-13 slides as of v1.0.6 (photo wall is conditional).
  //   0: Year intro
  //   1: Top artist
  //   2: Top venue        (this is the venue moment — Home Base was a duplicate)
  //   3: Highest rated
  //   4: Travel intro     (was 5; Cities slide retired)
  //   5: Venue depth
  //   6: Geographic spread
  //   7: Animated map
  //   8: Route recap      (replaced flat Cities tag-grid)
  //   9: Vibes
  //  10: Personality
  //  11: Your Year in Photos  ← NEW v1.0.6, only when photos exist
  //  12: Summary              (or 11 if no photos)
  // Only show the photo wall when there are enough photos to read as a
  // collage — a 1-2 photo year looks sparse, so skip it then.
  const hasPhotoWall = (data.photoWall || []).length >= 3;
  const summarySlide = hasPhotoWall ? 12 : 11;
  const totalSlides = hasPhotoWall ? 13 : 12;

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
      {slide > 0 && (
        <button
          className="wrapped-back"
          onClick={() => setSlide(slide - 1)}
          aria-label="Previous slide"
        >
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
      )}

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
        {/* Slide 1 — Year Intro (with confetti burst, v1.0.4 polish) */}
        <div className={`wrapped-slide ${slide === 0 ? 'is-active' : ''}`}>
          <SlideBg image={artistImg} overlay={SLIDE_OVERLAYS[0]} fallbackArtist={data.topArtist} />
          {slide === 0 && (
            <div className="wrapped-confetti" aria-hidden="true">
              {Array.from({ length: 28 }).map((_, i) => (
                <span key={i} className={`wc-piece wc-p${i % 7}`} style={{ '--wc-x': `${(i / 27) * 100}%`, '--wc-d': `${(i % 5) * 0.08}s` }} />
              ))}
            </div>
          )}
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
                <div className="wrapped-score-huge wrapped-score-shimmer wrapped-stagger" style={{ animationDelay: '0.25s' }}>
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

        {/* (Slide 5 "Cities Visited" with city-tag chips removed in v1.0.4
            late-cut — redundant with the Geographic Spread slide and the
            new Route Recap slide. Each city's chronological position is
            now expressed via the route, not a flat tag grid.) */}

        {/* === TRAVEL CHAPTER (v1.0.4) — between Highest Rated and Vibes. === */}

        {/* Slide 4 — Travel intro */}
        <div className={`wrapped-slide ${slide === 4 ? 'is-active' : ''}`}>
          <SlideBg image={artistImg} overlay={SLIDE_OVERLAYS[5]} fallbackArtist={data.topArtist} />
          <div className="wrapped-slide-content">
            <p className="wrapped-label wrapped-stagger" style={{ animationDelay: '0.1s' }}>NEXT CHAPTER</p>
            <div className="wrapped-travel-intro-stack">
              <KineticVibe name="You traveled" size="large" delay={0.3} />
              <KineticVibe name="for music" size="hero" delay={0.7} />
            </div>
          </div>
        </div>

        {/* Slide 5 — Venue depth */}
        <div className={`wrapped-slide ${slide === 5 ? 'is-active' : ''}`}>
          <SlideBg image={venueImg} overlay={SLIDE_OVERLAYS[2]} fallbackArtist={data.topVenueArtist || data.topArtist} />
          <div className="wrapped-slide-content">
            <p className="wrapped-label wrapped-stagger" style={{ animationDelay: '0.1s' }}>VENUE DEPTH</p>
            <div className="wrapped-count-big wrapped-stagger" style={{ animationDelay: '0.25s' }}>
              {slide === 5 && mapData && <CountUp end={mapData.depth.total} duration={1100} />}
            </div>
            <p className="wrapped-subtitle wrapped-stagger" style={{ animationDelay: '0.55s' }}>
              unique venues
            </p>
            {mapData && (mapData.depth.newCount > 0 || mapData.depth.returnCount > 0) && (
              <div className="wrapped-venue-split">
                <div className="wrapped-venue-split-item wrapped-stagger" style={{ animationDelay: '0.85s' }}>
                  <div className="wrapped-venue-split-num">{mapData.depth.newCount}</div>
                  <div className="wrapped-venue-split-label">new this year</div>
                </div>
                <div className="wrapped-venue-split-divider" />
                <div className="wrapped-venue-split-item wrapped-stagger" style={{ animationDelay: '1.05s' }}>
                  <div className="wrapped-venue-split-num">{mapData.depth.returnCount}</div>
                  <div className="wrapped-venue-split-label">return visits</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Slide 6 — Geographic spread */}
        <div className={`wrapped-slide ${slide === 6 ? 'is-active' : ''}`}>
          <SlideBg image={artistImg} overlay={SLIDE_OVERLAYS[4]} fallbackArtist={data.topArtist} />
          <div className="wrapped-slide-content">
            <p className="wrapped-label wrapped-stagger" style={{ animationDelay: '0.1s' }}>YOUR REACH</p>
            {mapData && (
              <div className="wrapped-spread-grid">
                <div className="wrapped-spread-item wrapped-stagger" style={{ animationDelay: '0.25s' }}>
                  <div className="wrapped-spread-num">
                    {slide === 6 && <CountUp end={mapData.spread.cities} duration={1100} />}
                  </div>
                  <div className="wrapped-spread-label">{mapData.spread.cities === 1 ? 'city' : 'cities'}</div>
                </div>
                {mapData.spread.states > 0 && (
                  <div className="wrapped-spread-item wrapped-stagger" style={{ animationDelay: '0.45s' }}>
                    <div className="wrapped-spread-num">
                      {slide === 6 && <CountUp end={mapData.spread.states} duration={1100} />}
                    </div>
                    <div className="wrapped-spread-label">{mapData.spread.states === 1 ? 'state' : 'states'}</div>
                  </div>
                )}
                {mapData.spread.countries > 0 && (
                  <div className="wrapped-spread-item wrapped-stagger" style={{ animationDelay: '0.65s' }}>
                    <div className="wrapped-spread-num">
                      {slide === 6 && <CountUp end={mapData.spread.countries} duration={1100} />}
                    </div>
                    <div className="wrapped-spread-label">{mapData.spread.countries === 1 ? 'country' : 'countries'}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Slide 7 — Animated map. Auto-plays once when active. */}
        <div className={`wrapped-slide wrapped-slide-map ${slide === 7 ? 'is-active' : ''}`}>
          {mapData && (
            <WrappedMapSlide
              shows={yearShows}
              geo={geo}
              active={slide === 7}
              totalMiles={mapData.miles}
            />
          )}
        </div>

        {/* Slide 8 — Route recap (NEW v1.0.4 late-cut). Static "itinerary"
            view of the journey: cities in chronological order with orange
            arrows + leg distances. Replaces the former flat-grid Cities
            slide and complements the animated map (the map is for video
            sharing, this is for screenshots). */}
        <div className={`wrapped-slide ${slide === 8 ? 'is-active' : ''}`}>
          <SlideBg image={artistImg} overlay={SLIDE_OVERLAYS[1]} fallbackArtist={data.topArtist} />
          <div className="wrapped-slide-content">
            <p className="wrapped-label wrapped-stagger" style={{ animationDelay: '0.1s' }}>YOUR ROUTE</p>
            {(() => {
              // Chronological list of unique cities the user visited, in
              // the order they first appeared. yearShows is already sorted
              // by date ascending in the parent useMemo. ALL cities are
              // rendered — earlier "+ N more cities" compression was
              // removed because hiding cities defeats the slide's
              // entire point. The CSS uses a count-aware var so the
              // layout tightens automatically as the route grows.
              const seen = new Set();
              const route = [];
              yearShows.forEach((s) => {
                if (s.city && !seen.has(s.city)) {
                  seen.add(s.city);
                  route.push(s.city);
                }
              });
              return (
                <div
                  className="wrapped-route"
                  style={{ '--route-count': route.length }}
                >
                  {route.map((city, i) => (
                    <div
                      key={`${city}-${i}`}
                      className="wrapped-route-item wrapped-stagger"
                      style={{ animationDelay: `${0.25 + Math.min(i, 12) * 0.04}s` }}
                    >
                      <span className="wrapped-route-pin" aria-hidden="true">●</span>
                      <span className="wrapped-route-city">{city}</span>
                      {i < route.length - 1 && (
                        <span className="wrapped-route-arrow" aria-hidden="true">↓</span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
            {mapData && (
              <p className="wrapped-route-total wrapped-stagger" style={{ animationDelay: `${0.6 + Math.min(yearShows.length, 8) * 0.05}s` }}>
                {mapData.miles > 0 ? `${mapData.miles.toLocaleString()} mi · ` : ''}
                {mapData.spread.cities} {mapData.spread.cities === 1 ? 'city' : 'cities'}
                {mapData.spread.countries > 1 ? ` · ${mapData.spread.countries} countries` : ''}
              </p>
            )}
          </div>
        </div>

        {/* (Slide 9 "Your Home Base" removed in v1.0.4 late-cut —
            redundant with Slide 2's "Top Venue" which already shows
            the same most-visited venue with its show count. Travel
            chapter ends on the Route Recap.) */}

        {/* === END TRAVEL CHAPTER === */}

        {/* Slide 9 — Vibes (kinetic typography per vibe). Top vibe is
            the hero moment with full motion treatment; runners-up
            stack below at smaller scale. v1.0.4. */}
        <div className={`wrapped-slide ${slide === 9 ? 'is-active' : ''}`}>
          <SlideBg image={artistImg} overlay={SLIDE_OVERLAYS[5]} fallbackArtist={data.topArtist} />
          <div className="wrapped-slide-content">
            <p className="wrapped-label wrapped-stagger" style={{ animationDelay: '0.1s' }}>YOUR VIBE</p>
            <div className="wrapped-vibes-stack">
              {data.topVibes[0] && (
                <KineticVibe name={data.topVibes[0][0]} size="hero" delay={0.25} />
              )}
              {data.topVibes.length > 1 && (
                <div className="wrapped-vibes-secondary">
                  {data.topVibes.slice(1, 4).map(([name], i) => (
                    <KineticVibe
                      key={name}
                      name={name}
                      size={i === 0 ? 'medium' : 'small'}
                      delay={0.55 + i * 0.18}
                    />
                  ))}
                </div>
              )}
            </div>
            <p
              className="wrapped-subtitle wrapped-stagger"
              style={{ marginTop: 28, animationDelay: '1.15s' }}
            >
              You chase the {data.topVibe.toLowerCase()} shows
            </p>
          </div>
        </div>

        {/* Slide 10 — Personality. Archetype name renders as a kinetic
            typography moment with archetype-specific motion (e.g.
            INDIE NIGHT OWL gets midnight purple + dual-eye-glow
            pulse). Suffix renders as a subtitle below for the prose
            half of the personality. v1.0.4. */}
        <div className={`wrapped-slide ${slide === 10 ? 'is-active' : ''}`}>
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
            <p className="wrapped-personality-prefix wrapped-stagger" style={{ animationDelay: '0.25s' }}>
              You're
            </p>
            <div className="wrapped-personality-stack">
              <KineticVibe name={data.personality.archetype} size="hero" delay={0.4} />
            </div>
            <p className="wrapped-personality-suffix wrapped-stagger" style={{ animationDelay: '1.0s' }}>
              {data.personality.suffix}
            </p>
          </div>
        </div>

        {/* Slide 11 — Your Year in Photos (only when photos exist).
            Per docs/initiatives/2026-05-21-v1-0-6-photos-and-openers.md. */}
        {hasPhotoWall && (
          <div className={`wrapped-slide ${slide === 11 ? 'is-active' : ''}`}>
            <div className="wrapped-photo-wall">
              {data.photoWall.map((url, i) => (
                <div
                  key={`${url}-${i}`}
                  className="wrapped-photo-tile"
                  style={{
                    backgroundImage: `url(${url})`,
                    animationDelay: `${0.06 * i}s`,
                  }}
                />
              ))}
            </div>
            <div className="wrapped-photo-overlay" />
            <div className="wrapped-slide-content">
              <p className="wrapped-label wrapped-stagger" style={{ animationDelay: '0.1s' }}>
                YOUR YEAR
              </p>
              <KineticVibe name="in photos" size="hero" delay={0.3} />
              <p
                className="wrapped-photo-meta wrapped-stagger"
                style={{ animationDelay: '0.85s' }}
              >
                {data.photoCount} {data.photoCount === 1 ? 'photo' : 'photos'} · {data.showsWithPhotos} {data.showsWithPhotos === 1 ? 'show' : 'shows'} · {year}
              </p>
            </div>
          </div>
        )}

        {/* Summary slide — index depends on whether the photo wall rendered. */}
        <div className={`wrapped-slide ${slide === summarySlide ? 'is-active' : ''}`}>
          <SlideBg image={artistImg} overlay={SLIDE_OVERLAYS[7]} fallbackArtist={data.topArtist} />
          <div className="wrapped-slide-content wrapped-summary">
            <div className="wrapped-summary-logo wrapped-stagger" style={{ animationDelay: '0.05s' }}>
              <MeloIcon size={48} />
              <MeloWordmark size={32} color="#fff" />
            </div>
            <div className="wrapped-summary-year wrapped-stagger" style={{ animationDelay: '0.18s' }}>
              {year} {wrappedLabel(year)}
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
              {data.personality.sentence}
            </p>
            <button
              className="wrapped-share-btn wrapped-stagger"
              style={{ animationDelay: '1s' }}
              onClick={(e) => {
                e.stopPropagation();
                track('wrapped_shared', { year });
                shareWrappedCard(data, year, mapData, profile?.username);
              }}
            >
              <span aria-hidden="true">↗</span> Share your year in music
            </button>
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
