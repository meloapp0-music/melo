import { useEffect, useRef, useState } from 'react';
import { haversineMiles } from '../lib/geo';

// Animated Leaflet map for the Wrapped travel chapter (v1.0.4).
// Drops pulsing pins chronologically, draws trailing polylines
// between consecutive cities, ticks a mileage counter up to the
// season total. Auto-plays once when the slide becomes active;
// won't re-run on tab switches inside Wrapped.
//
// Performance: caps animated cities at 20 (the chronologically
// first 10 + chronologically last 10). Beyond that, the map gets
// busy and frame rate suffers on older iPhones. Users with 50+
// shows still see all their venues — the un-animated middle ones
// just appear as static dots from the start.
//
// Props:
//   shows  — yearShows ordered chronologically (already filtered
//            to the relevant Wrapped year + isAttended)
//   geo    — { [cityName]: {lat, lng, state, country} }
//   active — whether this slide is currently visible (drives the
//            once-per-mount auto-play)
//   totalMiles — final number to tick up to (haversine sum from
//                geo.js totalMilesTraveled, passed in to avoid
//                recomputing here)
//
// Per docs/initiatives/2026-05-05-wrapped-map-slides.md.
const MAX_ANIMATED = 20;

export default function WrappedMapSlide({ shows, geo, active, totalMiles }) {
  const mapEl = useRef(null);
  const mapInstance = useRef(null);
  const playedRef = useRef(false);
  const [milesShown, setMilesShown] = useState(0);

  // Build the chronological set of (show, coords) pairs we'll
  // animate. Skip any show whose city we couldn't resolve.
  const points = shows
    .map((s) => ({ show: s, g: s.city ? geo[s.city] : null }))
    .filter((p) => p.g);

  // Cap at MAX_ANIMATED — keep the first half + last half so the
  // user still sees the start AND end of their year. Middle cities
  // render as quiet static dots immediately so the map isn't sparse.
  const animated = points.length <= MAX_ANIMATED
    ? points
    : [...points.slice(0, MAX_ANIMATED / 2), ...points.slice(-MAX_ANIMATED / 2)];
  const staticOnly = points.length <= MAX_ANIMATED
    ? []
    : points.slice(MAX_ANIMATED / 2, -MAX_ANIMATED / 2);

  useEffect(() => {
    if (!active || playedRef.current || !mapEl.current) return;
    if (points.length === 0) return;

    let cancelled = false;
    let map;

    import('leaflet').then((mod) => {
      if (cancelled) return;
      const L = mod.default || mod;

      map = L.map(mapEl.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        keyboard: false,
        tap: false,
      });

      // Dark-toned tile layer to match Wrapped's gradient overlays.
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 18,
      }).addTo(map);

      // Static dots first (the un-animated middle stretch).
      staticOnly.forEach(({ g }) => {
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:10px;height:10px;background:rgba(255,138,76,0.55);border-radius:50%;border:1.5px solid rgba(255,255,255,0.6);box-shadow:0 0 6px rgba(255,138,76,0.5);"></div>`,
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        });
        L.marker([g.lat, g.lng], { icon }).addTo(map);
      });

      // Compute a bounds box that fits all points, then fit it.
      const allLatLngs = points.map((p) => [p.g.lat, p.g.lng]);
      const bounds = L.latLngBounds(allLatLngs);
      map.fitBounds(bounds, { padding: [56, 56], animate: false, maxZoom: 7 });

      mapInstance.current = map;
      playedRef.current = true;

      // Animation: drop animated pins one at a time, drawing a
      // trail polyline between them. Schedule with timers so the
      // browser can repaint between drops.
      const trailLatLngs = [];
      let trail;
      let runningMiles = 0;

      const dropPin = (idx) => {
        if (cancelled) return;
        if (idx >= animated.length) {
          setMilesShown(totalMiles);
          return;
        }
        const { g } = animated[idx];

        const icon = L.divIcon({
          className: '',
          html: '<div class="wms-pin"></div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        L.marker([g.lat, g.lng], { icon }).addTo(map);

        trailLatLngs.push([g.lat, g.lng]);
        if (trailLatLngs.length >= 2) {
          if (trail) trail.remove();
          trail = L.polyline(trailLatLngs, {
            color: '#FF8A4C',
            weight: 2.5,
            opacity: 0.9,
            dashArray: '4 6',
            lineCap: 'round',
          }).addTo(map);
        }

        if (idx > 0) {
          const prev = animated[idx - 1].g;
          runningMiles += haversineMiles(prev, g);
          setMilesShown(Math.round(runningMiles));
        }

        setTimeout(() => dropPin(idx + 1), 320);
      };

      // Slight delay so the map has tiles before pins start.
      setTimeout(() => dropPin(0), 350);
    });

    return () => {
      cancelled = true;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="wms-wrap">
      <div ref={mapEl} className="wms-map" />
      <div className="wms-overlay-top">
        <p className="wrapped-label">YOUR YEAR ON THE MAP</p>
      </div>
      <div className="wms-overlay-bottom">
        <div className="wms-miles">
          {milesShown.toLocaleString()}
          <span className="wms-miles-unit"> mi</span>
        </div>
        <p className="wms-caption">for live music</p>
      </div>
    </div>
  );
}
