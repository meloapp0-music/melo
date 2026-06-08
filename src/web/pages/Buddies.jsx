import { useEffect, useMemo, useState, useCallback } from 'react';
import { useApp } from '../App';
import { isAttended } from '../store';
import BuddySearch from '../components/BuddySearch';
import {
  listFriends, listIncomingRequests, listOutgoingRequests, getRelationships,
  requestFriend, acceptFriend, removeFriend,
} from '../lib/db/friendships';

// Invite link shared via the native share sheet — the growth loop.
const INVITE_URL = 'https://melo.show';

function Avatar({ name, color, url, size = 44 }) {
  const style = {
    width: size, height: size, background: color,
    ...(url ? { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
  };
  return (
    <div className="buddy-avatar" style={style}>
      {!url && (name || '?')[0].toUpperCase()}
    </div>
  );
}

export default function Buddies() {
  const { shows, buddies, navigate, setSelectedUserId, showToast } = useApp();
  const attended = shows.filter(isAttended);

  const [view, setView] = useState('friends'); // 'friends' | 'requests' | 'find'
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [relationships, setRelationships] = useState({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [f, inc, out, rel] = await Promise.all([
        listFriends(), listIncomingRequests(), listOutgoingRequests(), getRelationships(),
      ]);
      setFriends(f); setIncoming(inc); setOutgoing(out); setRelationships(rel);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Melo] friends load failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleRequest = async (userId) => {
    try { await requestFriend(userId); showToast?.({ message: 'Request sent' }); await refresh(); }
    catch (err) { showToast?.({ message: err?.message || 'Could not send request' }); }
  };
  const handleAccept = async (userId) => {
    try { await acceptFriend(userId); showToast?.({ message: 'Friend added 🎶' }); await refresh(); }
    catch (err) { showToast?.({ message: err?.message || 'Could not accept' }); }
  };
  const handleRemove = async (userId) => {
    if (!confirm('Remove this friend?')) return;
    try { await removeFriend(userId); await refresh(); }
    catch (err) { showToast?.({ message: err?.message || 'Could not remove' }); }
  };
  const handleDecline = async (userId) => {
    try { await removeFriend(userId); await refresh(); }
    catch (err) { showToast?.({ message: err?.message || 'Could not decline' }); }
  };

  const invite = async () => {
    const text = 'I track all my concerts on Melo — join me 🎶';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Melo', text, url: INVITE_URL });
      } else {
        await navigator.clipboard.writeText(`${text} ${INVITE_URL}`);
        showToast?.({ message: 'Invite link copied' });
      }
    } catch { /* user dismissed */ }
  };

  // Legacy free-text buddies (Phase 1) that aren't linked to a real user.
  const legacyBuddies = useMemo(() => {
    return buddies
      .map((b) => {
        const count = attended.filter((s) => (s.buddies || []).includes(b.name)).length;
        return { ...b, count };
      })
      .filter((b) => b.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [buddies, attended]);

  return (
    <div className="page page-top">
      <div className="buddies-header">
        <button className="back-btn" onClick={() => navigate('profile')}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
          Profile
        </button>
        <h1>Buddies</h1>
        <button className="buddies-add-btn" onClick={() => setView('find')}>
          + Find
        </button>
      </div>

      {/* Tabs */}
      <div className="festival-mode-tabs">
        <button className={`shows-tab ${view === 'friends' ? 'active' : ''}`} onClick={() => setView('friends')}>
          Friends ({friends.length})
        </button>
        <button className={`shows-tab ${view === 'requests' ? 'active' : ''}`} onClick={() => setView('requests')}>
          Requests{incoming.length > 0 ? ` (${incoming.length})` : ''}
        </button>
        <button className={`shows-tab ${view === 'find' ? 'active' : ''}`} onClick={() => setView('find')}>
          Find
        </button>
      </div>

      {/* FRIENDS */}
      {view === 'friends' && (
        <>
          {loading ? (
            <div className="upcoming-loading">Loading friends…</div>
          ) : friends.length === 0 ? (
            <div className="shows-empty fade-in">
              <div className="shows-empty-icon">👋</div>
              <p>No friends yet. Search by name or username, or invite your crew.</p>
              <button className="log-submit" style={{ maxWidth: 260, margin: '14px auto 0' }} onClick={invite}>
                Invite friends 🎶
              </button>
            </div>
          ) : (
            <div className="buddy-grid">
              {friends.map((f) => (
                <button
                  key={f.userId}
                  className="buddy-card buddy-card-tappable"
                  onClick={() => setSelectedUserId(f.userId)}
                >
                  <Avatar name={f.displayName || f.username} color={f.avatarColor} url={f.avatarUrl} />
                  <div className="buddy-info">
                    <div className="buddy-name">{f.displayName || f.username}</div>
                    <div className="buddy-shows-count">@{f.username}</div>
                  </div>
                  <span className="buddy-card-chevron">›</span>
                </button>
              ))}
            </div>
          )}

          {/* Legacy free-text buddies (not yet linked to real accounts) */}
          {legacyBuddies.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 24 }}>Tagged on your shows</div>
              <p className="settings-desc" style={{ marginBottom: 12 }}>
                These are names you've tagged on shows. Search their name or username above to connect for real.
              </p>
              <div className="buddy-grid">
                {legacyBuddies.map((b) => (
                  <div key={b.id} className="buddy-card">
                    <Avatar name={b.name} color={b.color} />
                    <div className="buddy-info">
                      <div className="buddy-name">{b.name}</div>
                      <div className="buddy-shows-count">{b.count} show{b.count !== 1 ? 's' : ''} together</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* REQUESTS */}
      {view === 'requests' && (
        <>
          <div className="section-label">Incoming</div>
          {incoming.length === 0 ? (
            <p className="settings-desc">No incoming requests.</p>
          ) : (
            <div className="buddy-grid">
              {incoming.map((r) => (
                <div key={r.userId} className="buddy-card">
                  <Avatar name={r.displayName || r.username} color={r.avatarColor} url={r.avatarUrl} />
                  <div className="buddy-info">
                    <div className="buddy-name">{r.displayName || r.username}</div>
                    <div className="buddy-shows-count">@{r.username}</div>
                  </div>
                  <div className="buddy-req-actions">
                    <button className="buddy-action-btn" onClick={() => handleAccept(r.userId)}>Accept</button>
                    <button className="buddy-action-btn buddy-action-ghost" onClick={() => handleDecline(r.userId)}>Decline</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="section-label" style={{ marginTop: 24 }}>Sent</div>
          {outgoing.length === 0 ? (
            <p className="settings-desc">No pending sent requests.</p>
          ) : (
            <div className="buddy-grid">
              {outgoing.map((r) => (
                <div key={r.userId} className="buddy-card">
                  <Avatar name={r.displayName || r.username} color={r.avatarColor} url={r.avatarUrl} />
                  <div className="buddy-info">
                    <div className="buddy-name">{r.displayName || r.username}</div>
                    <div className="buddy-shows-count">@{r.username}</div>
                  </div>
                  <button className="buddy-action-btn buddy-action-ghost" onClick={() => handleDecline(r.userId)}>Cancel</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* FIND */}
      {view === 'find' && (
        <>
          <BuddySearch
            relationships={relationships}
            onRequest={handleRequest}
            onAccept={handleAccept}
            onOpenProfile={(id) => setSelectedUserId(id)}
          />
          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <p className="settings-desc">Friends not on Melo yet?</p>
            <button className="log-submit" style={{ maxWidth: 260, margin: '8px auto 0' }} onClick={invite}>
              Invite friends 🎶
            </button>
          </div>
        </>
      )}
    </div>
  );
}
