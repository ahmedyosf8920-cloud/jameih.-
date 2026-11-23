-- جمعية الخير للجميع | الإصدار 31: إخفاء البيانات الشخصية حسب الدور من الخادم + جدول سجلات مرآة
-- نفّذه بعد security_v29.sql و security_v30.sql. آمن لإعادة التنفيذ.
-- الإخفاء مطفأ افتراضيًا (security_config.pii_mask='off') حتى تراجع الصلاحيات ثم تشغّله.

insert into public.security_config(key,value) values ('pii_mask','off'),('records_mirror','off') on conflict (key) do nothing;

-- 1) صلاحية جديدة 'pii' = رؤية الرقم القومي والهاتف
do $$
declare d text; fn text;
begin
  for fn in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname='staff_admin_save' loop
    d := pg_get_functiondef(fn::regprocedure);
    if d like '%''settings'']%' and d not like '%''pii''%' then
      execute replace(d, '''settings'']', '''settings'',''pii'']');
    end if;
  end loop;
end $$;
-- منح pii لكل المستخدمين الحاليين حتى لا يتغير شيء عند التركيب (اسحبها لاحقًا ممن لا يحتاجها)
update public.staff_users set permissions = permissions || '["pii"]'::jsonb
 where role<>'مدير النظام' and permissions is not null and jsonb_typeof(permissions)='array' and not (permissions ? 'pii');

create or replace function public._has_pii(p_u text, p_p text) returns boolean
language plpgsql security definer set search_path=public, extensions as $$
declare r text; pm jsonb;
begin
  r := _staff_role(p_u,p_p);
  if r is null then return false; end if;
  if r='مدير النظام' then return true; end if;
  select permissions into pm from staff_users where username=trim(p_u);
  if pm is null then return true; end if;           -- حساب قديم بلا صلاحيات مخصّصة
  return pm ? 'pii';
end $$;
revoke all on function public._has_pii(text,text) from public, anon, authenticated;

-- 2) دوال الإخفاء والاسترجاع
create or replace function public._pii_mask(j jsonb) returns jsonb language plpgsql immutable as $$
declare out jsonb; k text; v jsonb;
  keys text[] := array['nid','phone','whatsapp'];
  tok jsonb := to_jsonb('••محجوب••'::text);
begin
  if j is null then return null; end if;
  if jsonb_typeof(j)='object' then
    out := '{}'::jsonb;
    for k,v in select * from jsonb_each(j) loop
      if k = any(keys) and jsonb_typeof(v) in ('string','number','array','object') and v <> '""'::jsonb then
        out := out || jsonb_build_object(k,tok);
      else out := out || jsonb_build_object(k,_pii_mask(v)); end if;
    end loop;
    return out;
  elsif jsonb_typeof(j)='array' then
    select coalesce(jsonb_agg(_pii_mask(e) order by o),'[]'::jsonb) into out from jsonb_array_elements(j) with ordinality t(e,o);
    return out;
  end if;
  return j;
end $$;

create or replace function public._pii_restore(n jsonb, o jsonb) returns jsonb language plpgsql immutable as $$
declare out jsonb; k text; v jsonb; e jsonb; i int := 0; m jsonb;
  tok jsonb := to_jsonb('••محجوب••'::text);
begin
  if n is null then return null; end if;
  if n = tok then return coalesce(o,'""'::jsonb); end if;
  if jsonb_typeof(n)='object' then
    out := '{}'::jsonb;
    for k,v in select * from jsonb_each(n) loop
      out := out || jsonb_build_object(k,_pii_restore(v, case when o is not null and jsonb_typeof(o)='object' then o->k end));
    end loop;
    return out;
  elsif jsonb_typeof(n)='array' then
    out := '[]'::jsonb;
    for e in select value from jsonb_array_elements(n) loop
      m := null;
      if o is not null and jsonb_typeof(o)='array' then
        if jsonb_typeof(e)='object' and e ? 'id' then
          select x into m from jsonb_array_elements(o) x where x->'id' = e->'id' limit 1;
        else m := o->i; end if;
      end if;
      out := out || jsonb_build_array(_pii_restore(e,m));
      i := i+1;
    end loop;
    return out;
  end if;
  return n;
