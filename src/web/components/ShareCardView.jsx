// Share-view shell — the full-screen "share your show" experience.
// Auto-generates a card, scales the fixed 1080 canvas to fit, and floats a dock
// (Customize + Share to your story) clear of the card's QR. Phase 1: Vibe style.
import { useEffect, useRef, useState } from 'react';
import ShareCardVibe from './ShareCardVibe';
import { shareShowCard } from '../lib/shareCard';

const STYLES = [
  { key: 'vibe', name: 'Vibe', mini: 'Mood + setlist' },
  { key: 'poster', name: 'Poster', mini: 'Soon' },
  { key: 'marquee', name: 'Marquee', mini: 'Soon' },
  { key: 'player', name: 'Player', mini: 'Soon' },
  { key: 'ticket', name: 'Ticket', mini: 'Soon' },
];
const THEMES = [
  { key: 'vibe', name: 'Vibe', sw: 'linear-gradient(135deg,#4B7BE5,#D65DB1)' },
  { key: 'ember', name: 'Ember', sw: 'linear-gradient(135deg,#F4A261,#E8573A)' },
  { key: 'artist', name: 'Artist', sw: 'linear-gradient(135deg,#7a4bd8,#2A1D13)' },
  { key: 'midnight', name: 'Midnight', sw: 'linear-gradient(135deg,#3a2718,#140C07)' },
];
const FLAG_DEFS = [
  { key: 'vibes', label: 'Vibes' }, { key: 'setlist', label: 'Setlist' },
  { key: 'date', label: 'Date' }, { key: 'venue', label: 'Venue' }, { key: 'rating', label: 'Rating' },
];

