// FitText — type that measures itself and fits.
// =============================================
// The Bill's whole grammar is that rank is expressed by size: the headliner
// fills the sheet edge to edge, tier 2 sits on one line however long the names
// are. Both need a font size derived from the RENDERED width of the text, and
// that can only be known after layout.
//
// Five rounds of prompting a design tool for this produced clipped headlines
// three times and an overflowing tier 2 twice, because a generator can only
// guess a size and hope. Measuring is the fix, and it's four lines of maths.
//
// How it works: render at a probe size, measure the natural width of the text
// against the width of the box it has to live in, and scale by the ratio.
// One pass — no binary search, no loop — because text width is very close to
// linear in font size for a fixed string.

import { useLayoutEffect, useRef, useState } from 'react';

export default function FitText({
  children,
  // Where the fitted size is allowed to land. `max` stops a two-letter name
  // ("MGMT") rendering absurdly large; `min` stops a very long one becoming
  // unreadable — past that point the caller should wrap instead.
  min = 12,
  max = 200,
  // <1 leaves a sliver of breathing room at the margins; 1 means the glyphs
  // genuinely touch both edges, which is what a letterpress bill does.
  fill = 1,
  className = '',
  style = {},
  as: Tag = 'div',
  title,
}) {
  const boxRef = useRef(null);
  const spanRef = useRef(null);
  const [size, setSize] = useState(null);
  // Set when even `min` can't fit the string on one line. The house rule is
  // that "fill the width" loses to "never clip", and the resolution is to
  // break across lines — so past the floor we stop shrinking and wrap.
  const [wrap, setWrap] = useState(false);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const span = spanRef.current;
    if (!box || !span) return undefined;

    const fit = () => {
      const avail = box.clientWidth;
      if (!avail) return;
      // Measure at a known size so the ratio is meaningful. scrollWidth is the
      // text's natural width — clientWidth would just report the box back.
      const PROBE = 100;
      // Measure on one line whatever the current wrap state is, or the second
      // pass would measure the already-wrapped width and settle on it.
      span.style.whiteSpace = 'nowrap';
      span.style.fontSize = `${PROBE}px`;
      const natural = span.scrollWidth;
      span.style.whiteSpace = '';
      if (!natural) return;
      const ideal = (avail * fill * PROBE) / natural;
      const next = Math.max(min, Math.min(max, ideal));
      setWrap(ideal < min);
      // Write the measured size straight to the node AS WELL AS to state.
      // Clearing it and relying on the re-render is wrong: a refit that lands
      // on the same number is a no-op for React, so no re-render happens and
      // the node is left with no font-size at all — it silently collapses to
      // the inherited 16px. That is exactly what a ResizeObserver or the
      // fonts.ready refit triggers, so it fires on nearly every mount.
      span.style.fontSize = `${next}px`;
      setSize(next);
    };

    fit();
    // Refit on rotation, on a font swapping in late (Playfair arrives after
    // first paint and is much wider than the fallback), and on any resize.
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    if (document.fonts?.ready) document.fonts.ready.then(fit).catch(() => {});
    return () => ro.disconnect();
  }, [children, min, max, fill]);

  return (
    <Tag ref={boxRef} className={className} style={{ ...style, width: '100%' }} title={title}>
      <span
        ref={spanRef}
        style={{
          display: 'inline-block',
          whiteSpace: wrap ? 'normal' : 'nowrap',
          // Hidden until measured, so nothing is ever seen at the probe size.
          fontSize: size ? `${size}px` : undefined,
          visibility: size ? 'visible' : 'hidden',
          lineHeight: 'inherit',
        }}
      >
        {children}
      </span>
    </Tag>
  );
}
