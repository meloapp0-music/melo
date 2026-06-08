// db/friendships.js — the two-way friend graph + safety (blocks/reports).
// Per docs/initiatives/2026-05-05-buddies-phase-2.md.
//
// Friendships use a canonical pair (user_a < user_b) so a pair can never
// duplicate. We compute that ordering here and in the SQL identically
// (lowercase-hex uuids sort the same in JS string order and Postgres
// uuid order).

import { supabase } from '../supabase';

async function myId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  return user.id;
}

function pair(a, b) {
  return a < b ? [a, b] : [b, a];
}

// ---- mutations ----

export async function requestFriend(otherId) {
  const me = await myId();
  if (otherId === me) throw new Error("You can't friend yourself");
  const [user_a, user_b] = pair(me, otherId);
  const { error } = await supabase
    .from('friendships')
    .upsert(
      { user_a, user_b, status: 'pending', requested_by: me },
      { onConflict: 'user_a,user_b', ignoreDuplicates: true }
    );
  if (error) throw error;
}

export async function acceptFriend(otherId) {
  const me = await myId();
  const [user_a, user_b] = pair(me, otherId);
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('user_a', user_a)
    .eq('user_b', user_b);
  if (error) throw error;
}

// Decline a request OR remove an existing friend — both just delete the row.
export async function removeFriend(otherId) {
  const me = await myId();
  const [user_a, user_b] = pair(me, otherId);
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('user_a', user_a)
    .eq('user_b', user_b);
  if (error) throw error;
}
export const declineFriend = removeFriend;

// ---- safety ----

export async function blockUser(otherId) {
  const me = await myId();
  // Blocking also tears down any friendship/request between you.
  await removeFriend(otherId).catch(() => {});
  const { error } = await supabase
    .from('blocks')
    .upsert({ blocker_id: me, blocked_id: otherId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function unblockUser(otherId) {
  const me = await myId();
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', me)
    .eq('blocked_id', otherId);
  if (error) throw error;
}

export async function listBlocked() {
  const me = await myId();
  const { data, error } = await supabase
    .from('blocks')
    .select('blocked_id')
    .eq('blocker_id', me);
  if (error) throw error;
  return (data || []).map((b) => b.blocked_id);
}

export async function reportUser(otherId, reason) {
  const me = await myId();
  const { error } = await supabase
    .from('user_reports')
    .insert({ reporter_id: me, reported_id: otherId, reason: reason || null });
  if (error) throw error;
}

// ---- queries ----

// Resolve a list of friendship rows into the OTHER person's profile.
async function hydrate(rows, me) {
  const otherIds = [...new Set(rows.map((r) => (r.user_a === me ? r.user_b : r.user_a)))];
  if (otherIds.length === 0) return [];
  const { data: profs, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_color, avatar_url, bio')
    .in('id', otherIds);
  if (error) throw error;
  const byId = Object.fromEntries((profs || []).map((p) => [p.id, p]));
  return rows.map((r) => {
    const oid = r.user_a === me ? r.user_b : r.user_a;
    const p = byId[oid] || {};
    return {
      userId: oid,
      username: p.username || '',
      displayName: p.display_name || '',
      avatarColor: p.avatar_color || '#E8573A',
      avatarUrl: p.avatar_url || '',
      bio: p.bio || '',
      status: r.status,
      requestedBy: r.requested_by,
      createdAt: r.created_at,
    };
  });
}

export async function listFriends() {
  const me = await myId();
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .eq('status', 'accepted')
    .or(`user_a.eq.${me},user_b.eq.${me}`);
  if (error) throw error;
  return hydrate(data || [], me);
}

export async function listIncomingRequests() {
  const me = await myId();
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .eq('status', 'pending')
    .neq('requested_by', me)
    .or(`user_a.eq.${me},user_b.eq.${me}`);
  if (error) throw error;
  return hydrate(data || [], me);
}

export async function listOutgoingRequests() {
  const me = await myId();
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .eq('status', 'pending')
    .eq('requested_by', me);
  if (error) throw error;
  return hydrate(data || [], me);
}

// Returns a map of otherUserId -> 'friends' | 'incoming' | 'outgoing' so
// the UI (search results, profiles) can show the right button.
export async function getRelationships() {
  const me = await myId();
  const { data, error } = await supabase
    .from('friendships')
    .select('user_a, user_b, status, requested_by')
    .or(`user_a.eq.${me},user_b.eq.${me}`);
  if (error) throw error;
  const map = {};
  (data || []).forEach((r) => {
    const oid = r.user_a === me ? r.user_b : r.user_a;
    if (r.status === 'accepted') map[oid] = 'friends';
    else if (r.requested_by === me) map[oid] = 'outgoing';
    else map[oid] = 'incoming';
  });
  return map;
}
