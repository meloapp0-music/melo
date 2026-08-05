// RecapScene — renders ONE scene of a recap cut.
// ==============================================
// Split out of RecapReel once the cut count went from four to sixteen: the reel
// owns timing, taps, audio and chrome; this owns what a scene LOOKS like. Each
// theme is self-contained (including its own backdrop) so adding a look never
// means threading another conditional through the player.
//
// Themes, and the cuts that use them:
//   dark / cinematic / vhs / super8 — full-bleed media behind type
//   scrapbook                       — cream stock, taped snapshot
//   setlist / ranks / words         — dark radial, NO media (no-camera cuts)
//   receipt / poster / stub / diary — paper stocks, print + handwriting
//
// Colors and type come from the handoff's token list; see lib/recapCuts.js for
// which `kind` each cut emits. docs/initiatives/2026-07-16-show-recap-reel.md

import { beatScale } from '../lib/recap';
import { vibeStyle } from '../store';
import { MeloWordmark } from './MeloLogo';

/** Copy in the cuts uses \n where the design breaks a line. */
const Lines = ({ text }) => String(text || '').split('\n').map((l, i) => (
  // eslint-disable-next-line react/no-array-index-key
  <span key={i} className="rc-line">{l}</span>
));

const MEDIA_THEMES = new Set(['dark', 'cinematic', 'vhs', 'super8']);

