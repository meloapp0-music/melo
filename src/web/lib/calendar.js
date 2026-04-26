// lib/calendar.js — Capacitor Calendar wrapper for backlog import.
//
// The first-run pain point for Melo is staring at an empty grid when
// you've been to 50 shows. This module powers the "Import past shows
// from Calendar" flow: read the user's iOS Calendar, hand back a
// normalized event list, let the UI present a checkbox grid where
// the user picks which ones were actually concerts.
//
// We intentionally don't try to disambiguate against Ticketmaster —
// it's too rate-limit-heavy for the import surface, and the user
// reading their own calendar is the cheapest disambiguation possible.
//
// Web fallback: returns an empty array. ImportFromCalendar handles
// the empty state ("Calendar import is iOS only — open the app on
// your iPhone").

import { Capacitor } from '@capacitor/core';

// Calendar entries that almost never represent concerts. Used as a
// soft denylist when filtering events. Lowercased substring match.
const NON_CONCERT_HINTS = [
  'meeting', 'standup', 'stand-up', 'sync', '1:1', '1-1', 'one on one',
  'lunch', 'breakfast', 'dinner reservation',
  'dentist', 'doctor', 'appointment',
  'birthday', 'anniversary',
  'workout', 'gym', 'yoga', 'pilates', 'run', 'hike',
  'flight', 'travel', 'trip',
  'class', 'lecture', 'office hours',
  'interview', 'review', 'planning',
];

/** Read events between `since` and `until` (Date objects). Returns
 *  `{ title, date (YYYY-MM-DD), location, raw }`. Empty array on web
 *  or if permission is denied. */
export async function scanCalendar({ since, until } = {}) {
  if (!Capacitor.isNativePlatform || !Capacitor.isNativePlatform()) {
    return { ok: false, reason: 'not-native', events: [] };
  }

  let CapacitorCalendar;
  try {
    ({ CapacitorCalendar } = await import(/* @vite-ignore */ '@ebarooni/capacitor-calendar'));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[Melo] @ebarooni/capacitor-calendar not installed; skipping calendar import');
    return { ok: false, reason: 'plugin-missing', events: [] };
  }

  // Default window: last 5 years → next month. Anything older than 5
  // years is unlikely to be useful and inflates the picker.
  const now = new Date();
  const sinceMs = (since || new Date(now.getFullYear() - 5, now.getMonth(), now.getDate())).getTime();
  const untilMs = (until || new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())).getTime();

  try {
    // Permission. The plugin's API surface differs slightly between
    // versions; we try the most common shape and fall through.
    if (typeof CapacitorCalendar.requestReadOnlyCalendarAccess === 'function') {
      const perm = await CapacitorCalendar.requestReadOnlyCalendarAccess();
      if (perm?.result === false || perm?.granted === false) {
        return { ok: false, reason: 'permission-denied', events: [] };
      }
    } else if (typeof CapacitorCalendar.requestPermissions === 'function') {
      const perm = await CapacitorCalendar.requestPermissions();
      if (perm?.read !== 'granted' && perm?.calendar !== 'granted') {
        return { ok: false, reason: 'permission-denied', events: [] };
      }
    }

    const result = await CapacitorCalendar.listEventsInRange({
      from: sinceMs,
      to: untilMs,
    });
    const raw = result?.result || result?.events || [];
    const events = raw
      .map((ev) => normalizeEvent(ev))
      .filter(Boolean);
    return { ok: true, events };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Melo] scanCalendar failed', err);
    return { ok: false, reason: String(err), events: [] };
  }
}

/** Heuristic: an event "looks like a concert" if it has a location
 *  and the title doesn't match the soft denylist. Used to pre-check
 *  the picker boxes — the user is the final arbiter. */
export function looksLikeConcert(ev) {
  if (!ev?.title) return false;
  if (!ev?.location || !ev.location.trim()) return false;
  const lc = ev.title.toLowerCase();
  if (NON_CONCERT_HINTS.some((h) => lc.includes(h))) return false;
  return true;
}

function normalizeEvent(raw) {
  if (!raw) return null;
  const title = raw.title || raw.name || raw.summary || '';
  if (!title.trim()) return null;
  const startMs = raw.startDate || raw.start || raw.startTime || raw.startMs || null;
  if (!startMs) return null;
  const date = new Date(typeof startMs === 'number' ? startMs : Date.parse(startMs));
  if (isNaN(date.getTime())) return null;
  const iso = date.toISOString().split('T')[0];
  const location = raw.location || raw.eventLocation || '';
  return {
    id: raw.id || raw.eventId || `${title}|${iso}`,
    title: title.trim(),
    date: iso,
    location: typeof location === 'string' ? location.trim() : '',
    raw,
  };
}
