import { useState, useEffect } from 'react';
import { useApp } from '../App';
import { listFriends } from '../lib/db/friendships';

// First-run "starting navigation" — a 3-step activation checklist pinned
// to the top of Home so a new user is never staring at an empty social
// feed wondering what to do. Each step ticks off against REAL state and
// the whole card disappears once all three are done (or it's dismissed).
// Replaces the old zero-show "Pick your way in" block + the standalone
// music-taste prompt with one unified surface. See
// docs/initiatives/2026-06-23-cold-start-activation.md.
export default function GetStarted() {
  const { shows, profile, navigate } = useApp();

  const [dismissed, setDismissed] = useState(() => {
    try { return !!localStorage.getItem('melo_getstarted_done'); } catch { return false; }
  });
  // null while the (RLS-scoped) friends query is in flight, so we can wait
  // before deciding "all done" and avoid flashing the card for a fully
  // set-up user who just hasn't dismissed it.
  const [hasFriends, setHasFriends] = useState(null);

  useEffect(() => {
    let alive = true;
    listFriends()
      .then((f) => { if (alive) setHasFriends((f?.length || 0) > 0); })
      .catch(() => { if (alive) setHasFriends(false); });
    return () => { alive = false; };
  }, []);

  const hasShow = shows.length > 0;
  const hasTaste =
    (profile?.favGenres?.length || 0) > 0 || (profile?.favArtists?.length || 0) > 0;
  const friendsKnown = hasFriends !== null;

  const steps = [
    {
      key: 'log', done: hasShow, icon: '🎤',
      title: 'Log your first show',
      desc: 'Past or future — it becomes a shareable card.',
      cta: 'Add', onClick: () => navigate('log'),
    },
    {
      key: 'friends', done: hasFriends === true, icon: '👥',
      title: 'Add your people',
      desc: 'See what friends are going to, and go together.',
      cta: 'Find', onClick: () => navigate('buddies'),
    },
    {
      key: 'taste', done: hasTaste, icon: '🔔',
      title: 'Turn on alerts',
      desc: 'Get a heads-up when artists you love tour.',
      cta: 'Set', onClick: () => navigate('settings'),
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = friendsKnown && doneCount === steps.length;

  // Wait for the friends query before first paint so an already-activated
  // user never sees a flash; a brand-new user's query resolves instantly.
  if (dismissed || !friendsKnown || allDone) return null;

  const dismiss = () => {
    try { localStorage.setItem('melo_getstarted_done', '1'); } catch {}
    setDismissed(true);
  };

  return (
    <div className="gs-card fade-in">
      <button className="gs-dismiss" onClick={dismiss} aria-label="Dismiss">×</button>
      <div className="gs-head">
        <div className="gs-title">Get started</div>
        <div className="gs-count">{doneCount} of {steps.length}</div>
      </div>
      <div className="gs-progress">
        <div className="gs-progress-fill" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <div className="gs-steps">
        {steps.map((s) => (
          <div key={s.key} className={`gs-step${s.done ? ' done' : ''}`}>
            <div className="gs-step-icon" aria-hidden="true">{s.done ? '✓' : s.icon}</div>
            <div className="gs-step-body">
              <div className="gs-step-title">{s.title}</div>
              <div className="gs-step-desc">{s.desc}</div>
            </div>
            {!s.done && (
              <button type="button" className="gs-step-cta" onClick={s.onClick}>{s.cta}</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
