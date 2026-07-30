// QuickLog — the fast path. Four taps from + to logged.
// =====================================================
// This is what the `+` button opens. LogShow is still there, one tap away, for
// anything richer — but the common case is "I just saw this", and that case was
// paying for thirteen sections behind two levels of segmented control.
//
// The four taps: `+` → type a few letters → tap the show row → tap a score →
// Save. Everything else (venue, city, date, festival, the whole setlist) comes
// from the picked row for free. That autofill IS the speed; without it this is
// four text inputs and no faster than the long form.
//
// Deliberately NOT here: Going/Wishlist. The fast case is a show you've been
// to; planning is a different job and gets one quiet link to the full sheet.
//
// docs/initiatives/2026-07-28-ia-simplification.md

import { useEffect, useRef, useState } from 'react';
import { useApp } from '../App';
import { generateId, SHOW_STATUS } from '../store';
import { BUCKETS, bucketScore } from '../lib/ranking';
import { track } from '../lib/analytics';
import ArtistShowPicker from './ArtistShowPicker';

export default function QuickLog({ onClose, onOpenFull }) {
  const { addShow, showToast, setSelectedShow, settings } = useApp();
  // Default to yesterday: the common case is logging the morning after, which
  // is also when the recap push lands.
  //
  // Built from LOCAL date parts, not toISOString(). toISOString() is UTC, so
  // west of Greenwich "now minus 24h" serialises back to *today* for most of
  // the evening — the exact class of bug App.jsx's localDayKey() exists for.
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const [artist, setArtist] = useState('');
  const [venue, setVenue] = useState('');
  const [city, setCity] = useState('');
  const [date, setDate] = useState(yesterday);
  // The coarse gut call. Stored as a representative number in `score`.
  const [bucket, setBucket] = useState(null);
  const [setlist, setSetlist] = useState([]);
  const [festival, setFestival] = useState('');
  // True once a real upstream row filled the details in — drives whether we
  // show a confirmation line or ask for the venue by hand.
  const [autofilled, setAutofilled] = useState(false);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  // Same funnel as the full sheet, tagged by surface — otherwise switching the
  // `+` button would zero out show_logged and the dashboards would quietly lie.
  const submitted = useRef(false);
  useEffect(() => {
    track('show_log_started', { is_edit: false, surface: 'quick' });
    return () => {
      if (!submitted.current) track('show_log_abandoned', { is_edit: false, surface: 'quick' });
    };
  }, []);

  const applyPick = (draft) => {
    if (draft.artist) setArtist(draft.artist);
    setError(false);
    if (draft.kind !== 'show') return;
    if (draft.venue) setVenue(draft.venue);
    if (draft.city) setCity(draft.city);
    if (draft.date) setDate(draft.date);
    if (draft.festival) setFestival(draft.festival);
    if (draft.songs?.length) setSetlist(draft.songs);
    setAutofilled(!!(draft.venue || draft.city || draft.date));
  };

  /** The draft handed to LogShow so nothing typed here is lost. */
  const draft = () => ({
    status: SHOW_STATUS.ATTENDED,
    artist: artist.trim(),
    date,
    venue: venue.trim(),
    city: city.trim(),
    festival,
    score: bucketScore(bucket),
    setlist,
  });

  const handleSave = async () => {
    if (saving) return;
    const name = artist.trim();
    if (!name) { setError(true); return; }
    setSaving(true);
    submitted.current = true;
    track('show_logged', {
      status: SHOW_STATUS.ATTENDED,
      is_edit: false,
      surface: 'quick',
      has_setlist: setlist.length > 0,
      has_photos: false,
      has_videos: false,
      score_set: !!bucket,
      bucket: bucket || 'none',
    });
    // Close first so the toast doesn't land behind the dimmed backdrop.
    onClose();
    // Full payload shape, matching LogShow's — a partial row here would make
    // a quick-logged show read differently everywhere downstream.
    const saved = await addShow({
      id: generateId(),
      artist: name,
      date: date || new Date().toISOString().split('T')[0],
      city: city.trim(),
      venue: venue.trim(),
      venueUrl: '',
      festival,
      genre: '',
      score: bucketScore(bucket),
      vibes: [],
      notes: '',
      setlist,
      buddies: [],
      openers: [],
      photos: [],
      videos: [],
      status: SHOW_STATUS.ATTENDED,
      wishlist: false,
      createdAt: new Date().toISOString(),
    });
    showToast?.({
      message: `✓ Logged ${name}`,
      onClick: saved?.id ? () => setSelectedShow(saved) : undefined,
    });
  };

  // Hand off to the full sheet WITH everything typed so far. This used to throw
  // the draft away and open a blank form.
  const openFull = (extra = {}) => {
    submitted.current = true; // handed off, not abandoned
    onOpenFull?.({ ...draft(), ...extra });
  };

  return (
    <div className="quicklog-overlay">
      <div className="quicklog-backdrop" onClick={onClose} />
      <div className="quicklog-sheet">
        <div className="log-handle" />
        <div className="quicklog-header">
          <h3>Log a show</h3>
          <button className="log-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="quicklog-body">
          <ArtistShowPicker
            value={artist}
            onChange={(v) => { setArtist(v); setError(false); setAutofilled(false); }}
            onPick={applyPick}
            mode="attended"
            city={city}
            date={date}
            apiKey={settings?.setlistFmKey || ''}
            error={error}
            autoFocus
          />

          {/* Picking a real row fills venue, city, date and the setlist. Show
              that as a confirmation rather than as four more inputs — the whole
              point is that the user doesn't have to type them. */}
          {autofilled ? (
            <div className="quicklog-filled">
              <span className="quicklog-filled-line">
                📍 {[venue, city].filter(Boolean).join(' · ') || 'Venue added'}
              </span>
              {setlist.length > 0 && (
                <span className="quicklog-filled-line">🎵 {setlist.length} songs from the setlist</span>
              )}
            </div>
          ) : (
            <input
              className="log-input"
              placeholder="Venue (optional)"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
            />
          )}

          <input className="log-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

          {/* Three options, not ten. A ten-point scale asks for precision
              nobody has on the way home, and the answers pile up at 8–10
              anyway. This is the gut call; the duel does the fine ordering,
              and it only ever compares within the bucket you picked. */}
          <div className="bucket-row">
            {BUCKETS.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`bucket-btn${bucket === b.id ? ' active' : ''} bucket-${b.id}`}
                onClick={() => setBucket(bucket === b.id ? null : b.id)}
              >
                <span className="bucket-emoji" aria-hidden="true">{b.emoji}</span>
                <span className="bucket-label">{b.label}</span>
                <span className="bucket-hint">{b.hint}</span>
              </button>
            ))}
          </div>

          <button className="log-submit" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Log it'}
          </button>
          <button className="quicklog-full-btn" onClick={() => openFull()}>
            Add photos, vibes &amp; more →
          </button>
          {/* Planning ahead is a different job — one quiet door, not a third
              segmented control on the fast path. */}
          <button
            className="quicklog-going-btn"
            onClick={() => openFull({ status: SHOW_STATUS.GOING, mode: 'tour' })}
          >
            Haven’t gone yet? Add an upcoming show
          </button>
        </div>
      </div>
    </div>
  );
}
