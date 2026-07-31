// PhotoBackfill — turn a camera roll into a back catalogue.
// =========================================================
// Every metric in Melo depends on library size. The ranking needs something to
// compare against, the drawer needs stubs, the receipt needs "3rd time seeing
// them", anniversaries need a past. And the user's camera roll ALREADY contains
// every show they've been to — it's just unstructured.
//
// SCOPE, honestly: nothing here scans the library in the background. No
// installed Capacitor plugin can enumerate photos with metadata, so that needs
// native work and an App Store round-trip. What this does instead is let the
// user hand over a batch (iOS's picker has Select All), read each photo's EXIF
// capture time, and group them into nights. Same outcome — the user just
// initiates it.
//
// docs/initiatives/2026-07-30-camera-roll-backfill.md

import { useRef, useState } from 'react';
import { useApp } from '../App';
import { readCaptureTime } from '../lib/exif';
import { clusterPhotos, withoutLogged, likelyShows } from '../lib/photoClusters';
import { formatDate } from '../store';
import { track } from '../lib/analytics';

const timeRange = (c) => {
  const t = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return c.start.getTime() === c.end.getTime() ? t(c.start) : `${t(c.start)} – ${t(c.end)}`;
};

export default function PhotoBackfill({ onClose }) {
  const { shows, openOverlay } = useApp();
  const inputRef = useRef(null);
  const [phase, setPhase] = useState('intro'); // intro | reading | review
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [clusters, setClusters] = useState([]);
  // Tracked separately: "already in your library" and "didn't look like a
  // gig" are different facts, and reporting them as one number is a small lie.
  const [counts, setCounts] = useState({ known: 0, weak: 0 });
  const [dismissed, setDismissed] = useState(() => new Set());

  const handleFiles = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = ''; // so re-picking the same batch fires again
    if (!files.length) return;

    setPhase('reading');
    setProgress({ done: 0, total: files.length });
    track('backfill_scan_started', { photo_count: files.length });

    // Read serially in small batches. Reading 300 headers at once pins the main
    // thread on a phone and the progress bar stops moving, which reads as a
    // hang; this stays responsive and lets the count tick up.
    const items = [];
    for (let i = 0; i < files.length; i += 8) {
      const chunk = files.slice(i, i + 8);
      // eslint-disable-next-line no-await-in-loop
      const meta = await Promise.all(chunk.map(async (file) => ({ file, ...(await readCaptureTime(file)) })));
      items.push(...meta);
      setProgress({ done: Math.min(i + 8, files.length), total: files.length });
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 0)); // yield so the UI can paint
    }

    const all = clusterPhotos(items);
    const fresh = withoutLogged(all, shows);
    const good = likelyShows(fresh);
    setClusters(good);
    setCounts({ known: all.length - fresh.length, weak: fresh.length - good.length });
    setPhase('review');
    track('backfill_scan_finished', {
      photo_count: files.length, nights: all.length, suggested: good.length,
    });
  };

  // Hand a cluster to the fast log sheet, date and photos already filled in.
  const logIt = (c) => {
    track('backfill_accepted', { photos: c.photos.length, confidence: c.confidence });
    setDismissed((prev) => new Set(prev).add(c.date));
    onClose();
    openOverlay('quicklog', {
      prefill: {
        date: c.date,
        // The files ride along so the log sheet can upload them as the show's
        // photos — the whole point is that the evidence becomes the record.
        photoFiles: c.photos.map((p) => p.file),
      },
    });
  };

  const visible = clusters.filter((c) => !dismissed.has(c.date));

  return (
    <div className="backfill-overlay">
      <div className="backfill-sheet">
        <div className="log-handle" />
        <div className="quicklog-header">
          <h3>Find shows in your photos</h3>
          <button className="log-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {phase === 'intro' && (
          <div className="backfill-body">
            <p className="backfill-lede">
              Your camera roll already remembers every show you’ve been to. Pick a
              batch — a whole year is fine — and melo will group them into nights
              and work out which ones look like gigs.
            </p>
            <p className="backfill-note">
              Photos are read <b>on your phone</b> to get the date they were taken.
              Nothing is uploaded until you log a show.
            </p>
            <button className="backfill-cta" onClick={() => inputRef.current?.click()}>
              Choose photos
            </button>
          </div>
        )}

        {phase === 'reading' && (
          <div className="backfill-body">
            <div className="backfill-progress-num">
              {progress.done}<span>/{progress.total}</span>
            </div>
            <div className="backfill-progress-track">
              <div
                className="backfill-progress-fill"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="backfill-note">Reading capture dates…</p>
          </div>
        )}

        {phase === 'review' && (
          <div className="backfill-body">
            {visible.length === 0 ? (
              <>
                <p className="backfill-lede">
                  {clusters.length === 0
                    ? (counts.known > 0
                      ? `Nothing new there — ${counts.known} of those ${counts.known === 1 ? 'night is' : 'nights are'} already in your library.`
                      : 'No gig-shaped nights in that batch — mostly daytime photos.')
                    : 'That’s all of them. Nice haul.'}
                </p>
                <button className="backfill-cta" onClick={() => inputRef.current?.click()}>
                  Try another batch
                </button>
              </>
            ) : (
              <>
                <p className="backfill-lede">
                  {visible.length} {visible.length === 1 ? 'night looks' : 'nights look'} like a show.
                  {(counts.known > 0 || counts.weak > 0) && (
                    <span className="backfill-note">
                      {' '}
                      {[
                        counts.known ? `${counts.known} already in your library` : '',
                        counts.weak ? `${counts.weak} didn’t look gig-shaped` : '',
                      ].filter(Boolean).join(' · ')}.
                    </span>
                  )}
                </p>
                <div className="backfill-list">
                  {visible.map((c) => (
                    <div key={c.date} className="backfill-card">
                      <div className="backfill-card-main">
                        <div className="backfill-card-date">
                          {formatDate(c.date)}
                          {!c.exact && <span className="backfill-soft" title="Date came from the file, not the photo">approx</span>}
                        </div>
                        <div className="backfill-card-meta">
                          {c.photos.length} photos · {timeRange(c)}
                        </div>
                      </div>
                      <button className="backfill-log" onClick={() => logIt(c)}>Log it</button>
                      <button
                        className="backfill-skip"
                        aria-label="Not a show"
                        onClick={() => setDismissed((prev) => new Set(prev).add(c.date))}
                      >✕</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFiles}
        />
      </div>
    </div>
  );
}
