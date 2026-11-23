-- جمعية الخير للجميع | الأمان + سجل النشاط + النسخ الاحتياطي (الإصدار 25)
-- الجزء (أ): آمن للتنفيذ الآن ولا يوقف النسخة الحالية من البرنامج.
-- الجزء (ب) lockdown_app_state.sql: يُنفَّذ بعد رفع الإصدار 25 والتأكد من عمله.

create table if not exists public.app_state_backups(
  id bigserial primary key,
  taken_at timestamptz not null default now(),
  reason text,
  by_user text,
  cases_count int,
  size_bytes int,
  payload jsonb not null
);
create table if not exists public.audit_log(
  id bigserial primary key,
  at timestamptz not null default now(),
  username text,
  action text not null,
  details jsonb
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_user_idx on public.audit_log (username, at desc);
alter table public.app_state_backups enable row level security;
alter table public.audit_log enable row level security;
revoke all on public.app_state_backups, public.audit_log from public, anon, authenticated;
revoke all on sequence public.app_state_backups_id_seq, public.audit_log_id_seq from public, anon, authenticated;

-- ===== مساعدات =====
create or replace function public._staff_role(p_u text, p_p text)
returns text language sql security definer set search_path=public, extensions as $$
  select role from staff_users where username=trim(p_u) and active
    and password_hash=encode(digest(p_p,'sha256'),'hex') limit 1;
$$;
revoke all on function public._staff_role(text,text) from public, anon, authenticated;

create or replace function public._audit(p_user text, p_action text, p_details jsonb default null)
returns void language sql security definer set search_path=public as $$
  insert into audit_log(username,action,details) values (left(coalesce(p_user,''),60), left(p_action,120), p_details);
$$;
revoke all on function public._audit(text,text,jsonb) from public, anon, authenticated;

-- ===== قراءة وحفظ بيانات النظام (بشرط تسجيل دخول موظف) =====
create or replace function public.app_state_get(p_u text, p_p text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare r record;
begin
  if _staff_role(p_u,p_p) is null then raise exception 'غير مصرح. سجّل الدخول من جديد.'; end if;
  select payload, updated_at into r from app_state where id=1;
  return jsonb_build_object('payload', coalesce(r.payload,'{}'::jsonb), 'updated_at', r.updated_at);
end $$;
grant execute on function public.app_state_get(text,text) to anon, authenticated;

create or replace function public.app_state_meta(p_u text, p_p text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare t timestamptz;
begin
  if _staff_role(p_u,p_p) is null then raise exception 'غير مصرح. سجّل الدخول من جديد.'; end if;
  select updated_at into t from app_state where id=1;
  return jsonb_build_object('ok',true,'updated_at',t);
end $$;
grant execute on function public.app_state_meta(text,text) to anon, authenticated;

create or replace function public.app_state_put(p_u text, p_p text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare
  v_role text; v_old jsonb; v_oc int; v_nc int; v_last timestamptz; v_reason text;
  k text; lbl text; cnt int; rm_total int := 0;
  cols text[] := array['cases','distributions','memberships','volunteers','donations','boardMinutes','campaignPeople','visitActivityPeople'];
  r record;
begin
  v_role := _staff_role(p_u,p_p);
  if v_role is null then raise exception 'غير مصرح. سجّل الدخول من جديد.'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or not (p_payload ? 'cases') then raise exception 'بيانات غير صالحة'; end if;
  select payload into v_old from app_state where id=1;
  v_old := coalesce(v_old,'{}'::jsonb);
  v_oc := jsonb_array_length(coalesce(v_old->'cases','[]'::jsonb));
  v_nc := jsonb_array_length(coalesce(p_payload->'cases','[]'::jsonb));

  -- منع غير المدير من حذف أكثر من 5 حالات في عملية واحدة
  select count(*) into cnt from jsonb_array_elements(coalesce(v_old->'cases','[]'::jsonb)) o
   where not exists (select 1 from jsonb_array_elements(p_payload->'cases') n where n->>'id'=o->>'id');
  if v_role<>'مدير النظام' and cnt>5 then raise exception 'حذف أكثر من 5 حالات مرة واحدة متاح لمدير النظام فقط'; end if;

  -- نسخة احتياطية تلقائية: كل 6 ساعات، أو قبل أي نقص كبير في الحالات
  if v_old <> '{}'::jsonb then
    select max(taken_at) into v_last from app_state_backups where reason like 'تلقائي%';
    if cnt>5 then v_reason := 'تلقائي — قبل حذف '||cnt||' حالة';
    elsif v_last is null or v_last < now()-interval '6 hours' then v_reason := 'تلقائي — دوري';
    end if;
    if v_reason is not null then
      insert into app_state_backups(reason,by_user,cases_count,size_bytes,payload)
      values (v_reason,p_u,v_oc,length(v_old::text),v_old);
      delete from app_state_backups where reason like 'تلقائي%' and id not in
        (select id from app_state_backups where reason like 'تلقائي%' order by taken_at desc limit 60);
    end if;
  end if;

  -- سجل النشاط: ما الذي أُضيف أو حُذف أو عُدّل
  foreach k in array cols loop
    lbl := case k when 'cases' then 'حالة' when 'distributions' then 'سجل توزيع' when 'memberships' then 'عضوية'
      when 'volunteers' then 'متطوع' when 'donations' then 'تبرع' when 'boardMinutes' then 'محضر'
      when 'campaignPeople' then 'مشارك حملة' else 'نشاط زيارة' end;
    -- محذوف
    cnt := 0;
    for r in select o->>'id' as id, coalesce(o->>'name',o->>'donor',o->>'title',o->>'id') as nm, o->>'no' as no
             from jsonb_array_elements(coalesce(v_old->k,'[]'::jsonb)) o
             where not exists (select 1 from jsonb_array_elements(coalesce(p_payload->k,'[]'::jsonb)) n where n->>'id'=o->>'id') loop
      cnt := cnt+1;
      if cnt<=30 then perform _audit(p_u,'حذف '||lbl,jsonb_build_object('id',r.id,'name',r.nm,'no',r.no)); end if;
    end loop;
    if cnt>30 then perform _audit(p_u,'حذف '||lbl||' (إجمالي)',jsonb_build_object('count',cnt)); end if;
    -- مُضاف
    cnt := 0;
    for r in select n->>'id' as id, coalesce(n->>'name',n->>'donor',n->>'title',n->>'id') as nm, n->>'no' as no
             from jsonb_array_elements(coalesce(p_payload->k,'[]'::jsonb)) n
             where not exists (select 1 from jsonb_array_elements(coalesce(v_old->k,'[]'::jsonb)) o where o->>'id'=n->>'id') loop
      cnt := cnt+1;
      if cnt<=30 then perform _audit(p_u,'إضافة '||lbl,jsonb_build_object('id',r.id,'name',r.nm,'no',r.no)); end if;
    end loop;
    if cnt>30 then perform _audit(p_u,'إضافة '||lbl||' (إجمالي)',jsonb_build_object('count',cnt)); end if;
    -- معدّل (الحالات والتوزيعات فقط)
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
  on conflict (id) do update set payload=excluded.payload, updated_at=excluded.updated_at;
  return jsonb_build_object('ok',true,'cases',v_nc);
end $$;
grant execute on function public.app_state_put(text,text,jsonb) to anon, authenticated;

-- ===== سجل النشاط =====
create or replace function public.audit_add(p_u text, p_p text, p_action text, p_details jsonb default null)
returns boolean language plpgsql security definer set search_path=public, extensions as $$
begin
  if _staff_role(p_u,p_p) is null then raise exception 'غير مصرح'; end if;
  perform _audit(p_u,p_action,p_details);
  return true;
end $$;
grant execute on function public.audit_add(text,text,text,jsonb) to anon, authenticated;

create or replace function public.audit_list(p_u text, p_p text, p_limit int default 200, p_user text default null, p_search text default null, p_from timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
begin
  if _staff_role(p_u,p_p) is distinct from 'مدير النظام' then raise exception 'هذه العملية متاحة لمدير النظام فقط'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select id, at, username, action, details from audit_log
     where (p_user is null or p_user='' or username=p_user)
       and (p_from is null or at>=p_from)
       and (p_search is null or p_search='' or action ilike '%'||p_search||'%' or coalesce(details::text,'') ilike '%'||p_search||'%')
     order by at desc, id desc limit least(coalesce(p_limit,200),1000)) x),'[]'::jsonb);
end $$;
grant execute on function public.audit_list(text,text,int,text,text,timestamptz) to anon, authenticated;

-- ===== النسخ الاحتياطي =====
create or replace function public.backup_list(p_u text, p_p text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
begin
  if _staff_role(p_u,p_p) is distinct from 'مدير النظام' then raise exception 'هذه العملية متاحة لمدير النظام فقط'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select id,taken_at,reason,by_user,cases_count,size_bytes from app_state_backups order by taken_at desc limit 100) x),'[]'::jsonb);
