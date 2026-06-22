// Share-card building blocks: wordmark, equalizer motif, real QR, "+N more" link.
// Ported from the design handoff; the QR is a real code (qrcode lib) not a mock.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

const OUTFIT = "'Outfit', sans-serif";
// Same install target the existing exporter uses (lib/shareCard.js).
export const SHARE_QR_URL = 'https://apps.apple.com/us/app/melo-concert-tracker/id6763952800';

// melo wordmark — Outfit 300, lowercase, +0.06em (matches the brand wordmark).
export function Wordmark({ size = 46, color = '#fff', style = {} }) {
  return (
    <span style={{
      fontFamily: OUTFIT, fontWeight: 300, fontSize: size,
      letterSpacing: '0.06em', color, lineHeight: 1, ...style,
    }}>melo</span>
  );
}

// Equalizer-M soundbars — static heights form an M-ish wave; animates when `anim`.
export function Equalizer({ bars = 7, w = 13, gap = 9, h = 120, anim = false,
                            grad = 'linear-gradient(180deg,#fbb040,#ef4136)', style = {} }) {
  const pattern = [0.45, 0.78, 0.55, 1.0, 0.55, 0.78, 0.45];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap, height: h, ...style }}>
      {Array.from({ length: bars }).map((_, i) => {
        const base = pattern[i % pattern.length];
        return (
          <span key={i}
            className={anim ? 'mc-eqbar mc-eqbar-anim' : 'mc-eqbar'}
            style={{
              width: w, height: Math.round(h * base), borderRadius: w,
              background: grad, transformOrigin: 'bottom',
              animationDelay: (i * 0.13) + 's',
              animationDuration: (1.05 + (i % 3) * 0.22) + 's',
            }} />
        );
      })}
    </div>
  );
}

// Real QR code rendered to an <img> (qrcode lib is async, so generate to a data URL).
export function QrCode({ size = 168, dark = '#3D2C1E', light = '#fff', radius = 14,
                         url = SHARE_QR_URL, style = {} }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: 480, color: { dark, light } })
      .then((d) => { if (alive) setSrc(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [url, dark, light]);
  return (
    <div style={{ width: size, height: size, background: light, borderRadius: radius,
                  overflow: 'hidden', flex: '0 0 auto', ...style }}>
      {src && <img src={src} alt="" width={size} height={size}
        style={{ display: 'block', width: '100%', height: '100%' }} />}
    </div>
  );
}

// "+N more ›" — taps open the full-setlist popover (handled by the host view).
export function MoreLink({ n, label, color, size, pad, ls = '0.03em', onMore }) {
  return (
    <div onClick={onMore} style={{ display: 'inline-flex', alignItems: 'center', gap: 7,
      fontFamily: OUTFIT, fontWeight: 700, fontSize: size, color, letterSpacing: ls,
      paddingTop: pad, cursor: onMore ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent' }}>
      + {n} {label}
      <span style={{ fontSize: '1.05em', opacity: 0.7 }}>›</span>
    </div>
  );
}
