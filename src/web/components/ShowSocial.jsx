import { useState, useEffect } from 'react';
import { useApp } from '../App';
import {
  reactionSummary, setReaction as dbSetReaction,
  listComments, addComment, deleteComment, reportComment, notifyInteraction,
} from '../lib/db/social';

// Reactions + comments for one show. Rendered inside ShowDetail for any
// show the viewer can see (their own, or a friend's). RLS guarantees a
// non-viewable show returns nothing, so this is safe to mount anywhere.
// Per docs/initiatives/2026-06-14-social-feed-likes-comments.md.

const QUICK = ['❤️', '🔥', '🎸', '🙌', '😍'];

function relTime(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const EMPTY = { count: 0, byEmoji: {}, mine: null };

export default function ShowSocial({ show }) {
  const { profile, showToast, setSelectedUserId } = useApp();
  const me = profile?.id;
  const isShowOwner = show.userId === me;

  const [summary, setSummary] = useState(null); // null = loading
  const [comments, setComments] = useState(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    reactionSummary([show.id])
      .then((m) => { if (!cancelled) setSummary(m.get(show.id) || EMPTY); })
      .catch(() => { if (!cancelled) setSummary(EMPTY); });
    listComments(show.id)
      .then((c) => { if (!cancelled) setComments(c); })
      .catch(() => { if (!cancelled) setComments([]); });
    return () => { cancelled = true; };
  }, [show.id]);

  const react = async (emoji) => {
    setPickerOpen(false);
    const prev = summary || EMPTY;
    // Optimistic recompute (one reaction per user; tapping the same one
    // clears it).
    const next = { count: prev.count, byEmoji: { ...prev.byEmoji }, mine: prev.mine };
    const dec = (e) => { next.byEmoji[e] = Math.max(0, (next.byEmoji[e] || 1) - 1); if (!next.byEmoji[e]) delete next.byEmoji[e]; };
    if (prev.mine === emoji) { dec(emoji); next.count -= 1; next.mine = null; }
    else { if (prev.mine) dec(prev.mine); else next.count += 1; next.byEmoji[emoji] = (next.byEmoji[emoji] || 0) + 1; next.mine = emoji; }
    setSummary(next);
    try {
      const result = await dbSetReaction(show.id, emoji);
      if (result) notifyInteraction(show.id, 'reaction');
    } catch {
      reactionSummary([show.id]).then((m) => setSummary(m.get(show.id) || EMPTY)).catch(() => {});
    }
  };

  const post = async () => {
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    try {
      const c = await addComment(show.id, text);
      setComments((cur) => [...(cur || []), { ...c, author: profile }]);
      setDraft('');
      notifyInteraction(show.id, 'comment');
    } catch {
      showToast?.({ message: 'Couldn’t post that comment.' });
    } finally {
      setPosting(false);
    }
  };

  const removeComment = async (c) => {
    if (!confirm('Delete this comment?')) return;
    const prev = comments;
    setComments((cur) => (cur || []).filter((x) => x.id !== c.id));
    try {
      await deleteComment(c.id);
    } catch {
      setComments(prev); // restore — the delete didn't take
      showToast?.({ message: 'Couldn’t delete that.' });
    }
  };

  const flagComment = async (c) => {
    try { await reportComment(c.id); showToast?.({ message: 'Reported. Thanks for keeping Melo safe.' }); }
    catch { showToast?.({ message: 'Couldn’t report that.' }); }
  };

  const reactedLabel = summary && summary.count > 0
    ? Object.entries(summary.byEmoji).sort((a, b) => b[1] - a[1]).map(([e]) => e).join(' ')
    : '';

  return (
    <div className="social-block">
      {/* Reactions */}
      <div className="social-react-row">
        <button
          className={`social-like-btn ${summary?.mine ? 'active' : ''}`}
          onClick={() => react(summary?.mine || '❤️')}
          aria-label={summary?.mine ? 'Remove your reaction' : 'Like this show'}
        >
          <span className="social-like-emoji">{summary?.mine || '❤️'}</span>
          {summary && summary.count > 0 && <span className="social-like-count">{summary.count}</span>}
        </button>
        <button
          className="social-react-add"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="React with an emoji"
        >
          {pickerOpen ? '×' : '😀+'}
        </button>
        {reactedLabel && !pickerOpen && (
          <span className="social-react-summary">{reactedLabel}</span>
        )}
        {pickerOpen && (
          <div className="social-emoji-picker">
            {QUICK.map((e) => (
              <button
                key={e}
                className={`social-emoji ${summary?.mine === e ? 'active' : ''}`}
                onClick={() => react(e)}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Comments */}
      <div className="social-comments">
        <div className="social-comments-title">
          {comments && comments.length > 0 ? `Comments (${comments.length})` : 'Comments'}
        </div>

        {comments === null ? (
          <div className="social-comments-loading">Loading…</div>
        ) : comments.length === 0 ? (
          <div className="social-comments-empty">Be the first to say something 🎶</div>
        ) : (
          <div className="social-comment-list">
            {comments.map((c) => {
              const name = c.author?.displayName || c.author?.username || 'Someone';
              const canDelete = c.userId === me || isShowOwner;
              return (
                <div key={c.id} className="social-comment">
                  <button
                    className="social-comment-avatar"
                    aria-label={`View ${name}`}
                    onClick={() => c.userId !== me && setSelectedUserId(c.userId)}
                    style={
                      c.author?.avatarUrl
                        ? { backgroundImage: `url(${c.author.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                        : { background: c.author?.avatarColor || '#9B8A7E' }
                    }
                  >
                    {!c.author?.avatarUrl && name[0].toUpperCase()}
                  </button>
                  <div className="social-comment-body">
                    <div className="social-comment-head">
                      <span className="social-comment-name">{name}</span>
                      <span className="social-comment-time">{relTime(c.createdAt)}</span>
                    </div>
                    <div className="social-comment-text">{c.body}</div>
                    <div className="social-comment-actions">
                      {canDelete && (
                        <button onClick={() => removeComment(c)}>Delete</button>
                      )}
                      {c.userId !== me && (
                        <button onClick={() => flagComment(c)}>Report</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="social-comment-input">
          <input
            className="log-input"
            placeholder="Add a comment…"
            value={draft}
            maxLength={1000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') post(); }}
          />
          <button
            className="social-comment-post"
            onClick={post}
            disabled={posting || !draft.trim()}
          >
            {posting ? '…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
