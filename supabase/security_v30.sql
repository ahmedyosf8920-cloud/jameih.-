-- جمعية الخير للجميع | الإصدار 30 — إيصالات مرقمة قابلة للتحقق + تحقق بخطوتين (TOTP) + حالة النسخ الخارجي
-- يتطلب تنفيذ security_v29.sql أولًا. آمن لإعادة التنفيذ. لا يغيّر سلوك أي حساب إلى أن يفعّل صاحبه التحقق بخطوتين.

-- ============================================================
-- 1) التحقق بخطوتين (TOTP — متوافق مع Google/Microsoft Authenticator)
-- ============================================================
alter table public.staff_users add column if not exists totp_secret text;
alter table public.staff_users add column if not exists totp_enabled boolean not null default false;
alter table public.staff_users add column if not exists totp_last_step bigint not null default 0;

insert into public.security_config(key,value) values ('totp_strict','off') on conflict (key) do nothing;

create or replace function public._b32_decode(p text) returns bytea
language plpgsql immutable as $$
declare alpha text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; c text; v int; bits bigint := 0; nb int := 0; out bytea := '\x'; s text := upper(regexp_replace(coalesce(p,''), '[\s=-]', '', 'g'));
begin
  for i in 1..length(s) loop
    c := substr(s,i,1); v := position(c in alpha) - 1;
    if v < 0 then raise exception 'سر غير صالح'; end if;
    bits := (bits << 5) | v; nb := nb + 5;
    if nb >= 8 then nb := nb - 8; out := out || set_byte('\x00'::bytea, 0, ((bits >> nb) & 255)::int); bits := bits & ((1::bigint << nb) - 1); end if;
  end loop;
  return out;
end $$;

create or replace function public._b32_encode(p bytea) returns text
language plpgsql immutable as $$
declare alpha text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; bits bigint := 0; nb int := 0; out text := ''; b int;
begin
  for i in 0..length(p)-1 loop
    b := get_byte(p,i); bits := (bits << 8) | b; nb := nb + 8;
    while nb >= 5 loop nb := nb - 5; out := out || substr(alpha, ((bits >> nb) & 31)::int + 1, 1); end loop;
    bits := bits & ((1::bigint << nb) - 1);
  end loop;
  if nb > 0 then out := out || substr(alpha, ((bits << (5 - nb)) & 31)::int + 1, 1); end if;
  return out;
end $$;

create or replace function public._totp_at(p_secret text, p_step bigint) returns text
language plpgsql immutable security definer set search_path=public, extensions as $$
declare h bytea; o int; n bigint;
begin
  h := hmac(int8send(p_step), public._b32_decode(p_secret), 'sha1');
  o := get_byte(h,19) & 15;
  n := ((get_byte(h,o) & 127)::bigint << 24) | (get_byte(h,o+1)::bigint << 16) | (get_byte(h,o+2)::bigint << 8) | get_byte(h,o+3)::bigint;
  return lpad((n % 1000000)::text, 6, '0');
end $$;
revoke all on function public._totp_at(text,bigint) from public, anon, authenticated;
revoke all on function public._b32_decode(text) from public, anon, authenticated;
revoke all on function public._b32_encode(bytea) from public, anon, authenticated;

-- يتحقق من الرمز (نافذة ±30 ثانية) ويمنع إعادة استخدام نفس الرمز
create or replace function public._totp_check(p_username text, p_code text) returns boolean
language plpgsql security definer set search_path=public, extensions as $$
declare u staff_users; cur bigint := floor(extract(epoch from now()) / 30)::bigint; d int; code text := regexp_replace(coalesce(p_code,''), '\s', '', 'g');
begin
  if code !~ '^\d{6}$' then return false; end if;
  select * into u from staff_users where username = p_username for update;
  if not found or u.totp_secret is null then return false; end if;
  for d in -1..1 loop
    if (cur + d) > u.totp_last_step and public._totp_at(u.totp_secret, cur + d) = code then
      update staff_users set totp_last_step = cur + d where id = u.id;
      return true;
    end if;
  end loop;
  return false;
