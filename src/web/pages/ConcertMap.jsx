import { useEffect, useRef, useState } from 'react';
import { useApp } from '../App';
import YearScopeBanner, { useYearScope } from '../components/YearScope';
import { getArtistGradient, formatDate, isAttended } from '../store';
import { resolveCities, geoSpread, totalMilesTraveled } from '../lib/geo';

export default function ConcertMap() {
  const { shows, setSelectedShow, getArtistImage, navigate } = useApp();
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [resolvedGeo, setResolvedGeo] = useState({});
  const [mapReady, setMapReady] = useState(false);
  // Bumped once the markers exist. Leaflet is imported lazily, so the pins are
  // built inside a promise — this lets the cross-highlight effect re-run against
  // markers that weren't there on its first pass.
  const [markersVersion, setMarkersVersion] = useState(0);

  const { scoped: yearShows } = useYearScope(shows);
  const attended = yearShows.filter(isAttended);
  const cityCounts = {};
  attended.forEach((s) => {
    if (s.city) cityCounts[s.city] = (cityCounts[s.city] || 0) + 1;
  });

  // The travel story. `cities` is known synchronously; `states` and `miles`
  // need resolved coords, so they fill in when the geo lookup lands (and are
  // simply omitted while 0 rather than rendering a hollow "0 states").
  const spread = geoSpread(attended, resolvedGeo);
  const miles = totalMilesTraveled(attended, resolvedGeo);
  const cityCount = Object.keys(cityCounts).length;

  // Cities for the rail, most-seen first, then alphabetical.
  const cityRail = Object.entries(cityCounts)
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));

  // Resolve city -> {lat, lng, state, country} for every distinct city
  // logged, mirroring Wrapped.jsx's map slide. CITY_DATA covers common
  // cities synchronously; anything else falls back to Nominatim so
  // every city counted in "N cities explored" also gets a pin.
  useEffect(() => {
    let cancelled = false;
    const cities = Object.keys(cityCounts);
    if (cities.length === 0) return;
    resolveCities(cities).then((resolved) => {
      if (!cancelled) setResolvedGeo(resolved);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shows]);

  const markersRef = useRef({}); // city -> Leaflet marker, for cross-highlighting
  const chipRefs = useRef({});   // city -> rail chip element

  useEffect(() => {
    if (mapInstance.current || !mapRef.current) return;

    import('leaflet').then((L) => {
      const map = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([39.5, -98.35], 4);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map);

      mapInstance.current = map;
      setMapReady(true);
      setTimeout(() => map.invalidateSize(), 100);
    });

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return;

    import('leaflet').then((L) => {
      const map = mapInstance.current;
      if (!map) return;

      Object.values(markersRef.current).forEach((m) => map.removeLayer(m));
      markersRef.current = {};

      Object.entries(cityCounts).forEach(([city, count]) => {
        const g = resolvedGeo[city];
        if (!g) return;

        const size = Math.min(24 + count * 4, 40);
        const icon = L.divIcon({
          className: 'map-pin',
          html: `<div style="width:${size}px;height:${size}px;background:linear-gradient(135deg,#F4A261,#E8573A);border-radius:50%;border:3px solid #fff;box-shadow:0 2px 12px rgba(232,87,58,0.4);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:${count > 1 ? 12 : 0}px;font-family:Outfit,sans-serif;">${count > 1 ? count : ''}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

        // Hover popup: the venues/shows in this city (so the map reads at a
        // glance, not just as dots). Tap/click still opens the full card below.
        const esc = (t) => String(t || '').replace(/[&<>"]/g, (c) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const here = attended.filter((s) => s.city === city);
        const rows = here.slice(0, 5).map((s) =>
          `<div class="map-pop-row"><b>${esc(s.artist)}</b>${s.venue ? ` · ${esc(s.venue)}` : ''}</div>`
        ).join('');
        const more = here.length > 5 ? `<div class="map-pop-more">+ ${here.length - 5} more</div>` : '';
        const popup = `<div class="map-pop"><div class="map-pop-city">${esc(city)}</div>${rows}${more}</div>`;

        const marker = L.marker([g.lat, g.lng], { icon })
          .addTo(map)
          .bindPopup(popup, { closeButton: false, offset: [0, -4], className: 'map-pop-wrap' })
          .on('mouseover', function () { this.openPopup(); })
          .on('mouseout', function () { this.closePopup(); })
          .on('click', () => setSelectedCity(city));
        markersRef.current[city] = marker;
      });

      setMarkersVersion((v) => v + 1);
    });
  }, [resolvedGeo, mapReady]);

  // Cross-highlight, both directions: the selected city's pin gets a ring, and
  // its rail chip lights up and scrolls into view. Mutating the existing marker
  // elements (rather than adding `selectedCity` to the marker effect's deps)
  // keeps us from tearing down and rebuilding every pin on each selection.
  useEffect(() => {
    Object.entries(markersRef.current).forEach(([city, marker]) => {
      const el = marker.getElement?.();
      if (el) el.classList.toggle('active', city === selectedCity);
    });
    if (selectedCity) {
      chipRefs.current[selectedCity]?.scrollIntoView({
        behavior: 'smooth', block: 'nearest', inline: 'center',
      });
    }
  }, [selectedCity, markersVersion]);

  // Rail chip -> fly the map to that city and open its card. (A pin tap only
  // selects: you can already see where it is, so yanking the viewport would be
  // gratuitous.)
  const selectCity = (city) => {
    setSelectedCity(city);
    const g = resolvedGeo[city];
    const map = mapInstance.current;
    if (g && map) {
      map.flyTo([g.lat, g.lng], Math.max(map.getZoom(), 7), { duration: 0.9 });
    }
  };

  const cityShows = selectedCity
    ? attended.filter((s) => s.city === selectedCity)
    : [];

  const bgStyle = (artist) => {
    const img = getArtistImage(artist);
    return img
      ? { backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: getArtistGradient(artist) };
  };

  return (
    <div className="map-container">
      <div className="map-title">
        <button className="back-btn" onClick={() => navigate('home')}>
          <svg viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <h1>Concert Map</h1>
        <p style={{ color: '#9B8A7E', fontSize: 14, marginTop: 4 }}>
          {cityCount} {cityCount === 1 ? 'city' : 'cities'} explored
        </p>
      </div>
      <div style={{ padding: '0 20px' }}><YearScopeBanner /></div>

      {attended.length > 0 && (
        <div className="map-travel">
          <div className="map-travel-stats">
            <span className="map-travel-stat">
              <b>{cityCount}</b> {cityCount === 1 ? 'city' : 'cities'}
            </span>
            {spread.states > 0 && (
              <>
                <span className="map-travel-dot" />
                <span className="map-travel-stat">
                  <b>{spread.states}</b> {spread.states === 1 ? 'state' : 'states'}
                </span>
              </>
            )}
            {miles > 0 && (
              <>
                <span className="map-travel-dot" />
                <span className="map-travel-stat">
                  <b>{miles.toLocaleString()}</b> miles
                </span>
              </>
            )}
          </div>
          <div className="map-travel-label">for live music</div>
        </div>
      )}

      <div className="map-wrap" style={{ position: 'relative' }}>
        <div ref={mapRef} style={{ height: '100%', width: '100%', borderRadius: 20 }} />
        {selectedCity && (
          <div className="map-city-card">
            <div className="map-city-header">
              <h3>{selectedCity}</h3>
              <button
                className="log-close"
                onClick={() => setSelectedCity(null)}
              >
                <svg viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="map-city-shows">
              {cityShows.map((show) => (
                <div
                  key={show.id}
                  className="map-city-show"
                  onClick={() => {
                    setSelectedCity(null);
                    setSelectedShow(show);
                  }}
                >
                  <div className="map-city-show-thumb" style={bgStyle(show.artist)} />
                  <div className="map-city-show-info">
                    <div className="map-city-show-artist">{show.artist}</div>
                    <div className="map-city-show-venue">
                      {show.venue} &middot; {formatDate(show.date)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {cityRail.length > 0 && (
        <div className="map-rail">
          {cityRail.map(({ city, count }) => (
            <button
              key={city}
              ref={(el) => { chipRefs.current[city] = el; }}
              className={`map-rail-chip${city === selectedCity ? ' active' : ''}`}
              onClick={() => selectCity(city)}
            >
              <span className="map-rail-city">{city}</span>
              <span className="map-rail-count">{count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
