// PhotoPicker — multi-image upload widget for LogShow.
// =====================================================
// Hosts an `<input type="file" multiple accept="image/*">`, runs each
// chosen file through `uploadShowPhoto` (which resizes client-side to
// a 2048px-edge JPEG before sending to Supabase Storage), and then
// reports the resulting public-URL list back to the parent via
// `onChange`.
//
// Designed to be a *controlled* component: the parent owns the
// `photos` array. We never mutate it directly — we always call
// `onChange(next)` so optimistic state stays in one place. That lets
// LogShow keep its single submit button and persist photos as part
// of the normal `addShow` / `updateShow` payload.
//
// We require `userId` and `showId` so uploads land at
// `{userId}/{showId}/{file}` — matching the storage RLS policy that
// gates writes by the first folder segment. For a brand-new show
// being logged, the parent should generate a stable client-side
// `showId` *before* mounting this component, otherwise the photos
// would be orphaned under a temp folder.

import { useRef, useState } from 'react';
import { uploadShowPhoto, deleteShowPhoto } from '../lib/storage';

export default function PhotoPicker({ photos = [], onChange, userId, showId }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(0); // count of in-flight uploads
  const [error, setError] = useState(null);

  const handlePick = () => inputRef.current?.click();

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    // Reset the input value so re-picking the same file still fires onChange.
    e.target.value = '';
    if (!files.length) return;
    if (!userId || !showId) {
      setError('Cannot upload yet — missing show id.');
      return;
    }

    setError(null);
    setUploading((n) => n + files.length);

    // Run uploads in parallel — each one is its own resize + POST.
    // Append URLs as they land so the user sees progress instead of a
    // long blocking spinner.
    let current = photos.slice();
    await Promise.all(
      files.map(async (f) => {
        try {
          const url = await uploadShowPhoto(f, userId, showId);
          current = [...current, url];
          onChange(current);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[Melo] photo upload failed', err);
          setError(err?.message || 'Upload failed');
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
  };

  const handleRemove = async (url) => {
    // Optimistic remove from the array. Best-effort delete from Storage
    // — `deleteShowPhoto` swallows storage errors so a stale orphan
    // file doesn't block the UI.
    onChange(photos.filter((p) => p !== url));
    deleteShowPhoto(url);
  };

  return (
    <div className="photo-picker">
      <input
        ref={inputRef}
        className="photo-picker-input"
        type="file"
        accept="image/*"
        multiple
        onChange={handleFiles}
      />

      <div className="photo-picker-grid">
        {photos.map((url) => (
          <div key={url} className="photo-picker-tile" style={{ backgroundImage: `url(${url})` }}>
            <button
              type="button"
              className="photo-picker-remove"
              onClick={() => handleRemove(url)}
              aria-label="Remove photo"
            >
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        ))}

        {uploading > 0 &&
          Array.from({ length: uploading }).map((_, i) => (
            <div key={`up-${i}`} className="photo-picker-tile photo-picker-tile-loading">
              <div className="photo-picker-spinner" aria-hidden />
            </div>
          ))}

        <button
          type="button"
          className="photo-picker-add"
          onClick={handlePick}
          aria-label="Add photo"
        >
          <span className="photo-picker-add-plus">+</span>
          <span className="photo-picker-add-label">
            {photos.length === 0 ? 'Add photos' : 'Add more'}
          </span>
        </button>
      </div>

      {error && <div className="photo-picker-error">{error}</div>}
    </div>
  );
}
