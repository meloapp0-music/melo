import { useState } from 'react';
import { signUp } from '../../lib/auth';
import { MeloLockup } from '../../components/MeloLogo';

export default function SignUp({ onToggle }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsConfirm, setNeedsConfirm] = useState(false);

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
      if (!session) {
        // Email confirmation required — nothing happens automatically
        setNeedsConfirm(true);
      }
      // If session is returned, App.jsx's onAuthStateChange takes over
    } catch (err) {
      setError(err.message || 'Sign up failed');
    } finally {
      setBusy(false);
    }
  };

  if (needsConfirm) {
    return (
      <div className="page auth-page">
        <div className="auth-brand"><MeloLockup iconSize={56} wordmarkSize={40} tagline /></div>
        <div className="auth-form">
          <h1 className="auth-title">Check your email</h1>
          <p className="auth-sub">
            We sent a confirmation link to <b>{email}</b>. Tap it to finish signing up,
            then come back here and sign in.
          </p>
          <button className="settings-save-btn" onClick={onToggle}>Back to Sign In</button>
        </div>
      </div>
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

        <div className="auth-footer">
          <button type="button" className="auth-link" onClick={onToggle}>
            Already have an account? <b>Sign in</b>
          </button>
        </div>
      </form>
    </div>
  );
}
