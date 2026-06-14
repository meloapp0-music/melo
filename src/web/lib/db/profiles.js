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
    avatarUrl: row.avatar_url || '',
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

// Read another user's profile by id. RLS allows this when the profile is
// searchable, is yours, or you have a friendship row with them.
export async function getProfileById(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return fromRow(data);
}

// Batch profile lookup → Map(id → profile). RLS silently drops rows the
// viewer can't see (e.g. a non-searchable non-friend), so callers must
// tolerate missing ids — that's the privacy filter for co-attendees:
// only discoverable people resolve to a tappable profile.
export async function getProfilesByIds(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('id', unique);
  if (error) throw error;
  return new Map((data || []).map((r) => [r.id, fromRow(r)]));
}

export async function updateMyProfile(patch) {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error('Not signed in');

  const row = {};
  if ('username' in patch) row.username = String(patch.username || '').trim().toLowerCase();
  if ('displayName' in patch) row.display_name = patch.displayName || '';
  if ('avatarColor' in patch) row.avatar_color = patch.avatarColor || '#E8573A';
  if ('avatarUrl' in patch) row.avatar_url = patch.avatarUrl || '';
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

// Username/display-name search for friend discovery. Returns up to 20
// searchable profiles matching the query, excluding yourself and anyone
// blocked in either direction. Per buddies-phase-2.
export async function searchUsers(query) {
  const raw = String(query || '').trim();
  if (raw.length < 2) return [];
  // Usernames are [a-z0-9_]; strip chars that would break the PostgREST
  // `or=ilike` filter (commas, parens, percent).
  const q = raw.replace(/[%,()]/g, '');
  if (!q) return [];

  const { data: { user } } = await supabase.auth.getUser();
  const me = user?.id;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_color, avatar_url, bio')
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .eq('is_searchable', true)
    .limit(20);
  if (error) throw error;

  let results = (data || []).filter((p) => p.id !== me);

  // Exclude blocked users (either direction).
  if (me && results.length) {
    const { data: blocks } = await supabase
      .from('blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${me},blocked_id.eq.${me}`);
    const blocked = new Set();
    (blocks || []).forEach((b) => {
      blocked.add(b.blocker_id === me ? b.blocked_id : b.blocker_id);
    });
    results = results.filter((p) => !blocked.has(p.id));
  }

  return results.map((p) => ({
    id: p.id,
    username: p.username || '',
    displayName: p.display_name || '',
    avatarColor: p.avatar_color || '#E8573A',
    avatarUrl: p.avatar_url || '',
    bio: p.bio || '',
  }));
}
