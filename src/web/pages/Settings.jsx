import { useState, useEffect } from 'react';
import { useApp } from '../App';
import { deleteMyAccount } from '../lib/db/account';
import { checkUsernameAvailable } from '../lib/db/profiles';
import { showsToCsv, showsToJson, deliverFile } from '../lib/exportShows';
import { track } from '../lib/analytics';

export default function Settings() {
  const { navigate, settings, updateSettings, signOut, profile, updateProfile, shows } = useApp();
  // The Setlist.fm key is encrypted at rest as of migration 0003. The
  // client never sees plaintext after the initial save round-trip.
  // Only show the input when the user explicitly wants to set/replace
  // it; otherwise display a "Connected" badge.
  const isConnected = !!settings.hasSetlistFmKey;
  const [editing, setEditing] = useState(!isConnected);
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // 'csv' | 'json' | false — which export is in flight (drives button labels).
  const [exporting, setExporting] = useState(false);

  // ----- Profile (display name + username) edit state -----
  // Inline-edit affordance in the Account row. Backend (updateMyProfile +
  // checkUsernameAvailable) was always there, but Onboarding's
  // "you can change it later" promise had no Settings UI to back it up.
  const [editingProfile, setEditingProfile] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  // null | 'checking' | 'available' | 'taken' | 'invalid'
  const [usernameStatus, setUsernameStatus] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Debounced username availability check while editing. Skips the call
  // entirely when the value matches the current profile's username (no
  // change → already "yours").
  useEffect(() => {
    if (!editingProfile) return;
    const u = editUsername.trim().toLowerCase();
    if (u === (profile?.username || '')) {
      setUsernameStatus('available');
      return;
    }
    if (!/^[a-z0-9_]{3,24}$/.test(u)) {
      setUsernameStatus(u.length === 0 ? null : 'invalid');
      return;
    }
    setUsernameStatus('checking');
    const t = setTimeout(async () => {
      try {
        const ok = await checkUsernameAvailable(u);
        setUsernameStatus(ok ? 'available' : 'taken');
      } catch {
        setUsernameStatus(null);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [editUsername, editingProfile, profile?.username]);

  const openEditProfile = () => {
    setProfileError('');
    setEditDisplayName(profile?.displayName || '');
    setEditUsername(profile?.username || '');
    setUsernameStatus('available'); // current username is by definition available to self
    setEditingProfile(true);
  };

  const cancelEditProfile = () => {
    setEditingProfile(false);
    setProfileError('');
  };

  const saveProfile = async () => {
    setProfileError('');
    const nextDisplay = editDisplayName.trim();
    const nextUsername = editUsername.trim().toLowerCase();
    if (!nextDisplay) {
      setProfileError('Display name cannot be empty');
      return;
    }
    if (usernameStatus === 'invalid') {
      setProfileError('Username must be 3–24 characters: lowercase letters, numbers, or underscores');
      return;
    }
    if (usernameStatus === 'taken') {
      setProfileError('That username is taken');
      return;
    }
    if (usernameStatus === 'checking') {
      setProfileError('Still checking availability — try again in a sec');
      return;
    }
    setSavingProfile(true);
    try {
      const patch = {};
      if (nextDisplay !== (profile?.displayName || '')) patch.displayName = nextDisplay;
      if (nextUsername !== (profile?.username || '')) patch.username = nextUsername;
      if (Object.keys(patch).length > 0) await updateProfile(patch);
      setEditingProfile(false);
    } catch (err) {
      setProfileError(err?.message || 'Could not save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      await updateSettings({ setlistFmKey: apiKey.trim() });
      setApiKey('');
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err?.message || 'Could not save key');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Setlist.fm? Auto-fill will stop working until you re-paste a key.')) return;
    setSaveError(null);
    setSaving(true);
    try {
      await updateSettings({ setlistFmKey: '' });
      setApiKey('');
      setEditing(true);
    } catch (err) {
      setSaveError(err?.message || 'Could not disconnect');
    } finally {
      setSaving(false);
    }
  };

  // Export the full show history as a portable file. Pure client-side
  // transform (see lib/exportShows.js) — no backend call.
  const handleExport = async (format) => {
    if (exporting || shows.length === 0) return;
    setExporting(format);
    try {
      const stamp = new Date().toISOString().split('T')[0];
      if (format === 'csv') {
        await deliverFile(`melo-shows-${stamp}.csv`, showsToCsv(shows), 'text/csv');
      } else {
        await deliverFile(`melo-shows-${stamp}.json`, showsToJson(shows), 'application/json');
      }
      track('data_exported', { format, show_count: shows.length });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Melo] export failed', err);
    } finally {
      setExporting(false);
    }
  };

  const handleSignOut = async () => {
    if (confirm('Sign out of Melo on this device? Your shows stay safe in the cloud.')) {
      try { await signOut(); } catch (err) { console.error(err); }
    }
  };

  // Double-confirm before nuking the account. The Edge Function deletes the
  // auth row and everything cascades from there (see migration 0001 + the
  // delete-account function). If the function isn't deployed yet,
  // deleteMyAccount() throws a friendly error that we surface inline.
  const handleDelete = async () => {
    if (deleting) return;
    const ok1 = confirm(
      'Permanently delete your Melo account? This wipes every show, ranking, and setting you have logged. It cannot be undone.'
    );
    if (!ok1) return;
    const ok2 = confirm(
      'Last chance — are you absolutely sure? Tap OK to delete, Cancel to keep your account.'
    );
    if (!ok2) return;
    setDeleting(true);
    try {
      await deleteMyAccount();
      // signOut inside deleteMyAccount() already cleared the session, which
      // unmounts this page. No further state work needed.
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Melo] deleteMyAccount failed', err);
      alert(`Delete failed: ${err?.message || err}`);
      setDeleting(false);
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
      <h1>Settings</h1>

      <div className="settings-section">
        <div className="settings-section-title">Setlist.fm API Key (optional)</div>
        <div className="settings-card">
          <div className="settings-label">Bring your own key (advanced)</div>
          <p className="settings-desc">
            Auto-fill works out of the box — no setup required. If you'd
            rather use your own free Setlist.fm key (for personal
            accountability or higher rate limits), paste it here. Your
            key is encrypted before it ever leaves the device.
          </p>

          {isConnected && !editing && (
            <>
              <div className="settings-integration-row" style={{ borderBottom: 'none', paddingLeft: 0, paddingRight: 0 }}>
                <div className="settings-integration-info">
                  <div className="settings-label">Setlist.fm</div>
                  <p className="settings-desc" style={{ marginBottom: 0 }}>
                    Connected · key stored encrypted
                  </p>
                </div>
                <div className="settings-integration-badge active">Connected</div>
              </div>
              <button
                className="settings-save-btn"
                onClick={() => setEditing(true)}
                style={{ background: 'rgba(61,44,30,0.06)', color: '#3D2C1E' }}
              >
                Replace key
              </button>
              <button
                className="settings-danger-btn"
                onClick={handleDisconnect}
                disabled={saving}
                style={{ marginTop: 8 }}
              >
                {saving ? 'Working…' : 'Disconnect'}
              </button>
            </>
          )}

          {editing && (
            <>
              {!isConnected && (
                <div className="setlist-steps">
                  <div className="setlist-step">
                    <span className="setlist-step-num">1</span>
                    <div>
                      <a
                        href="https://www.setlist.fm/signup"
                        target="_blank"
                        rel="noopener"
                        className="settings-link"
                      >
                        Create a free Setlist.fm account
                      </a>
                      <p>Takes 30 seconds — just email + password</p>
                    </div>
                  </div>
                  <div className="setlist-step">
                    <span className="setlist-step-num">2</span>
                    <div>
                      <a
                        href="https://www.setlist.fm/settings/api"
                        target="_blank"
                        rel="noopener"
                        className="settings-link"
                      >
                        Request an API key
                      </a>
                      <p>Fill out the short form — approved instantly for personal use</p>
                    </div>
                  </div>
                  <div className="setlist-step">
                    <span className="setlist-step-num">3</span>
                    <div>
                      <span className="settings-link-text">Paste the key below &amp; hit Save</span>
                      <p>Your setlists will auto-fill from then on</p>
                    </div>
                  </div>
                </div>
              )}

              <input
                className="log-input"
                placeholder="Paste your API key here"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setSaved(false); }}
                type="password"
                style={{ marginTop: apiKey ? 0 : 8 }}
                autoComplete="off"
              />
              <button
                className="settings-save-btn"
                onClick={handleSave}
                style={saved ? { background: '#00C9A7' } : {}}
                disabled={!apiKey.trim() || saving}
              >
                {saving ? 'Saving…' : saved ? '✓ Saved — you\'re all set!' : 'Save Key'}
              </button>
              {isConnected && (
                <button
                  className="settings-danger-btn"
                  onClick={() => { setEditing(false); setApiKey(''); setSaveError(null); }}
                  style={{ marginTop: 8 }}
                >
                  Cancel
                </button>
              )}
              {saveError && (
                <p className="auth-error" style={{ marginTop: 10 }}>{saveError}</p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Integrations</div>
        <div className="settings-card">
          <div className="settings-integration-row">
            <div className="settings-integration-icon" style={{ background: 'linear-gradient(135deg, #1DB954, #1AA34A)' }}>
              <span style={{ fontSize: 18 }}>&#9835;</span>
            </div>
            <div className="settings-integration-info">
              <div className="settings-label">Deezer</div>
              <p className="settings-desc" style={{ marginBottom: 0 }}>Artist images &middot; Auto-enabled</p>
            </div>
            <div className="settings-integration-badge active">Active</div>
          </div>
          <div className="settings-integration-row">
            <div className="settings-integration-icon" style={{ background: 'linear-gradient(135deg, #E8573A, #C34A36)' }}>
              <span style={{ fontSize: 18 }}>&#9836;</span>
            </div>
            <div className="settings-integration-info">
              <div className="settings-label">Setlist.fm</div>
              <p className="settings-desc" style={{ marginBottom: 0 }}>
                Real setlists &middot; {isConnected ? 'Using your key' : 'Active (shared key)'}
              </p>
            </div>
            <div className="settings-integration-badge active">
              {isConnected ? 'Active' : 'Active'}
            </div>
          </div>
          <div className="settings-integration-row">
            <div className="settings-integration-icon" style={{ background: 'linear-gradient(135deg, #00B4D8, #0077B6)' }}>
              <span style={{ fontSize: 18 }}>&#127915;</span>
            </div>
            <div className="settings-integration-info">
              <div className="settings-label">Ticketmaster</div>
              <p className="settings-desc" style={{ marginBottom: 0 }}>
                Upcoming shows & festivals &middot; Auto-enabled
              </p>
            </div>
            <div className="settings-integration-badge active">Active</div>
          </div>
          <div className="settings-integration-row" style={{ borderBottom: 'none' }}>
            <div className="settings-integration-icon" style={{ background: 'linear-gradient(135deg, #BA478F, #8B2C6E)' }}>
              <span style={{ fontSize: 18 }}>&#127912;</span>
            </div>
            <div className="settings-integration-info">
              <div className="settings-label">MusicBrainz</div>
              <p className="settings-desc" style={{ marginBottom: 0 }}>Artist bios & genres &middot; Auto-enabled</p>
            </div>
            <div className="settings-integration-badge active">Active</div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">About</div>
        <div className="settings-card">
          {/* Calendar import hidden in v1.0 — see Onboarding.jsx and
              Home.jsx for the rationale. The page itself is still in
              the repo (pages/ImportFromCalendar.jsx). */}
          <button className="settings-link-row" onClick={() => navigate('legal')}>
            <span>Legal & Attributions</span>
            <span className="settings-link-row-chevron">›</span>
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Your Data</div>
        <div className="settings-card">
          <div className="settings-label">Export your show history</div>
          <p className="settings-desc">
            You own your show history. Export every show you've logged —
            artists, dates, venues, scores, vibes, setlists and more — as
            a file you can keep, open in a spreadsheet, or move elsewhere.
            No questions asked.
          </p>
          <button
            className="settings-save-btn"
            onClick={() => handleExport('csv')}
            disabled={!!exporting || shows.length === 0}
          >
            {exporting === 'csv' ? 'Preparing…' : 'Export as CSV'}
          </button>
          <button
            className="settings-save-btn"
            onClick={() => handleExport('json')}
            disabled={!!exporting || shows.length === 0}
            style={{ background: 'rgba(61,44,30,0.06)', color: '#3D2C1E', marginTop: 8 }}
          >
            {exporting === 'json' ? 'Preparing…' : 'Export as JSON'}
          </button>
          {shows.length === 0 && (
            <p className="settings-desc" style={{ marginTop: 8, textAlign: 'center' }}>
              Log a show first — then you'll have something to export.
            </p>
          )}
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Account</div>
        <div className="settings-card">
          {profile && !editingProfile && (
            <div className="settings-account-row">
              <div className="settings-account-avatar" style={{ background: profile.avatarColor }}>
                {(profile.displayName || profile.username || 'M').slice(0, 1).toUpperCase()}
              </div>
              <div className="settings-account-info">
                <div className="settings-label">{profile.displayName || profile.username}</div>
                <p className="settings-desc" style={{ marginBottom: 0 }}>@{profile.username}</p>
              </div>
              <button
                className="settings-save-btn"
                onClick={openEditProfile}
                style={{ background: 'rgba(61,44,30,0.06)', color: '#3D2C1E', width: 'auto', padding: '8px 14px' }}
              >
                Edit
              </button>
            </div>
          )}

          {profile && editingProfile && (
            <div className="settings-profile-edit">
              <label className="settings-label" htmlFor="settings-edit-display">Display name</label>
              <input
                id="settings-edit-display"
                className="log-input"
                type="text"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="Your name"
                maxLength={40}
                style={{ marginBottom: 12 }}
              />
              <label className="settings-label" htmlFor="settings-edit-username">Username</label>
              <div className="auth-username-row">
                <span className="auth-username-at">@</span>
                <input
                  id="settings-edit-username"
                  className="log-input auth-username-input"
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="yourname"
                  maxLength={24}
                />
              </div>
              <div className="auth-hint" style={{ marginTop: 6, marginBottom: 12 }}>
                {editUsername.length > 0 && editUsername.length < 3 && 'At least 3 characters'}
                {usernameStatus === 'checking' && 'Checking…'}
                {usernameStatus === 'available' && editUsername === (profile?.username || '') && (
                  <span style={{ opacity: 0.6 }}>Your current username</span>
                )}
                {usernameStatus === 'available' && editUsername !== (profile?.username || '') && (
                  <span className="auth-ok-inline">✓ Available</span>
                )}
                {usernameStatus === 'taken' && (
                  <span className="auth-err-inline">Taken — try another</span>
                )}
                {usernameStatus === 'invalid' && (
                  <span className="auth-err-inline">Lowercase letters, numbers, underscores only</span>
                )}
              </div>
              {profileError && (
                <p className="settings-desc" style={{ color: '#C34A36', marginBottom: 12 }}>{profileError}</p>
              )}
              <button
                className="settings-save-btn"
                onClick={saveProfile}
                disabled={savingProfile}
              >
                {savingProfile ? 'Saving…' : 'Save'}
              </button>
              <button
                className="settings-save-btn"
                onClick={cancelEditProfile}
                disabled={savingProfile}
                style={{ background: 'rgba(61,44,30,0.06)', color: '#3D2C1E', marginTop: 8 }}
              >
                Cancel
              </button>
            </div>
          )}
          <button className="settings-danger-btn" onClick={handleSignOut}>
            Sign Out
          </button>
          <p className="settings-desc" style={{ marginTop: 8, textAlign: 'center' }}>
            Your shows stay safe in the cloud
          </p>

          <button
            className="settings-danger-btn settings-danger-btn-delete"
            onClick={handleDelete}
            disabled={deleting}
            style={{ marginTop: 16 }}
          >
            {deleting ? 'Deleting…' : 'Delete Account'}
          </button>
          <p className="settings-desc" style={{ marginTop: 8, textAlign: 'center' }}>
            Permanently removes your account and all data. Cannot be undone.
          </p>
        </div>
      </div>
    </div>
  );
}
