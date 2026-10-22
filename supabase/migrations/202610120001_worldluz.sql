-- One private world per authenticated user, including embedded compressed images.
create table if not exists public.worldluz_worlds (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.worldluz_worlds enable row level security;
revoke all on public.worldluz_worlds from anon, authenticated;
grant select on public.worldluz_worlds to authenticated;
create policy "Read own world" on public.worldluz_worlds
  for select to authenticated using ((select auth.uid()) = user_id);

-- Security definer is narrowly scoped: the user id ALWAYS comes from auth.uid(),
-- never a caller parameter. All writes pass through a locked revision comparison.
create schema if not exists worldluz_private;
revoke all on schema worldluz_private from public, anon;
grant usage on schema worldluz_private to authenticated;
create or replace function worldluz_private.save(expected_revision bigint, new_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  existing public.worldluz_worlds%rowtype;
  next_revision bigint;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if expected_revision is null or expected_revision < 0 then raise exception 'Invalid revision'; end if;
  if new_payload is null or jsonb_typeof(new_payload) <> 'object'
    or (new_payload->>'version') is distinct from '1'
    or jsonb_typeof(new_payload->'nodes') is distinct from 'array'
    or jsonb_typeof(new_payload->'relations') is distinct from 'array'
    then raise exception 'Invalid world'; end if;
  if octet_length(new_payload::text) > 20971520 then raise exception 'World exceeds 20 MB; export a backup and reduce images'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text, 0));
  select * into existing from public.worldluz_worlds where user_id=caller;
  if coalesce(existing.revision,0) <> expected_revision then
    return jsonb_build_object('ok',false,'current',case when existing.user_id is null then null
      else jsonb_build_object('revision',existing.revision,'payload',existing.payload) end);
  end if;
  next_revision := expected_revision + 1;
  insert into public.worldluz_worlds(user_id,revision,payload,updated_at)
    values(caller,next_revision,new_payload,now())
    on conflict(user_id) do update set revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at;
  return jsonb_build_object('ok',true,'revision',next_revision);
end;
$$;
revoke all on function worldluz_private.save(bigint,jsonb) from public, anon;
grant execute on function worldluz_private.save(bigint,jsonb) to authenticated;
create or replace function public.worldluz_save(expected_revision bigint, new_payload jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select worldluz_private.save(expected_revision, new_payload);
$$;
revoke all on function public.worldluz_save(bigint,jsonb) from public, anon;
grant execute on function public.worldluz_save(bigint,jsonb) to authenticated;
