// db/social.js — reactions + comments on shows (the social layer).
// RLS (migration 0011) enforces "you can only touch interactions on a
// show you can view"; this module is the thin client over it. Per
// docs/initiatives/2026-06-14-social-feed-likes-comments.md.

import { supabase } from '../supabase';
import { getProfilesByIds } from './profiles';

async function myId() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

// ---- reactions ----

// Toggle/replace the current user's reaction on a show. Passing the
// same emoji again removes it (tap ❤️ twice = unlike); a different emoji
// replaces it. Returns the new emoji or null if cleared.
export async function setReaction(showId, emoji = '❤️') {
  const me = await myId();
  if (!me) throw new Error('Not signed in');
  // Is the same reaction already there? Then this is an un-react.
  const { data: existing } = await supabase
    .from('show_reactions')
    .select('emoji')
    .eq('show_id', showId)
    .eq('user_id', me)
    .maybeSingle();
  if (existing && existing.emoji === emoji) {
    const { error } = await supabase
      .from('show_reactions').delete().eq('show_id', showId).eq('user_id', me);
    if (error) throw error;
    return null;
  }
  const { error } = await supabase
    .from('show_reactions')
    .upsert({ show_id: showId, user_id: me, emoji }, { onConflict: 'show_id,user_id' });
  if (error) throw error;
  return emoji;
}

// Reaction summary for a set of shows → Map(showId → { count, byEmoji,
// mine }). One query; aggregated client-side. `mine` is the current
// user's emoji (or null).
export async function reactionSummary(showIds) {
  const ids = [...new Set((showIds || []).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const me = await myId();
  const { data, error } = await supabase
    .from('show_reactions')
    .select('show_id, user_id, emoji')
    .in('show_id', ids);
  if (error) throw error;
  const map = new Map();
  for (const r of data || []) {
    const e = map.get(r.show_id) || { count: 0, byEmoji: {}, mine: null };
    e.count += 1;
    e.byEmoji[r.emoji] = (e.byEmoji[r.emoji] || 0) + 1;
    if (r.user_id === me) e.mine = r.emoji;
    map.set(r.show_id, e);
  }
  return map;
}

// ---- comments ----

export async function addComment(showId, body) {
  const me = await myId();
  if (!me) throw new Error('Not signed in');
  const text = (body || '').trim();
  if (!text) throw new Error('Empty comment');
  const { data, error } = await supabase
    .from('show_comments')
    .insert({ show_id: showId, user_id: me, body: text.slice(0, 1000) })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, showId: data.show_id, userId: data.user_id, body: data.body, createdAt: data.created_at };
}

// Full comments for one show, hydrated with author profiles (RLS drops
// blocked authors automatically). Oldest-first reads like a thread.
export async function listComments(showId) {
  const { data, error } = await supabase
    .from('show_comments')
    .select('id, show_id, user_id, body, created_at')
    .eq('show_id', showId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = data || [];
  const profs = await getProfilesByIds(rows.map((r) => r.user_id));
  return rows.map((r) => ({
    id: r.id,
    showId: r.show_id,
    userId: r.user_id,
    body: r.body,
    createdAt: r.created_at,
    author: profs.get(r.user_id) || null,
  }));
}

// Comment counts for a set of shows → Map(showId → count). For the feed.
export async function commentCounts(showIds) {
  const ids = [...new Set((showIds || []).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from('show_comments')
    .select('show_id')
    .in('show_id', ids);
  if (error) throw error;
  const map = new Map();
  for (const r of data || []) map.set(r.show_id, (map.get(r.show_id) || 0) + 1);
  return map;
}

export async function deleteComment(commentId) {
  const { error } = await supabase.from('show_comments').delete().eq('id', commentId);
  if (error) throw error;
}

export async function reportComment(commentId, reason) {
  const me = await myId();
  if (!me) throw new Error('Not signed in');
  const { error } = await supabase
    .from('comment_reports')
    .insert({ reporter_id: me, comment_id: commentId, reason: reason || null });
  if (error) throw error;
}

// Fire-and-forget push to the show owner when someone reacts/comments.
// Never block the UI on it. Edge Function verifies the actor + that the
// target is someone else.
export function notifyInteraction(showId, kind) {
  supabase.functions
    .invoke('notify-interaction', { body: { showId, kind } })
    .catch(() => {});
}
