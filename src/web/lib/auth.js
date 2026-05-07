// Auth hooks + wrappers around Supabase Auth.
// useSession() subscribes to onAuthStateChange and returns a 3-state value:
//   { status: 'loading' | 'signedOut' | 'signedIn', session, user }

import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export function useSession() {
  const [state, setState] = useState({ status: 'loading', session: null, user: null });

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setState({
        status: session ? 'signedIn' : 'signedOut',
        session,
        user: session?.user ?? null,
      });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({
        status: session ? 'signedIn' : 'signedOut',
        session,
        user: session?.user ?? null,
      });
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export async function signUp({ email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw error;
  return data;
}

// Email confirmation OTP flow. Requires the Supabase project's
// "Confirm email" setting to be ON and the email template configured
// to send the 6-digit `{{ .Token }}` value. With those in place,
// signUp() returns a session=null result and the proxy automatically
// emails the OTP. The client then prompts the user with an OtpEntry
// step, calls verifyEmailOtp() to confirm, and the resulting session
// flips them straight into the app without a second sign-in step.
export async function verifyEmailOtp({ email, token }) {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: token.trim(),
    type: 'signup',
  });
  if (error) throw error;
  return data;
}

// Resends the signup confirmation email. Supabase rate-limits this
// internally (default 5 emails/hour per address) so a fast click on
// the resend button can return an error — we surface that to the user.
export async function resendSignupOtp(email) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
  });
  if (error) throw error;
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
