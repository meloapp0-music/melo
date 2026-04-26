// Account-level operations that need elevated privileges (the
// service-role key) and therefore live in a Supabase Edge Function.
// The client just invokes the function with the user's JWT; the
// function verifies the JWT and acts on behalf of that user.
//
// To deploy the matching Edge Function, see
// `supabase/functions/delete-account/`. Until it's deployed,
// `deleteMyAccount()` will throw a clear error and the Settings UI
// will surface it.

import { supabase } from '../supabase';

export async function deleteMyAccount() {
  // `supabase.functions.invoke` automatically attaches the user's JWT
  // as the Authorization header, which the Edge Function uses to
  // identify the caller.
  const { error } = await supabase.functions.invoke('delete-account', {
    method: 'POST',
  });
  if (error) {
    // Surface a friendlier message when the function isn't deployed.
    if (error.message?.includes('Function not found') || error.context?.status === 404) {
      throw new Error(
        'Account deletion is not yet wired up on this Melo deployment. ' +
          'Ask the operator to deploy the delete-account Edge Function.'
      );
    }
    throw error;
  }
  // The function deletes the auth user → cascades wipe shows,
  // rankings, settings, profile via ON DELETE CASCADE. Sign the
  // (now-orphaned) session out client-side to clear local state.
  await supabase.auth.signOut();
}
