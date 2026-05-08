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

      // Compute the journey-wide bounds once upfront. This is the
      // reveal-everything view we MIGHT need — used as the target
      // for the single zoom-out (if a zoom is needed at all).
      const allLatLngs = points.map((p) => [p.g.lat, p.g.lng]);
      const fullBounds = L.latLngBounds(allLatLngs);

      // Decide the camera strategy ONCE, upfront:
      //
      //  - If the full journey fits at a comfortable regional zoom
      //    (>= 4, roughly "continental US" scale or tighter), open
      //    at full bounds and NEVER move the camera mid-journey.
      //    A US tour stays at one stable view the whole time.
      //
      //  - If the journey requires a wider zoom (an outlier far
      //    from the home cluster — Australia from a US year, etc.),
      //    open tight on the first city and trigger exactly ONE
      //    big zoom-out to full bounds the first time a pin lands
      //    outside the current view. After that one zoom, the
      //    camera holds. So the user gets at most one mid-journey
      //    transition, never a parade of small adjustments.
      //
      // Earlier cuts expanded the bounds incrementally, which felt
      // "the map keeps changing" — too many adjustments in a row.
      const initialZoom = map.getBoundsZoom(fullBounds, false, [60, 60]);
      const fitsInRegionalView = initialZoom >= 4;

      const first = animated[0]?.g;
      if (fitsInRegionalView) {
        // Whole journey at once — no mid-journey camera moves planned.
        map.fitBounds(fullBounds, { padding: [60, 60], animate: false, maxZoom: 7 });
      } else if (first) {
        // Start tight; the journey loop will expand once if needed.
        map.setView([first.lat, first.lng], 5.5, { animate: false });
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
      // Pacing tightened from the prior cut: line draw + pause are
      // shorter so the journey doesn't drag, and at most ONE camera
      // move happens (if any) — no incremental "map keeps changing."
      const SEGMENT_DURATION = 650; // ms — line draw between cities
      const SETTLE_PAUSE = 200;     // ms — pause after each pin
      const ZOOM_DURATION = 1.0;    // s — the single zoom-out
      const PADDING = [60, 60];

      // We may need exactly one zoom-out — to reveal an outlier pin
      // that doesn't fit in the initial tight view. Tracked so we
      // never fire a second zoom: once we've expanded, we hold.
      let zoomedOutAlready = fitsInRegionalView; // already wide → no zoom planned

      const ensurePinVisible = async (latLng) => {
        if (zoomedOutAlready) return;
        const bounds = map.getBounds();
        // 8% inset so a pin right at the edge still counts as visible.
        if (bounds.pad(-0.08).contains(latLng)) return;

        // Outlier detected — do the SINGLE big reveal to full bounds.
        // After this, ride the wide view for the rest of the journey.
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
          await ensurePinVisible([origin.lat, origin.lng]);
          trailLatLngs.push([origin.lat, origin.lng]);
          ensurePolyline().setLatLngs(trailLatLngs);
          dropPinMarker(origin);
          await sleep(SETTLE_PAUSE);
        }

        // 2. Each subsequent city: maybe-zoom → draw line → drop pin.
        for (let i = 1; i < animated.length; i++) {
          if (cancelled) return;
          const from = animated[i - 1].g;
          const to = animated[i].g;

          await ensurePinVisible([to.lat, to.lng]);
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
