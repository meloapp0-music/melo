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
    photos: row.photos || [],
    festival: row.festival || '',
    venueUrl: row.venue_url || '',
    status,
    wishlist: status === 'wishlist',
    visibility: row.visibility || null,
    createdAt: row.created_at,
  };
}

function toRow(show, userId) {
  const status = deriveStatus(show);
  return {
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
    venue_url: show.venueUrl || '',
    status,
    wishlist: status === 'wishlist',
    visibility: show.visibility || null,
  };
}

export async function listMyShows() {
  const { data, error } = await supabase
    .from('shows')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []).map(fromRow);
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
    photos: 'photos',
    festival: 'festival',
    venueUrl: 'venue_url',
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
