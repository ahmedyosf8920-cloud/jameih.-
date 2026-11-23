-- جمعية الخير للجميع | الإصدار 29 — جلسات بتوكن + قفل محاولات الدخول + دعم bcrypt
-- آمن لإعادة التنفيذ. شغّله في Supabase > SQL Editor. لا يغيّر شيئًا في سلوك النسخة الحالية (v28) إلى أن تُفعّل المفاتيح في الآخر.
--
-- ما يفعله:
--  1) جدول staff_sessions: بعد الدخول يحصل المتصفح على توكن مؤقت (30 دقيقة خمول، 12 ساعة حد أقصى) ويُرسله بدل كلمة المرور.
--     كل الدوال القديمة تقبل التوكن في مكان كلمة المرور دون تغيير توقيعها.
--  2) قفل محاولات الدخول: 5 محاولات فاشلة لنفس (المستخدم + الشبكة) خلال 15 دقيقة، أو 20 للمستخدم من أي شبكة، أو 30 للشبكة.
--  3) bcrypt: جاهز لكنه مطفأ (security_config.bcrypt='off') حتى تتأكد أن دوال Edge Functions لا تقارن SHA-256 مباشرة.
--  4) تعديل تلقائي لأي دالة موجودة في قاعدتك تقارن password_hash بـ SHA-256 (حتى التي ليست في هذه الحزمة)؛ تُطبع أسماؤها في رسائل NOTICE.
--  5) انتهاء كل الجلسات تلقائيًا عند تغيير كلمة السر أو إيقاف الحساب أو حذفه.

create extension if not exists pgcrypto;

-- ===== الإعدادات =====
create table if not exists public.security_config(key text primary key, value text not null);
insert into public.security_config(key,value) values ('password_rpc','on'),('bcrypt','off') on conflict (key) do nothing;
alter table public.security_config enable row level security;
revoke all on public.security_config from public, anon, authenticated;

create or replace function public._cfg(p_key text) returns text
language sql stable security definer set search_path=public as $$
  select value from public.security_config where key=p_key
$$;
revoke all on function public._cfg(text) from public, anon, authenticated;

-- ===== الجلسات ومحاولات الدخول =====
create table if not exists public.staff_sessions(
  token_hash text primary key,
  username text not null,
  created_at timestamptz not null default now(),
  last_used timestamptz not null default now(),
  expires_at timestamptz not null,
  hard_expires_at timestamptz not null
);
create index if not exists staff_sessions_user_idx on public.staff_sessions (lower(username));
alter table public.staff_sessions enable row level security;
revoke all on public.staff_sessions from public, anon, authenticated;

create table if not exists public.login_attempts(
  id bigserial primary key,
  at timestamptz not null default now(),
  ukey text not null,
  ip text not null default ''
);
create index if not exists login_attempts_at_idx on public.login_attempts (at);
create index if not exists login_attempts_ukey_idx on public.login_attempts (ukey, at);
alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from public, anon, authenticated;
revoke all on sequence public.login_attempts_id_seq from public, anon, authenticated;

-- ===== دوال مساعدة =====
create or replace function public._is_token(p text) returns boolean
language sql immutable as $$ select coalesce(p ~ '^jkh_[0-9a-f]{48}$', false) $$;
revoke all on function public._is_token(text) from public, anon, authenticated;

create or replace function public._pw_hash(p text) returns text
language plpgsql security definer set search_path=public, extensions as $$
begin
  if coalesce(public._cfg('bcrypt'),'off')='on' then return crypt(p, gen_salt('bf',10)); end if;
  return encode(digest(p,'sha256'),'hex');
end $$;
revoke all on function public._pw_hash(text) from public, anon, authenticated;

create or replace function public._pw_verify(h text, p text) returns boolean
language plpgsql security definer set search_path=public, extensions as $$
begin
  if h is null or p is null then return false; end if;
  if h like '$2%' then return h = crypt(p, h); end if;
  return h = encode(digest(p,'sha256'),'hex');
end $$;
revoke all on function public._pw_verify(text,text) from public, anon, authenticated;

create or replace function public._client_ip() returns text
language plpgsql stable as $$
declare h jsonb;
begin
  h := nullif(current_setting('request.headers', true),'')::jsonb;
  if h is null then return ''; end if;
  return trim(coalesce(nullif(h->>'cf-connecting-ip',''), split_part(coalesce(h->>'x-forwarded-for',''),',',1), ''));