end $$;
grant execute on function public.backup_list(text,text) to anon, authenticated;

create or replace function public.backup_create(p_u text, p_p text, p_reason text default 'يدوي')
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare v jsonb; n int;
begin
  if _staff_role(p_u,p_p) is distinct from 'مدير النظام' then raise exception 'هذه العملية متاحة لمدير النظام فقط'; end if;
  select payload into v from app_state where id=1;
  if v is null then raise exception 'لا توجد بيانات لنسخها'; end if;
  insert into app_state_backups(reason,by_user,cases_count,size_bytes,payload)
  values ('يدوي — '||left(coalesce(nullif(trim(p_reason),''),'نسخة يدوية'),80),p_u,jsonb_array_length(coalesce(v->'cases','[]'::jsonb)),length(v::text),v)
  returning id into n;
  perform _audit(p_u,'نسخة احتياطية يدوية',jsonb_build_object('backup_id',n));
  return jsonb_build_object('ok',true,'id',n);
end $$;
grant execute on function public.backup_create(text,text,text) to anon, authenticated;

create or replace function public.backup_get(p_u text, p_p text, p_id bigint)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare v jsonb;
begin
  if _staff_role(p_u,p_p) is distinct from 'مدير النظام' then raise exception 'هذه العملية متاحة لمدير النظام فقط'; end if;
  select payload into v from app_state_backups where id=p_id;
  if v is null then raise exception 'النسخة غير موجودة'; end if;
  return v;
