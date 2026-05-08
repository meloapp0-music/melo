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

      // Dark Carto tiles — matches the rest of Wrapped's dark theme
      // and lets the orange trail pop. State borders are subtle but
      // visible at zoom >= 5.
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 18,
      }).addTo(map);

      // Static dots first (the un-animated middle stretch — only when
      // the user has 20+ shows and we capped the animated list).
      staticOnly.forEach(({ g }) => {
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:10px;height:10px;background:rgba(255,138,76,0.55);border-radius:50%;border:1.5px solid rgba(255,255,255,0.6);box-shadow:0 0 6px rgba(255,138,76,0.5);"></div>`,
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        });
        L.marker([g.lat, g.lng], { icon }).addTo(map);
      });

      // Camera strategy decided once upfront:
      //
      //  - Compute the "home cluster" — the longest prefix of pins
      //    (in chronological order) that still fits at a useful
      //    regional zoom (>= 4). For a US tour + 1 Australia show,
      //    that's all the US pins.
      //  - Open the map at the home cluster's bounds (NOT just the
      //    first city — that was too tight and forced an early
      //    full-zoom-out to fit the second pin). This gives a
      //    stable continental view for all the local pins.
      //  - If every pin is in the home cluster: never move the
      //    camera. Stable view through the whole journey.
      //  - If outliers exist (Australia, Tokyo, etc.): the journey
      //    loop fires EXACTLY ONE flyToBounds(fullBounds) right
      //    before the first outlier pin draws. That's the
      //    Australia-reveal moment. After that, camera holds.
      //
      // Earlier cuts went straight from "tight on first city" to
      // "fit world" the moment any pin was off-screen, which made
      // the world view appear way earlier than the actual outlier.
      const allLatLngs = points.map((p) => [p.g.lat, p.g.lng]);
      const fullBounds = L.latLngBounds(allLatLngs);
      const PADDING = [60, 60];
      const MIN_REGIONAL_ZOOM = 4;

      // Greedy: extend the prefix as long as it still fits at zoom 4+.
      let homeClusterCount = 1;
      let homeClusterBounds = L.latLngBounds([[animated[0].g.lat, animated[0].g.lng]]);
      for (let i = 1; i < animated.length; i++) {
        const tentative = L.latLngBounds(
          animated.slice(0, i + 1).map((p) => [p.g.lat, p.g.lng])
        );
        const z = map.getBoundsZoom(tentative, false, PADDING);
        if (z >= MIN_REGIONAL_ZOOM) {
          homeClusterBounds = tentative;
          homeClusterCount = i + 1;
        } else {
          break;
        }
      }
      // If home cluster has only 1 pin, zoom in to a sensible city
      // view rather than a degenerate single-point fitBounds.
      if (homeClusterCount === 1) {
        const o = animated[0].g;
        map.setView([o.lat, o.lng], 5.5, { animate: false });
      } else {
        map.fitBounds(homeClusterBounds, { padding: PADDING, animate: false, maxZoom: 7 });
      }

      mapInstance.current = map;
      playedRef.current = true;

      // ONE persistent polyline. Earlier cut destroyed + recreated
      // the trail every pin, which caused a visible flicker as the
      // line briefly disappeared between frames. Now we grow a
      // single layer via setLatLngs — no flicker, smooth draw.
      const trailLatLngs = [];
      let polyline = null;
      let runningMiles = 0;
      const trailStyle = {
        color: '#FF8A4C',
        weight: 3.5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      };

      const ensurePolyline = () => {
        if (!polyline) polyline = L.polyline([], trailStyle).addTo(map);
        return polyline;
      };

      // Animate a new line segment from `from` to `to` over `duration`
      // ms, by interpolating the endpoint via requestAnimationFrame
      // and updating the polyline in place. Resolves when the segment
      // reaches `to`.
      const drawSegment = (from, to, duration) => new Promise((resolve) => {
        const startTs = performance.now();
        const line = ensurePolyline();
        const tick = (now) => {
          if (cancelled) return resolve();
          const elapsed = now - startTs;
          const t = Math.min(elapsed / duration, 1);
          // ease-out cubic — fast start, settles into the destination
          const eased = 1 - Math.pow(1 - t, 3);
          const lat = from.lat + (to.lat - from.lat) * eased;
          const lng = from.lng + (to.lng - from.lng) * eased;
          line.setLatLngs([...trailLatLngs, [lat, lng]]);
          if (t < 1) requestAnimationFrame(tick);
          else {
            // Settle the final point cleanly into trailLatLngs so
            // subsequent draws extend, not replace.
            trailLatLngs.push([to.lat, to.lng]);
            line.setLatLngs(trailLatLngs);
            resolve();
          }
        };
        requestAnimationFrame(tick);
      });

      // Smooth Leaflet camera move that resolves on `moveend`. Used
      // ONLY at the cinematic open and the final pull-back — never
      // mid-journey, because mid-journey camera moves desync the
      // polyline endpoint animation.
      const flyToBoundsAsync = (bounds, opts) => new Promise((resolve) => {
        const onEnd = () => { map.off('moveend', onEnd); resolve(); };
        map.on('moveend', onEnd);
        map.flyToBounds(bounds, opts);
      });

      const dropPinMarker = (g) => {
        const icon = L.divIcon({
          className: '',
          html: '<div class="wms-pin"></div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        L.marker([g.lat, g.lng], { icon }).addTo(map);
      };

      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      const enableInteraction = () => {
        map.dragging.enable();
        map.touchZoom.enable();
        map.scrollWheelZoom.enable();
      };

      // === Main animation ===
      //
      // At most ONE camera move during the journey — fires only when
      // we're about to draw to a pin OUTSIDE the home cluster. No
      // per-pin adjustments, no parade of small zooms.
      const SEGMENT_DURATION = 650; // ms — line draw between cities
      const SETTLE_PAUSE = 200;     // ms — pause after each pin
      const ZOOM_DURATION = 1.0;    // s — the single zoom-out

      // True once we've flown out to fullBounds. Latched — never resets.
      let zoomedOutAlready = (homeClusterCount === animated.length);

      // Called before drawing the line into pin index `i`. If `i`
      // is the first outlier (== homeClusterCount), this fires the
      // single zoom-out reveal. Otherwise no-op.
      const maybeRevealOutlier = async (idx) => {
        if (zoomedOutAlready) return;
        if (idx < homeClusterCount) return;
        zoomedOutAlready = true;
        await flyToBoundsAsync(fullBounds, {
          padding: PADDING,
          duration: ZOOM_DURATION,
          maxZoom: 7,
        });
        await sleep(180);
      };

      const playJourney = async () => {
        await sleep(450); // tiles settle in

        if (cancelled) return;

        // 1. Drop the origin pin. No line yet — this is the start.
        if (animated[0]) {
          const origin = animated[0].g;
          trailLatLngs.push([origin.lat, origin.lng]);
          ensurePolyline().setLatLngs(trailLatLngs);
          dropPinMarker(origin);
          await sleep(SETTLE_PAUSE);
        }

        // 2. Each subsequent city: maybe-reveal-outlier → draw → drop.
        // The reveal fires exactly once, when we cross from the home
        // cluster into the outlier zone. After that, no more camera
        // moves for the rest of the journey.
        for (let i = 1; i < animated.length; i++) {
          if (cancelled) return;
          const from = animated[i - 1].g;
          const to = animated[i].g;

          await maybeRevealOutlier(i);
          if (cancelled) return;
          await drawSegment(from, to, SEGMENT_DURATION);
          dropPinMarker(to);
          runningMiles += haversineMiles(from, to);
          setMilesShown(Math.round(runningMiles));
          await sleep(SETTLE_PAUSE);
        }

        if (cancelled) return;
        setMilesShown(totalMiles);

        // 3. Unlock interactions so the user can pinch in for state
        // borders + venue cities.
        enableInteraction();
      };

      playJourney();
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
