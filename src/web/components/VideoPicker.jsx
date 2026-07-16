// VideoPicker — short-clip upload widget for LogShow.
// ====================================================
// Sibling of PhotoPicker with the same controlled-component contract:
// the parent owns the `videos` URL array and we call `onChange(next)`.
// Uploads go through `uploadShowVideo`, which VALIDATES (≤60s, ≤45MB)
// rather than transcodes — in-webview compression isn't reliable, so
// v1 asks for short clips and rejects oversized ones with a friendly
// message. Native compression is phase 2 (see the video-uploads
// initiative).
//
// Same `{userId}/{showId}/…` pathing as photos — matching the
// show-videos storage RLS (migration 0014).

import { useRef, useState } from 'react';
import { uploadShowVideo, deleteShowVideo, VIDEO_MAX_SECONDS } from '../lib/storage';
import SortableMediaGrid from './SortableMediaGrid';

const MAX_VIDEOS_PER_SHOW = 3;

export default function VideoPicker({ videos = [], onChange, userId, showId }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState(null);
  // 0..1 per in-flight file, keyed by a per-pick id. A 200MB clip on venue LTE
  // takes minutes — without this the UI is an unexplained freeze.
  const [progress, setProgress] = useState({});

  const handlePick = () => inputRef.current?.click();

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    if (!userId || !showId) {
      setError('Cannot upload yet — missing show id.');
      return;
    }
    const room = MAX_VIDEOS_PER_SHOW - videos.length;
    if (room <= 0) {
      setError(`Max ${MAX_VIDEOS_PER_SHOW} clips per show — remove one first.`);
      return;
    }

    setError(null);
    const picked = files.slice(0, room);
    setUploading((n) => n + picked.length);

    let current = videos.slice();
    await Promise.all(
      picked.map(async (f, i) => {
        const key = `${Date.now()}-${i}`;
        setProgress((p) => ({ ...p, [key]: 0 }));
        try {
          const url = await uploadShowVideo(f, userId, showId, (pct) => {
            setProgress((p) => ({ ...p, [key]: pct }));
          });
          current = [...current, url];
          onChange(current);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[Melo] video upload failed', err);
          setError(err?.message || 'Upload failed');
        } finally {
          setUploading((n) => n - 1);
          setProgress((p) => {
            const next = { ...p };
            delete next[key];
            return next;
          });
        }
      }),
    );
  };

  const handleRemove = (url) => {
    onChange(videos.filter((v) => v !== url));
    deleteShowVideo(url);
  };

  return (
    <div className="photo-picker">
      <input
        ref={inputRef}
        className="photo-picker-input"
        type="file"
        accept="video/*"
        multiple
        onChange={handleFiles}
      />

      <div className="photo-picker-grid">
        <SortableMediaGrid ids={videos} onReorder={onChange} renderTile={(url, i) => (
          <div className="photo-picker-tile" style={{ background: '#17120C' }}>
            {/* #t=0.01 nudges iOS to paint the first frame as the poster */}
            <video
              src={`${url}#t=0.01`}
              preload="metadata"
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
            />
            <div
              aria-hidden="true"
              style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                       justifyContent: 'center', color: '#fff', fontSize: 22, pointerEvents: 'none',
                       textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}
            >
              ▶
            </div>
            {/* Clip 1 is the one og:video hands iMessage to autoplay in the link
                bubble, so which clip leads actually matters. */}
            {i === 0 && <span className="media-cover-flag">1st</span>}
            <button
              type="button"
              className="photo-picker-remove"
              onClick={() => handleRemove(url)}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Remove video"
            >
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        )}>

        {/* One tile per in-flight upload, each showing its OWN percentage. A
            bare spinner for a multi-minute 200MB upload reads as a freeze. */}
        {Object.entries(progress).map(([key, pct]) => (
          <div key={key} className="photo-picker-tile photo-picker-tile-loading">
            <div className="vid-up">
              <div className="vid-up-ring" aria-hidden />
              <div className="vid-up-pct">{Math.round((pct || 0) * 100)}%</div>
              <div className="vid-up-bar" aria-hidden>
                <div className="vid-up-fill" style={{ width: `${Math.round((pct || 0) * 100)}%` }} />
              </div>
            </div>
          </div>
        ))}

          {videos.length < MAX_VIDEOS_PER_SHOW && (
            <button
              type="button"
              className="photo-picker-add"
              onClick={handlePick}
              aria-label="Add video"
            >
              <span className="photo-picker-add-plus">＋</span>
              <span className="photo-picker-add-label">
                {videos.length === 0 ? 'Add clips' : 'Add more'}
              </span>
            </button>
          )}
        </SortableMediaGrid>
      </div>

      {/* At 200MB the duration limit is finally the one that binds (60s of 4K30
          ≈ 170MB), so we can state it plainly again. */}
      <div className="log-section-hint" style={{ marginTop: 6 }}>
        Up to {MAX_VIDEOS_PER_SHOW} clips · {VIDEO_MAX_SECONDS}s each
        {videos.length > 1 && ' · hold and drag to reorder'}
      </div>

      {error && <div className="photo-picker-error">{error}</div>}
    </div>
  );
}