export default function RecapScene({ scene, fallback = '' }) {
  const theme = scene.theme || 'dark';
  const media = scene.video || scene.media || (MEDIA_THEMES.has(theme) ? fallback : '');
  const isVideo = !!scene.video;

  // ---- Backdrop -----------------------------------------------------------
  const backdrop = MEDIA_THEMES.has(theme) ? (
    <div className={`recap-bg recap-punch${scene.kb === -1 ? ' kb-rev' : ''}`} aria-hidden="true">
      {media ? (
        isVideo
          ? <video src={`${scene.video}#t=0.01`} muted playsInline autoPlay loop className="recap-bg-media recap-kenburns" />
          : <div className="recap-bg-media recap-kenburns" style={{ backgroundImage: `url("${media}")` }} />
      ) : <div className="recap-bg-media" style={{ background: scene.grad }} />}
      <div className="recap-scrim" />
      <div className="recap-grain" />
      {theme === 'vhs' && <><div className="rc-scanlines" /><div className="rc-vhsjit" /></>}
      {theme === 'super8' && <><div className="rc-weave" /><div className="rc-flicker" /></>}
    </div>
  ) : (
    <div className={`recap-bg rc-page rc-page-${theme}`} aria-hidden="true"><div className="recap-grain" /></div>
  );

  return (
    <>
      {backdrop}

      {/* Letterbox — heaviest on Cinematic, per the handoff (46px at 9:16). */}
      {MEDIA_THEMES.has(theme) && <>
        <div className={`recap-letterbox top${theme === 'cinematic' ? ' tall' : ''}`} />
        <div className={`recap-letterbox bottom${theme === 'cinematic' ? ' tall' : ''}`} />
      </>}
      {scene.flash ? <div className="recap-flash" style={{ '--amt': scene.flash }} /> : null}

      {/* `rc-t-` prefix, not `rc-`: several themes name their inner card the
          same as the theme (.rc-stub, .rc-receipt, .rc-poster, .rc-diary), and
          an unprefixed modifier gave the full-bleed body the card's own paper
          background. */}
      <div className={`rc-body rc-t-${theme}`}>
        {/* ================= MEDIA CUTS ================= */}
        {MEDIA_THEMES.has(theme) && (() => {
          if (scene.kind === 'countdown') {
            return (
              <>
                <div className="rc-rank">{scene.rank}</div>
                <div className="rc-rank-label"><Lines text={scene.label} /></div>
              </>
            );
          }
          if (scene.kind === 'countdown-title' || scene.kind === 'clock-title') {
            return (
              <div className="rc-center">
                {scene.eyebrow && <div className="rc-eyebrow">{scene.eyebrow}</div>}
                <div className="rc-huge"><Lines text={scene.big} /></div>
              </div>
            );
          }
          if (scene.kind === 'clock') {
            return (
              <>
                <div className="rc-clock">{scene.time}</div>
                <div className="rc-rank-label"><Lines text={scene.label} /></div>
              </>
            );
          }
          if (scene.kind === 'score') {
            return (
              <div className="rc-center">
                {scene.label && <div className="rc-eyebrow"><Lines text={scene.label} /></div>}
                <div className="recap-verdict-big"><Lines text={scene.big} /></div>
                {scene.sub && <div className="recap-verdict">{scene.sub}</div>}
              </div>
            );
          }
          if (scene.kind === 'title' || scene.kind === 'outro') {
            return (
              <div className="rc-center">
                {scene.eyebrow && <div className="rc-eyebrow">{scene.eyebrow}</div>}
                <div className="recap-headline"><Lines text={scene.big} /></div>
                {scene.sub && <div className="recap-sub"><Lines text={scene.sub} /></div>}
                <div className="recap-wordmark"><MeloWordmark size={17} color="rgba(251,246,238,0.75)" /></div>
              </div>
            );
          }
          // beat
          return (
            <div className={`rc-beat-wrap${scene.layout === 'lower' ? ' lower' : ''}`}>
              <div className="recap-beat" style={{ fontSize: `${Math.round(34 * beatScale(scene.label))}px` }}>
                <Lines text={scene.label} />
              </div>
            </div>
          );
        })()}

        {/* ================= THE SETLIST ================= */}
        {theme === 'setlist' && (
          <div className="rc-center">
            {scene.kind === 'eq-title' && (
              <>
                <div className="rc-eq" aria-hidden="true">{[0, 1, 2, 3, 4].map((k) => <i key={k} style={{ '--k': k }} />)}</div>
                {scene.eyebrow && <div className="rc-eyebrow">{scene.eyebrow}</div>}
                <div className="rc-huge"><Lines text={scene.big} /></div>
              </>
            )}
            {scene.kind === 'roll' && (
              <div className="rc-roll">
                <div className="rc-roll-inner" style={{ '--rows': scene.rows.length }}>
                  {scene.rows.map(([n, song]) => (
                    <div className="rc-roll-row" key={n + song}><span className="rc-roll-n">{n}</span><span>{song}</span></div>
                  ))}
                </div>
              </div>
            )}
            {scene.kind === 'encore' && (
              <>
                <div className="rc-eyebrow">{scene.eyebrow}</div>
                <div className="rc-encore">{scene.rows.map((r) => <div key={r}>{r}</div>)}</div>
              </>
            )}
            {scene.kind === 'tally' && (
              <>
                <div className="rc-stats">
                  {scene.stats.map(([v, k]) => (
                    <div className="rc-stat" key={k}><b>{v}</b><span>{k}</span></div>
                  ))}
                </div>
                <div className="rc-mid"><Lines text={scene.big} /></div>
              </>
            )}
          </div>
        )}

        {/* ================= THE RECEIPT ================= */}
        {theme === 'receipt' && (
          <div className="rc-receipt">
            {scene.kind === 'receipt-head' && (
              <>
                <div className="rc-rc-title"><Lines text={scene.big} /></div>
                <div className="rc-rc-meta">{scene.rows.map((r) => <div key={r}>{r}</div>)}</div>
              </>
            )}
            {scene.kind === 'receipt-items' && (
              <>
                <div className="rc-rc-eyebrow">{scene.eyebrow}</div>
                <div className="rc-rc-items">
                  {scene.rows.map(([k, v]) => (
                    <div className="rc-rc-row" key={k}><span>{k}</span><i /><span>{v}</span></div>
                  ))}
                </div>
              </>
            )}
            {scene.kind === 'receipt-total' && (
              <>
                <div className="rc-rc-eyebrow">{scene.eyebrow}</div>
                <div className="rc-rc-total">{scene.big}</div>
                <div className="rc-rc-sub">{scene.sub}</div>
                <div className="rc-rc-stars">★★★★★</div>
              </>
            )}
            {scene.kind === 'receipt-foot' && (
              <>
                <div className="rc-rc-foot"><Lines text={scene.big} /></div>
                <div className="rc-rc-sub">{scene.sub}</div>
                <div className="rc-barcode" aria-hidden="true" />
              </>
            )}
          </div>
        )}

        {/* ================= WHERE IT RANKS ================= */}
        {theme === 'ranks' && (
          <div className="rc-center">
            {scene.kind === 'rank-intro' && <div className="rc-mid"><Lines text={scene.big} /></div>}
            {scene.kind === 'rank-hero' && (
              <>
                <div className="rc-rank-hero">{scene.big}</div>
                <div className="rc-eyebrow">{scene.sub}</div>
              </>
            )}
            {scene.kind === 'rank-board' && (
              <>
                <div className="rc-eyebrow">{scene.eyebrow}</div>
                <div className="rc-board">
                  {scene.board.map((r) => (
                    <div className={`rc-board-row${r.me ? ' me' : ''}`} key={r.pos} style={{ '--i': r.pos }}>
                      <span className="rc-board-pos">{r.pos}</span>
                      <span className="rc-board-artist">{r.artist}</span>
                      <span className="rc-board-score">{r.score}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {scene.kind === 'rank-outro' && (
              <>
                <div className="rc-mid"><Lines text={scene.big} /></div>
                {scene.sub && <div className="recap-sub">{scene.sub}</div>}
              </>
            )}
          </div>
        )}

        {/* ================= THE GIG POSTER ================= */}
        {theme === 'poster' && (
          <div className={`rc-poster${scene.kind === 'poster-inverse' ? ' inverse' : ''}`}>
            {scene.eyebrow && <div className="rc-po-eyebrow">{scene.eyebrow}</div>}
            {scene.kind === 'poster-main' && (
              <>
                <div className="rc-po-name">{scene.lines.map((l) => <div key={l}>{l}</div>)}</div>
                <div className="rc-po-rule" />
                <div className="rc-po-meta">{scene.rows.map((r) => <div key={r}>{r}</div>)}</div>
              </>
            )}
            {scene.kind === 'poster-inverse' && (
              <>
                <div className="rc-po-big"><Lines text={scene.big} /></div>
                {scene.sub && <div className="rc-po-meta"><div>{scene.sub}</div></div>}
              </>
            )}
            {scene.kind === 'poster-stamp' && (
              <>
                <div className="rc-po-big"><Lines text={scene.big} /></div>
                <div className="rc-po-stamp">{scene.stamp}</div>
              </>
            )}
            {scene.kind === 'poster-foot' && <div className="rc-po-foot"><Lines text={scene.big} /></div>}
          </div>
        )}

        {/* ================= IN YOUR WORDS ================= */}
        {theme === 'words' && (
          <div className="rc-center">
            {scene.kind === 'words-intro' && (
              <>
                <div className="rc-eyebrow">{scene.eyebrow}</div>
                <div className="rc-huge"><Lines text={scene.big} /></div>
              </>
            )}
            {scene.kind === 'words-pills' && (
              <div className="rc-pills">
                {scene.pills.map((v, i) => {
                  const st = vibeStyle(v);
                  return (
                    <span className="rc-pill" key={v} style={{ '--i': i, '--c': st.color || '#F4A261' }}>{v}</span>
                  );
                })}
              </div>
            )}
            {scene.kind === 'words-quote' && (
              <>
                <div className="rc-quotemark" aria-hidden="true">“</div>
                <div className="rc-quote">{scene.big}</div>
                <div className="recap-sub">{scene.sub}</div>
              </>
            )}
            {scene.kind === 'words-verdict' && (
              <>
                <div className="rc-eyebrow">{scene.eyebrow}</div>
                <div className="recap-verdict-big">{scene.big}</div>
              </>
            )}
          </div>
        )}

        {/* ================= TICKET STUBS (+ THE DRAWER) ================= */}
        {theme === 'stub' && (
          <div className="rc-stubwrap">
            {scene.kind === 'stub-drawer' ? (
              <>
                {/* THE DRAWER — your other stubs, fanned. -14° / -4° / +6°. */}
                <div className="rc-drawer">
                  {scene.stubs.map((st, i) => (
                    <div className={`rc-drawer-stub${st.me ? ' me' : ''}`} key={st.artist + st.where} style={{ '--i': i }}>
                      <div className="rc-drawer-artist">{st.artist}</div>
                      <div className="rc-drawer-where">{st.where}</div>
                    </div>
                  ))}
                </div>
                <div className="rc-drawer-cap"><Lines text={scene.big} /></div>
              </>
            ) : (
              <div className={`rc-stub rc-stub-${scene.kind}`}>
                <div className="rc-stub-perf" aria-hidden="true" />
                {scene.tag && <div className="rc-stub-tag">{scene.tag}</div>}
                {scene.eyebrow && <div className="rc-stub-eyebrow">{scene.eyebrow}</div>}
                {scene.media && <div className="rc-stub-photo" style={{ backgroundImage: `url("${scene.media}")` }} />}
                {scene.kind === 'stub-photo'
                  ? <div className="rc-stub-hand">{scene.big}</div>
                  : <div className="rc-stub-head"><Lines text={scene.big} /></div>}
                {scene.sub && <div className="rc-stub-sub"><Lines text={scene.sub} /></div>}
                {scene.rows && (
                  <div className="rc-stub-rows">
                    {scene.rows.map(([k, v]) => (
                      <div className="rc-stub-row" key={k}><span>{k}</span><b>{v}</b></div>
                    ))}
                  </div>
                )}
                {scene.kind === 'stub-rating' && <div className="rc-stub-stars">★★★★★</div>}
                <div className="rc-barcode" aria-hidden="true" />
              </div>
            )}
          </div>
        )}

        {/* ================= SCRAPBOOK ================= */}
        {theme === 'scrapbook' && (
          <div className="rc-scrap">
            {media && (
              <div className="rc-scrap-photo">
                <span className="rc-tape" aria-hidden="true" />
                {isVideo
                  ? <video src={`${scene.video}#t=0.01`} muted playsInline autoPlay loop />
                  : <div className="rc-scrap-img" style={{ backgroundImage: `url("${media}")` }} />}
              </div>
            )}
            {scene.eyebrow && <div className="rc-scrap-eyebrow">{scene.eyebrow}</div>}
            <div className="rc-scrap-hand"><Lines text={scene.label || scene.big} /></div>
            {scene.sub && <div className="rc-scrap-sub"><Lines text={scene.sub} /></div>}
          </div>
        )}

        {/* ================= DEAR DIARY ================= */}
        {theme === 'diary' && (
          <div className="rc-diary">
            {scene.eyebrow && <div className="rc-diary-date">{scene.eyebrow}</div>}
            {scene.media && (
              <div className="rc-diary-photo" style={{ backgroundImage: `url("${scene.media}")` }}>
                <span className="rc-tape" aria-hidden="true" />
              </div>
            )}
            <div className="rc-diary-hand"><Lines text={scene.big} /></div>
            {scene.sub && (
              <div className={scene.kind === 'diary-score' ? 'rc-diary-score' : 'rc-diary-sub'}><Lines text={scene.sub} /></div>
            )}
            {scene.verdict && <div className="rc-diary-verdict">{scene.verdict} 🔥</div>}
          </div>
        )}
      </div>
    </>
  );
}
