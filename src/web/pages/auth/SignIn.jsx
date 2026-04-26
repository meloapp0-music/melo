import { useState } from 'react';
import { signIn, sendPasswordReset } from '../../lib/auth';
import { MeloLockup } from '../../components/MeloLogo';

export default function SignIn({ onToggle }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signIn({ email: email.trim(), password });
      // onAuthStateChange in App.jsx will pick up from here
    } catch (err) {
      setError(err.message || 'Sign in failed');
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

  return (
    <div className="page auth-page">
      <div className="auth-brand"><MeloLockup iconSize={56} wordmarkSize={40} tagline /></div>

      <form className="auth-form" onSubmit={submit}>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-sub">Sign in to your Melo account</p>

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
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          minLength={6}
        />

        {error && <div className="auth-error">{error}</div>}
        {resetSent && <div className="auth-ok">Check your inbox for a password reset link.</div>}

        <button className="settings-save-btn" type="submit" disabled={busy || !email.trim() || !password}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>

        <div className="auth-footer">
          <button type="button" className="auth-link" onClick={reset}>
            Forgot password?
          </button>
          <button type="button" className="auth-link" onClick={onToggle}>
            Don't have an account? <b>Sign up</b>
          </button>
        </div>
      </form>
    </div>
  );
}
