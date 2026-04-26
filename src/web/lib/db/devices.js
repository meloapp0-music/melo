// db/devices.js — push-notification device-token registry.
//
// One row per (user, token). Composite PK in the table; we upsert on
// (user_id, token) so re-launching the app (which always re-registers)
// just refreshes `last_seen_at` instead of inserting duplicates.
//
// The `tour-alerts` Edge Function reads this table with the service-
// role key to find every iOS device for a given user. RLS lets the
// signed-in user manage their own rows (insert, refresh, delete on
// sign-out) but nothing else.

import { supabase } from '../supabase';

export async function upsertDeviceToken(token, platform) {
  if (!token || !platform) throw new Error('upsertDeviceToken: token + platform required');

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  if (!user) throw new Error('not signed in');

  const row = {
    user_id: user.id,
    token,
    platform,
    last_seen_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('device_tokens')
    .upsert(row, { onConflict: 'user_id,token' });
  if (error) throw error;
}

/** Best-effort: drop a token (call this on sign-out so the user
 *  doesn't keep getting pushes after logging out of this device). */
export async function removeDeviceToken(token) {
  if (!token) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('device_tokens')
    .delete()
    .eq('user_id', user.id)
    .eq('token', token);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[Melo] removeDeviceToken failed', error);
  }
}
