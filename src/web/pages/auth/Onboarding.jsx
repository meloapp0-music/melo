import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { updateMyProfile, checkUsernameAvailable } from '../../lib/db/profiles';
import { MeloIcon } from '../../components/MeloLogo';
import ImportFromCalendar from '../ImportFromCalendar';

const AVATAR_COLORS = [
  '#E8573A', '#FF6B6B', '#FF9671', '#FFC75F', '#C4E538',
  '#00C9A7', '#00D2FC', '#4B7BE5', '#845EC2', '#D65DB1',
];

export default function Onboarding({ onComplete }) {
  // Two-step flow on iOS: profile, then calendar import. Web users
  // skip straight from profile → done since the calendar plugin is
  // a no-op outside Capacitor.
  const isNative = !!(Capacitor.isNativePlatform && Capacitor.isNativePlatform());
  const [step, setStep] = useState('profile'); // 'profile' | 'calendar'

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [available, setAvailable] = useState(null); // null | true | false
  const [checking, setChecking] = useState(false);

  // Debounced availability check
  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(u)) {
      setAvailable(null);
      return;
    }
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const ok = await checkUsernameAvailable(u);
        setAvailable(ok);
      } catch {
        setAvailable(null);
      } finally {
        setChecking(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [username]);

  const canSubmit =
    available === true &&
    displayName.trim().length > 0 &&
    !busy;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setBusy(true);
    try {
      await updateMyProfile({
        username: username.trim().toLowerCase(),
        displayName: displayName.trim(),
        avatarColor,
      });
      // On native we route to the calendar-import step before handing
      // control back to App.jsx. On web we're done — App.jsx will
      // re-fetch the profile (no longer a temp username) and unmount
      // this page.
      if (isNative) {
        setStep('calendar');
        setBusy(false);
      } else {
        onComplete?.();
      }
    } catch (err) {
      setError(err.message || 'Could not save profile');
      setBusy(false);
    }
  };

  if (step === 'calendar') {
    return <ImportFromCalendar onDone={() => onComplete?.()} />;
  }

  return (
    <div className="page auth-page">
      <div className="auth-brand" style={{ justifyContent: 'center' }}>
        <MeloIcon size={64} />
      </div>

      <form className="auth-form" onSubmit={submit}>
        <h1 className="auth-title">Pick your handle</h1>
        <p className="auth-sub">Friends will find you by username. You can change it later.</p>

        <label className="auth-label">Username</label>
        <div className="auth-username-row">
          <span className="auth-username-at">@</span>
          <input
            className="log-input auth-username-input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="yourname"
            maxLength={24}
            required
          />
        </div>
        <div className="auth-hint">
          {username && username.length < 3 && 'At least 3 characters'}
          {username.length >= 3 && checking && 'Checking…'}
          {username.length >= 3 && !checking && available === true && (
            <span className="auth-ok-inline">✓ Available</span>
          )}
          {username.length >= 3 && !checking && available === false && (
            <span className="auth-err-inline">Taken — try another</span>
          )}
        </div>

        <label className="auth-label">Display name</label>
        <input
          className="log-input"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
          maxLength={40}
          required
        />

        <label className="auth-label">Avatar color</label>
        <div className="auth-color-row">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`auth-color-swatch${avatarColor === c ? ' selected' : ''}`}
              style={{ background: c }}
              onClick={() => setAvatarColor(c)}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>

        {error && <div className="auth-error">{error}</div>}

        <button className="settings-save-btn" type="submit" disabled={!canSubmit}>
          {busy ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
