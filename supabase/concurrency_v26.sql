-- جمعية الخير للجميع | حماية التعارض بين المستخدمين (الإصدار 26)
-- نفّذه قبل رفع الإصدار 26. آمن لإعادة التنفيذ. متوافق مع الإصدار 25.

create or replace function public._app_state_touch() returns trigger language plpgsql as $f$
begin
  if new.payload is distinct from old.payload then
    new.updated_at := greatest(now(), old.updated_at + interval '1 microsecond');
  end if;
  return new;
end $f$;
drop trigger if exists app_state_touch on public.app_state;
create trigger app_state_touch before update on public.app_state
  for each row execute function public._app_state_touch();

drop function if exists public.app_state_put(text,text,jsonb);
create or replace function public.app_state_put(p_u text, p_p text, p_payload jsonb, p_base timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public, extensions as $f$
declare
  v_role text; v_old jsonb; v_cur timestamptz; v_new timestamptz; v_oc int; v_nc int; v_last timestamptz; v_reason text;
  k text; lbl text; cnt int; rm_cases int;
  cols text[] := array['cases','distributions','memberships','volunteers','donations','boardMinutes','campaignPeople','visitActivityPeople'];
  r record;
begin
  v_role := _staff_role(p_u,p_p);
  if v_role is null then raise exception 'غير مصرح. سجّل الدخول من جديد.'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or not (p_payload ? 'cases') then raise exception 'بيانات غير صالحة'; end if;
  select payload, updated_at into v_old, v_cur from app_state where id=1 for update;
  -- تعارض: شخص آخر حفظ بعد آخر تحميل لدى هذا المستخدم
  if p_base is not null and v_cur is not null and v_cur <> p_base then
    return jsonb_build_object('conflict',true,'updated_at',v_cur,'payload',v_old);
  end if;
  v_old := coalesce(v_old,'{}'::jsonb);
  v_oc := jsonb_array_length(coalesce(v_old->'cases','[]'::jsonb));
  v_nc := jsonb_array_length(coalesce(p_payload->'cases','[]'::jsonb));

  select count(*) into rm_cases from jsonb_array_elements(coalesce(v_old->'cases','[]'::jsonb)) o
   where not exists (select 1 from jsonb_array_elements(p_payload->'cases') n where n->>'id'=o->>'id');
  if v_role<>'مدير النظام' and rm_cases>5 then raise exception 'حذف أكثر من 5 حالات مرة واحدة متاح لمدير النظام فقط'; end if;

  if v_old <> '{}'::jsonb then
    select max(taken_at) into v_last from app_state_backups where reason like 'تلقائي%';
    if rm_cases>5 then v_reason := 'تلقائي — قبل حذف '||rm_cases||' حالة';
    elsif v_last is null or v_last < now()-interval '6 hours' then v_reason := 'تلقائي — دوري';
    end if;
    if v_reason is not null then
      insert into app_state_backups(reason,by_user,cases_count,size_bytes,payload)
      values (v_reason,p_u,v_oc,length(v_old::text),v_old);
      delete from app_state_backups where reason like 'تلقائي%' and id not in
        (select id from app_state_backups where reason like 'تلقائي%' order by taken_at desc limit 60);
    end if;
  end if;

  foreach k in array cols loop
    lbl := case k when 'cases' then 'حالة' when 'distributions' then 'سجل توزيع' when 'memberships' then 'عضوية'
      when 'volunteers' then 'متطوع' when 'donations' then 'تبرع' when 'boardMinutes' then 'محضر'
      when 'campaignPeople' then 'مشارك حملة' else 'نشاط زيارة' end;
    cnt := 0;
    for r in select o->>'id' as id, coalesce(o->>'name',o->>'donor',o->>'title',o->>'id') as nm, o->>'no' as no
             from jsonb_array_elements(coalesce(v_old->k,'[]'::jsonb)) o
             where not exists (select 1 from jsonb_array_elements(coalesce(p_payload->k,'[]'::jsonb)) n where n->>'id'=o->>'id') loop
      cnt := cnt+1;
      if cnt<=30 then perform _audit(p_u,'حذف '||lbl,jsonb_build_object('id',r.id,'name',r.nm,'no',r.no)); end if;
    end loop;
    if cnt>30 then perform _audit(p_u,'حذف '||lbl||' (إجمالي)',jsonb_build_object('count',cnt)); end if;
    cnt := 0;
    for r in select n->>'id' as id, coalesce(n->>'name',n->>'donor',n->>'title',n->>'id') as nm, n->>'no' as no
             from jsonb_array_elements(coalesce(p_payload->k,'[]'::jsonb)) n
             where not exists (select 1 from jsonb_array_elements(coalesce(v_old->k,'[]'::jsonb)) o where o->>'id'=n->>'id') loop
      cnt := cnt+1;
      if cnt<=30 then perform _audit(p_u,'إضافة '||lbl,jsonb_build_object('id',r.id,'name',r.nm,'no',r.no)); end if;
    end loop;
    if cnt>30 then perform _audit(p_u,'إضافة '||lbl||' (إجمالي)',jsonb_build_object('count',cnt)); end if;
    if k in ('cases','distributions') then
      cnt := 0;
      for r in select n->>'id' as id, coalesce(n->>'name',n->>'id') as nm, n->>'no' as no
               from jsonb_array_elements(coalesce(p_payload->k,'[]'::jsonb)) n
               join jsonb_array_elements(coalesce(v_old->k,'[]'::jsonb)) o on o->>'id'=n->>'id'
               where o is distinct from n loop
        cnt := cnt+1;
        if cnt<=30 then perform _audit(p_u,'تعديل '||lbl,jsonb_build_object('id',r.id,'name',r.nm,'no',r.no)); end if;
      end loop;
      if cnt>30 then perform _audit(p_u,'تعديل '||lbl||' (إجمالي)',jsonb_build_object('count',cnt)); end if;
    end if;
  end loop;
  delete from audit_log where at < now()-interval '400 days';

  insert into app_state(id,payload,updated_at) values (1,p_payload,now())
  on conflict (id) do update set payload=excluded.payload, updated_at=excluded.updated_at
  returning updated_at into v_new;
  return jsonb_build_object('ok',true,'cases',v_nc,'updated_at',v_new);
end $f$;
grant execute on function public.app_state_put(text,text,jsonb,timestamptz) to anon, authenticated;
