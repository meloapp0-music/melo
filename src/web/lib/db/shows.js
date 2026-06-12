// db/shows.js — CRUD for the shows table.
// The app shape is camelCase (legacy localStorage format).
// Postgres columns are snake_case. This module does the mapping.

import { supabase } from '../supabase';

// Backfill `status` from legacy `wishlist` boolean for rows that
// haven't been migrated yet (or for any in-flight payload that only
// sets the boolean). Mirror of `getShowStatus()` in store.js but
// inlined to keep the db layer free of UI imports.
function deriveStatus(input) {
  if (input?.status) return input.status;
  return input?.wishlist ? 'wishlist' : 'attended';
}

function fromRow(row) {
  if (!row) return null;
  const status = deriveStatus(row);
  return {
    id: row.id,
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
    festival: row.festival || '',
    venueUrl: row.venue_url || '',
    battleWins: row.battle_wins ?? 0,
    isFavorite: row.is_favorite ?? false,
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
