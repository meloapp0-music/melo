-- 0018: Give show-photos and avatars their own limits
-- ===================================================
-- Both buckets were created (0003, 0004) with only (id, name, public) — no
-- file_size_limit and no allowed_mime_types. A bucket with a NULL limit is
-- bounded ONLY by the project's GLOBAL file size limit, so raising global to
-- 200MB for videos (0017) would silently widen these two from ~50MB to 200MB as
-- a side effect. This pins them so the video change can't leak into them.
--
-- The app already resizes client-side (~300–600KB JPEGs at 2048px; avatars 512px)
-- and both upload paths hardcode contentType 'image/jpeg' — so these limits are
-- far above anything Melo actually sends. They exist to bound what a caller can
-- do by POSTing to Storage directly with their own token, bypassing the client.
--
-- The MIME allowlist is the bigger win and is independent of the size change:
-- these buckets are PUBLIC-READ and previously accepted ANY file type, so an
-- authenticated user could park arbitrary files — including .html — on the
-- project's storage domain and link them. Restricting to images closes that.
-- jpeg/png/webp is headroom; the client only ever produces jpeg.

update storage.buckets
set file_size_limit  = 10485760, -- 10 MB (client sends ~0.3–0.6MB)
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'show-photos';

update storage.buckets
set file_size_limit  = 5242880, -- 5 MB (client sends ~0.05–0.15MB)
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';
