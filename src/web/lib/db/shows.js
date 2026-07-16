// db/shows.js — CRUD for the shows table.
// The app shape is camelCase (legacy localStorage format).
// Postgres columns are snake_case. This module does the mapping.

import { supabase } from '../supabase';
import { listFriends } from './friendships';

// Backfill `status` from legacy `wishlist` boolean for rows that
// haven't been migrated yet (or for any in-flight payload that only
// sets the boolean). Mirror of `getShowStatus()` in store.js but
// inlined to keep the db layer free of UI imports.
function deriveStatus(input) {
  if (input?.status) return input.status;
  return input?.wishlist ? 'wishlist' : 'attended';
}

// Festival grouping key — mirrors festivalKey() in store.js (kept inline so the
// db layer stays free of UI imports). `name|year`, or '' for non-festival shows.
function festKeyOf(festival, date) {
  const f = (festival || '').trim().toLowerCase();
  if (!f) return '';
  const yr = (date || '').slice(0, 4);
  return yr ? `${f}|${yr}` : f;
}

function fromRow(row) {
  if (!row) return null;
  const status = deriveStatus(row);
  return {
    id: row.id,
    userId: row.user_id,
    artist: row.artist,
    date: row.date,
    venue: row.venue || '',
    city: row.city || '',
    genre: row.genre || '',
    score: row.score == null ? null : Number(row.score),
    vibes: row.vibes || [],
    notes: row.notes || '',
    setlist: row.setlist || [],
    buddies: row.buddies || [],
    openers: row.openers || [],
    photos: row.photos || [],
    videos: row.videos || [],
    festival: row.festival || '',
    venueUrl: row.venue_url || '',
    battleWins: row.battle_wins ?? 0,
    isFavorite: row.is_favorite ?? false,
    // '' when the show has never been shared publicly (migration 0016).
    shareToken: row.share_token || '',
    status,
    wishlist: status === 'wishlist',
    visibility: row.visibility || null,
    createdAt: row.created_at,
  };
}

function toRow(show, userId) {
  const status = deriveStatus(show);
  const row = {
    id: show.id,
    user_id: userId,
    artist: show.artist,
    date: show.date,
    venue: show.venue || '',
    city: show.city || '',
    genre: show.genre || '',
    score: show.score == null ? null : Number(show.score),
    vibes: show.vibes || [],
    notes: show.notes || '',
    setlist: show.setlist || [],
    buddies: show.buddies || [],
    photos: show.photos || [],
    festival: show.festival || '',
    status,
    wishlist: status === 'wishlist',
    visibility: show.visibility || null,
  };
  // Only include `venue_url` when the caller actually has a value.
  // The column landed in migration 0006; sending it on a database
  // where 0006 hasn't been applied causes Supabase to reject the
  // INSERT with "column 'venue_url' does not exist" and the show
  // silently fails to save. Empty default is unrelated to the column
  // existing — this gate is purely about not naming a column we
  // don't need to set.
  if (show.venueUrl) row.venue_url = show.venueUrl;
  // Same defense for `battle_wins` (migration 0007).
  if (show.battleWins) row.battle_wins = show.battleWins;
  // Same defense for `is_favorite` (migration 0008).
  if (show.isFavorite) row.is_favorite = show.isFavorite;
  // Same defense for `openers` (migration 0009).
  if (Array.isArray(show.openers) && show.openers.length > 0) row.openers = show.openers;
  // Same defense for `videos` (migration 0014).
  if (Array.isArray(show.videos) && show.videos.length > 0) row.videos = show.videos;
  return row;
}

export async function listMyShows() {
  // MUST scope to the signed-in user. Migration 0010 added a friend-read
  // RLS policy on shows, so an unscoped select returns friends' visible
  // shows too — which leaked them into "my shows" (duplicate cards on
  // Home, inflated stats) the moment a friendship was accepted.
  // getSession() reads the locally-cached session (no network hop):
  // getUser() here would add a boot-time round trip whose transient
  // failure rejects App.jsx's load Promise.all and strands the splash.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('shows')
    .select('*')
    .eq('user_id', session.user.id)
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []).map(fromRow);
}

// Recent shows across a set of friends — the home feed. RLS enforces
// PROFILE-level visibility per owner (can_view_shows checks
// shows_visibility; the per-show `visibility` column is not yet
// consulted by any policy — don't rely on it here). Ordering by
// created_at makes it an activity feed ("Claire just logged …"), not a
// concert-date timeline. Each item carries its owner's userId.
export async function listFriendsShows(friendIds, limit = 30) {
  if (!Array.isArray(friendIds) || friendIds.length === 0) return [];
  const { data, error } = await supabase
    .from('shows')
    .select('*')
    .in('user_id', friendIds)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((r) => ({ ...fromRow(r), userId: r.user_id }));
}

