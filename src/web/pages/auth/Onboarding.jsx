import { useState, useEffect } from 'react';
import { updateMyProfile, checkUsernameAvailable } from '../../lib/db/profiles';
import TasteEditor from '../../components/TasteEditor';
import AuthShell from '../../components/auth/AuthShell';
import Field from '../../components/auth/Field';
import { AuthButton, AuthLink } from '../../components/auth/AuthButton';
import Icon from '../../components/Icon';
// Note: ImportFromCalendar import removed in v1.0 — the calendar
// onboarding step is hidden until the underlying Capacitor plugin
// (@ebarooni/capacitor-calendar) iOS bridge issue is resolved. The
// page itself still exists in the repo and can be re-enabled by
// restoring this import + the `step === 'calendar'` branch below.

// The eight archive colours, matching ARTIST_PALETTE in store.js rather than
// the old candy set (#FF6B6B, #FFC75F, #00D2FC …). Those were chosen against
// a white app; on warm paper they read as stickers. Existing users keep
// whatever colour they already picked — only the options on offer change.
const AVATAR_COLORS = [
  '#5A1A1A', // oxblood
  '#A8442A', // ember
  '#D4A017', // ochre
  '#1E3A2A', // bottle green
  '#1E4A52', // deep teal
  '#1E3A5F', // navy
  '#3D1A2A', // plum
  '#2A1B14', // walnut
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
      <AuthShell
        footer={
          <>
            <AuthButton onClick={finish} busy={busy}>
              {busy ? 'Saving…' : 'Finish'}
            </AuthButton>
            <AuthLink onClick={finish} disabled={busy}>Skip for now</AuthLink>
          </>
        }
      >
        <p className="font-sans uppercase tracking-[0.4em] text-[10px] font-black text-muted-foreground">
          Page 02 · Of 02
        </p>
        <h1 className="font-serif italic text-[28px] leading-tight tracking-tight text-foreground mt-3 mb-2">
          Your music taste
        </h1>
        <p className="font-sans text-sm leading-relaxed text-muted-foreground mb-7">
          So we can tell you when artists you love play your city — and tune
          your Discover feed. You can change this anytime.
        </p>

        {/* TasteEditor is shared with Settings, so it is used as-is rather
            than restyled here — a change to it would land on two screens. */}
        <TasteEditor value={taste} onChange={setTaste} />

        {error && (
          <p className="mt-4 font-sans text-[12px] leading-snug" style={{ color: 'var(--ember-text)' }}>
            {error}
          </p>
        )}
      </AuthShell>
    );
  }

  // ----- Step 1: handle + name -----
  const u = username.trim().toLowerCase();
  const handleHint =
    !username ? '' :
    u.length < 3 ? 'At least 3 characters' :
    checking ? 'Checking…' :
    available === true ? '✓ Available' :
    available === false ? `@${u} is taken — try another` : '';
  const handleErr = available === false && !checking ? handleHint : '';

  return (
    <AuthShell
      footer={
        <AuthButton type="submit" form="onboarding-form" disabled={!canContinue}>
          Continue
        </AuthButton>
      }
    >
      <p className="font-sans uppercase tracking-[0.4em] text-[10px] font-black text-muted-foreground">
        Page 01 · Of 02
      </p>
      <h1 className="font-serif italic text-[28px] leading-tight tracking-tight text-foreground mt-3 mb-2">
        Make it yours
      </h1>
      <p className="font-sans text-sm leading-relaxed text-muted-foreground mb-7">
        Friends will find you by username. You can change it later.
      </p>

      <form id="onboarding-form" onSubmit={goToTaste}>
        <Field
          label="Handle"
          name="username"
          prefix="@"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
          placeholder="yourname"
          maxLength={24}
          error={handleErr}
          hint={handleErr ? '' : handleHint}
          required
        />
        <Field
          label="Display name"
          name="name"
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
          maxLength={40}
          required
        />

        <p className="font-sans uppercase tracking-[0.4em] text-[10px] font-black text-muted-foreground mb-3">
          Avatar colour
        </p>
        <div className="flex flex-wrap gap-3 mb-2">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setAvatarColor(c)}
              aria-label={`Avatar colour ${c}`}
              aria-pressed={avatarColor === c}
              className="size-11 rounded-full active:scale-95 transition-transform flex items-center justify-center"
              style={{
                background: c,
                // An outline rather than a border, so selecting doesn't resize
                // the swatch and shuffle the row.
                outline: avatarColor === c ? '2px solid var(--foreground)' : 'none',
                outlineOffset: 3,
              }}
            >
              {avatarColor === c && <Icon name="ph:check-bold" size={16} className="text-white" />}
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-3 font-sans text-[12px] leading-snug" style={{ color: 'var(--ember-text)' }}>
            {error}
          </p>
        )}
      </form>
    </AuthShell>
  );
}
