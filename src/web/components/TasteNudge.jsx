import { useState } from 'react';
import { useApp } from '../App';

// A second chance at "turn on alerts" for users who got past GetStarted
// without ever setting a music taste — GetStarted's own 'taste' step only
// shows while that 3-step checklist is still up; once it's dismissed or
// completed, a user who skipped taste has no more nudge to go set it. This
// fires in exactly that gap: only once GetStarted itself is no longer
// showing (its own localStorage flag is set) AND taste is still unset.
// Independently dismissible so it doesn't nag forever either.
// Per docs/initiatives/2026-07-07-music-taste-discoverability.md.
export default function TasteNudge() {
  const { profile, navigate } = useApp();

  const [dismissed, setDismissed] = useState(() => {
    try { return !!localStorage.getItem('melo_taste_nudge_dismissed'); } catch { return false; }
  });
  const getStartedDone = (() => {
    try { return !!localStorage.getItem('melo_getstarted_done'); } catch { return false; }
  })();
  const hasTaste =
    (profile?.favGenres?.length || 0) > 0 || (profile?.favArtists?.length || 0) > 0;

  if (dismissed || hasTaste || !getStartedDone) return null;

  const dismiss = () => {
    try { localStorage.setItem('melo_taste_nudge_dismissed', '1'); } catch {}
    setDismissed(true);
  };

  return (
    <div className="taste-nudge fade-in">
      <button className="taste-nudge-dismiss" onClick={dismiss} aria-label="Dismiss">×</button>
      <div className="taste-nudge-icon" aria-hidden="true">🔔</div>
      <div className="taste-nudge-body">
        <div className="taste-nudge-title">Get notified about shows you'd love</div>
        <div className="taste-nudge-desc">Pick genres and artists — Melo will alert you when they play near you.</div>
      </div>
      <button type="button" className="taste-nudge-cta" onClick={() => navigate('music-taste')}>
        Set taste
      </button>
    </div>
  );
}
