-- 0017: Raise the show-videos file size limit 45MB -> 200MB
-- =========================================================
-- Why 45MB was wrong: iPhone records 4K30 HEVC by DEFAULT at ~170MB/min, so the
-- old cap bought ~16 seconds — not the 60s the UI promised. (4K60 ≈ 400MB/min
-- bought ~7s.) The duration check could never fire at any setting except 720p30;
-- users always hit the byte error instead. That contradiction is now gone.
--
-- Why 200MB: it covers a FULL 60s at 4K30 (~170MB) and at 1080p60 (~90MB), so
-- VIDEO_MAX_SECONDS = 60 becomes honest for the first time. Only 4K60 for a full
-- minute is excluded — the client rejects that with a message naming the fix
-- (record in 4K30 or 1080p), rather than failing mysteriously.
--
-- ⚠️ TWO LIMITS, NOT ONE. A per-bucket limit CANNOT exceed the project's GLOBAL
-- file size limit (Dashboard → Storage → Settings → "Global file size limit").
-- Running this migration alone will LOOK like it worked and silently won't if
-- the global limit is still lower. On the Pro plan the global ceiling is 500GB;
-- set it to at least 200MB.
--
-- ⚠️ Requires the client to use RESUMABLE (TUS) uploads — a plain .upload() of a
-- 200MB file on venue LTE is a multi-minute silent hang with no resume and no
-- progress. See src/web/lib/storage.js (uploadShowVideo) and
-- docs/initiatives/2026-06-23-public-share-pages.md (Phase 2).

update storage.buckets
set file_size_limit = 209715200 -- 200 MB
where id = 'show-videos';
