import { useState } from 'react';
import { useApp } from '../App';
import TasteEditor from '../components/TasteEditor';

// Music taste — favorite genres/artists + home city, promoted to its own
// page (was buried inside Settings) so the thing that actually powers your
// notifications isn't three taps deep. Reachable from Profile directly and
// from a Settings link-row, for anyone used to finding it there. Feeds the
// genre/artist "in your city" cron (see the genre-based-notifications and
// music-taste-onboarding initiatives) + Discover personalization.
export default function MusicTaste() {
  const { profile, updateProfile, navigate } = useApp();
  const baseline = () => ({
    genres: profile?.favGenres || [],
    artists: profile?.favArtists || [],
    city: profile?.homeCity || '',
  });
  const [taste, setTaste] = useState(baseline);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(taste) !== JSON.stringify(baseline());

  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    try {
      await updateProfile({ favGenres: taste.genres, favArtists: taste.artists, homeCity: taste.city });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page page-top">
      <button className="back-btn" onClick={() => navigate('profile')}>
        <svg viewBox="0 0 24 24">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Profile
      </button>

      <div className="shows-header" style={{ marginBottom: 8 }}>
        <h1>Music Taste</h1>
      </div>
      <p style={{ color: 'var(--brown-muted)', fontSize: 14, marginTop: 0, marginBottom: 18 }}>
        Get alerts when artists or genres you love play your city, and tune your Discover feed.
      </p>

      <div className="settings-section">
        <div className="settings-card">
          <TasteEditor value={taste} onChange={setTaste} />
          <button className="settings-save-btn" onClick={save} disabled={saving || !dirty}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
