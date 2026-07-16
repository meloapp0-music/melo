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
import { uploadShowVideo, deleteShowVideo, VIDEO_MAX_MB } from '../lib/storage';

const MAX_VIDEOS_PER_SHOW = 3;

export default function VideoPicker({ videos = [], onChange, userId, showId }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState(null);

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
      picked.map(async (f) => {
        try {
          const url = await uploadShowVideo(f, userId, showId);
          current = [...current, url];
          onChange(current);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[Melo] video upload failed', err);
          setError(err?.message || 'Upload failed');
        } finally {
          setUploading((n) => n - 1);
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
        {videos.map((url) => (
          <div key={url} className="photo-picker-tile" style={{ background: '#17120C' }}>
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
            <button
              type="button"
              className="photo-picker-remove"
              onClick={() => handleRemove(url)}
              aria-label="Remove video"
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
      </div>

      {/* The real limit is SIZE, not duration — 45MB is ~15s of 4K but ~40s of
          1080p, so a flat "60s max" was a promise the byte cap always broke
          first. Say what actually binds. */}
      <div className="log-section-hint" style={{ marginTop: 6 }}>
        Up to {MAX_VIDEOS_PER_SHOW} clips · {VIDEO_MAX_MB}MB each
        {' '}(~15s at 4K, ~40s at 1080p)
      </div>

      {error && <div className="photo-picker-error">{error}</div>}
    </div>
  );
}
