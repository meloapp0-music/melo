// ImportFromCalendar — first-run backlog importer.
//
// Reads the user's iOS Calendar (via lib/calendar.js), filters down
// to events that look like concerts (have a location, don't match
// common non-concert keywords), and presents a checkbox grid. The
// user disambiguates which ones were actually shows; we batch-add
// them as `attended` rows.
//
// We deliberately avoid Ticketmaster lookups here — too rate-limit-
// heavy, and the user reading their own calendar is the cheapest
// "is this a concert?" signal we have.
//
// Available two ways:
//   - Onboarding step (skippable, native-only)
//   - Settings → About → "Import past shows from Calendar"
//
// Both routes mount this component the same way; the `onDone`
// callback decides what "done" means in each context.

import { useState, useEffect } from 'react';
import { useApp } from '../App';
import { scanCalendar, looksLikeConcert } from '../lib/calendar';
import { generateId, formatDate, SHOW_STATUS } from '../store';
import { Capacitor } from '@capacitor/core';

const VENUE_REGEX = /\b(Arena|Stadium|Theater|Theatre|Hall|Amphitheater|Amphitheatre|Pavilion|Center|Centre|Club|Lounge|Park|Field|Garden|Bowl|Ballroom)\b/i;

export default function ImportFromCalendar({ onDone }) {
  const { addShow } = useApp();
  const isNative = !!(Capacitor.isNativePlatform && Capacitor.isNativePlatform());

  const [phase, setPhase] = useState('idle'); // idle | scanning | picking | importing | done
  const [error, setError] = useState(null);
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState({}); // id -> bool
  const [importedCount, setImportedCount] = useState(0);

  useEffect(() => {
    // Pre-check the events that look like concerts so the user starts
    // from a sensible default state.
    const next = {};
    for (const ev of events) {
      if (looksLikeConcert(ev)) next[ev.id] = true;
    }
    setSelected(next);
  }, [events]);

  const startScan = async () => {
    setError(null);
    setPhase('scanning');
    const res = await scanCalendar();
    if (!res.ok) {
      const reasons = {
        'not-native': 'Calendar import is iOS-only. Open Melo on your iPhone to use this.',
        'plugin-missing': 'Calendar plugin not installed yet. Run npm install and rebuild the iOS app.',
        'permission-denied': 'Calendar access is required. Open Settings → Melo → Calendar to enable.',
      };
      setError(reasons[res.reason] || `Couldn't read your calendar: ${res.reason}`);
      setPhase('idle');
      return;
    }
    if (!res.events.length) {
      setError('No events found in the last 5 years.');
      setPhase('idle');
      return;
    }
    setEvents(res.events);
    setPhase('picking');
  };

  const toggle = (id) => setSelected((s) => ({ ...s, [id]: !s[id] }));

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const importSelected = async () => {
    const picks = events.filter((e) => selected[e.id]);
    if (!picks.length) {
      onDone?.();
      return;
    }
    setPhase('importing');
    let n = 0;
    for (const ev of picks) {
      // Best-effort field mapping. The user can edit any of these
      // later from the show detail / log screen.
      const { artist, venue } = splitTitleAndVenue(ev.title, ev.location);
      try {
        await addShow({
          id: generateId(),
          artist,
          date: ev.date,
          venue,
          city: extractCity(ev.location),
          genre: '',
          score: 0,
          vibes: [],
          notes: 'Imported from Calendar',
          setlist: [],
          buddies: [],
          status: SHOW_STATUS.ATTENDED,
          wishlist: false,
          createdAt: new Date().toISOString(),
        });
        n++;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[Melo] import row failed', ev, err);
      }
    }
    setImportedCount(n);
    setPhase('done');
  };

  return (
    <div className="page page-top import-cal-page">
      <h1>Import from Calendar</h1>
      <p className="settings-desc">
        Drain your concert backlog in one shot. Melo reads your iPhone Calendar and
        you tick the events that were actually shows.
      </p>

      {phase === 'idle' && (
        <>
          {!isNative && (
            <div className="import-cal-empty">
              Calendar import only works on iPhone. Pop open Melo on iOS to use it.
            </div>
          )}
          {isNative && (
            <button className="settings-save-btn" onClick={startScan}>
              Scan my Calendar
            </button>
          )}
          {error && <div className="auth-error" style={{ marginTop: 16 }}>{error}</div>}
          <div style={{ marginTop: 24 }}>
            <button className="settings-danger-btn" onClick={() => onDone?.()}>
              Skip for now
            </button>
          </div>
        </>
      )}

      {phase === 'scanning' && (
        <div className="import-cal-empty">Reading your calendar…</div>
      )}

      {phase === 'picking' && (
        <>
          <div className="import-cal-summary">
            Found {events.length} event{events.length === 1 ? '' : 's'} ·{' '}
            <strong>{selectedCount}</strong> selected
          </div>
          <div className="import-cal-list">
            {events.map((ev) => (
              <label key={ev.id} className={`import-cal-row ${selected[ev.id] ? 'is-checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={!!selected[ev.id]}
                  onChange={() => toggle(ev.id)}
                />
                <div className="import-cal-row-body">
                  <div className="import-cal-row-title">{ev.title}</div>
                  <div className="import-cal-row-meta">
                    {formatDate(ev.date)}
                    {ev.location ? ` · ${ev.location}` : ''}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <button
            className="settings-save-btn import-cal-import-btn"
            onClick={importSelected}
            disabled={selectedCount === 0}
          >
            Import {selectedCount || ''} show{selectedCount === 1 ? '' : 's'}
          </button>
        </>
      )}

      {phase === 'importing' && (
        <div className="import-cal-empty">Importing your shows…</div>
      )}

      {phase === 'done' && (
        <>
          <div className="import-cal-empty">
            ✨ Imported {importedCount} show{importedCount === 1 ? '' : 's'}. You can
            edit details on each show whenever you like.
          </div>
          <button className="settings-save-btn" onClick={() => onDone?.()}>
            Done
          </button>
        </>
      )}
    </div>
  );
}

// Calendar event titles vary wildly. Common patterns:
//   "Phoebe Bridgers @ Salt Shed"
//   "Phoebe Bridgers - Salt Shed"
//   "Phoebe Bridgers concert"
//   "Salt Shed: Phoebe Bridgers"
// We try to split on common separators when there's a venue-looking
// fragment; otherwise we use the title as the artist and the
// location as the venue.
function splitTitleAndVenue(title, location) {
  const t = (title || '').trim();
  const loc = (location || '').trim();

  // Pattern: "Artist @ Venue" or "Artist - Venue"
  const m = t.match(/^(.+?)\s*[@\-–]\s*(.+)$/);
  if (m) {
    const left = m[1].trim();
    const right = m[2].trim();
    if (VENUE_REGEX.test(right)) return { artist: left, venue: right };
    if (VENUE_REGEX.test(left)) return { artist: right, venue: left };
    // Default to "left = artist, right = venue".
    return { artist: left, venue: right };
  }

  // Pattern: "Venue: Artist"
  if (t.includes(':')) {
    const [a, b] = t.split(':').map((s) => s.trim());
    if (VENUE_REGEX.test(a)) return { artist: b, venue: a };
  }

  // Fallback: title is the artist, location is the venue.
  // Strip "concert" suffix if present.
  const cleaned = t.replace(/\bconcert\b/i, '').trim();
  return { artist: cleaned || t, venue: loc.split(',')[0] || loc };
}

function extractCity(location) {
  if (!location) return '';
  // Simple heuristic: location often looks like "Salt Shed, Chicago, IL"
  // or "1300 W Carroll Ave, Chicago, IL". Pick the second-to-last
  // comma-separated token if there are 2+ commas.
  const parts = location.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 2];
  if (parts.length === 2) return parts[1];
  return '';
}
