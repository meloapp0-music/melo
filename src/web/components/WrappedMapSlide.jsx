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

      // Camera model — per-leg "follow the journey":
      //
      //   1. Open at the "home cluster" — longest prefix of pins
      //      that fits at zoom >= 4. For most users this is their
      //      whole continental tour. Stable wide-but-useful view.
      //
      //   2. For each subsequent leg: if the destination is already
      //      visible (within the current viewport), no camera move
      //      — just draw the line. If it's outside, fly to a view
      //      that fits THIS LEG ONLY (prev + to), with maxZoom=6
      //      so close-together cities don't zoom in too tight.
      //      Camera tracks the journey one leg at a time, never
      //      zooming all the way out to "fit everything."
      //
      //   3. No final zoom-out. Camera ends wherever the last leg
      //      put it. (Earlier cuts ended at fitBounds(everything)
      //      which made the journey look microscopic on phone for
      //      users with an Australia outlier.)
      //
      // Trade-off vs the prior "one big zoom" cut: a journey with
      // multiple far-apart outliers has multiple camera moves
      // instead of one. But each move is small + tied to a real
      // moment in the trip. Users with no outliers see zero moves.
      const PADDING = [60, 60];
      const MIN_REGIONAL_ZOOM = 4;
      const LEG_MAX_ZOOM = 6;

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
      // Per-leg camera. Stay still while drawing pins inside the
      // current view; fly to fit the active leg only when a pin
      // lands outside. Each fly is sized to the leg (prev + to),
      // not the whole journey — so an LA → Sydney leg shows a
      // Pacific-spanning view, not a microscopic world view.
      const SEGMENT_DURATION = 650; // ms — line draw between cities
      const SETTLE_PAUSE = 200;     // ms — pause after each pin
      const ZOOM_DURATION = 1.0;    // s — leg-specific camera fly

      const isInView = (latLng) =>
        map.getBounds().pad(-0.08).contains(latLng);

      // Fly the camera so this single leg is comfortably framed.
      // maxZoom caps the zoom for close-together legs (e.g., two
      // cities in the same metro shouldn't zoom in to street level
      // mid-journey). Bounds are JUST prev + to, never the full set.
      const flyToFitLeg = async (from, to) => {
        const legBounds = L.latLngBounds(
          [[from.lat, from.lng], [to.lat, to.lng]]
        );
        await flyToBoundsAsync(legBounds, {
          padding: PADDING,
          duration: ZOOM_DURATION,
          maxZoom: LEG_MAX_ZOOM,
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

        // 2. Each subsequent leg.
        for (let i = 1; i < animated.length; i++) {
          if (cancelled) return;
          const from = animated[i - 1].g;
          const to = animated[i].g;

          // If destination is outside the current view, fly to fit
          // just this leg before drawing. Inside the view = no move.
          if (!isInView([to.lat, to.lng])) {
            await flyToFitLeg(from, to);
            if (cancelled) return;
          }

          await drawSegment(from, to, SEGMENT_DURATION);
          dropPinMarker(to);
          runningMiles += haversineMiles(from, to);
          setMilesShown(Math.round(runningMiles));
          await sleep(SETTLE_PAUSE);
        }

        if (cancelled) return;
        setMilesShown(totalMiles);

        // 3. Final beat: slow pull-back to show the entire journey.
        // Different context from a mid-journey "fit everything"
        // (which made active drawing microscopic) — by now every
        // pin is placed and the trail is fully painted, so the
        // wide view reads as a triumphant overview, not as
        // compression. This is also the screenshot moment for
        // share-out.
        const allLatLngs = points.map((p) => [p.g.lat, p.g.lng]);
        if (allLatLngs.length >= 2) {
          await sleep(550); // beat after last pin before pulling back
          await flyToBoundsAsync(L.latLngBounds(allLatLngs), {
            padding: [80, 80],
            duration: 1.6,
            maxZoom: 5,
          });
          await sleep(600);
        }

        if (cancelled) return;
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