// A friend's shows. RLS (can_view_shows) enforces visibility — this
// returns rows only if the viewer is allowed to see them. Per
// buddies-phase-2 (friend profiles + "shows together").
export async function listUserShows(userId) {
  const { data, error } = await supabase
    .from('shows')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []).map(fromRow);
}

// Lightweight full-history pull for a set of friends — just the columns
// the feed needs to compute ACCURATE milestones (Nth-show ordinals) and
// year recaps. RLS filters to shows the viewer may see. One query for
// all friends. Per docs/initiatives/2026-06-14-social-feed-likes-comments.md.
export async function friendsShowStats(friendIds) {
  const ids = [...new Set((friendIds || []).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from('shows')
    .select('id, user_id, date, status, wishlist, city')
    .in('user_id', ids);
  if (error) throw error;
  const map = new Map();
  for (const r of data || []) {
    const arr = map.get(r.user_id) || [];
    arr.push(r);
    map.set(r.user_id, arr);
  }
  return map;
}

// ---- show attendees (tag a real friend on a show you own) ----
export async function tagAttendee(showId, userId) {
  const { error } = await supabase
    .from('show_attendees')
    .upsert({ show_id: showId, user_id: userId }, { onConflict: 'show_id,user_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function untagAttendee(showId, userId) {
  const { error } = await supabase
    .from('show_attendees')
    .delete()
    .eq('show_id', showId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function listAttendees(showId) {
  const { data, error } = await supabase
    .from('show_attendees')
    .select('user_id, confirmed_at')
    .eq('show_id', showId);
  if (error) throw error;
  return data || [];
}

// Batch: tagged attendees for a set of shows → Map(showId → [userId]).
// RLS (0011 "attendees read for viewers") returns rows only for shows
// the viewer can see. For the feed's "going with …" line.
export async function attendeesForShows(showIds) {
  const ids = [...new Set((showIds || []).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from('show_attendees')
    .select('show_id, user_id')
    .in('show_id', ids);
  if (error) throw error;
  const map = new Map();
  for (const r of data || []) {
    const arr = map.get(r.show_id) || [];
    arr.push(r.user_id);
    map.set(r.show_id, arr);
  }
  return map;
}

// Friends (per the friend graph) who INDEPENDENTLY logged a show matching one of
// the given (artist, date) pairs with the given status — i.e. going to / were at
// the same show WITHOUT being explicitly tagged. Returns
// Map(`${artistLower}|${date}` → [userId]). RLS also limits rows to shows the
// viewer may see. Powers "going with …" beyond tagged co-attendees.
// Pairs: { artist, date, festival? }. A FESTIVAL pair matches any friend who
// logged the SAME festival (name+year) with the matching status — regardless of
// which acts/days they picked (loosened, per user request). A non-festival pair
// matches the exact artist+date. Returned Map keys are the festivalKey for
// festival pairs, else `${artistLower}|${date}` — callers look up with the same.
export async function friendsMatchingShows(pairs, status = 'going') {
  const clean = (pairs || []).filter((p) => p?.date && (p.artist || p.festival));
  if (!clean.length) return new Map();
  const friends = await listFriends().catch(() => []);
  const friendIds = friends.map((f) => f.userId).filter(Boolean);
  if (!friendIds.length) return new Map();

  const festPairs = clean.filter((p) => (p.festival || '').trim());
  const soloPairs = clean.filter((p) => !(p.festival || '').trim());
  const dates = [...new Set(soloPairs.map((p) => p.date))];
  const wantedSolo = new Set(soloPairs.map((p) => `${p.artist.toLowerCase().trim()}|${p.date}`));
  const wantedFest = new Set(festPairs.map((p) => festKeyOf(p.festival, p.date)));

  const base = () => supabase
    .from('shows')
    .select('user_id, artist, date, status, wishlist, festival')
    .in('user_id', friendIds);
  const rows = [];
  if (dates.length) {
    const { data } = await base().in('date', dates);
    if (data) rows.push(...data);
  }
  if (festPairs.length) {
    // `festival` is free text and festKeyOf() lowercases, so an exact
    // `.in('festival', names)` filter silently misses a friend whose row says
    // "lollapalooza" (or carries different whitespace from another resolver
    // path) — the case-insensitive key downstream never gets to see the row.
    // Pull the friends' festival rows and let festKeyOf do the matching, which
    // is what actually defines equality here. Bounded: friends only, and only
    // rows that carry a festival at all.
    const { data } = await base().not('festival', 'is', null).neq('festival', '');
    if (data) rows.push(...data);
  }

  const map = new Map();
  const add = (key, uid) => {
    const arr = map.get(key) || [];
    if (!arr.includes(uid)) arr.push(uid);
    map.set(key, arr);
  };
  const seen = new Set();
  for (const r of rows) {
    const dedupe = `${r.user_id}|${r.artist}|${r.date}|${r.festival || ''}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const rStatus = r.status || (r.wishlist ? 'wishlist' : 'attended');
    if (rStatus !== status) continue;
    const fk = festKeyOf(r.festival, r.date);
    if (fk && wantedFest.has(fk)) add(fk, r.user_id);           // festival-level (any day)
    const ek = `${(r.artist || '').toLowerCase().trim()}|${r.date}`;
    if (wantedSolo.has(ek)) add(ek, r.user_id);                 // exact artist+date
  }
  return map;
}

export async function createShow(show, userId) {
  const row = toRow(show, userId);
  // If the caller supplied its own id (the legacy store generated short IDs),
  // let Postgres ignore it and use the default uuid — the returned row is
  // what the caller should keep.
  delete row.id;
  const { data, error } = await supabase
    .from('shows')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
}

// Batch insert — used by the festival finder's multi-select "Log N
// shows" action. One round-trip instead of N. Per
// docs/initiatives/2026-05-21-festival-past-show-finder.md.
export async function createShows(shows, userId) {
  if (!Array.isArray(shows) || shows.length === 0) return [];
  const rows = shows.map((s) => {
    const row = toRow(s, userId);
    delete row.id; // let Postgres assign uuids
    return row;
  });
  const { data, error } = await supabase
    .from('shows')
    .insert(rows)
    .select();
  if (error) throw error;
  return (data || []).map(fromRow);
}

export async function updateShow(id, updates, userId) {
  // Build a partial patch — only the fields actually supplied.
  const patch = {};
  const map = {
    artist: 'artist',
    date: 'date',
    venue: 'venue',
    city: 'city',
    genre: 'genre',
    score: 'score',
    vibes: 'vibes',
    notes: 'notes',
    setlist: 'setlist',
    buddies: 'buddies',
    openers: 'openers',
    photos: 'photos',
    videos: 'videos',
    festival: 'festival',
    venueUrl: 'venue_url',
    battleWins: 'battle_wins',
    isFavorite: 'is_favorite',
    status: 'status',
    wishlist: 'wishlist',
    visibility: 'visibility',
  };
  Object.entries(updates).forEach(([k, v]) => {
    if (map[k]) patch[map[k]] = v;
  });
  // Keep the legacy `wishlist` shadow in sync when the caller patches
  // status directly (e.g. flipping a Going show to Attended).
  if (updates.status && updates.wishlist === undefined) {
    patch.wishlist = updates.status === 'wishlist';
  }
  const { data, error } = await supabase
    .from('shows')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
}

export async function deleteShow(id, userId) {
  const { error } = await supabase
    .from('shows')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

// ===== Public share links (migration 0016) =====
// A show is private until the owner shares it. The token IS the credential for
// the public page (melo.show/s/<token>), so it must be unguessable — generated
// from crypto.getRandomValues, never Math.random.

const TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const TOKEN_LENGTH = 22; // 36^22 ≈ 2^113 — not enumerable

function generateShareToken() {
  const bytes = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    // Modulo bias across 36 of 256 values is negligible at this entropy.
    out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return out;
}

/** The show's existing share token, minting one on first share. Idempotent —
 *  re-sharing the same show keeps the same URL, so a link already out in the
 *  world never breaks. Returns the token. */
export async function ensureShareToken(showId, userId) {
  if (!showId || !userId) throw new Error('ensureShareToken: missing arg');

  const { data: existing, error: readErr } = await supabase
    .from('shows')
    .select('share_token')
    .eq('id', showId)
    .eq('user_id', userId)
    .single();
  if (readErr) throw readErr;
  if (existing?.share_token) return existing.share_token;

  const token = generateShareToken();
  const { data, error } = await supabase
    .from('shows')
    .update({ share_token: token })
    .eq('id', showId)
    .eq('user_id', userId)
    .select('share_token')
    .single();
  if (error) throw error;
  return data.share_token;
}

/** Stop sharing — nulls the token so the public page 404s.
 *
 *  HONEST LIMIT (surfaced in the UI copy, do not overstate): this removes the
 *  PAGE. photos[]/videos[] live in public-read Storage buckets, so anyone who
 *  already saved a media URL keeps it. Real revocation needs a signed-URL
 *  redesign — see docs/initiatives/2026-06-23-public-share-pages.md. */
export async function revokeShareToken(showId, userId) {
  if (!showId || !userId) throw new Error('revokeShareToken: missing arg');
  const { error } = await supabase
    .from('shows')
    .update({ share_token: null })
    .eq('id', showId)
    .eq('user_id', userId);
  if (error) throw error;
}
