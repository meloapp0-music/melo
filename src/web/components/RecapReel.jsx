// RecapReel — the full-screen "melo made you a recap" story reel.
// ================================================================
// Auto-advances through the scenes from buildScenes(show), Wrapped/Story-style:
// cross-fade, an animated cinematic label per beat, a flash on entry, a progress
// bar, and a 9:16 ↔ 1:1 aspect toggle. Story controls: tap right = skip, tap
// left = back, press-and-hold = pause. Faithful to the Melo Recap design; driven
// by real data. See docs/initiatives/2026-07-16-show-recap-reel.md.
//
// Kept presentational + self-contained so the same scene walk can later be
// re-rendered deterministically to Canvas frames for the MP4 export (Phase 2).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App';
import { buildScenes } from '../lib/recap';
import { canExportRecap, exportRecap } from '../lib/recapExport';
import { shareBlob } from '../lib/shareCard';

const PACE = 1; // scene-duration multiplier; the design exposes 12–26s total

export default function RecapReel({ show, onClose }) {
  const { getArtistImage } = useApp();
  const scenes = useMemo(() => buildScenes(show), [show]);
  const [i, setI] = useState(0);
  const [square, setSquare] = useState(false); // false = 9:16, true = 1:1
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 within the current scene
  // MP4 export: null = capability unknown/absent, true = button shows.
  // exporting: null idle | 0..1 encoding progress.
  const [exportable, setExportable] = useState(false);
  const [exporting, setExporting] = useState(null);
  const raf = useRef(0);
  const started = useRef(0);
  const holdTimer = useRef(0);

  const artistImg = getArtistImage(show?.artist);
  const scene = scenes[i];

  // Per-scene timer via rAF (not setInterval) so the progress bar is smooth and
  // pausing is exact. Advancing `i` restarts the clock.
  useEffect(() => {
    if (!scene) return undefined;
    const durMs = scene.dur * PACE * 1000;
    started.current = performance.now();
    let acc = 0;
    const tick = (now) => {
      if (paused) { started.current = now - acc; raf.current = requestAnimationFrame(tick); return; }
      acc = now - started.current;
      const p = Math.min(acc / durMs, 1);
      setProgress(p);
      if (p >= 1) {
        if (i < scenes.length - 1) setI((v) => v + 1);
        else onClose?.(); // reel over
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [i, paused, scene, scenes.length, onClose]);

  // Show the export button only where the pipeline exists (iOS 16.4+ / Chrome).
  useEffect(() => {
    let gone = false;
    canExportRecap().then((ok) => { if (!gone) setExportable(ok); });
    return () => { gone = true; };
  }, []);

  const doExport = async () => {
    if (exporting !== null) return;
    setPaused(true);
    setExporting(0);
    try {
      const blob = await exportRecap(show, { onProgress: setExporting });
      const slug = (show.artist || 'show').replace(/\s+/g, '-').toLowerCase();
      await shareBlob(blob, `melo-recap-${slug}.mp4`, `${show.artist} — melo recap`, undefined, 'video/mp4');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Melo] recap export failed', err);
    } finally {
      setExporting(null);
      setPaused(false);
    }
  };

  const back = () => setI((v) => Math.max(0, v - 1));
  const skip = () => { if (i < scenes.length - 1) setI((v) => v + 1); else onClose?.(); };

  // Tap zones: left third = back, right two-thirds = skip. Hold = pause.
  const onPointerDown = (e) => {
    holdTimer.current = window.setTimeout(() => setPaused(true), 220);
    e.currentTarget._x = e.clientX;
  };
  const onPointerUp = (e) => {
    clearTimeout(holdTimer.current);
    if (paused) { setPaused(false); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX ?? rect.left) - rect.left;
    if (x < rect.width * 0.33) back(); else skip();
  };

  if (!scene) return null;

  // Backdrop: the scene's own media (video/photo) → the show's cover photo →
  // the artist photo → the artist gradient. Always something behind the type.
  const bgMedia = scene.video || scene.media || (show?.photos || [])[0] || artistImg || '';
  const isVideo = !!scene.video;

  const bigCls = scene.kind === 'score' ? 'recap-score-num'
    : scene.kind === 'title' || scene.kind === 'outro' ? 'recap-headline'
      : 'recap-beat';

  return (
    <div className="recap-overlay">
      <button className="recap-close" onClick={onClose} aria-label="Close recap">
        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>

      <div className={`recap-stage ${square ? 'square' : ''}`}>
        {/* Backdrop */}
        <div className="recap-bg" aria-hidden="true">
          {bgMedia ? (
            isVideo ? (
              <video key={scene.id} src={`${scene.video}#t=0.01`} muted playsInline autoPlay loop
                className="recap-bg-media recap-kenburns" />
            ) : (
              <div key={scene.id} className="recap-bg-media recap-kenburns"
                style={{ backgroundImage: `url("${bgMedia}")` }} />
            )
          ) : (
            <div className="recap-bg-media" style={{ background: scene.grad }} />
          )}
          <div className="recap-scrim" />
          <div className="recap-grain" />
        </div>

        {/* Letterbox bars */}
        <div className="recap-letterbox top" />
        <div className="recap-letterbox bottom" />

        {/* Flash on beat entry */}
        {scene.flash ? <div key={`f${scene.id}`} className="recap-flash" style={{ '--amt': scene.flash }} /> : null}

        {/* Content */}
        <div key={scene.id} className="recap-content">
          {scene.label && scene.kind === 'score' && <div className="recap-eyebrow">{scene.label}</div>}
          {scene.big && <div className={bigCls}>{scene.big}</div>}
          {scene.label && scene.kind !== 'score' && <div className="recap-beat">{scene.label}</div>}
          {scene.sub && <div className={scene.kind === 'score' ? 'recap-verdict' : 'recap-sub'}>{scene.sub}</div>}
          {(scene.kind === 'title' || scene.kind === 'outro') && (
            <div className="recap-wordmark">melo</div>
          )}
        </div>

        {/* Progress: one segment per scene, Story-style */}
        <div className="recap-progress">
          {scenes.map((s, idx) => (
            <div key={s.id} className="recap-progseg">
              <div className="recap-progfill" style={{
                transform: `scaleX(${idx < i ? 1 : idx === i ? progress : 0})`,
              }} />
            </div>
          ))}
        </div>

        {/* Tap layer (below the close button in z, above content) */}
        <div className="recap-tap" onPointerDown={onPointerDown} onPointerUp={onPointerUp} />
      </div>

      {/* Aspect toggle + export */}
      <div className="recap-aspect">
        <button className={!square ? 'on' : ''} onClick={() => setSquare(false)}>9:16</button>
        <button className={square ? 'on' : ''} onClick={() => setSquare(true)}>1:1</button>
        {exportable && (
          <button className="recap-export" onClick={doExport} disabled={exporting !== null}>
            {exporting === null ? '📤 Share video' : `Encoding… ${Math.round(exporting * 100)}%`}
          </button>
        )}
      </div>
    </div>
  );
}
