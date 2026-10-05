-- Apply to the selected Transforma-Ações Supabase project, never to an unrelated app.
begin;
create schema if not exists transforma_private;
revoke all on schema transforma_private from public;
create table public.ta_workspaces (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0),
  data jsonb not null check (data->>'version' = '1' and jsonb_typeof(data->'projects')='array' and jsonb_typeof(data->'entries')='array'),
  updated_at timestamptz not null default now(),
  check (octet_length(data::text) <= 10485760)
);
alter table public.ta_workspaces enable row level security;
create policy ta_workspace_read on public.ta_workspaces for select to authenticated using ((select auth.uid())=owner_id);
create policy ta_workspace_insert on public.ta_workspaces for insert to authenticated with check ((select auth.uid())=owner_id and revision=1);
create policy ta_workspace_update on public.ta_workspaces for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
grant select,insert,update on public.ta_workspaces to authenticated;
revoke all on public.ta_workspaces from anon;

create table public.ta_audit (
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null,
  at timestamptz not null default now(),
  snapshot jsonb not null,
  primary key(owner_id,revision)
);
alter table public.ta_audit enable row level security;
create policy ta_audit_read on public.ta_audit for select to authenticated using ((select auth.uid())=owner_id);
grant select on public.ta_audit to authenticated;
revoke insert,update,delete on public.ta_audit from authenticated,anon;

create function transforma_private.snapshot_workspace() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or auth.uid() <> new.owner_id then raise exception 'Owner mismatch'; end if;
  if tg_op='UPDATE' and (new.owner_id <> old.owner_id or new.revision <> old.revision+1) then raise exception 'Invalid revision'; end if;
  new.updated_at:=now();
  insert into public.ta_audit(owner_id,revision,snapshot) values(new.owner_id,new.revision,new.data);
  return new;
end $$;
revoke all on function transforma_private.snapshot_workspace() from public,anon,authenticated;
create trigger ta_workspace_audit before insert or update on public.ta_workspaces for each row execute function transforma_private.snapshot_workspace();

-- Private originals. Every path begins with the authenticated owner's UUID.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values (
  'transforma-documentos','transforma-documentos',false,10485760,
  array['application/pdf','image/jpeg','image/png','image/webp','application/xml','text/xml','text/plain','text/csv','application/octet-stream','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
);
create policy ta_file_read on storage.objects for select to authenticated using (bucket_id='transforma-documentos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy ta_file_insert on storage.objects for insert to authenticated with check (bucket_id='transforma-documentos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy ta_file_delete on storage.objects for delete to authenticated using (bucket_id='transforma-documentos' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Atomic per-user minute and daily quotas. Accessible only through RPC.
create table transforma_private.ai_usage(owner_id uuid not null,period text not null,requests integer not null,primary key(owner_id,period));
alter table transforma_private.ai_usage enable row level security;
create function public.ta_consume_ai_quota() returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); n integer; period_key text;
begin
  if u is null then raise exception 'Authentication required'; end if;
  foreach period_key in array array[to_char(now() at time zone 'UTC','YYYY-MM-DD'),to_char(now() at time zone 'UTC','YYYY-MM-DD HH24:MI')] loop
    insert into transforma_private.ai_usage(owner_id,period,requests) values(u,period_key,1)
    on conflict(owner_id,period) do update set requests=transforma_private.ai_usage.requests+1 returning requests into n;
    if n > case when length(period_key)=10 then 100 else 10 end then raise exception 'Limite de uso da IA atingido. Tente novamente mais tarde.'; end if;
  end loop;
  return true;
end $$;
revoke all on function public.ta_consume_ai_quota() from public,anon;
grant execute on function public.ta_consume_ai_quota() to authenticated;
commit;
