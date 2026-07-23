// RecapSpike — THROWAWAY diagnostic screen for the recap MP4 export (Phase 2).
// ===========================================================================
// The entire Phase 2 build is gated on one undocumented question: does WebCodecs
// work inside the Capacitor WKWebView? This screen answers it on-device in ~a
// minute, per docs/initiatives/2026-07-16-show-recap-reel.md ("THE SPIKE"):
//
//   1. Encode capability — canEncodeVideo('avc' @1080×1920) + a direct
//      VideoEncoder.isConfigSupported cross-check (in case mediabunny masks it).
//   2. Decode capability — canDecodeVideo for AVC and HEVC (iPhone clips are
//      typically HEVC; a "no" here degrades video beats to poster frames).
//   3. End-to-end encode — 30 real frames through OffscreenCanvas → CanvasSource
//      → Mp4OutputFormat(fastStart in-memory) → BufferTarget → a playable Blob.
//   4. Decode one frame from the user's OWN uploaded clip (if any) and draw it.
//   5. Share the encoded Blob as video/mp4 — the human checks whether Instagram
//      appears in the sheet (that claim was never live-verified by research).
//
// PASS = 1✓ 3✓ (playable, >0 bytes) and IG visible in 5. Entry is gated in
// Settings to the founder account. DELETE this file when the spike is done.

import { useRef, useState } from 'react';
import { useApp } from '../App';
import {
  Output, Mp4OutputFormat, BufferTarget, CanvasSource,
  canEncodeVideo, canDecodeVideo, Input, BlobSource, VideoSampleSink, ALL_FORMATS,
} from 'mediabunny';
import { shareBlob } from '../lib/shareCard';

const W = 1080, H = 1920, FPS = 30, FRAMES = 30; // a 1s test clip

