import { useState } from 'react';
import { useApp } from '../App';
import { deleteMyAccount } from '../lib/db/account';

export default function Settings() {
  const { navigate, settings, updateSettings, signOut, profile } = useApp();
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
        <div className="settings-section-title">Setlist.fm API Key</div>
        <div className="settings-card">
          <div className="settings-label">Auto-fill real setlists</div>
          <p className="settings-desc">
            Connect your free Setlist.fm API key so Melo can pull actual setlists when you log a show.
            Your key is encrypted before it ever leaves the device.
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
                Real setlists &middot; {isConnected ? 'Connected' : 'API key required'}
              </p>
            </div>
            <div className={`settings-integration-badge ${isConnected ? 'active' : ''}`}>
              {isConnected ? 'Active' : 'Setup'}
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
          <button className="settings-link-row" onClick={() => navigate('import-calendar')}>
            <span>Import past shows from Calendar</span>
            <span className="settings-link-row-chevron">›</span>
          </button>
          <button className="settings-link-row" onClick={() => navigate('legal')}>
            <span>Legal & Attributions</span>
            <span className="settings-link-row-chevron">›</span>
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Account</div>
        <div className="settings-card">
          {profile && (
            <div className="settings-account-row">
              <div className="settings-account-avatar" style={{ background: profile.avatarColor }}>
                {(profile.displayName || profile.username || 'M').slice(0, 1).toUpperCase()}
              </div>
              <div className="settings-account-info">
                <div className="settings-label">{profile.displayName || profile.username}</div>
                <p className="settings-desc" style={{ marginBottom: 0 }}>@{profile.username}</p>
              </div>
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
