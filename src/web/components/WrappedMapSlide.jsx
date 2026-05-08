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
        // All interactions disabled DURING the cinematic auto-play.
        // We re-enable dragging + touchZoom in `enableInteraction()`
        // after the animation finishes so the user can explore the
        // finished map (zoom in to see state borders / venue cities).
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        keyboard: false,
        tap: false,
        zoomSnap: 0.25, // smooth flyTo zoom changes
      });

      // Carto Voyager — dark-toned but with much more visible state +
      // country borders than `dark_all`. Reads as "this is a real
      // map, you traveled across these regions" instead of feeling
      // featureless.
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 18,
      }).addTo(map);

      // Static dots first (the un-animated middle stretch — only when
      // the user has 20+ shows and we capped the animated list).
      staticOnly.forEach(({ g }) => {
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:10px;height:10px;background:rgba(255,138,76,0.55);border-radius:50%;border:1.5px solid rgba(255,255,255,0.85);box-shadow:0 0 6px rgba(255,138,76,0.5);"></div>`,
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        });
        L.marker([g.lat, g.lng], { icon }).addTo(map);
      });

      // Open at a regional zoom on the FIRST animated city — gives
      // an immediate sense of place before the journey starts. We'll
      // fly to each subsequent city in turn, then pull back to the
      // full overview at the end.
      const first = animated[0]?.g;
      if (first) {
        map.setView([first.lat, first.lng], 5.5, { animate: false });
      } else {
        const allLatLngs = points.map((p) => [p.g.lat, p.g.lng]);
        map.fitBounds(L.latLngBounds(allLatLngs), { padding: [56, 56], animate: false, maxZoom: 7 });
      }

      mapInstance.current = map;
      playedRef.current = true;

      const trailLatLngs = [];
      let trail;
      let runningMiles = 0;

      const enableInteraction = () => {
        // Allow the user to explore the finished map. Pinch-zoom +
        // drag stay; double-tap zoom stays off so a stray double-tap
        // on the slide doesn't mistakenly zoom.
        map.dragging.enable();
        map.touchZoom.enable();
        map.scrollWheelZoom.enable();
      };

      const dropPin = (idx) => {
        if (cancelled) return;
        if (idx >= animated.length) {
          setMilesShown(totalMiles);
          // After the last pin, pull back to show the whole journey,
          // then unlock interactions so the user can zoom in.
          const allLatLngs = points.map((p) => [p.g.lat, p.g.lng]);
          if (allLatLngs.length >= 2) {
            map.flyToBounds(L.latLngBounds(allLatLngs), {
              padding: [60, 60],
              duration: 1.2,
              maxZoom: 7,
            });
            setTimeout(enableInteraction, 1300);
          } else {
            enableInteraction();
          }
          return;
        }
        const { g } = animated[idx];

        // Fly the camera to the next city BEFORE dropping its pin —
        // this is the moment the journey "happens" visually. Zoom
        // level 6 keeps state borders + neighbor cities visible, so
        // the cross-country leg actually reads as a cross-country
        // leg, not just two pins on a static frame.
        const isFirst = idx === 0;
        const flyDuration = isFirst ? 0.4 : 0.65; // first one is instant-ish since we already setView'd

        if (isFirst) {
          // Already at the right view; just drop the pin
          dropPinNow(idx);
        } else {
          map.flyTo([g.lat, g.lng], 6, { duration: flyDuration, easeLinearity: 0.4 });
          setTimeout(() => dropPinNow(idx), flyDuration * 1000);
        }
      };

      const dropPinNow = (idx) => {
        if (cancelled) return;
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
            weight: 3,
            opacity: 0.95,
            dashArray: '4 6',
            lineCap: 'round',
          }).addTo(map);
        }

        if (idx > 0) {
          const prev = animated[idx - 1].g;
          runningMiles += haversineMiles(prev, g);
          setMilesShown(Math.round(runningMiles));
        }

        // Pause briefly on this city before flying to the next so
        // the eye registers the pin + trail before the camera moves.
        setTimeout(() => dropPin(idx + 1), 280);
      };

      // Slight delay so the map has tiles before pins start.
      setTimeout(() => dropPin(0), 400);
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
