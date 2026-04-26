// db/profiles.js — read + update the current user's profile row.
// Phase 2 will add searchUsers() for friend discovery.

import { supabase } from '../supabase';

function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || '',
    avatarColor: row.avatar_color || '#E8573A',
    bio: row.bio || '',
    isSearchable: row.is_searchable !== false,
    showsVisibility: row.shows_visibility || 'friends',
    createdAt: row.created_at,
  };
}

export async function getMyProfile() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', (await supabase.auth.getUser()).data.user?.id)
    .maybeSingle();
  if (error) throw error;
  return fromRow(data);
}

export async function updateMyProfile(patch) {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error('Not signed in');

  const row = {};
  if ('username' in patch) row.username = String(patch.username || '').trim().toLowerCase();
  if ('displayName' in patch) row.display_name = patch.displayName || '';
  if ('avatarColor' in patch) row.avatar_color = patch.avatarColor || '#E8573A';
  if ('bio' in patch) row.bio = patch.bio || '';
  if ('isSearchable' in patch) row.is_searchable = !!patch.isSearchable;
  if ('showsVisibility' in patch) row.shows_visibility = patch.showsVisibility;

  const { data, error } = await supabase
    .from('profiles')
    .update(row)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
}

// Returns true if the username is free (or already owned by the current user).
export async function checkUsernameAvailable(username) {
  const u = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(u)) return false;
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', u)
    .maybeSingle();
  if (error) throw error;
  if (!data) return true;
  return data.id === user?.id;
}

// Placeholder for Phase 2 — returns [] for now so the UI can be wired up.
export async function searchUsers(_query) {
  return [];
}
