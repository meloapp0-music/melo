// PhotoGallery — display-only photo strip for ShowDetail.
// =========================================================
// Horizontal scroll of square thumbnails. Tapping one opens a
// fullscreen lightbox with prev/next + close. We use a portal-less
// in-tree overlay (consistent with ShowDetail's existing modal
// pattern) so we don't have to wire any new mounting points.
//
// Photos array comes from `shows.photos` (text[] of public-bucket
// URLs — see migration 0003 + lib/storage.js). Public-read means
// the <img> just renders without an Authorization header, which is
// the whole point of the bucket being public.

import { useState, useEffect, useCallback } from 'react';

export default function PhotoGallery({ photos = [] }) {
  const [activeIndex, setActiveIndex] = useState(null); // null = closed

  const close = useCallback(() => setActiveIndex(null), []);
  const next = useCallback(
    () => setActiveIndex((i) => (i == null ? i : (i + 1) % photos.length)),
    [photos.length],
  );
  const prev = useCallback(
    () => setActiveIndex((i) => (i == null ? i : (i - 1 + photos.length) % photos.length)),
    [photos.length],
  );

  // Keyboard nav while the lightbox is open. Bound at document level
  // so it works regardless of focus.
  useEffect(() => {
    if (activeIndex == null) return;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIndex, close, next, prev]);

  if (!photos || photos.length === 0) return null;

  return (
    <>
      <div className="photo-gallery">
        {photos.map((url, i) => (
          <button
            key={url}
            type="button"
            className="photo-gallery-tile"
            style={{ backgroundImage: `url(${url})` }}
            onClick={() => setActiveIndex(i)}
            aria-label={`View photo ${i + 1} of ${photos.length}`}
          />
        ))}
      </div>

      {activeIndex != null && (
        <div className="photo-lightbox" onClick={close}>
          <img
            className="photo-lightbox-img"
            src={photos[activeIndex]}
            alt=""
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="photo-lightbox-close"
            onClick={close}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                className="photo-lightbox-nav photo-lightbox-prev"
                onClick={(e) => { e.stopPropagation(); prev(); }}
                aria-label="Previous photo"
              >
                ‹
              </button>
              <button
                type="button"
                className="photo-lightbox-nav photo-lightbox-next"
                onClick={(e) => { e.stopPropagation(); next(); }}
                aria-label="Next photo"
              >
                ›
              </button>
              <div className="photo-lightbox-counter">
                {activeIndex + 1} / {photos.length}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
