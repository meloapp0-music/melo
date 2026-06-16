import { useState, useEffect } from 'react';
import { signUp } from '../../lib/auth';
import { track } from '../../lib/analytics';
import { MeloLockup } from '../../components/MeloLogo';
import OtpEntry from '../../components/OtpEntry';

export default function SignUp({ onToggle }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsConfirm, setNeedsConfirm] = useState(false);

  // Top of the activation funnel.
  useEffect(() => { track('signup_started'); }, []);

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
    <div className="page auth-page">
      <div className="auth-brand"><MeloLockup iconSize={56} wordmarkSize={40} tagline /></div>

      <form className="auth-form" onSubmit={submit}>
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-sub">Track every show, every setlist, every memory.</p>

        <label className="auth-label">Email</label>
        <input
          className="log-input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />

        <label className="auth-label">Password</label>
        <input
          className="log-input"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          required
          minLength={8}
        />

        <label className="auth-label">Confirm password</label>
        <input
          className="log-input"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
          required
        />

        {error && <div className="auth-error">{error}</div>}

        <button
          className="settings-save-btn"
          type="submit"
          disabled={busy || !email.trim() || !password || !confirm}
        >
          {busy ? 'Creating account…' : 'Create Account'}
        </button>

        <p className="auth-agree">
          By creating an account you agree to our{' '}
          <a href="https://melo.show/terms" target="_blank" rel="noopener noreferrer">Terms</a>
          {' '}and{' '}
          <a href="https://melo.show/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
        </p>

        <div className="auth-footer">
          <button type="button" className="auth-link" onClick={onToggle}>
            Already have an account? <b>Sign in</b>
          </button>
        </div>
      </form>
    </div>
  );
}