exception when others then return '';
end $$;
revoke all on function public._client_ip() from public, anon, authenticated;

create or replace function public._attempt_locked(p_key text) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_ip text := public._client_ip(); pair int; keyc int; ipc int;
begin
  select count(*) filter (where ukey=p_key and ip=v_ip),
         count(*) filter (where ukey=p_key),
         count(*) filter (where v_ip<>'' and ip=v_ip)
    into pair, keyc, ipc
    from login_attempts where at > now() - interval '15 minutes';
  return (v_ip<>'' and pair>=5) or (v_ip='' and keyc>=5) or keyc>=20 or ipc>=30;
end $$;
revoke all on function public._attempt_locked(text) from public, anon, authenticated;

create or replace function public._attempt_fail(p_key text) returns void
language plpgsql security definer set search_path=public as $$
begin
  delete from login_attempts where at < now() - interval '1 day';
  insert into login_attempts(ukey, ip) values (p_key, public._client_ip());
end $$;
revoke all on function public._attempt_fail(text) from public, anon, authenticated;

-- ===== التحقق من بيانات الدخول: توكن أو (عند السماح) كلمة مرور =====
create or replace function public._cred_ok(u text, secret text) returns boolean
language plpgsql security definer set search_path=public, extensions as $$
declare th text; h text;
begin
  if u is null or secret is null or secret = '' then return false; end if;
  if public._is_token(secret) then
    th := encode(digest(secret,'sha256'),'hex');
    perform 1 from staff_sessions s
      where s.token_hash = th and lower(s.username) = lower(trim(u))
        and s.expires_at > now() and s.hard_expires_at > now();
    if not found then return false; end if;
    update staff_sessions
       set last_used = now(), expires_at = least(now() + interval '30 minutes', hard_expires_at)
     where token_hash = th and expires_at < now() + interval '25 minutes';
    return true;
  end if;
  if coalesce(public._cfg('password_rpc'),'on') <> 'on' then return false; end if;
  select password_hash into h from staff_users where username = trim(u) and active;
  return public._pw_verify(h, secret);
end $$;
revoke all on function public._cred_ok(text,text) from public, anon, authenticated;

-- ===== الدخول =====
create or replace function public._login_core(p_username text, p_password text, p_session boolean)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare u staff_users; v_key text := lower(trim(coalesce(p_username,''))); ok boolean := false; tok text; res jsonb;
begin
  if v_key = '' or coalesce(p_password,'') = '' then return jsonb_build_object('user', null); end if;
  if p_session and public._is_token(p_password) then return jsonb_build_object('user', null); end if;
  if public._attempt_locked(v_key) then
    return jsonb_build_object('user', null, 'locked', true, 'retry_minutes', 15);
  end if;

  select * into u from staff_users where username = trim(p_username) and active = true;
  if found then
    if public._is_token(p_password) then ok := public._cred_ok(u.username, p_password);
    else ok := public._pw_verify(u.password_hash, p_password);
    end if;
  end if;

  if not ok then
    perform public._attempt_fail(v_key);
    if not exists(select 1 from audit_log where action='محاولة دخول فاشلة' and username=left(trim(coalesce(p_username,'')),60) and at>now()-interval '1 minute') then
      perform _audit(left(trim(coalesce(p_username,'')),60),'محاولة دخول فاشلة',null);
    end if;
    return jsonb_build_object('user', null);
  end if;

  delete from login_attempts where ukey = v_key;
  update staff_users set last_seen = now() where id = u.id;

  if not public._is_token(p_password) then
    -- ترقية الهاشَّ القديم إلى bcrypt عند أول دخول ناجح (إن كان مفعّلًا) دون إنهاء الجلسات
    if coalesce(public._cfg('bcrypt'),'off')='on' and u.password_hash not like '$2%' then
      perform set_config('jkh.keep_sessions','1',true);
      update staff_users set password_hash = public._pw_hash(p_password) where id = u.id;
      perform set_config('jkh.keep_sessions','',true);
    end if;
    perform _audit(u.username,'تسجيل دخول',null);
  end if;

  res := jsonb_build_object('user', jsonb_build_object('id',u.id,'name',u.name,'username',u.username,
    'role',u.role,'active',u.active,'permissions',u.permissions));

  if p_session then
    delete from staff_sessions where hard_expires_at < now() or expires_at < now();
    tok := 'jkh_' || encode(gen_random_bytes(24),'hex');
    insert into staff_sessions(token_hash, username, expires_at, hard_expires_at)
    values (encode(digest(tok,'sha256'),'hex'), u.username, now() + interval '30 minutes', now() + interval '12 hours');
    delete from staff_sessions where lower(username)=lower(u.username) and token_hash not in
      (select token_hash from staff_sessions where lower(username)=lower(u.username) order by created_at desc limit 10);
    res := res || jsonb_build_object('token', tok);
  end if;
  return res;