end $$;
revoke all on function public._totp_check(text,text) from public, anon, authenticated;

-- ===== الدخول مع الخطوة الثانية =====
drop function if exists public._login_core(text,text,boolean);
create or replace function public._login_core(p_username text, p_password text, p_session boolean, p_totp text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare u staff_users; v_key text := lower(trim(coalesce(p_username,''))); ok boolean := false; tok text; res jsonb; need2fa boolean;
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

  -- الخطوة الثانية: عند إنشاء جلسة، أو عند تفعيل totp_strict لكلمات المرور المباشرة
  need2fa := u.totp_enabled and not public._is_token(p_password)
             and (p_session or coalesce(public._cfg('totp_strict'),'off') = 'on');
  if need2fa then
    if coalesce(trim(p_totp),'') = '' then
      return jsonb_build_object('user', null, 'need_totp', true);
    end if;
    if not public._totp_check(u.username, p_totp) then
      perform public._attempt_fail(v_key);
      perform _audit(u.username,'رمز التحقق بخطوتين خاطئ',null);
      return jsonb_build_object('user', null, 'need_totp', true, 'bad_totp', true);
    end if;
  end if;

  delete from login_attempts where ukey = v_key;
  update staff_users set last_seen = now() where id = u.id;

  if not public._is_token(p_password) then
    if coalesce(public._cfg('bcrypt'),'off')='on' and u.password_hash not like '$2%' then
      perform set_config('jkh.keep_sessions','1',true);
      update staff_users set password_hash = public._pw_hash(p_password) where id = u.id;
      perform set_config('jkh.keep_sessions','',true);
    end if;
    perform _audit(u.username,'تسجيل دخول',null);
  end if;

  res := jsonb_build_object('user', jsonb_build_object('id',u.id,'name',u.name,'username',u.username,
    'role',u.role,'active',u.active,'permissions',u.permissions,'totp',u.totp_enabled));

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
revoke all on function public._login_core(text,text,boolean,text) from public, anon, authenticated;

create or replace function public.login_staff(p_username text, p_password text)
returns jsonb language sql security definer set search_path=public, extensions as $$
  select public._login_core(p_username, p_password, false, null)
$$;
grant execute on function public.login_staff(text,text) to anon, authenticated;

drop function if exists public.login_staff_session(text,text);
create or replace function public.login_staff_session(p_username text, p_password text, p_totp text default null)
returns jsonb language sql security definer set search_path=public, extensions as $$
  select public._login_core(p_username, p_password, true, p_totp)
$$;
grant execute on function public.login_staff_session(text,text,text) to anon, authenticated;

-- staff_session_check يُرجع حقل totp أيضًا
create or replace function public.staff_session_check(p_u text, p_token text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare u staff_users;
begin
  if not public._is_token(p_token) or not public._cred_ok(p_u, p_token) then return jsonb_build_object('user', null); end if;
  select * into u from staff_users where username = trim(p_u) and active;
  if not found then return jsonb_build_object('user', null); end if;
  update staff_users set last_seen = now() where id = u.id;
  return jsonb_build_object('user', jsonb_build_object('id',u.id,'name',u.name,'username',u.username,
    'role',u.role,'active',u.active,'permissions',u.permissions,'totp',u.totp_enabled));
end $$;
grant execute on function public.staff_session_check(text,text) to anon, authenticated;

-- ===== إعداد وتفعيل وإيقاف =====
create or replace function public.totp_setup_start(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare sec text; v_user text := trim(p_u);
begin
  if _staff_role(p_u,p_p) is null then raise exception 'غير مصرح'; end if;
  if exists(select 1 from staff_users where username=v_user and totp_enabled) then raise exception 'التحقق بخطوتين مفعّل بالفعل'; end if;
  sec := public._b32_encode(gen_random_bytes(20));
  update staff_users set totp_secret = sec, totp_last_step = 0 where username = v_user;
  return jsonb_build_object('secret', sec, 'uri',
    'otpauth://totp/' || replace(urlencode_simple('جمعية الخير للجميع:' || v_user),'+','%20') ||
    '?secret=' || sec || '&issuer=' || urlencode_simple('جمعية الخير للجميع') || '&digits=6&period=30');
end $$;

create or replace function public.urlencode_simple(p text) returns text
language sql immutable as $$
  select string_agg(case when ch ~ '[A-Za-z0-9_.~-]' then ch
         else (select string_agg('%' || upper(to_hex(get_byte(convert_to(ch,'UTF8'), g))), '') from generate_series(0, length(convert_to(ch,'UTF8')) - 1) g) end, '')
  from regexp_split_to_table(coalesce(p,''), '') ch
$$;
revoke all on function public.urlencode_simple(text) from public, anon, authenticated;

create or replace function public.totp_enable(p_u text, p_p text, p_code text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  if _staff_role(p_u,p_p) is null then raise exception 'غير مصرح'; end if;
  if not exists(select 1 from staff_users where username=trim(p_u) and totp_secret is not null and not totp_enabled) then
    raise exception 'ابدأ الإعداد أولًا';
  end if;
  if not public._totp_check(trim(p_u), p_code) then raise exception 'الرمز غير صحيح. تأكد من ضبط وقت الهاتف ثم أعد المحاولة.'; end if;
  update staff_users set totp_enabled = true where username = trim(p_u);
  perform _audit(p_u,'تفعيل التحقق بخطوتين',null);
  return jsonb_build_object('ok', true);
end $$;

-- الإيقاف يتطلب كلمة المرور الحالية + رمزًا صالحًا (أو مدير آخر يعيد ضبط الحساب)
create or replace function public.totp_disable(p_u text, p_password text, p_code text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare u staff_users; v_key text := lower(trim(coalesce(p_u,'')));
begin
  if public._attempt_locked(v_key) then return jsonb_build_object('ok', false, 'message', 'محاولات كثيرة. انتظر 15 دقيقة.'); end if;
  select * into u from staff_users where username = trim(p_u) and active and totp_enabled;
  if not found or public._is_token(p_password) or not public._pw_verify(u.password_hash, p_password) or not public._totp_check(u.username, p_code) then
    perform public._attempt_fail(v_key);
    return jsonb_build_object('ok', false, 'message', 'كلمة المرور أو الرمز غير صحيح');
  end if;
  update staff_users set totp_enabled = false, totp_secret = null, totp_last_step = 0 where id = u.id;
  perform _audit(p_u,'إيقاف التحقق بخطوتين',null);
  return jsonb_build_object('ok', true);
end $$;

-- المدير يعيد ضبط التحقق بخطوتين لموظف فقد هاتفه
create or replace function public.totp_admin_reset(p_u text, p_p text, p_target text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare n int;
begin
  if not _staff_is_admin(p_u,p_p) then raise exception 'هذه العملية متاحة لمدير النظام فقط'; end if;
  update staff_users set totp_enabled=false, totp_secret=null, totp_last_step=0 where username=trim(p_target);
  get diagnostics n = row_count;
  perform _audit(p_u,'إعادة ضبط التحقق بخطوتين لمستخدم',jsonb_build_object('username',trim(p_target)));
  return jsonb_build_object('ok', true, 'reset', n > 0);
end $$;
grant execute on function public.totp_setup_start(text,text), public.totp_enable(text,text,text),
  public.totp_disable(text,text,text), public.totp_admin_reset(text,text,text) to anon, authenticated;

-- ============================================================
-- 2) إيصالات التبرع المرقمة والقابلة للتحقق
-- ============================================================
insert into public.security_config(key,value) values ('receipt_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')) on conflict (key) do nothing;

create table if not exists public.receipts(
  id bigserial primary key,
  yr int not null,
  seq int not null,
  no text not null unique,
  code text not null,
  donation_id text,
  amount numeric(14,2) not null,
  donor_masked text not null default '',
  rdate date not null,
  issued_by text,
  issued_at timestamptz not null default now(),
  cancelled boolean not null default false,
  cancel_reason text,
  unique (yr, seq)
);
create unique index if not exists receipts_donation_uq on public.receipts (donation_id) where donation_id is not null and not cancelled;
alter table public.receipts enable row level security;
revoke all on public.receipts from public, anon, authenticated;
revoke all on sequence public.receipts_id_seq from public, anon, authenticated;

create or replace function public._receipt_code(p_no text, p_amount numeric, p_date date) returns text
language sql stable security definer set search_path=public, extensions as $$
  select upper(substr(encode(hmac(p_no || '|' || to_char(p_amount,'FM999999990.00') || '|' || p_date::text,
                                   public._cfg('receipt_secret'), 'sha256'), 'hex'), 1, 8))
$$;
revoke all on function public._receipt_code(text,numeric,date) from public, anon, authenticated;

-- إخفاء اسم المتبرع: الاسم الأول + حروف مخفية
create or replace function public._mask_name(p text) returns text language sql immutable as $$
  select case when btrim(coalesce(p,'')) = '' then '' else split_part(btrim(p),' ',1) || ' ***' end
$$;
revoke all on function public._mask_name(text) from public, anon, authenticated;

create or replace function public._can_issue_receipt(p_u text, p_p text) returns boolean
language plpgsql security definer set search_path=public, extensions as $$
declare r text; perms jsonb;
begin
  r := _staff_role(p_u,p_p);
  if r is null then return false; end if;
  if r in ('مدير النظام','محاسب') then return true; end if;
  select permissions into perms from staff_users where username=trim(p_u);
  return coalesce(perms,'[]'::jsonb) ? 'donations';
end $$;
revoke all on function public._can_issue_receipt(text,text) from public, anon, authenticated;

-- إصدار إيصال (أو إرجاع الإيصال الموجود لنفس التبرع — لا يتكرر الرقم أبدًا)
create or replace function public.receipt_issue(p_u text, p_p text, p_donation_id text, p_amount numeric, p_donor text, p_date date)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare r receipts; y int; n int; v_no text;
begin
  if not public._can_issue_receipt(p_u,p_p) then raise exception 'غير مصرح بإصدار الإيصالات'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'مبلغ غير صالح'; end if;
  if coalesce(trim(p_donation_id),'') = '' then raise exception 'رقم التبرع مطلوب'; end if;
  perform pg_advisory_xact_lock(hashtext('jkh_receipts'));
  select * into r from receipts where donation_id = p_donation_id and not cancelled;
  if not found then
    y := extract(year from coalesce(p_date, current_date))::int;
    select coalesce(max(seq),0) + 1 into n from receipts where yr = y;
    v_no := 'JKH-' || y || '-' || lpad(n::text, 5, '0');
    insert into receipts(yr, seq, no, code, donation_id, amount, donor_masked, rdate, issued_by)
    values (y, n, v_no, public._receipt_code(v_no, p_amount, coalesce(p_date, current_date)), p_donation_id, p_amount,
            public._mask_name(p_donor), coalesce(p_date, current_date), left(p_u,60))
    returning * into r;
    perform _audit(p_u, 'إصدار إيصال تبرع', jsonb_build_object('no', r.no, 'amount', r.amount));
  end if;
  return jsonb_build_object('no', r.no, 'code', r.code, 'amount', r.amount, 'date', r.rdate, 'cancelled', r.cancelled);
end $$;
grant execute on function public.receipt_issue(text,text,text,numeric,text,date) to anon, authenticated;

create or replace function public.receipt_cancel(p_u text, p_p text, p_no text, p_reason text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare n int;
begin
  if not _staff_is_admin(p_u,p_p) then raise exception 'إلغاء الإيصال لمدير النظام فقط'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'اكتب سبب الإلغاء'; end if;
  update receipts set cancelled = true, cancel_reason = left(trim(p_reason),300) where no = trim(p_no) and not cancelled;
  get diagnostics n = row_count;
  perform _audit(p_u, 'إلغاء إيصال تبرع', jsonb_build_object('no', trim(p_no), 'reason', left(p_reason,200)));
  return jsonb_build_object('ok', true, 'cancelled', n > 0);
end $$;
grant execute on function public.receipt_cancel(text,text,text,text) to anon, authenticated;

-- التحقق العام (بدون تسجيل دخول): يرجع بيانات محدودة فقط، مع حد للمحاولات الخاطئة
create or replace function public.receipt_verify(p_no text, p_code text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare r receipts; v_key text := 'rcv:' || coalesce(nullif(public._client_ip(),''),'unknown');
begin
  if public._attempt_locked(v_key) then return jsonb_build_object('valid', false, 'locked', true); end if;
  select * into r from receipts where no = upper(trim(p_no));
  if not found or r.code <> upper(regexp_replace(coalesce(p_code,''), '\s', '', 'g')) then
    perform public._attempt_fail(v_key);
    return jsonb_build_object('valid', false);
  end if;
  return jsonb_build_object('valid', not r.cancelled, 'cancelled', r.cancelled, 'no', r.no, 'amount', r.amount,
    'date', r.rdate, 'donor', r.donor_masked);
end $$;
grant execute on function public.receipt_verify(text,text) to anon, authenticated;

-- قائمة الإيصالات للموظفين المخوّلين
create or replace function public.receipt_list(p_u text, p_p text, p_limit int default 200)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
begin
  if not public._can_issue_receipt(p_u,p_p) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(x) from (select no, code, amount, rdate, donor_masked, donation_id, issued_by, issued_at, cancelled
                    from receipts order by id desc limit least(coalesce(p_limit,200),1000)) x), '[]'::jsonb);
end $$;
grant execute on function public.receipt_list(text,text,int) to anon, authenticated;

-- ============================================================
-- 3) النسخ الاحتياطي الخارجي: سجل + تنزيل كامل للمدير
-- ============================================================
create table if not exists public.backup_log(
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null,          -- external | manual
  ok boolean not null,
  bytes bigint,
  note text
);
alter table public.backup_log enable row level security;
revoke all on public.backup_log from public, anon, authenticated;
revoke all on sequence public.backup_log_id_seq from public, anon, authenticated;

create or replace function public.backup_external_status(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare a timestamptz; b timestamptz;
begin
  if _staff_role(p_u,p_p) is null then raise exception 'غير مصرح'; end if;
  select max(at) into a from backup_log where ok and kind='external';
  select max(at) into b from backup_log where ok and kind='manual';
  return jsonb_build_object('last_external', a, 'last_manual', b,
    'recent', coalesce((select jsonb_agg(x) from (select at, kind, ok, bytes, note from backup_log order by id desc limit 10) x),'[]'::jsonb));
end $$;
grant execute on function public.backup_external_status(text,text) to anon, authenticated;

-- نسخة كاملة (البيانات + سجل النشاط + الإيصالات) للمدير فقط؛ تُسجَّل في backup_log
create or replace function public.backup_full(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare res jsonb;
begin
  if not _staff_is_admin(p_u,p_p) then raise exception 'متاح لمدير النظام فقط'; end if;
  res := jsonb_build_object(
    'exportedAt', now(), 'kind', 'full',
    'state', (select payload from app_state where id=1),
    'audit', coalesce((select jsonb_agg(a order by a.id) from (select id, at, username, action, details from audit_log where at > now() - interval '400 days') a), '[]'::jsonb),
    'receipts', coalesce((select jsonb_agg(r) from receipts r), '[]'::jsonb));
  insert into backup_log(kind, ok, bytes, note) values ('manual', true, length(res::text), left(p_u,60));
  perform _audit(p_u, 'تنزيل نسخة كاملة', jsonb_build_object('bytes', length(res::text)));
  return res;
end $$;
grant execute on function public.backup_full(text,text) to anon, authenticated;

-- ============================================================
-- 4) إضافة صلاحية "donations" للإيصالات متوفرة أصلًا؛ لا تغييرات أخرى على الصلاحيات
-- ============================================================
