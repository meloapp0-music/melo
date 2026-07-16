-- 0016: Public share pages — opt-in per-show share tokens
-- =======================================================
-- Shows are PRIVATE by default (owner + accepted friends via can_view_shows,
-- migration 0010). A public web page at melo.show/s/<token> must not weaken any
-- of that. This is strictly ADDITIVE and cannot leak a non-shared row:
--
--   * No new RLS policy is added to `shows`. `anon` still has zero read access
--     to the table — the existing policies are untouched.
--   * The ONLY public read path is `get_public_show(token)`, a SECURITY DEFINER
--     function that hard-filters on `share_token = <token>` and returns nothing
--     when the token is null/unknown. A caller with no token can reach nothing.
--   * `share_token` is opt-in: null until the owner shares, and nulling it again
--     ("Stop sharing") makes the page 404 immediately.
--
-- HONEST LIMIT (see the initiative note): photos[]/videos[] are public-bucket
-- URLs. Revoking the token removes the PAGE; it does not un-publish a storage
-- object someone already saved the URL for. The UI must say "removes the page",
-- never "deletes". Real revocation = a signed-URL redesign, deliberately not
-- scoped here.

alter table public.shows
  add column if not exists share_token text;

-- Unguessable, and unique so a token always identifies exactly one show.
create unique index if not exists shows_share_token_idx
  on public.shows (share_token)
  where share_token is not null;

-- The public read surface. SECURITY DEFINER so it can see past RLS, but it is
-- safe BECAUSE:
--   1. it filters on an unguessable token (no token => no row, ever),
--   2. it returns a hand-picked column list — never user_id, notes, buddies,
--      is_favorite, or anything else the owner didn't intend to publish,
--   3. search_path is pinned (a SECURITY DEFINER function without this can be
--      hijacked via a mutable search_path).
create or replace function public.get_public_show(p_token text)
returns table (
  artist        text,
  venue         text,
  city          text,
  date          date,
  score         numeric,
  setlist       text[],
  vibes         text[],
  openers       text[],
  festival      text,
  photos        text[],
  videos        text[],
  owner_username     text,
  owner_display_name text,
  owner_avatar_url   text,
  owner_avatar_color text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    s.artist, s.venue, s.city, s.date, s.score,
    s.setlist, s.vibes, s.openers, s.festival,
    s.photos, s.videos,
    p.username, p.display_name, p.avatar_url, p.avatar_color
  from public.shows s
  left join public.profiles p on p.id = s.user_id
  where s.share_token is not null
    and s.share_token = p_token
  limit 1;
$$;

-- Reachable by a logged-out visitor (that is the entire point) — the token is
-- the credential.
grant execute on function public.get_public_show(text) to anon, authenticated;