end $$;
grant execute on function public.backup_get(text,text,bigint) to anon, authenticated;

create or replace function public.backup_restore(p_u text, p_p text, p_id bigint)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare v jsonb; cur jsonb;
begin
  if _staff_role(p_u,p_p) is distinct from 'مدير النظام' then raise exception 'هذه العملية متاحة لمدير النظام فقط'; end if;
  select payload into v from app_state_backups where id=p_id;
  if v is null then raise exception 'النسخة غير موجودة'; end if;
  select payload into cur from app_state where id=1;
  if cur is not null then
    insert into app_state_backups(reason,by_user,cases_count,size_bytes,payload)
    values ('تلقائي — قبل الاسترجاع',p_u,jsonb_array_length(coalesce(cur->'cases','[]'::jsonb)),length(cur::text),cur);
  end if;
  insert into app_state(id,payload,updated_at) values (1,v,now())
  on conflict (id) do update set payload=excluded.payload, updated_at=excluded.updated_at;
  perform _audit(p_u,'استرجاع نسخة احتياطية',jsonb_build_object('backup_id',p_id));
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.backup_restore(text,text,bigint) to anon, authenticated;

-- ===== ربط سجل النشاط بالدوال الموجودة =====
create or replace function public.login_staff(p_username text, p_password text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare u staff_users;
begin
  select * into u from staff_users
   where username = trim(p_username) and active = true
     and password_hash = encode(digest(p_password,'sha256'),'hex');
  if not found then
    if not exists(select 1 from audit_log where action='محاولة دخول فاشلة' and username=left(trim(coalesce(p_username,'')),60) and at>now()-interval '1 minute') then
      perform _audit(left(trim(coalesce(p_username,'')),60),'محاولة دخول فاشلة',null);
    end if;
    return jsonb_build_object('user', null);
  end if;
  update staff_users set last_seen = now() where id = u.id;
  perform _audit(u.username,'تسجيل دخول',null);
  return jsonb_build_object('user', jsonb_build_object('id',u.id,'name',u.name,'username',u.username,
    'role',u.role,'active',u.active,'permissions',u.permissions));
end $$;
grant execute on function public.login_staff(text,text) to anon, authenticated;

create or replace function public.staff_admin_save(p_u text, p_p text, p_username text, p_name text,
  p_password text, p_role text, p_permissions jsonb, p_active boolean, p_create boolean)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare v_user text := trim(p_username); v_perms jsonb; g text;
  v_valid text[] := array['cases','donations','aid','stock','people','accounts','projects','reports','settings'];
begin
  if not _staff_is_admin(p_u,p_p) then raise exception 'هذه العملية متاحة لمدير النظام فقط'; end if;
  if v_user !~ '^[A-Za-z0-9_.-]{3,40}$' then raise exception 'اسم المستخدم: 3 إلى 40 حرفًا إنجليزيًا أو أرقامًا بدون مسافات'; end if;
  if coalesce(trim(p_name),'')='' then raise exception 'اكتب اسم المستخدم'; end if;
  if p_role not in ('مدير النظام','باحث اجتماعي','محاسب','مسؤول مخازن','متطوع','مخصص') then raise exception 'دور غير صالح'; end if;
  if p_role='مدير النظام' then v_perms := null;
  else
    v_perms := coalesce(p_permissions,'[]'::jsonb);
    if jsonb_typeof(v_perms)<>'array' then raise exception 'صلاحيات غير صالحة'; end if;
    for g in select jsonb_array_elements_text(v_perms) loop
      if not (g = any(v_valid)) then raise exception 'صلاحية غير معروفة: %', g; end if;
    end loop;
  end if;
  if p_create then
    if exists(select 1 from staff_users where lower(username)=lower(v_user)) then raise exception 'اسم المستخدم موجود بالفعل'; end if;
    if length(coalesce(p_password,''))<8 then raise exception 'كلمة المرور 8 أحرف على الأقل'; end if;
    insert into staff_users(name,username,password_hash,role,active,permissions)
    values (trim(p_name),v_user,encode(digest(p_password,'sha256'),'hex'),p_role,coalesce(p_active,true),v_perms);
    perform _audit(p_u,'إنشاء مستخدم',jsonb_build_object('username',v_user,'role',p_role));
  else
    if not exists(select 1 from staff_users where username=v_user) then raise exception 'المستخدم غير موجود'; end if;
    if lower(v_user)=lower(trim(p_u)) and (coalesce(p_active,true)=false or p_role<>'مدير النظام') then
      raise exception 'لا يمكنك إيقاف حسابك أو تغيير دورك. استخدم حساب مدير آخر.'; end if;
    update staff_users set name=trim(p_name),role=p_role,permissions=v_perms,active=coalesce(p_active,active) where username=v_user;
    perform _audit(p_u,'تعديل مستخدم',jsonb_build_object('username',v_user,'role',p_role,'active',p_active));
    if coalesce(p_password,'')<>'' then
      if length(p_password)<8 then raise exception 'كلمة المرور 8 أحرف على الأقل'; end if;
      update staff_users set password_hash=encode(digest(p_password,'sha256'),'hex') where username=v_user;
      perform _audit(p_u,'تغيير كلمة سر مستخدم',jsonb_build_object('username',v_user));
    end if;
  end if;
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.staff_admin_save(text,text,text,text,text,text,jsonb,boolean,boolean) to anon, authenticated;

create or replace function public.staff_admin_delete(p_u text, p_p text, p_target text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
begin
  if not _staff_is_admin(p_u,p_p) then raise exception 'هذه العملية متاحة لمدير النظام فقط'; end if;
  if lower(trim(p_target))=lower(trim(p_u)) then raise exception 'لا يمكنك حذف حسابك'; end if;
  delete from staff_users where username=trim(p_target);
  perform _audit(p_u,'حذف مستخدم',jsonb_build_object('username',trim(p_target)));
  return jsonb_build_object('ok',true,'deleted',found);
end $$;
grant execute on function public.staff_admin_delete(text,text,text) to anon, authenticated;

create or replace function public.staff_change_password(p_u text, p_old text, p_new text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
begin
  if length(coalesce(p_new,''))<8 then raise exception 'كلمة المرور الجديدة 8 أحرف على الأقل'; end if;
  update staff_users set password_hash=encode(digest(p_new,'sha256'),'hex')
   where username=trim(p_u) and active and password_hash=encode(digest(p_old,'sha256'),'hex');
  if not found then raise exception 'كلمة المرور الحالية غير صحيحة'; end if;
  perform _audit(p_u,'تغيير كلمة سر الحساب',null);
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.staff_change_password(text,text,text) to anon, authenticated;

create or replace function public.volunteer_staff_decide(p_u text, p_p text, p_id uuid, p_status text, p_reply text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare v_code text;
begin
  if not _vol_staff_ok(p_u,p_p) then raise exception 'بيانات الدخول غير صحيحة أو لا توجد صلاحية'; end if;
  if p_status not in ('مقبول','مرفوض','مطلوب تعديل','تحت المراجعة') then raise exception 'قرار غير صالح'; end if;
  update volunteer_applications set status=p_status,reply=p_reply,updated_at=now() where id=p_id returning code into v_code;
  perform _audit(p_u,'قرار طلب تطوع: '||p_status,jsonb_build_object('code',v_code));
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.volunteer_staff_decide(text,text,uuid,text,text) to anon, authenticated;

-- ===== تقوية التخزين (غير معطِّلة) =====
drop policy if exists "case docs public delete" on storage.objects;  -- لا يمكن لأي زائر حذف مستندات الحالات
drop policy if exists "case docs public read" on storage.objects;    -- منع سرد ملفات المخزن (الروابط العامة تعمل كما هي)
update storage.buckets set file_size_limit=10485760, allowed_mime_types=array['image/*','application/pdf'] where id='volunteer-docs';
