// lib/exif.js — when was this photo actually taken?
// =================================================
// The camera-roll backfill lives or dies on capture TIME. A file's
// `lastModified` is whatever the OS felt like (often the export or copy date),
// so it can be days or years off. EXIF `DateTimeOriginal` is the real answer.
//
// Deliberately dependency-free and byte-level: it reads only the APP1 segment
// header, so it never decodes the image and never holds more than the first
// 128KB of a file in memory. Selecting 300 photos has to stay cheap.
//
// Scope note: this reads JPEG/TIFF EXIF. iOS normally transcodes HEIC to JPEG
// on its way through a file input, but not always — `readCaptureTime` falls
// back to `lastModified` when there's no EXIF to find, which is wrong-ish but
// never worse than having nothing.
//
// docs/initiatives/2026-07-30-camera-roll-backfill.md

const APP1 = 0xffe1;
const SOI = 0xffd8;
const EXIF_HEADER = 0x45786966; // "Exif"

// Only the head of the file is ever read — EXIF lives near the front, and
// pulling whole 5MB photos into memory 300 at a time is how you crash a phone.
const HEAD_BYTES = 128 * 1024;

const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_DATETIME_DIGITIZED = 0x9004;
const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const GPS_LAT_REF = 0x0001;
const GPS_LAT = 0x0002;
const GPS_LON_REF = 0x0003;
const GPS_LON = 0x0004;

/** "2025:09:14 21:04:33" → Date, in LOCAL time (EXIF carries no zone). */
function parseExifDate(s) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || '').trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, sec] = m.map(Number);
  const dt = new Date(y, mo - 1, d, h, mi, sec);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Walk one IFD, returning { tag: value } for the tags we care about. */
function readIFD(view, start, tiffStart, little, want) {
  const out = {};
  if (start + 2 > view.byteLength) return out;
  const count = view.getUint16(start, little);
  for (let i = 0; i < count; i++) {
    const entry = start + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = view.getUint16(entry, little);
    if (!want.has(tag)) continue;
    const type = view.getUint16(entry + 2, little);
    const num = view.getUint32(entry + 4, little);
    const valueOffset = entry + 8;

    if (type === 2) {
      // ASCII. Inline when it fits in 4 bytes, otherwise at an offset.
      const at = num > 4 ? tiffStart + view.getUint32(valueOffset, little) : valueOffset;
      let s = '';
      for (let k = 0; k < num - 1 && at + k < view.byteLength; k++) {
        s += String.fromCharCode(view.getUint8(at + k));
      }
      out[tag] = s;
    } else if (type === 4) {
      out[tag] = view.getUint32(valueOffset, little); // LONG (sub-IFD pointers)
    } else if (type === 5) {
      // RATIONAL[]: GPS coordinates are three of them (deg, min, sec).
      const at = tiffStart + view.getUint32(valueOffset, little);
      const vals = [];
      for (let k = 0; k < num && at + k * 8 + 8 <= view.byteLength; k++) {
        const n = view.getUint32(at + k * 8, little);
        const d = view.getUint32(at + k * 8 + 4, little);
        vals.push(d ? n / d : 0);
      }
      out[tag] = vals;
    }
  }
  return out;
}

const dms = (v) => (Array.isArray(v) && v.length >= 3 ? v[0] + v[1] / 60 + v[2] / 3600 : null);

/**
 * Parse the EXIF we care about out of an ArrayBuffer.
 * Returns `{ takenAt, lat, lon }`, any of which may be null.
 */
export function parseExif(buffer) {
  const empty = { takenAt: null, lat: null, lon: null };
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0, false) !== SOI) return empty;

    // Walk JPEG segments looking for APP1/Exif.
    let offset = 2;
    let tiffStart = -1;
    while (offset + 4 < view.byteLength) {
      const marker = view.getUint16(offset, false);
      const size = view.getUint16(offset + 2, false);
      if (marker === APP1 && view.getUint32(offset + 4, false) === EXIF_HEADER) {
        tiffStart = offset + 10; // 4 "Exif" + 2 nulls
        break;
      }
      if ((marker & 0xff00) !== 0xff00 || size < 2) break;
      offset += 2 + size;
    }
    if (tiffStart < 0 || tiffStart + 8 > view.byteLength) return empty;

    const little = view.getUint16(tiffStart, false) === 0x4949;
    const ifd0At = tiffStart + view.getUint32(tiffStart + 4, little);
    const ifd0 = readIFD(view, ifd0At, tiffStart, little,
      new Set([TAG_EXIF_IFD, TAG_GPS_IFD, TAG_DATETIME]));

    let takenAt = null;
    if (ifd0[TAG_EXIF_IFD]) {
      const sub = readIFD(view, tiffStart + ifd0[TAG_EXIF_IFD], tiffStart, little,
        new Set([TAG_DATETIME_ORIGINAL, TAG_DATETIME_DIGITIZED]));
      takenAt = parseExifDate(sub[TAG_DATETIME_ORIGINAL] || sub[TAG_DATETIME_DIGITIZED]);
    }
    // IFD0's DateTime is the file's modification stamp — a weaker signal, but
    // better than falling all the way back to the filesystem.
    if (!takenAt) takenAt = parseExifDate(ifd0[TAG_DATETIME]);

    let lat = null;
    let lon = null;
    if (ifd0[TAG_GPS_IFD]) {
      const gps = readIFD(view, tiffStart + ifd0[TAG_GPS_IFD], tiffStart, little,
        new Set([GPS_LAT_REF, GPS_LAT, GPS_LON_REF, GPS_LON]));
      const la = dms(gps[GPS_LAT]);
      const lo = dms(gps[GPS_LON]);
      if (la != null) lat = gps[GPS_LAT_REF] === 'S' ? -la : la;
      if (lo != null) lon = gps[GPS_LON_REF] === 'W' ? -lo : lo;
    }
    return { takenAt, lat, lon };
  } catch {
    return empty; // A malformed photo must never break a 300-file scan.
  }
}

/**
 * When a File was captured.
 *
 * `lastModified` is the fallback, and it's a genuinely weaker signal — for a
 * photo that's been exported, AirDropped or synced it can be wildly wrong. It's
 * flagged as `exact: false` so the review step can say so rather than silently
 * proposing a show on the wrong night.
 */
export async function readCaptureTime(file) {
  try {
    const head = file.slice(0, HEAD_BYTES);
    const { takenAt, lat, lon } = parseExif(await head.arrayBuffer());
    if (takenAt) return { takenAt, lat, lon, exact: true };
  } catch { /* fall through */ }
  const fallback = file.lastModified ? new Date(file.lastModified) : null;
  return { takenAt: fallback, lat: null, lon: null, exact: false };
}