export default function RecapSpike() {
  const { navigate, shows } = useApp();
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const blobRef = useRef(null);
  const decodeCanvasRef = useRef(null);

  const add = (status, text) => setLog((l) => [...l, { status, text, t: Date.now() }]);

  const run = async () => {
    if (running) return;
    setRunning(true); setLog([]); setVideoUrl(''); blobRef.current = null;

    // ---- 1. Encode capability --------------------------------------------
    try {
      const hasVE = typeof window.VideoEncoder !== 'undefined';
      add(hasVE ? 'ok' : 'fail', `window.VideoEncoder present: ${hasVE}`);
      if (hasVE) {
        const direct = await window.VideoEncoder.isConfigSupported({
          codec: 'avc1.42E028', width: W, height: H, bitrate: 8_000_000, framerate: FPS,
        }).catch((e) => ({ supported: `threw: ${e.message}` }));
        add(direct.supported === true ? 'ok' : 'warn', `isConfigSupported(avc L4.0 @1080×1920): ${direct.supported}`);
      }
      const can = await canEncodeVideo('avc', { width: W, height: H, bitrate: 8_000_000 });
      add(can ? 'ok' : 'fail', `mediabunny canEncodeVideo('avc' 1080×1920): ${can}`);
      if (!can) throw new Error('encode capability absent — MP4 path is dead on this OS/webview');
    } catch (e) {
      add('fail', `Capability check failed: ${e.message}`);
      setRunning(false); return;
    }

    // ---- 2. Decode capability --------------------------------------------
    for (const codec of ['avc', 'hevc']) {
      try {
        const ok = await canDecodeVideo(codec, { width: 1920, height: 1080 });
        add(ok ? 'ok' : 'warn', `canDecodeVideo('${codec}'): ${ok}${codec === 'hevc' && !ok ? ' — HEVC clips would fall back to poster frames' : ''}`);
      } catch (e) { add('warn', `canDecodeVideo('${codec}') threw: ${e.message}`); }
    }

    // ---- 3. End-to-end encode --------------------------------------------
    try {
      const t0 = performance.now();
      const canvas = new OffscreenCanvas(W, H);
      const ctx = canvas.getContext('2d');
      const source = new CanvasSource(canvas, { codec: 'avc', bitrate: 8_000_000, keyFrameInterval: 2 });
      const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
      output.addVideoTrack(source, { frameRate: FPS });
      await output.start();
      for (let f = 0; f < FRAMES; f++) {
        ctx.fillStyle = `hsl(${18 + f * 2} 60% ${20 + f}%)`; // ember sweep
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#FBF6EE';
        ctx.font = '700 160px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${f + 1}`, W / 2, H / 2);
        ctx.font = '600 54px Outfit, sans-serif';
        ctx.fillText('melo recap spike', W / 2, H / 2 + 120);
        await source.add(f / FPS, 1 / FPS); // awaiting = the whole backpressure story
      }
      await output.finalize();
      const bytes = output.target.buffer;
      if (!bytes || bytes.byteLength === 0) throw new Error('finalize produced 0 bytes');
      const blob = new Blob([bytes], { type: 'video/mp4' });
      blobRef.current = blob;
      setVideoUrl(URL.createObjectURL(blob));
      add('ok', `Encoded ${FRAMES} frames → ${(blob.size / 1024).toFixed(0)} KB mp4 in ${((performance.now() - t0) / 1000).toFixed(1)}s — confirm it PLAYS below`);
    } catch (e) {
      add('fail', `End-to-end encode failed: ${e.message}`);
      setRunning(false); return;
    }

    // ---- 4. Decode a frame from the user's own clip ----------------------
    const clip = shows.flatMap((s) => s.videos || []).find(Boolean);
    if (!clip) {
      add('warn', 'No uploaded clips on this account — decode-real-clip test skipped');
    } else {
      try {
        const res = await fetch(clip);
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const input = new Input({ source: new BlobSource(await res.blob()), formats: ALL_FORMATS });
        const track = await input.getPrimaryVideoTrack();
        if (!track) throw new Error('no video track found');
        const sink = new VideoSampleSink(track);
        const sample = await sink.getSample(0.1);
        if (!sample) throw new Error('no sample at t=0.1');
        const c = decodeCanvasRef.current;
        if (c) {
          c.width = 180; c.height = 320;
          sample.draw(c.getContext('2d'), 0, 0, 180, 320);
        }
        sample.close();
        add('ok', 'Decoded + drew a frame from your own uploaded clip (below) — video beats in the export are GO');
      } catch (e) {
        add('warn', `Real-clip decode failed: ${e.message} — video beats would fall back to poster frames`);
      }
    }

    add('ok', 'Automated checks done. Now tap "Share test MP4" and check whether INSTAGRAM appears in the sheet.');
    setRunning(false);
  };

  const share = async () => {
    if (!blobRef.current) return;
    const ok = await shareBlob(blobRef.current, 'melo-recap-spike.mp4', 'Melo recap spike', undefined, 'video/mp4');
    add(ok ? 'ok' : 'warn', ok ? 'Share sheet completed — was Instagram in the list?' : 'Share dismissed or unavailable');
  };

  const icon = { ok: '✅', warn: '⚠️', fail: '❌' };

  return (
    <div className="page page-top">
      <button className="back-btn" onClick={() => navigate('settings')}>
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
        Settings
      </button>
      <div className="shows-header" style={{ marginBottom: 6 }}><h1>Recap export spike</h1></div>
      <p style={{ color: 'var(--brown-muted)', fontSize: 13.5, marginTop: 0 }}>
        Throwaway diagnostics for the MP4 export. Run on a real device via Xcode.
      </p>

      <button className="detail-share-btn" onClick={run} disabled={running} style={{ marginTop: 12 }}>
        {running ? 'Running…' : '▶️ Run spike tests'}
      </button>
      <button className="detail-recap-btn" onClick={share} disabled={!videoUrl}>
        📤 Share test MP4 (check for Instagram)
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {log.map((e, i) => (
          <div key={i} style={{ fontSize: 13, lineHeight: 1.45, background: '#fff', borderRadius: 10, padding: '9px 12px', color: '#2B1D12' }}>
            {icon[e.status]} {e.text}
          </div>
        ))}
      </div>

      {videoUrl && (
        <div style={{ marginTop: 14 }}>
          <div className="log-section-hint">The encoded test clip — does it play?</div>
          <video src={videoUrl} controls playsInline muted style={{ width: 160, borderRadius: 12, marginTop: 6 }} />
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <div className="log-section-hint">Decoded frame from your clip (test 4):</div>
        <canvas ref={decodeCanvasRef} style={{ width: 90, borderRadius: 10, background: '#17120C', marginTop: 6 }} />
      </div>
      <div style={{ height: 30 }} />
    </div>
  );
}
