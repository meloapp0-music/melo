// Public share links — melo.show/s/<token>
//
// The page itself is a Cloudflare Pages Function in `marketing/functions/s/`.
// The token is minted by `ensureShareToken` (lib/db/shows.js) and read back by
// the `get_public_show` RPC (migration 0016). Keep this origin in sync with the
// deployed marketing site.

export const PUBLIC_SHARE_ORIGIN = 'https://melo.show';

/** The public URL for a share token. '' when the show isn't shared, so callers
 *  can fall back to the App Store QR rather than minting a broken link. */
export function publicShowUrl(token) {
  if (!token) return '';
  return `${PUBLIC_SHARE_ORIGIN}/s/${encodeURIComponent(token)}`;
}
