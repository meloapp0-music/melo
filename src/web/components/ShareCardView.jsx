// Share-view shell — the full-screen "share your show" experience.
// Auto-picks a style, scales the fixed 1080 canvas to fit, floats a dock clear of
// the card's QR, and exports the real card to a PNG for share-to-story.
import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { shareBlob, renderShowCard } from '../lib/shareCard';
import ShareCardVibe from './ShareCardVibe';
import ShareCardPoster from './ShareCardPoster';
import ShareCardMarquee from './ShareCardMarquee';
import ShareCardPlayer from './ShareCardPlayer';
import ShareCardTicket from './ShareCardTicket';

const CARD = {
  vibe: ShareCardVibe, poster: ShareCardPoster, marquee: ShareCardMarquee,
  player: ShareCardPlayer, ticket: ShareCardTicket,
};
const STYLES = [
  { key: 'vibe', name: 'Vibe', mini: 'Mood + setlist' },
  { key: 'poster', name: 'Poster', mini: 'Photo gig' },
  { key: 'marquee', name: 'Marquee', mini: 'In lights' },
  { key: 'player', name: 'Player', mini: 'Now playing' },
  { key: 'ticket', name: 'Ticket', mini: 'Collectible' },
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

// Smart auto-pick: a show with photos opens photo-forward (Poster); otherwise the
// generative Vibe card, tinted by the show's own logged vibes.
function autoPick(show) {
  const hasPhotos = (show.photos || []).length > 0;
  return hasPhotos
    ? { style: 'poster', photos: true, theme: 'artist' }
    : { style: 'vibe', photos: false, theme: 'vibe' };
}

// iOS Safari / WKWebView sometimes hands html-to-image an all-black frame (a
// foreignObject + external-image limitation). Detect it by sampling the PNG
// small, so we can fall back to the canvas-drawn card instead of a black share.
function isBlankImage(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = 48, h = 85;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const cx = c.getContext('2d');
        cx.drawImage(img, 0, 0, w, h);
        const d = cx.getImageData(0, 0, w, h).data;
        let lit = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] > 28 || d[i + 1] > 28 || d[i + 2] > 28) lit++;
        }
        resolve(lit < w * h * 0.01); // <1% non-dark pixels → a blank capture
      } catch { resolve(false); }
    };
    img.onerror = () => resolve(true);
    img.src = dataUrl;
  });
}

