import { useState, useEffect, useRef } from 'react';
import { searchUsers } from '../lib/db/profiles';

// Debounced username search box. Renders results with an avatar + handle
// and a per-result action button whose label depends on the current
// relationship (Add / Requested / Accept / Friends). The parent supplies
// `relationships` (userId -> 'friends'|'incoming'|'outgoing') and the
// action handlers. Per buddies-phase-2.
export default function BuddySearch({ relationships = {}, onRequest, onAccept, onOpenProfile }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await searchUsers(query);
        setResults(r);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
        setSearched(true);
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [q]);

  const actionFor = (userId) => {
    const rel = relationships[userId];
    if (rel === 'friends') return { label: 'Friends', disabled: true };
    if (rel === 'outgoing') return { label: 'Requested', disabled: true };
    if (rel === 'incoming') return { label: 'Accept', onClick: () => onAccept?.(userId) };
    return { label: '+ Add', onClick: () => onRequest?.(userId) };
  };

  return (
    <div className="buddy-search">
      <div className="shows-search" style={{ marginBottom: 12 }}>
        <svg viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </svg>
        <input
          placeholder="Search by name or username…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
        />
      </div>

      {loading && <div className="upcoming-loading">Searching…</div>}

      {!loading && searched && results.length === 0 && (
        <div className="shows-empty"><p>No users found for "{q.trim()}".</p></div>
      )}

      <div className="buddy-search-results">
        {results.map((u) => {
          const action = actionFor(u.id);
          return (
            <div key={u.id} className="buddy-search-row">
              <button
                type="button"
                className="buddy-search-main"
                onClick={() => onOpenProfile?.(u.id)}
              >
                <div className="buddy-avatar" style={{
                  background: u.avatarColor,
                  ...(u.avatarUrl ? { backgroundImage: `url(${u.avatarUrl})`, backgroundSize: 'cover' } : {}),
                }}>
                  {!u.avatarUrl && (u.displayName || u.username || '?')[0].toUpperCase()}
                </div>
                <div className="buddy-info">
                  <div className="buddy-name">{u.displayName || u.username}</div>
                  <div className="buddy-shows-count">@{u.username}</div>
                </div>
              </button>
              <button
                type="button"
                className="buddy-action-btn"
                disabled={action.disabled}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
