import { useEffect, useRef, useState } from 'react';
import { useApp } from '../App';
import { getArtistGradient, formatDate, isAttended } from '../store';

const CITY_COORDS = {
  'New York': [40.7128, -74.006],
  'Los Angeles': [34.0522, -118.2437],
  'Chicago': [41.8781, -87.6298],
  'Nashville': [36.1627, -86.7816],
  'Austin': [30.2672, -97.7431],
  'San Francisco': [37.7749, -122.4194],
  'Denver': [39.7392, -104.9903],
  'Seattle': [47.6062, -122.3321],
  'Portland': [45.5051, -122.6750],
  'Atlanta': [33.749, -84.388],
  'Philadelphia': [39.9526, -75.1652],
  'Boston': [42.3601, -71.0589],
  'Miami': [25.7617, -80.1918],
  'Brooklyn': [40.6782, -73.9442],
  'Dallas': [32.7767, -96.797],
  'Detroit': [42.3314, -83.0458],
  'Minneapolis': [44.9778, -93.265],
  'New Orleans': [29.9511, -90.0715],
  'Washington DC': [38.9072, -77.0369],
  'Phoenix': [33.4484, -112.074],
  'Morrison': [39.6536, -105.1911],
  'Manchester': [53.4808, -2.2426],
  'London': [51.5074, -0.1278],
  'Berlin': [52.52, 13.405],
  'Tokyo': [35.6762, 139.6503],
  'Paris': [48.8566, 2.3522],
  'Toronto': [43.6532, -79.3832],
  'Melbourne': [-37.8136, 144.9631],
};

export default function ConcertMap() {
  const { shows, setSelectedShow, getArtistImage, navigate } = useApp();
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [selectedCity, setSelectedCity] = useState(null);

  const attended = shows.filter(isAttended);
  const cityCounts = {};
  attended.forEach((s) => {
    if (s.city) cityCounts[s.city] = (cityCounts[s.city] || 0) + 1;
  });

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

      Object.entries(cityCounts).forEach(([city, count]) => {
        const coords = CITY_COORDS[city];
        if (!coords) return;

        const size = Math.min(24 + count * 4, 40);
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:${size}px;height:${size}px;background:linear-gradient(135deg,#F4A261,#E8573A);border-radius:50%;border:3px solid #fff;box-shadow:0 2px 12px rgba(232,87,58,0.4);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:${count > 1 ? 12 : 0}px;font-family:Outfit,sans-serif;">${count > 1 ? count : ''}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

        L.marker(coords, { icon })
          .addTo(map)
          .on('click', () => setSelectedCity(city));
      });

      mapInstance.current = map;
      setTimeout(() => map.invalidateSize(), 100);
    });

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

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
