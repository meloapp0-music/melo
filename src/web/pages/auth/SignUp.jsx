import { useState, useEffect } from 'react';
import { signUp } from '../../lib/auth';
import { track } from '../../lib/analytics';
import { MeloWordmark } from '../../components/MeloLogo';
import OtpEntry from '../../components/OtpEntry';
import AuthShell from '../../components/auth/AuthShell';
import Field from '../../components/auth/Field';
import PasswordRules, { passwordValid } from '../../components/auth/PasswordRules';
import { AuthButton, AuthLink, Emphasis } from '../../components/auth/AuthButton';

// Create account — ported to the paper archive. Behaviour unchanged: the same
// analytics events at the same points, the same OTP branch, the same 8-char
// minimum. What moved is that the password rules are now shown live as a
// checklist rather than delivered as an error after the fact.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUp({ onToggle }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [touched, setTouched] = useState({});

  // Top of the activation funnel.
  useEffect(() => { track('signup_started'); }, []);

  const emailErr = touched.email && email && !EMAIL.test(email) ? 'Enter a valid email.' : '';
  const confirmErr = touched.confirm && confirm && confirm !== password ? "Passwords don't match." : '';
  const valid = EMAIL.test(email) && passwordValid(password) && confirm === password && confirm.length > 0;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords don\'t match');
      return;
    }
    setBusy(true);
    try {
      const { session } = await signUp({ email: email.trim(), password });
      // Account created. `email_confirmation_required` distinguishes the
      // OTP path (Confirm Email ON) from the dev path (session returned).
      track('signup_completed', { email_confirmation_required: !session });
      if (!session) {
        // Email confirmation required (Supabase project has "Confirm
        // email" turned on). Show the 6-digit OTP entry; on success
        // App.jsx's onAuthStateChange picks up the new session
        // automatically.
        setNeedsConfirm(true);
      }
      // If session is returned (confirmation off, dev only), App.jsx
      // takes over directly.
    } catch (err) {
      setError(err.message || 'Sign up failed');
    } finally {
      setBusy(false);
    }
  };

  if (needsConfirm) {
    return (
      <OtpEntry
        email={email.trim()}
        onChangeEmail={() => setNeedsConfirm(false)}
        // No onVerified — App.jsx's session listener flips the user
        // into the app automatically once verifyOtp succeeds.
      />
    );
  }

  return (
    <AuthShell
      footer={
        <>
          <AuthButton type="submit" form="signup-form" disabled={!valid} busy={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </AuthButton>
          <AuthLink onClick={onToggle}>
            Already have an account? <Emphasis>Sign in</Emphasis>
          </AuthLink>
        </>
      }
    >
      <MeloWordmark size={34} color="var(--foreground)" />
      <h1 className="font-serif italic text-[28px] leading-tight tracking-tight text-foreground mt-4 mb-2">
        Create your account
      </h1>
      <p className="font-sans text-sm leading-relaxed text-muted-foreground mb-6">
        Track every show, every setlist, every memory.
      </p>

      <form id="signup-form" onSubmit={submit}>
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          placeholder="you@email.com"
          error={emailErr}
          required
        />
        <Field
          label="Password"
          type="password"
          name="new-password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          minLength={8}
        />
        <PasswordRules value={password} />
        <Field
          label="Confirm password"
          type="password"
          name="confirm-password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
          placeholder="••••••••"
          error={confirmErr}
          required
        />

        <p className="font-sans text-[11px] leading-relaxed text-muted-foreground">
          By continuing you agree to Melo&rsquo;s{' '}
          <a href="https://melo.show/terms" target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2">Terms</a>
          {' '}and{' '}
          <a href="https://melo.show/privacy" target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2">Privacy Policy</a>.
        </p>

        {error && (
          <p className="mt-3 font-sans text-[12px] leading-snug" style={{ color: 'var(--ember-text)' }}>
            {error}
          </p>
        )}
      </form>
    </AuthShell>
  );
}
