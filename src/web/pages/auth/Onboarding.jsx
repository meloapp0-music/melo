import { useState, useEffect } from 'react';
import { updateMyProfile, checkUsernameAvailable } from '../../lib/db/profiles';
import { MeloIcon } from '../../components/MeloLogo';
import TasteEditor from '../../components/TasteEditor';
// Note: ImportFromCalendar import removed in v1.0 — the calendar
// onboarding step is hidden until the underlying Capacitor plugin
// (@ebarooni/capacitor-calendar) iOS bridge issue is resolved. The
// page itself still exists in the repo and can be re-enabled by
// restoring this import + the `step === 'calendar'` branch below.

const AVATAR_COLORS = [
  '#E8573A', '#FF6B6B', '#FF9671', '#FFC75F', '#C4E538',
  '#00C9A7', '#00D2FC', '#4B7BE5', '#845EC2', '#D65DB1',
];

export default function Onboarding({ onComplete }) {
  // Single-step flow in v1.0: profile only. Calendar import is
  // deferred to v1.1 (see note above).

  const [step, setStep] = useState('profile'); // 'profile' | 'taste'
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [taste, setTaste] = useState({ genres: [], artists: [], city: '' });
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

  const canContinue =
    available === true &&
    displayName.trim().length > 0 &&
    !busy;

  // Step 1 just advances to the taste step — nothing is saved yet,
  // because saving the (non-temp) username is what flips the user OUT
  // of onboarding in App.jsx. So we save everything together at the end.
  const goToTaste = (e) => {
    e.preventDefault();
    if (!canContinue) return;
    setError('');
    setStep('taste');
  };

  // Final save (with or without taste — Skip passes the empty taste).
  const finish = async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await updateMyProfile({
        username: username.trim().toLowerCase(),
        displayName: displayName.trim(),
        avatarColor,
        favGenres: taste.genres,
        favArtists: taste.artists,
        homeCity: taste.city,
      });
      // App.jsx re-fetches the profile (no longer a temp username) and
      // unmounts this page.
      onComplete?.();
    } catch (err) {
      setError(err.message || 'Could not save profile');
      setBusy(false);
    }
  };

  // ----- Step 2: music taste -----
  if (step === 'taste') {
    return (
      <div className="page auth-page">
        <div className="auth-brand" style={{ justifyContent: 'center' }}>
          <MeloIcon size={64} />
        </div>
        <div className="auth-form">
          <h1 className="auth-title">Your music taste</h1>
          <p className="auth-sub">
            So we can tell you when artists you love play your city — and
            tune your Discover feed. You can change this anytime.
          </p>

          <TasteEditor value={taste} onChange={setTaste} />

          {error && <div className="auth-error">{error}</div>}

          <button className="settings-save-btn" type="button" onClick={finish} disabled={busy}>
            {busy ? 'Saving…' : 'Finish'}
          </button>
          <button className="auth-link" type="button" onClick={finish} disabled={busy} style={{ marginTop: 10 }}>
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  // ----- Step 1: handle + name -----
  return (
    <div className="page auth-page">
      <div className="auth-brand" style={{ justifyContent: 'center' }}>
        <MeloIcon size={64} />
      </div>

      <form className="auth-form" onSubmit={goToTaste}>
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

        <button className="settings-save-btn" type="submit" disabled={!canContinue}>
          Continue
        </button>
      </form>
    </div>
  );
}
