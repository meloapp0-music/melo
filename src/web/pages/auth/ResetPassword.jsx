import { useState } from 'react';
import { updatePassword, signOut } from '../../lib/auth';
import AuthShell from '../../components/auth/AuthShell';
import Field from '../../components/auth/Field';
import PasswordRules, { passwordValid } from '../../components/auth/PasswordRules';
import { AuthButton } from '../../components/auth/AuthButton';
import Icon from '../../components/Icon';

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
  const [touched, setTouched] = useState({});

  const confirmErr = touched.confirm && confirm && confirm !== password ? "Passwords don't match." : '';
  const valid = passwordValid(password) && confirm === password && confirm.length > 0;

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
    <AuthShell
      footer={
        !done && (
          <AuthButton type="submit" form="reset-form" disabled={!valid} busy={busy}>
            {busy ? 'Saving…' : 'Save new password'}
          </AuthButton>
        )
      }
    >
      <h1 className="font-serif italic text-[28px] leading-tight tracking-tight text-foreground mb-2">
        Set a new password
      </h1>
      <p className="font-sans text-sm leading-relaxed text-muted-foreground mb-6">
        Pick something you&rsquo;ll remember this time.
      </p>

      {done ? (
        // Held for 1.5s while the sign-out completes, then App.jsx swaps this
        // screen for SignIn. A confirmation card rather than a toast, because
        // the screen is about to change underneath it either way.
        <div className="border border-border bg-secondary p-5 flex items-center gap-3">
          <Icon name="ph:check-bold" size={20} className="text-foreground shrink-0" />
          <div>
            <p className="font-serif italic text-lg text-foreground">Password saved.</p>
            <p className="font-mono text-[10px] text-muted-foreground mt-1">Signing you back in…</p>
          </div>
        </div>
      ) : (
        <form id="reset-form" onSubmit={submit}>
          <Field
            label="New password"
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
          {error && (
            <p className="mt-1 font-sans text-[12px] leading-snug" style={{ color: 'var(--ember-text)' }}>
              {error}
            </p>
          )}
        </form>
      )}
    </AuthShell>
  );
}