export default function ShareCardView({ show, handle, onShared, onClose, firstRun = false }) {
  const pick = autoPick(show);
  const [style, setStyle] = useState(pick.style);
  const [format, setFormat] = useState('9x16');
  const [theme, setTheme] = useState(pick.theme);
  const [photos, setPhotos] = useState(pick.photos);
  const [anim, setAnim] = useState(true);
  const [flags, setFlags] = useState({ vibes: true, setlist: true, date: true, venue: true, rating: false });
  const [scale, setScale] = useState(0.32);
  const [customize, setCustomize] = useState(false);
  const [fullList, setFullList] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState('');
  const stageRef = useRef(null);
  const exportRef = useRef(null);

  const cardW = 1080, cardH = format === '9x16' ? 1920 : 1080;
  const Card = CARD[style] || ShareCardVibe;
  const hasPhotos = (show.photos || []).length > 0;

  useEffect(() => {
    const el = stageRef.current; if (!el) return;
    const fit = () => {
      // Reserve space from the stage's ACTUAL padding (which now includes the
      // device safe-area at top + bottom) so the card never collides with the
      // status bar / Dynamic Island or the dock.
      const cs = getComputedStyle(el);
      const padX = parseFloat(cs.paddingLeft) || 0;
      const padT = parseFloat(cs.paddingTop) || 0;
      const padB = parseFloat(cs.paddingBottom) || 0;
      const aw = el.clientWidth - padX * 2;
      const ah = el.clientHeight - padT - padB;
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
      const node = exportRef.current;
      let ok = false;
      if (node) {
        // Wait for the brand fonts + the card's images before rasterizing.
        // html2canvas paints any glyph whose web-font hasn't finished loading in a
        // FALLBACK face — which lands part of a word on the wrong baseline mid-title.
        // document.fonts.ready alone resolves too eagerly in the iOS webview, so
        // explicitly load every weight the cards use before capturing.
        try {
          if (document.fonts?.load) {
            await Promise.all(
              ['600 1em Outfit', '700 1em Outfit', '800 1em Outfit',
               '500 1em "DM Sans"', '600 1em "DM Sans"', '700 1em "DM Sans"']
                .map((f) => document.fonts.load(f).catch(() => {})));
          }
          if (document.fonts?.ready) await document.fonts.ready;
        } catch { /* noop */ }
        await Promise.all([...node.querySelectorAll('img')].map((img) =>
          img.complete ? null
            : img.decode ? img.decode().catch(() => {})
            : new Promise((r) => { img.onload = img.onerror = r; })));
        // Rasterize with html2canvas (NOT html-to-image): it paints the DOM to a
        // canvas directly, without the SVG <foreignObject> that the iOS WKWebView
        // renders blank — so the user's actual chosen card STYLE exports on device.
        let dataUrl = '';
        try {
          const canvas = await html2canvas(node, {
            backgroundColor: '#110C07', useCORS: true, scale: 1,
            width: cardW, height: cardH, windowWidth: cardW, windowHeight: cardH,
            logging: false,
          });
          dataUrl = canvas.toDataURL('image/png');
        } catch { /* fall through to the canvas-drawn card below */ }
        // Safety net: if the capture failed or came back blank, use the reliable
        // canvas-drawn card so a share is never a black screen.
        const blob = (!dataUrl || await isBlankImage(dataUrl))
          ? await renderShowCard(show, handle)
          : await (await fetch(dataUrl)).blob();
        const slug = (show.artist || 'show').replace(/\s+/g, '-').toLowerCase();
        ok = await shareBlob(blob, `melo-${slug}.png`, `${show.artist} — I was there`);
      }
      if (ok) { onShared?.(); setToast('Shared to your story ✨'); }
    } catch {
      setToast('Could not make the image — try again');
    } finally {
      setSharing(false);
      setTimeout(() => setToast(''), 2200);
    }
  };

  // Re-mount the card on these so entrance animations replay.
  const cardKey = style + theme + format + photos + anim + JSON.stringify(flags);
  const setlist = show.setlist || [];

  // The card (shared by preview + the hidden export node). Export uses anim=false
  // so the captured frame is the final, fully-revealed state.
  const renderCard = (forExport) => (
    <Card show={show} theme={theme} format={format} photos={photos} flags={flags}
      anim={forExport ? false : anim} handle={handle}
      onMore={forExport ? undefined : () => setFullList(true)} />
  );

  return (
    <div className="sc-overlay">
      <div className="sc-stage" ref={stageRef}>
        <div className="sc-topbar">
          <button className="sc-close" onClick={onClose} aria-label="Close">✕</button>
          <span className="sc-title">{firstRun ? 'Your first Melo card 🎉' : 'Share your show'}</span>
          <span style={{ width: 38 }} />
        </div>

        {/* the scaled fixed-canvas card */}
        <div className="sc-frame" style={{ width: cardW * scale, height: cardH * scale }}>
          <div style={{ width: cardW, height: cardH, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <div key={cardKey} style={{ position: 'absolute', inset: 0 }}>
              {renderCard(false)}
            </div>
          </div>
        </div>

        {/* floating dock — kept clear of the card's footer/QR */}
        <div className="sc-dock">
          <button className="sc-ghost" onClick={() => setCustomize(true)}>
            <span style={{ fontSize: 17 }}>✨</span> Customize
          </button>
          <button className="sc-primary" onClick={doShare} disabled={sharing}>
            {sharing ? 'Making your card…' : 'Share to your story'}
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
                      onClick={() => setStyle(s.key)}>
                      {s.name}<span className="mini">{s.mini}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="sc-group">
                <div className="sc-switch-row">
                  <div>
                    <div className="t">Use my photos</div>
                    <div className="d">{hasPhotos
                      ? (photos ? 'Showing your show photos' : 'Off — generative artwork')
                      : 'No photos on this show'}</div>
                  </div>
                  <button className={'sc-sw' + (photos ? ' on' : '')} disabled={!hasPhotos}
                    onClick={() => hasPhotos && setPhotos((p) => !p)} aria-label="Toggle photos" />
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

      {/* hidden full-size (1080) copy used only for PNG export */}
      <div ref={exportRef} aria-hidden="true"
        style={{ position: 'fixed', left: -99999, top: 0, width: cardW, height: cardH,
                 pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0 }}>{renderCard(true)}</div>
      </div>
    </div>
  );
}
