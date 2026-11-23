-- جمعية الخير للجميع | إدارة المستخدمين والصلاحيات (الإصدار 23)
-- آمن لإعادة التنفيذ
alter table public.staff_users add column if not exists permissions jsonb;
alter table public.staff_users add column if not exists last_seen timestamptz;
create unique index if not exists staff_users_username_lower_uq on public.staff_users (lower(username));

create or replace function public._staff_is_admin(p_u text, p_p text)
returns boolean language sql security definer set search_path=public, extensions as $$
  select exists(select 1 from staff_users where username=trim(p_u) and active
    and role='مدير النظام' and password_hash=encode(digest(p_p,'sha256'),'hex'));
$$;
revoke all on function public._staff_is_admin(text,text) from public, anon, authenticated;

create or replace function public.login_staff(p_username text, p_password text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare u staff_users;
begin
  select * into u from staff_users
   where username = trim(p_username) and active = true
     and password_hash = encode(digest(p_password,'sha256'),'hex');
  if not found then return jsonb_build_object('user', null); end if;
  update staff_users set last_seen = now() where id = u.id;
  return jsonb_build_object('user', jsonb_build_object('id',u.id,'name',u.name,'username',u.username,
    'role',u.role,'active',u.active,'permissions',u.permissions));
end $$;
grant execute on function public.login_staff(text,text) to anon, authenticated;

create or replace function public.staff_heartbeat(p_u text, p_p text)
returns boolean language plpgsql security definer set search_path=public, extensions as $$
begin
  update staff_users set last_seen=now()
   where username=trim(p_u) and active and password_hash=encode(digest(p_p,'sha256'),'hex');
  return found;
end $$;
grant execute on function public.staff_heartbeat(text,text) to anon, authenticated;

create or replace function public.staff_admin_list(p_u text, p_p text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
begin
  if not _staff_is_admin(p_u,p_p) then raise exception 'هذه العملية متاحة لمدير النظام فقط'; end if;
  return jsonb_build_object('now',now(),'users',coalesce((
    select jsonb_agg(jsonb_build_object('id',id,'name',name,'username',username,'role',role,'active',active,
      'permissions',permissions,'last_seen',last_seen,'created_at',created_at) order by created_at) from staff_users),'[]'::jsonb));
end $$;
grant execute on function public.staff_admin_list(text,text) to anon, authenticated;

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
  else
    if not exists(select 1 from staff_users where username=v_user) then raise exception 'المستخدم غير موجود'; end if;
    if lower(v_user)=lower(trim(p_u)) and (coalesce(p_active,true)=false or p_role<>'مدير النظام') then
      raise exception 'لا يمكنك إيقاف حسابك أو تغيير دورك. استخدم حساب مدير آخر.'; end if;
    update staff_users set name=trim(p_name),role=p_role,permissions=v_perms,active=coalesce(p_active,active) where username=v_user;
    if coalesce(p_password,'')<>'' then
      if length(p_password)<8 then raise exception 'كلمة المرور 8 أحرف على الأقل'; end if;
      update staff_users set password_hash=encode(digest(p_password,'sha256'),'hex') where username=v_user;
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
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.staff_change_password(text,text,text) to anon, authenticated;

-- مراجعة طلبات المتطوعين: المدير أو الباحث الاجتماعي أو من لديه صلاحية المتطوعين
create or replace function public._vol_staff_ok(p_u text, p_p text)
returns boolean language sql security definer set search_path=public, extensions as $$
  select exists(select 1 from staff_users where username=trim(p_u) and active
    and password_hash=encode(digest(p_p,'sha256'),'hex')
    and (role in ('مدير النظام','باحث اجتماعي') or coalesce(permissions,'[]'::jsonb) ? 'people'));
$$;
revoke execute on function public._vol_staff_ok(text,text) from public, anon, authenticated;