export default function ShareCardView({ show, handle, onShared, onClose }) {
  // Smart auto-pick (Phase 1 = the no-photo Vibe path, tinted by the show's vibes).
  const [style, setStyle] = useState('vibe');
  const [format, setFormat] = useState('9x16');
  const [theme, setTheme] = useState('vibe');
  const [anim, setAnim] = useState(true);
  const [flags, setFlags] = useState({ vibes: true, setlist: true, date: true, venue: true, rating: false });
  const [scale, setScale] = useState(0.32);
  const [customize, setCustomize] = useState(false);
  const [fullList, setFullList] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState('');
  const stageRef = useRef(null);

  const cardW = 1080, cardH = format === '9x16' ? 1920 : 1080;

  useEffect(() => {
    const el = stageRef.current; if (!el) return;
    const fit = () => {
      const top = 58, bottom = 112, side = 16;
      const aw = el.clientWidth - side * 2;
      const ah = el.clientHeight - top - bottom;
      setScale(Math.max(0.1, Math.min(aw / cardW, ah / cardH, 0.62)));
    };
    fit();
    requestAnimationFrame(fit);
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [cardW, cardH]);

  const toggleFlag = (k) => setFlags((f) => ({ ...f, [k]: !f[k] }));

  const doShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      // Interim: the existing canvas exporter. New-card raster export is a follow-up.
      const ok = await shareShowCard(show, handle);
      if (ok) { onShared?.(); setToast('Shared to your story ✨'); }
    } catch {
      setToast('Could not share — try again');
    } finally {
      setSharing(false);
      setTimeout(() => setToast(''), 2200);
    }
  };

  // Re-mount the card on these so entrance animations replay.
  const cardKey = style + theme + format + anim + JSON.stringify(flags);
  const setlist = show.setlist || [];

  return (
    <div className="sc-overlay">
      <div className="sc-stage" ref={stageRef}>
        <div className="sc-topbar">
          <button className="sc-close" onClick={onClose} aria-label="Close">✕</button>
          <span className="sc-title">Share your show</span>
          <span style={{ width: 38 }} />
        </div>

        {/* the scaled fixed-canvas card */}
        <div className="sc-frame" style={{ width: cardW * scale, height: cardH * scale }}>
          <div style={{ width: cardW, height: cardH, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <div key={cardKey} style={{ position: 'absolute', inset: 0 }}>
              <ShareCardVibe show={show} theme={theme} format={format} flags={flags}
                anim={anim} handle={handle} onMore={() => setFullList(true)} />
            </div>
          </div>
        </div>

        {/* floating dock — kept clear of the card's footer/QR */}
        <div className="sc-dock">
          <button className="sc-ghost" onClick={() => setCustomize(true)}>
            <span style={{ fontSize: 17 }}>✨</span> Customize
          </button>
          <button className="sc-primary" onClick={doShare} disabled={sharing}>
            {sharing ? 'Sharing…' : 'Share to your story'}
          </button>
        </div>

        {/* full-setlist popover — compact, card-width, opens from "+N more" */}
        {fullList && (
          <>
            <div className="sc-modal-scrim" onClick={() => setFullList(false)} />
            <div className="sc-modal" style={{ width: Math.round(cardW * scale * 0.86),
                  maxHeight: Math.round(cardH * scale * 0.78) }}>
              <h3>Full setlist</h3>
              <p className="sc-sub" style={{ margin: '2px 0 14px' }}>{show.artist} · {show.venue}</p>
              <div>
                {setlist.map((t, i) => (
                  <div key={i} className="fs-row">
                    <span className="fs-num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="fs-name">{t}</span>
                  </div>
                ))}
              </div>
              <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 13,
                            color: 'var(--brown-muted)', marginTop: 18 }}>
                {setlist.length} songs{show.city ? ` · ${show.city}` : ''}
              </div>
            </div>
          </>
        )}

        {/* customize bottom sheet */}
        {customize && (
          <>
            <div className="sc-scrim" onClick={() => setCustomize(false)} />
            <div className="sc-sheet">
              <div className="sc-grip" />
              <h3>Make it yours</h3>
              <p className="sc-sub" style={{ margin: '0 0 6px' }}>Your card's already made — change anything, or just hit share.</p>

              <div className="sc-group">
                <div className="sc-lbl">Style</div>
                <div className="sc-seg col3">
                  {STYLES.map((s) => (
                    <button key={s.key} className={'sc-seg-btn' + (s.key === style ? ' on' : '')}
                      disabled={s.key !== 'vibe'} onClick={() => s.key === 'vibe' && setStyle(s.key)}>
                      {s.name}<span className="mini">{s.mini}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="sc-group">
                <div className="sc-lbl">Format</div>
                <div className="sc-seg">
                  <button className={'sc-seg-btn' + (format === '9x16' ? ' on' : '')} style={{ flex: 1 }}
                    onClick={() => setFormat('9x16')}>Story<span className="mini">9 : 16</span></button>
                  <button className={'sc-seg-btn' + (format === '1x1' ? ' on' : '')} style={{ flex: 1 }}
                    onClick={() => setFormat('1x1')}>Post<span className="mini">1 : 1</span></button>
                </div>
              </div>

              <div className="sc-group">
                <div className="sc-lbl">Color theme</div>
                <div className="sc-swatches">
                  {THEMES.map((t) => (
                    <button key={t.key} className={'sc-swatch' + (t.key === theme ? ' on' : '')}
                      style={{ background: t.sw }} title={t.name} onClick={() => setTheme(t.key)}>
                      <span className="nm">{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="sc-group">
                <div className="sc-switch-row">
                  <div>
                    <div className="t">Animate</div>
                    <div className="d">Looping motion — great for video stories</div>
                  </div>
                  <button className={'sc-sw' + (anim ? ' on' : '')} onClick={() => setAnim((a) => !a)} aria-label="Toggle animation" />
                </div>
              </div>

              <div className="sc-group">
                <div className="sc-lbl">Show on card</div>
                <div className="sc-chips">
                  {FLAG_DEFS.map((f) => (
                    <button key={f.key} className={'sc-chip' + (flags[f.key] ? ' on' : '')}
                      onClick={() => toggleFlag(f.key)}>{f.label}</button>
                  ))}
                </div>
              </div>

              <button className="sc-share-btn" onClick={() => { setCustomize(false); doShare(); }}>Share to your story</button>
            </div>
          </>
        )}

        {toast && <div className="sc-toast">{toast}</div>}
      </div>
    </div>
  );
}
