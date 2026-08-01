// RecapPicker — "One recap · every vibe".
// =======================================
// The cut gallery from the design handoff (§5): all sixteen cuts grouped into
// four tiers in the handoff's order — No camera needed (badged "always on"),
// Quick, Style, then Memory (badged "resurfaces over time"). Cuts whose Canvas
// exporter isn't written yet still play in-app; they're marked, not hidden, so
// the shelf reads as the full system it is.
//
// Cuts this show can't fill are shown DIMMED with the reason rather than
// removed — "add 2 more photos" is an invitation to finish logging the show,
// and a gallery that silently shrinks teaches nothing.
//
// docs/initiatives/2026-07-16-show-recap-reel.md

import { eligibleCuts, TIERS, TIER_BADGE } from '../lib/recapCuts';

/** Why a cut is greyed out — phrased as the thing to go add. */
function missing(cut, show, shows) {
  const n = cut.needs || {};
  const media = (show.photos || []).length + (show.videos || []).length;
  const songs = (show.setlist || []).filter(Boolean).length;
  if (n.media && media < n.media) return `Add ${n.media - media} more photo${n.media - media === 1 ? '' : 's'}`;
  if (n.songs && songs < n.songs) return 'Add the setlist';
  if (n.score && !(show.score > 0)) return 'Rate the show';
  if (n.words) return 'Add vibes or a note';
  if (n.library && (shows || []).length < n.library) return 'Log a few more shows';
  if (n.aged) return 'Once the night is a year behind you';
  return 'Not available yet';
}

export default function RecapPicker({ current, onPick, onClose, show = {}, shows = [] }) {
  const cuts = eligibleCuts(show, { shows });
  return (
    <div className="cutpick-overlay">
      <div className="cutpick-sheet">
        <div className="cutpick-head">
          <div>
            <div className="cutpick-title">One recap · every vibe</div>
            <div className="cutpick-sub">Pick how tonight gets told.</div>
          </div>
          <button className="cutpick-x" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="cutpick-scroll">
          {TIERS.map((tier) => {
            const inTier = cuts.filter((c) => c.tier === tier);
            if (!inTier.length) return null;
            return (
              <div key={tier} className="cutpick-tier">
                <div className="cutpick-tier-head">
                  <span className="cutpick-tier-name">{tier}</span>
                  {TIER_BADGE[tier] && <span className="cutpick-tier-badge">{TIER_BADGE[tier]}</span>}
                </div>
                <div className="cutpick-list">
                  {inTier.map((c) => (
                    <button
                      key={c.id}
                      className={`cutpick-card${c.id === current ? ' on' : ''}${c.ok ? '' : ' off'}`}
                      onClick={() => c.ok && onPick(c.id)}
                      disabled={!c.ok}
                    >
                      <span className={`cutpick-swatch sw-${c.id}`} aria-hidden="true" />
                      <span className="cutpick-meta">
                        <span className="cutpick-name">
                          {c.name}
                          {c.default && <span className="cutpick-badge">Default</span>}
                        </span>
                        <span className="cutpick-blurb">{c.blurb}</span>
                        {!c.ok
                          ? <span className="cutpick-note lock">🔒 {missing(c, show, shows)}</span>
                          : !c.exportable && <span className="cutpick-note">In-app only for now</span>}
                      </span>
                      {c.id === current && <span className="cutpick-check">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="cutpick-foot">
            The five up top need no photos at all — they build themselves from what you logged.
          </div>
        </div>
      </div>
    </div>
  );
}
