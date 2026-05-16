// exportShows.js — turn the user's show history into a portable file.
// Per docs/initiatives/2026-05-13-data-export.md.
//
// Pure + client-side: no network, no backend. Shows are already loaded
// in the AppContext, so export is a local transform. This is the
// "your data is yours" trust signal — it directly answers the
// concert-tracker-longevity objection (a dead app shouldn't strand
// your history).

// Pipe-join an array field so commas inside a value don't break the
// CSV cell. Readable in Sheets / Excel / Numbers without mangling.
const pipe = (arr) => (Array.isArray(arr) ? arr.filter(Boolean).join(' | ') : '');

// RFC-4180 CSV cell: always quote, and double any internal quote.
const cell = (val) => {
  const s = val == null ? '' : String(val);
  return `"${s.replace(/"/g, '""')}"`;
};

// [column header, value extractor]. Order = column order in the file.
const COLUMNS = [
  ['artist', (s) => s.artist],
  ['date', (s) => s.date],
  ['venue', (s) => s.venue],
  ['city', (s) => s.city],
  ['score', (s) => (s.score == null ? '' : s.score)],
  ['status', (s) => s.status || (s.wishlist ? 'wishlist' : 'attended')],
  ['vibes', (s) => pipe(s.vibes)],
  ['genre', (s) => s.genre],
  ['festival', (s) => s.festival],
  ['notes', (s) => s.notes],
  ['setlist', (s) => pipe(s.setlist)],
  ['buddies', (s) => pipe(s.buddies)],
  ['is_favorite', (s) => (s.isFavorite ? 'true' : 'false')],
  ['created_at', (s) => s.createdAt],
  ['photo_urls', (s) => pipe(s.photos)],
];

// CSV — the universal format. Imports straight into Sheets / Notion /
// Airtable / Excel.
export function showsToCsv(shows) {
  const header = COLUMNS.map(([name]) => cell(name)).join(',');
  const rows = (shows || []).map((s) =>
    COLUMNS.map(([, get]) => cell(get(s))).join(',')
  );
  return [header, ...rows].join('\r\n');
}

// JSON — preserves nested structure (setlist/vibes/buddies arrays) for
// users who want to re-import elsewhere or run their own analysis.
// Keeps the app's camelCase shape.
export function showsToJson(shows) {
  return JSON.stringify(shows || [], null, 2);
}

// Anchor-tag download — the fallback path for desktop browsers and any
// webview without Web Share file support.
function anchorDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Hand a generated file to the user. On iOS (WKWebView, iOS 15+) the
// Web Share API opens the native share sheet so they can save to
// Files, AirDrop to a Mac, email it, etc. Elsewhere it falls back to a
// plain browser download.
export async function deliverFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const file = new File([blob], filename, { type: mime });

  if (typeof navigator !== 'undefined' &&
      navigator.canShare &&
      navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
    } catch (err) {
      // AbortError = the user dismissed the share sheet on purpose;
      // respect that and do nothing. Any other error → fall back to a
      // direct download so they still get their file.
      if (err && err.name === 'AbortError') return;
      anchorDownload(blob, filename);
    }
    return;
  }

  anchorDownload(blob, filename);
}
