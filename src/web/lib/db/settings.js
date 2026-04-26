// db/settings.js — per-user app settings.
//
// As of migration 0003 the Setlist.fm API key is encrypted at rest
// (AES-GCM, decrypted only inside Edge Functions). The client never
// sees plaintext. `getSettings()` returns a boolean — "do you have a
// key configured?" — and `updateSettings()` proxies through the
// `setlistfm-set-key` Edge Function which does the encryption.

import { supabase } from '../supabase';

export async function getSettings() {
  const { data, error } = await supabase
    .from('user_settings')
    // We only need to know whether a ciphertext exists. Selecting the
    // column itself returns bytea bytes the client can't use anyway,
    // so we just look for a non-null value.
    .select('setlist_fm_key_encrypted')
    .maybeSingle();
  if (error) throw error;
  const hasSetlistFmKey = !!data?.setlist_fm_key_encrypted;
  return {
    hasSetlistFmKey,
    // Legacy field name kept for any reader still checking truthiness
    // of `settings.setlistFmKey`. Empty string is fine — the Setlist.fm
    // request flow now goes through the proxy Edge Function and no
    // longer needs the raw key client-side.
    setlistFmKey: hasSetlistFmKey ? '__set__' : '',
  };
}

export async function updateSettings(patch /* , userId — unused; Edge Fn uses JWT */) {
  if (!('setlistFmKey' in patch)) {
    // No-op for unrelated patches. Returning current state keeps the
    // App.jsx optimistic-update flow happy.
    return await getSettings();
  }
  // Empty string clears the key (acts as a "disconnect" toggle).
  const key = (patch.setlistFmKey || '').trim();

  const { error } = await supabase.functions.invoke('setlistfm-set-key', {
    body: { key },
  });
  if (error) throw error;

  return {
    hasSetlistFmKey: !!key,
    setlistFmKey: key ? '__set__' : '',
  };
}
