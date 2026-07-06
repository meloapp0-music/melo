import { useEffect, useRef, useState } from 'react';
import { useApp } from '../App';
import { getArtistGradient, formatDate, isAttended } from '../store';
import { resolveCities } from '../lib/geo';

export default function ConcertMap() {
  const { shows, setSelectedShow, getArtistImage, navigate } = useApp();
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [resolvedGeo, setResolvedGeo] = useState({});
  const [mapReady, setMapReady] = useState(false);

  const attended = shows.filter(isAttended);
  const cityCounts = {};
  attended.forEach((s) => {
    if (s.city) cityCounts[s.city] = (cityCounts[s.city] || 0) + 1;
  });

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

  const markersRef = useRef([]);

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

      markersRef.current.forEach((m) => map.removeLayer(m));
      markersRef.current = [];

      Object.entries(cityCounts).forEach(([city, count]) => {
        const g = resolvedGeo[city];
        if (!g) return;

        const size = Math.min(24 + count * 4, 40);
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:${size}px;height:${size}px;background:linear-gradient(135deg,#F4A261,#E8573A);border-radius:50%;border:3px solid #fff;box-shadow:0 2px 12px rgba(232,87,58,0.4);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:${count > 1 ? 12 : 0}px;font-family:Outfit,sans-serif;">${count > 1 ? count : ''}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

        const marker = L.marker([g.lat, g.lng], { icon })
          .addTo(map)
          .on('click', () => setSelectedCity(city));
        markersRef.current.push(marker);
      });
    });
  }, [resolvedGeo, mapReady]);

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
          {Object.keys(cityCounts).length} cities explored
        </p>
      </div>
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
    </div>
  );
}
