-- 0012_friendship_guard.sql
--
-- Close a forge hole in the friendships UPDATE path (found in pre-ship
-- review). 0010's "friendships accept" policy has USING but no
-- WITH CHECK, and Postgres only evaluates USING against the OLD row. So
-- the non-requester of a pending request could UPDATE that row and
-- *re-target the pair* (swap themselves into an accepted friendship with
-- an arbitrary victim), then read the victim's friends-only shows,
-- reactions, and comments.
--
-- A WITH CHECK alone can't fully stop it (the attacker stays in the new
-- pair, so it passes). The bulletproof guard is to make the identity
-- columns immutable on UPDATE — only `status`/`updated_at` may change.
-- We keep a tightened WITH CHECK too, for defense in depth.

-- Immutability trigger: the pair + who requested can never change on an
-- update. Accept = flip status; that's the only legitimate mutation.
create or replace function public.friendships_immutable_identity()
returns trigger
language plpgsql
as $$
begin
  if NEW.user_a <> OLD.user_a
     or NEW.user_b <> OLD.user_b
     or NEW.requested_by <> OLD.requested_by then
    raise exception 'friendship identity columns (user_a, user_b, requested_by) are immutable';
  end if;
  return NEW;
end;
$$;

drop trigger if exists friendships_guard on public.friendships;
create trigger friendships_guard
  before update on public.friendships
  for each row execute function public.friendships_immutable_identity();

-- Tighten the accept policy with a matching WITH CHECK.
drop policy if exists "friendships accept" on public.friendships;
create policy "friendships accept" on public.friendships
  for update
  using (
    (auth.uid() = user_a or auth.uid() = user_b)
    and auth.uid() <> requested_by
  )
  with check (
    (auth.uid() = user_a or auth.uid() = user_b)
    and auth.uid() <> requested_by
  );
