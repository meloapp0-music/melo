// RecapPicker — "One recap · every vibe".
// =======================================
// The cut gallery from the design handoff (§5): every recap style grouped into
// Quick / Style / Memory tiers. Beat drop is the one-tap default; the rest are
// a choice. Cuts whose Canvas exporter isn't written yet still play in-app —
// they're just marked as in-app only rather than hidden, so the shelf reads as
// the full system it is.
//
// docs/initiatives/2026-07-16-show-recap-reel.md

import { CUTS, TIERS } from '../lib/recapCuts';

export default function RecapPicker({ current, onPick, onClose }) {
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
            const cuts = CUTS.filter((c) => c.tier === tier);
            if (!cuts.length) return null;
            return (
              <div key={tier} className="cutpick-tier">
                <div className="cutpick-tier-name">{tier}</div>
                <div className="cutpick-list">
                  {cuts.map((c) => (
                    <button
                      key={c.id}
                      className={`cutpick-card${c.id === current ? ' on' : ''}`}
                      onClick={() => onPick(c.id)}
                    >
                      <span className={`cutpick-swatch sw-${c.id}`} aria-hidden="true" />
                      <span className="cutpick-meta">
                        <span className="cutpick-name">
                          {c.name}
                          {c.default && <span className="cutpick-badge">Default</span>}
                        </span>
                        <span className="cutpick-blurb">{c.blurb}</span>
                        {!c.exportable && <span className="cutpick-note">In-app only for now</span>}
                      </span>
                      {c.id === current && <span className="cutpick-check">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="cutpick-foot">More cuts on the way — Top 10 moments, Real time, VHS, Super 8, One year ago.</div>
        </div>
      </div>
    </div>
  );
}
