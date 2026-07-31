// melo.show — the Worker entry
// ============================
// melo.show is a WORKER WITH STATIC ASSETS, not a Cloudflare Pages project.
// (Verified 2026-07-16: `wrangler pages project list` returns nothing, and the
// dashboard serves it from /workers/services/view/odd-water-9335/.) That means
// the Pages `functions/` folder convention does NOT apply — dynamic routes have
// to be handled by this script, and the static site is served from the `assets`
// binding declared in wrangler.jsonc.
//
// Static assets win by default: a request that matches a file in the assets
// directory (/, /privacy.html, /og-share.png …) is served directly and never
// reaches this code. So only the dynamic routes below land here, and anything
// else falls through to ASSETS — which also produces the site's own 404.
//
// Deploy:  cd marketing && npx wrangler deploy

import { handleTonight } from './routes/tonight.js';
import { handleShow } from './routes/show.js';
import { handleProfile } from './routes/profile.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Both routes render HTML for humans and link scrapers; nothing mutates, so
    // anything other than GET/HEAD is a mistake worth naming.
    const readOnly = request.method === 'GET' || request.method === 'HEAD';

    if (url.pathname === '/tonight' || url.pathname === '/tonight/') {
      if (!readOnly) return new Response('Method not allowed', { status: 405 });
      return handleTonight(request, env);
    }

    // /s/<token> — the public show page. Trailing slash tolerated because links
    // get mangled in the wild.
    const share = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (share) {
      if (!readOnly) return new Response('Method not allowed', { status: 405 });
      return handleShow(request, env, decodeURIComponent(share[1]));
    }

    // /@username — the public concert résumé. Unlike /s/<token> this URL is
    // guessable by design, so the safety is an explicit opt-in flag checked
    // inside get_public_profile(); an un-published handle 404s.
    const profile = url.pathname.match(/^\/@([A-Za-z0-9_]{3,24})\/?$/);
    if (profile) {
      if (!readOnly) return new Response('Method not allowed', { status: 405 });
      return handleProfile(profile[1], env, url.origin);
    }

    return env.ASSETS.fetch(request);
  },
};