end $$;
revoke all on function public._pii_mask(jsonb), public._pii_restore(jsonb,jsonb) from public, anon, authenticated;

create or replace function public._cfg(p_key text) returns text language sql stable security definer set search_path=public as $$
  select value from security_config where key=p_key $$;
revoke all on function public._cfg(text) from public, anon, authenticated;

-- 3) القراءة
create or replace function public.app_state_get(p_u text, p_p text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare r record; pl jsonb;
begin
  if _staff_role(p_u,p_p) is null then raise exception 'غير مصرح. سجّل الدخول من جديد.'; end if;
  select payload, updated_at into r from app_state where id=1;
  pl := coalesce(r.payload,'{}'::jsonb);
  if _cfg('pii_mask')='on' and not _has_pii(p_u,p_p) then pl := _pii_mask(pl); end if;
  return jsonb_build_object('payload', pl, 'updated_at', r.updated_at);
end $$;
grant execute on function public.app_state_get(text,text) to anon, authenticated;

-- 4) الحفظ: الدالة الأصلية تُعاد تسميتها مرة واحدة ثم يُغلَّف
do $$ begin
  if to_regprocedure('public._app_state_put_core(text,text,jsonb,timestamptz)') is null then
    alter function public.app_state_put(text,text,jsonb,timestamptz) rename to _app_state_put_core;
  end if;
end $$;
revoke all on function public._app_state_put_core(text,text,jsonb,timestamptz) from public, anon, authenticated;

-- 5) جدول السجلات (مرآة للقراءة والتقارير بـ SQL؛ المصدر الأصلي يبقى app_state)
create table if not exists public.records(
  kind text not null, id text not null, data jsonb not null, updated_at timestamptz not null default now(),
  primary key(kind,id));
alter table public.records enable row level security;
revoke all on public.records from public, anon, authenticated;

create or replace function public._records_sync(pl jsonb) returns void language plpgsql security definer set search_path=public as $$
declare k text; cols text[] := array['cases','distributions','memberships','volunteers','donations','boardMinutes','campaignPeople','visitActivityPeople'];
begin
  foreach k in array cols loop
    insert into records(kind,id,data)
      select k, e->>'id', e from jsonb_array_elements(coalesce(pl->k,'[]'::jsonb)) e where e->>'id' is not null
    on conflict (kind,id) do update set data=excluded.data, updated_at=now() where records.data is distinct from excluded.data;
    delete from records r where r.kind=k and not exists
      (select 1 from jsonb_array_elements(coalesce(pl->k,'[]'::jsonb)) e where e->>'id'=r.id);
  end loop;
end $$;
revoke all on function public._records_sync(jsonb) from public, anon, authenticated;

create or replace function public.app_state_put(p_u text, p_p text, p_payload jsonb, p_base timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare masked boolean := false; pl jsonb; old jsonb; res jsonb;
begin
  if _staff_role(p_u,p_p) is null then raise exception 'غير مصرح. سجّل الدخول من جديد.'; end if;
  pl := p_payload;
  if _cfg('pii_mask')='on' and not _has_pii(p_u,p_p) then
    masked := true;
    select payload into old from app_state where id=1;
    pl := _pii_restore(p_payload, old);
  end if;
  res := _app_state_put_core(p_u,p_p,pl,p_base);
  if res ? 'conflict' then
    if masked then res := jsonb_set(res,'{payload}',_pii_mask(res->'payload')); end if;
  elsif _cfg('records_mirror')='on' then
    perform _records_sync(pl);
  end if;
  return res;
end $$;
grant execute on function public.app_state_put(text,text,jsonb,timestamptz) to anon, authenticated;

create or replace function public.records_rebuild(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare n int;
begin
  if _staff_role(p_u,p_p) is distinct from 'مدير النظام' then raise exception 'هذه العملية متاحة لمدير النظام فقط'; end if;
  perform _records_sync((select payload from app_state where id=1));
  select count(*) into n from records;
  perform _audit(p_u,'إعادة بناء جدول السجلات',jsonb_build_object('rows',n));
  return jsonb_build_object('ok',true,'rows',n);
end $$;
grant execute on function public.records_rebuild(text,text) to anon, authenticated;
