import { useState } from 'react';
import { signIn, sendPasswordReset, resendSignupOtp } from '../../lib/auth';
import { MeloWordmark } from '../../components/MeloLogo';
import OtpEntry from '../../components/OtpEntry';
import AuthShell from '../../components/auth/AuthShell';
import Field from '../../components/auth/Field';
import { AuthButton, AuthLink, Emphasis } from '../../components/auth/AuthButton';

// Sign in — ported to the paper archive. The BEHAVIOUR below is unchanged from
// the peach-gradient version; only the frame around it moved. In particular
// the `email_not_confirmed` branch still auto-resends and routes into OtpEntry,
// which is the path a user hits when they bailed halfway through signup, and
// it is invisible until it fires.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignIn({ onToggle }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [touched, setTouched] = useState({});

  // Validation is shown per field and only after the user has left it — an
  // error that appears while you're still typing your own address reads as
  // the app arguing with you.
  const emailErr = touched.email && email && !EMAIL.test(email) ? 'Enter a valid email.' : '';
  const passErr = touched.password && password.length === 0 ? 'Enter your password.' : '';
  const valid = EMAIL.test(email) && password.length > 0;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signIn({ email: email.trim(), password });
      // onAuthStateChange in App.jsx will pick up from here
    } catch (err) {
      // Supabase returns this code when a user has signed up but not
      // confirmed their email yet (typically because they bailed
      // mid-OTP-flow). Auto-resend a fresh code and route them into
      // OtpEntry so they can finish without re-typing their email.
      const code = err?.code || err?.error_code;
      const msg = (err?.message || '').toLowerCase();
      const isUnconfirmed =
        code === 'email_not_confirmed' || msg.includes('email not confirmed');
      if (isUnconfirmed) {
        try { await resendSignupOtp(email.trim()); } catch {}
        setNeedsConfirm(true);
      } else {
        setError(err.message || 'Sign in failed');
      }
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!email.trim()) { setError('Enter your email first, then tap reset'); return; }
    setError('');
    try {
      await sendPasswordReset(email.trim());
      setResetSent(true);
    } catch (err) {
      setError(err.message || 'Reset failed');
    }
  };

  if (needsConfirm) {
    return (
      <OtpEntry
        email={email.trim()}
        onChangeEmail={() => setNeedsConfirm(false)}
      />
    );
  }

  return (
    <AuthShell
      footer={
        <>
          <AuthButton type="submit" form="signin-form" disabled={!valid} busy={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </AuthButton>
          <AuthLink onClick={onToggle}>
            New to Melo? <Emphasis>Create an account</Emphasis>
          </AuthLink>
        </>
      }
    >
      <MeloWordmark size={34} color="var(--foreground)" />
      <h1 className="font-serif italic text-[30px] leading-tight tracking-tight text-foreground mt-5 mb-7">
        Welcome back
      </h1>

      <form id="signin-form" onSubmit={submit}>
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
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          placeholder="••••••••"
          error={passErr}
          required
          minLength={6}
        />

        <div className="flex justify-end -mt-2">
          <button
            type="button"
            onClick={reset}
            className="py-2 font-sans text-[12px] text-muted-foreground active:scale-95 transition-transform"
          >
            Forgot password?
          </button>
        </div>

        {error && (
          <p className="mt-3 font-sans text-[12px] leading-snug" style={{ color: 'var(--ember-text)' }}>
            {error}
          </p>
        )}
        {resetSent && (
          <p className="mt-3 font-sans text-[12px] leading-snug text-foreground">
            Check your inbox for a password reset link.
          </p>
        )}
      </form>
    </AuthShell>
  );
}
