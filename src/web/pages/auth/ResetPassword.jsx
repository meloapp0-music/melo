import { useState } from 'react';
import { updatePassword, signOut } from '../../lib/auth';
import { MeloIcon } from '../../components/MeloLogo';

// Rendered when Supabase redirects back with a recovery token. The SDK
// auto-processes the URL on load and lands us here in a signed-in-but-
// recovery session. The user picks a new password, we sign them out and
// back to SignIn so they enter it fresh.
export default function ResetPassword({ onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('At least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords don\'t match'); return; }
    setBusy(true);
    try {
      await updatePassword(password);
      setDone(true);
      await signOut();
      setTimeout(() => onDone?.(), 1500);
    } catch (err) {
      setError(err.message || 'Could not update password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page auth-page">
      <div className="auth-brand" style={{ justifyContent: 'center' }}>
        <MeloIcon size={64} />
      </div>
      <form className="auth-form" onSubmit={submit}>
        <h1 className="auth-title">Set a new password</h1>
        {done ? (
          <p className="auth-ok">Password updated. Redirecting…</p>
        ) : (
          <>
            <label className="auth-label">New password</label>
            <input
              className="log-input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
            <label className="auth-label">Confirm</label>
            <input
              className="log-input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            {error && <div className="auth-error">{error}</div>}
            <button className="settings-save-btn" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Update Password'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