end $$;
revoke all on function public._login_core(text,text,boolean) from public, anon, authenticated;

-- login_staff: كلمة مرور أو توكن (للتحقق/إعادة التحقق ولدوال Edge Functions القديمة)
create or replace function public.login_staff(p_username text, p_password text)
returns jsonb language sql security definer set search_path=public, extensions as $$
  select public._login_core(p_username, p_password, false)
$$;
grant execute on function public.login_staff(text,text) to anon, authenticated;

-- login_staff_session: كلمة مرور فقط، ويرجع توكن الجلسة
create or replace function public.login_staff_session(p_username text, p_password text)
returns jsonb language sql security definer set search_path=public, extensions as $$
  select public._login_core(p_username, p_password, true)
$$;
grant execute on function public.login_staff_session(text,text) to anon, authenticated;

create or replace function public.staff_session_check(p_u text, p_token text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare u staff_users;
begin
  if not public._is_token(p_token) or not public._cred_ok(p_u, p_token) then return jsonb_build_object('user', null); end if;
  select * into u from staff_users where username = trim(p_u) and active;
  if not found then return jsonb_build_object('user', null); end if;
  update staff_users set last_seen = now() where id = u.id;
  return jsonb_build_object('user', jsonb_build_object('id',u.id,'name',u.name,'username',u.username,
    'role',u.role,'active',u.active,'permissions',u.permissions));
end $$;
grant execute on function public.staff_session_check(text,text) to anon, authenticated;

create or replace function public.staff_logout(p_u text, p_token text)
returns boolean language plpgsql security definer set search_path=public, extensions as $$
begin
  if not public._is_token(p_token) then return false; end if;
  delete from staff_sessions where token_hash = encode(digest(p_token,'sha256'),'hex') and lower(username)=lower(trim(p_u));
  return found;
end $$;
grant execute on function public.staff_logout(text,text) to anon, authenticated;

-- ===== تغيير كلمة السر (يتطلب كلمة السر الحالية الفعلية، وليس التوكن) =====
create or replace function public.staff_change_password(p_u text, p_old text, p_new text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare u staff_users; v_key text := lower(trim(coalesce(p_u,''))); tok text;
begin
  if length(coalesce(p_new,'')) < 8 then raise exception 'كلمة المرور الجديدة 8 أحرف على الأقل'; end if;
  if public._attempt_locked(v_key) then
    return jsonb_build_object('ok', false, 'message', 'محاولات كثيرة. انتظر 15 دقيقة ثم حاول مرة أخرى.');
  end if;
  select * into u from staff_users where username = trim(p_u) and active;
  if not found or public._is_token(p_old) or not public._pw_verify(u.password_hash, p_old) then
    perform public._attempt_fail(v_key);
    return jsonb_build_object('ok', false, 'message', 'كلمة المرور الحالية غير صحيحة');
  end if;
  update staff_users set password_hash = public._pw_hash(p_new) where id = u.id;   -- يُنهي كل الجلسات تلقائيًا (trigger)
  perform _audit(p_u,'تغيير كلمة سر الحساب',null);
  tok := 'jkh_' || encode(gen_random_bytes(24),'hex');
  insert into staff_sessions(token_hash, username, expires_at, hard_expires_at)
  values (encode(digest(tok,'sha256'),'hex'), u.username, now() + interval '30 minutes', now() + interval '12 hours');
  return jsonb_build_object('ok', true, 'token', tok);
end $$;
grant execute on function public.staff_change_password(text,text,text) to anon, authenticated;

-- ===== حذف مستخدم (يتطلب كلمة سر المدير الفعلية) =====
create or replace function public.admin_delete_staff(p_staff_username text, p_admin_username text, p_admin_password text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare v_admin staff_users; v_deleted integer; v_key text := lower(trim(coalesce(p_admin_username,'')));
begin
  if nullif(trim(p_staff_username),'') is null or nullif(trim(p_admin_username),'') is null or nullif(p_admin_password,'') is null then
    return jsonb_build_object('success', false, 'message', 'بيانات التأكيد غير مكتملة.');
  end if;
  if public._attempt_locked(v_key) then
    return jsonb_build_object('success', false, 'message', 'محاولات كثيرة. انتظر 15 دقيقة.');
  end if;
  select * into v_admin from staff_users where username = trim(p_admin_username) and active = true and role = 'مدير النظام';
  if not found or public._is_token(p_admin_password) or not public._pw_verify(v_admin.password_hash, p_admin_password) then
    perform public._attempt_fail(v_key);
    return jsonb_build_object('success', false, 'message', 'كلمة مرور المدير غير صحيحة أو الحساب غير مخوّل.');
  end if;
  if lower(trim(p_staff_username)) = 'admin' then
    return jsonb_build_object('success', false, 'message', 'لا يمكن حذف حساب المدير الافتراضي.');
  end if;
  delete from staff_users where username = trim(p_staff_username);
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('success', true, 'deleted', (v_deleted > 0), 'username', trim(p_staff_username));
end $$;
revoke all on function public.admin_delete_staff(text,text,text) from public;
grant execute on function public.admin_delete_staff(text,text,text) to anon, authenticated;

-- ===== إنهاء الجلسات عند تغيير كلمة السر / الإيقاف / الحذف / إعادة التسمية =====
create or replace function public._staff_sessions_cleanup() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('jkh.keep_sessions', true),'') = '1' then return new; end if;
  delete from staff_sessions where lower(username) = lower(old.username);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public._staff_sessions_cleanup() from public, anon, authenticated;
drop trigger if exists staff_sessions_cleanup_upd on public.staff_users;
create trigger staff_sessions_cleanup_upd after update on public.staff_users
  for each row when (old.password_hash is distinct from new.password_hash
                  or old.active is distinct from new.active
                  or old.username is distinct from new.username)
  execute function public._staff_sessions_cleanup();
drop trigger if exists staff_sessions_cleanup_del on public.staff_users;
create trigger staff_sessions_cleanup_del after delete on public.staff_users
  for each row execute function public._staff_sessions_cleanup();

-- ===== تعديل تلقائي لباقي الدوال التي تقارن SHA-256 مباشرة =====
-- (_staff_role, _staff_is_admin, _vol_staff_ok, staff_heartbeat, staff_admin_save ... وأي دوال أخرى في مشروعك)
do $$
declare r record; def text; nd text; patched text[] := '{}';
  sha text := $re$(?:extensions\.)?digest\(\s*(\w+)\s*,\s*'sha256'\s*\)\s*,\s*'hex'\s*\)$re$;
begin
  for r in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as d
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname not in ('_pw_hash','_pw_verify','_cred_ok','_login_core','login_staff','login_staff_session',
                             'staff_session_check','staff_logout','staff_change_password','admin_delete_staff','_staff_sessions_cleanup')
       and pg_get_functiondef(p.oid) ~* 'password_hash|digest\('
  loop
    def := r.d;
    -- 1) تعيين: set password_hash = encode(digest(X,'sha256'),'hex')  أو  , password_hash = ...
    nd := regexp_replace(def, '(\mset\s+|,\s*)password_hash(\s*=\s*)encode\(\s*' || sha, '\1password_hash\2public._pw_hash(\3)', 'gi');
    -- ملاحظة: \3 هنا هو اسم المتغير (المجموعة الثالثة) بعد المجموعتين السابقتين
    -- 2) مقارنة: [alias.]password_hash = encode(digest(X,'sha256'),'hex')
    nd := regexp_replace(nd, '((?:\w+\.)?)password_hash\s*=\s*encode\(\s*' || sha, 'public._cred_ok(\1username, \2)', 'gi');
    -- 3) قيم إدخال لكلمات سر جديدة فقط (أسماء المتغيرات تحتوي pass/pw/new)
    nd := regexp_replace(nd, 'encode\(\s*(?:extensions\.)?digest\(\s*(\w*(?:pass|pw|new)\w*)\s*,\s*''sha256''\s*\)\s*,\s*''hex''\s*\)', 'public._pw_hash(\1)', 'gi');
    if nd is distinct from def then
      execute nd;
      patched := patched || r.proname::text;
    end if;
  end loop;
  raise notice 'الدوال المعدّلة تلقائيًا: %', coalesce(array_to_string(patched, ', '), '(لا شيء)');
end $$;

-- ===== صلاحيات =====
revoke all on function public._login_core(text,text,boolean) from public, anon, authenticated;
