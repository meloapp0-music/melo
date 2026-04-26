// Melo — delete-account Edge Function
// ====================================
// Required for Apple App Store compliance: any app with sign-in must
// allow the user to delete their account from inside the app.
//
// This function:
//   1. Reads the user's JWT from the Authorization header.
//   2. Verifies the JWT using the project's anon client (so we know
//      who the caller is).
//   3. Calls `auth.admin.deleteUser(uid)` with the service-role key
//      to permanently remove the auth row. ON DELETE CASCADE on the
//      `profiles`, `shows`, `rankings`, and `user_settings` tables
//      wipes the user's data automatically.
//
// Deploy:
//   supabase functions deploy delete-account --no-verify-jwt
//
// (We pass --no-verify-jwt because we verify the JWT manually below;
// this also lets us return a clean error message instead of a 401.)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Pre-flight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'missing Authorization header' }, 401);
    }

    // Identify the caller from the JWT.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user?.id) {
      return json({ error: 'invalid session' }, 401);
    }
    const userId = userData.user.id;

    // Delete with the service role.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('[delete-account] auth.admin.deleteUser failed', deleteError);
      return json({ error: deleteError.message }, 500);
    }

    return json({ ok: true }, 200);
  } catch (err) {
    console.error('[delete-account] unexpected error', err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
