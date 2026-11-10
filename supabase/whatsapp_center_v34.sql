-- جمعية الخير للجميع | مركز التواصل عبر واتساب (WhatsApp Business Cloud API) — الإصدار 34
-- شغّل الملف كاملًا مرة واحدة في Supabase > SQL Editor (آمن لإعادة التنفيذ).
-- شرطه: تنفيذ ملفات الأمان السابقة (security_audit_backup / staff_management / v29..v31) لأن الدوال تعتمد على _staff_role.
-- لا يلمس أي جدول أو دالة قائمة (wa_queue / wa_optout الخاصة بخادم Baileys القديم تبقى كما هي).
-- النمط نفسه المستخدم في المشروع: RLS مفعّل بلا سياسات (المتصفح لا يصل للجداول مباشرة)،
-- والواجهة تستدعي دوال security definer بعد التحقق من جلسة الموظف، والدوال wa_svc_* لدور service_role فقط.

create extension if not exists pgcrypto;

-- ============================================================ الجداول
create table if not exists public.whatsapp_settings (
  id               int primary key default 1 check (id = 1),
  enabled          boolean not null default false,          -- الإرسال متوقف حتى يفعّله المدير بعد اختبار الاتصال
  phone_number_id  text,
  waba_id          text,
  api_version      text not null default 'v21.0',
  business_name    text not null default 'جمعية الخير للجميع',
  country_code     text not null default '20',
  daily_cap        int  not null default 1000,              -- حد الرسائل الجماعية يوميًا (يتبع مستوى حسابكم عند Meta)
  msgs_per_second  int  not null default 5,                 -- أقل بكثير من حد Meta
  window_start     int  not null default 9,                 -- نافذة إرسال الحملات (ساعة القاهرة)
  window_end       int  not null default 21,
  links            jsonb not null default '{"store":"","volunteer":"","case":"","activities":"","contact":""}'::jsonb,
  notifications    jsonb not null default '{
    "volunteer_received":{"enabled":false,"template_id":null},
    "volunteer_accepted":{"enabled":false,"template_id":null},
    "volunteer_rejected":{"enabled":false,"template_id":null},
    "donation_thanks":{"enabled":false,"template_id":null},
    "store_order_received":{"enabled":false,"template_id":null},
    "case_received":{"enabled":false,"template_id":null},
    "case_status_changed":{"enabled":false,"template_id":null}}'::jsonb,
  last_test_at     timestamptz,
  last_test_ok     boolean,
  last_test_msg    text,
  last_webhook_at  timestamptz,
  updated_at       timestamptz not null default now()
);
insert into public.whatsapp_settings(id) values (1) on conflict (id) do nothing;

create table if not exists public.whatsapp_contacts (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null default '',
  phone                text not null,
  category             text check (category is null or category in
                         ('المتبرعون','المتطوعون','الحالات الإنسانية','المستفيدون','عملاء المتجر','الإدارة')),
  source               text not null default 'يدوي',
  source_ref           text,
  registered_at        timestamptz not null default now(),
  consent_status       text not null default 'unknown' check (consent_status in ('granted','unknown','revoked')),
  consent_at           timestamptz,
  subscription_status  text not null default 'subscribed' check (subscription_status in ('subscribed','unsubscribed')),
  notes                text,
  last_inbound_at      timestamptz,                        -- لحساب نافذة خدمة العملاء 24 ساعة
  created_by           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint whatsapp_contacts_phone_ck check (phone ~ '^[0-9]{10,15}$')
);
create unique index if not exists whatsapp_contacts_phone_uq on public.whatsapp_contacts(phone);
create index if not exists whatsapp_contacts_cat_idx on public.whatsapp_contacts(category, subscription_status, consent_status);

create table if not exists public.whatsapp_templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                               -- اسم داخلي للعرض
  kind         text not null default 'meta' check (kind in ('meta','free_text')),
  meta_name    text,                                        -- اسم القالب المعتمد عند Meta (حروف إنجليزية صغيرة وشرطة سفلية)
  language     text not null default 'ar',
  category     text not null default 'UTILITY' check (category in ('UTILITY','MARKETING','AUTHENTICATION')),
  meta_status  text not null default 'draft' check (meta_status in ('draft','pending','approved','rejected','paused','disabled')),
  body         text not null,
  param_keys   text[] not null default '{}',                -- ترتيب المتغيرات = {{1}} {{2}} ... عند Meta
  header_type  text check (header_type is null or header_type in ('image','document','video')),
  is_builtin   boolean not null default false,
  active       boolean not null default true,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists whatsapp_templates_meta_uq on public.whatsapp_templates(meta_name, language) where meta_name is not null;

create table if not exists public.whatsapp_campaigns (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  audience      jsonb not null default '{"categories":[],"contact_ids":[]}'::jsonb,
  message_mode  text not null default 'template' check (message_mode in ('template','text')),
  template_id   uuid references public.whatsapp_templates(id) on delete set null,
  body          text,                                       -- نص حر: يُرسل فقط لمن راسل الجمعية خلال 24 ساعة
  media_url     text,
  media_type    text check (media_type is null or media_type in ('image','document','video')),
  status        text not null default 'draft' check (status in ('draft','scheduled','running','paused','completed','failed','cancelled')),
  scheduled_at  timestamptz,
  started_at    timestamptz,
  completed_at  timestamptz,
  test_sent_at  timestamptz,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists whatsapp_campaigns_status_idx on public.whatsapp_campaigns(status, scheduled_at);

create table if not exists public.whatsapp_campaign_recipients (
  id               bigint generated always as identity primary key,
  campaign_id      uuid not null references public.whatsapp_campaigns(id) on delete cascade,
  contact_id       uuid references public.whatsapp_contacts(id) on delete set null,
  phone            text not null,
  name             text,
  params           jsonb not null default '{}'::jsonb,
  status           text not null default 'pending' check (status in ('pending','sending','sent','delivered','read','failed','skipped')),
  error            text,
  attempts         int  not null default 0,
  next_attempt_at  timestamptz,
  claimed_at       timestamptz,
  message_id       uuid,
  idempotency_key  text not null,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  unique (campaign_id, phone),
  unique (idempotency_key)
);
create index if not exists whatsapp_recipients_work_idx on public.whatsapp_campaign_recipients(status, next_attempt_at, id);
create index if not exists whatsapp_recipients_camp_idx on public.whatsapp_campaign_recipients(campaign_id, status);

create table if not exists public.whatsapp_messages (
  id               uuid primary key default gen_random_uuid(),
  direction        text not null check (direction in ('out','in')),
  contact_id       uuid references public.whatsapp_contacts(id) on delete set null,
  phone            text not null,
  msg_type         text not null default 'text',
  body             text,
  template_id      uuid references public.whatsapp_templates(id) on delete set null,
  template_name    text,
  wa_message_id    text,
  status           text not null default 'queued' check (status in ('queued','sent','delivered','read','failed','received')),
  error_code       text,
  error_message    text,
  campaign_id      uuid references public.whatsapp_campaigns(id) on delete set null,
  recipient_id     bigint,
  event_key        text,
  source           text not null default 'manual' check (source in ('manual','campaign','event','auto_reply','system','inbound')),
  idempotency_key  text,
  created_by       text,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz,
  delivered_at     timestamptz,
  read_at          timestamptz,
  status_updated_at timestamptz not null default now()
);
create unique index if not exists whatsapp_messages_wa_uq on public.whatsapp_messages(wa_message_id) where wa_message_id is not null;
create unique index if not exists whatsapp_messages_idem_uq on public.whatsapp_messages(idempotency_key) where idempotency_key is not null;
create index if not exists whatsapp_messages_time_idx on public.whatsapp_messages(created_at desc);
create index if not exists whatsapp_messages_phone_idx on public.whatsapp_messages(phone, created_at desc);
create index if not exists whatsapp_messages_camp_idx on public.whatsapp_messages(campaign_id);

create table if not exists public.whatsapp_scheduled_messages (
  id               uuid primary key default gen_random_uuid(),
  phone            text not null,
  contact_id       uuid references public.whatsapp_contacts(id) on delete set null,
  name             text,
  template_id      uuid references public.whatsapp_templates(id) on delete set null,
  body             text,
  params           jsonb not null default '{}'::jsonb,
  send_at          timestamptz not null default now(),
  status           text not null default 'pending' check (status in ('pending','processing','sent','failed','cancelled','skipped')),
  source           text not null default 'manual' check (source in ('manual','event')),
  event_type       text,
  event_key        text,
  attempts         int not null default 0,
  next_attempt_at  timestamptz,
  claimed_at       timestamptz,
  last_error       text,
  message_id       uuid,
  created_by       text,
  created_at       timestamptz not null default now(),
  processed_at     timestamptz
);
create unique index if not exists whatsapp_scheduled_event_uq on public.whatsapp_scheduled_messages(event_key) where event_key is not null;
create index if not exists whatsapp_scheduled_work_idx on public.whatsapp_scheduled_messages(status, send_at);

create table if not exists public.whatsapp_auto_replies (
  id          uuid primary key default gen_random_uuid(),
  keyword     text not null,
  match_type  text not null default 'contains' check (match_type in ('exact','contains')),
  reply_body  text not null,
  active      boolean not null default true,
  sort_order  int not null default 100,
  hit_count   int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.whatsapp_opt_outs (
  phone          text primary key,
  contact_id     uuid references public.whatsapp_contacts(id) on delete set null,
  reason         text,
  source         text not null default 'manual' check (source in ('keyword','manual','import','api')),
  created_at     timestamptz not null default now(),
  resubscribed_at timestamptz
);

create table if not exists public.whatsapp_webhook_events (
  id            bigint generated always as identity primary key,
  event_id      text not null unique,                        -- مفتاح منع التكرار
  event_type    text not null,
  payload       jsonb,
  signature_ok  boolean not null default true,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text
);

create table if not exists public.whatsapp_audit_logs (
  id          bigint generated always as identity primary key,
  username    text,
  action      text not null,
  details     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists whatsapp_audit_time_idx on public.whatsapp_audit_logs(created_at desc);

-- RLS: مفعّل بلا سياسات = لا وصول مباشر من المتصفح. الدوال أدناه (security definer) والخادم (service_role) فقط.
do $$ declare t text; begin
  foreach t in array array['whatsapp_settings','whatsapp_contacts','whatsapp_templates','whatsapp_campaigns',
    'whatsapp_campaign_recipients','whatsapp_messages','whatsapp_scheduled_messages','whatsapp_auto_replies',
    'whatsapp_opt_outs','whatsapp_webhook_events','whatsapp_audit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence public.whatsapp_campaign_recipients_id_seq, public.whatsapp_webhook_events_id_seq,
  public.whatsapp_audit_logs_id_seq from public, anon, authenticated;

-- ============================================================ مساعدات
create or replace function public.wa_norm_phone(p text, p_cc text default '20') returns text
language plpgsql immutable set search_path=public as $$
declare d text;
begin
  d := translate(coalesce(p,''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  d := regexp_replace(d, '[^0-9]', '', 'g');
  if d like '00%' then d := substr(d, 3);
  elsif d like '0%' then d := p_cc || substr(d, 2);
  elsif p_cc = '20' and length(d) = 10 and d like '1%' then d := '20' || d;
  end if;
  if length(d) between 10 and 15 then return d; end if;
  return null;
end $$;

create or replace function public._wa_role(p_u text, p_p text) returns text
language plpgsql security definer set search_path=public, extensions as $$
declare r text; pm jsonb;
begin
  r := _staff_role(p_u, p_p);
  if r is null then return null; end if;
  if r = 'مدير النظام' then return 'admin'; end if;
  select permissions into pm from staff_users where username = trim(p_u) and active;
  if r = 'باحث اجتماعي' or (pm is not null and jsonb_typeof(pm) = 'array' and pm ? 'whatsapp') then return 'supervisor'; end if;
  return null;
end $$;

create or replace function public._wa_need(p_u text, p_p text, p_admin boolean default false) returns text
language plpgsql security definer set search_path=public, extensions as $$
declare r text;
begin
  r := _wa_role(p_u, p_p);
  if r is null then raise exception 'غير مصرح بالدخول إلى مركز واتساب'; end if;
  if p_admin and r <> 'admin' then raise exception 'هذه العملية متاحة لمدير النظام فقط'; end if;
  return r;
end $$;

create or replace function public._wa_audit(p_user text, p_action text, p_details jsonb default null) returns void
language sql security definer set search_path=public as $$
  insert into whatsapp_audit_logs(username, action, details) values (left(coalesce(p_user,''),60), left(p_action,160), p_details);
$$;

-- استخراج متغيرات {الاسم} بترتيب أول ظهور
create or replace function public._wa_param_keys(p_body text) returns text[]
language sql immutable as $$
  select coalesce(array_agg(k order by first_pos), '{}') from (
    select m[1] as k, min(ord) as first_pos
    from regexp_matches(coalesce(p_body,''), '\{([^{}]+)\}', 'g') with ordinality as t(m, ord)
    group by m[1]) s;
$$;

revoke all on function public._wa_role(text,text), public._wa_need(text,text,boolean),
  public._wa_audit(text,text,jsonb) from public, anon, authenticated;

-- ============================================================ الجمهور وجهات الاتصال
create or replace function public._wa_audience_ids(p_aud jsonb) returns setof uuid
language sql stable security definer set search_path=public as $$
  select ct.id from whatsapp_contacts ct
   where ct.consent_status = 'granted' and ct.subscription_status = 'subscribed'
     and not exists (select 1 from whatsapp_opt_outs o where o.phone = ct.phone and o.resubscribed_at is null)
     and ( coalesce((p_aud->>'all')::boolean, false)
        or ct.category in (select jsonb_array_elements_text(coalesce(p_aud->'categories','[]'::jsonb)))
        or ct.id::text in (select jsonb_array_elements_text(coalesce(p_aud->'contact_ids','[]'::jsonb))) );
$$;
revoke all on function public._wa_audience_ids(jsonb) from public, anon, authenticated;

create or replace function public.wa_audience_count(p_u text, p_p text, p_aud jsonb) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare n int; total int; blocked int;
begin
  perform _wa_need(p_u, p_p);
  select count(*) into n from _wa_audience_ids(p_aud);
  select count(*) into total from whatsapp_contacts ct
   where coalesce((p_aud->>'all')::boolean,false)
      or ct.category in (select jsonb_array_elements_text(coalesce(p_aud->'categories','[]'::jsonb)))
      or ct.id::text in (select jsonb_array_elements_text(coalesce(p_aud->'contact_ids','[]'::jsonb)));
  blocked := total - n;
  return jsonb_build_object('eligible', n, 'matched', total, 'excluded', blocked);
end $$;

create or replace function public.wa_contacts_list(p_u text, p_p text, p_search text default null, p_category text default null,
  p_sub text default null, p_consent text default null, p_limit int default 50, p_offset int default 0) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare q text := nullif(trim(coalesce(p_search,'')),''); rows jsonb; total int;
begin
  perform _wa_need(p_u, p_p);
  select count(*) into total from whatsapp_contacts c
   where (q is null or c.name ilike '%'||q||'%' or c.phone like '%'||regexp_replace(q,'\D','','g')||'%' or c.notes ilike '%'||q||'%')
     and (p_category is null or p_category = '' or (p_category='__none' and c.category is null) or c.category = p_category)
     and (p_sub is null or p_sub = '' or c.subscription_status = p_sub)
     and (p_consent is null or p_consent = '' or c.consent_status = p_consent);
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into rows from (
    select c.* from whatsapp_contacts c
     where (q is null or c.name ilike '%'||q||'%' or c.phone like '%'||regexp_replace(q,'\D','','g')||'%' or c.notes ilike '%'||q||'%')
       and (p_category is null or p_category = '' or (p_category='__none' and c.category is null) or c.category = p_category)
       and (p_sub is null or p_sub = '' or c.subscription_status = p_sub)
       and (p_consent is null or p_consent = '' or c.consent_status = p_consent)
     order by c.created_at desc limit least(greatest(p_limit,1),500) offset greatest(p_offset,0)) x;
  return jsonb_build_object('total', total, 'rows', rows);
end $$;

create or replace function public.wa_contact_save(p_u text, p_p text, p_c jsonb) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare s whatsapp_settings; ph text; cid uuid; cat text; cons text; sub text; rec whatsapp_contacts;
begin
  perform _wa_need(p_u, p_p);
  select * into s from whatsapp_settings where id = 1;
  ph := wa_norm_phone(p_c->>'phone', s.country_code);
  if ph is null then raise exception 'رقم الهاتف غير صالح'; end if;
  cat  := nullif(p_c->>'category','');
  cons := coalesce(nullif(p_c->>'consent_status',''), 'unknown');
  sub  := coalesce(nullif(p_c->>'subscription_status',''), 'subscribed');
  begin cid := nullif(p_c->>'id','')::uuid; exception when others then raise exception 'معرّف غير صالح'; end;
  if cid is null then
    select id into cid from whatsapp_contacts where phone = ph;
  end if;
  if cid is null then
    insert into whatsapp_contacts(name, phone, category, source, consent_status, consent_at, subscription_status, notes, created_by)
    values (coalesce(trim(p_c->>'name'),''), ph, cat, coalesce(nullif(p_c->>'source',''),'يدوي'), cons,
            case when cons='granted' then now() end, sub, p_c->>'notes', p_u)
    returning * into rec;
  else
    if exists(select 1 from whatsapp_contacts where phone = ph and id <> cid) then raise exception 'هذا الرقم مسجّل لجهة اتصال أخرى'; end if;
    update whatsapp_contacts set name = coalesce(trim(p_c->>'name'),name), phone = ph, category = cat,
           consent_status = cons, consent_at = case when cons='granted' and consent_status<>'granted' then now() else consent_at end,
           subscription_status = sub, notes = p_c->>'notes', updated_at = now()
     where id = cid returning * into rec;
    if not found then raise exception 'جهة الاتصال غير موجودة'; end if;
  end if;
  perform _wa_audit(p_u, 'حفظ جهة اتصال', jsonb_build_object('id', rec.id));
  return to_jsonb(rec);
end $$;

create or replace function public.wa_contact_delete(p_u text, p_p text, p_ids jsonb) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare n int;
begin
  perform _wa_need(p_u, p_p, true);
  if jsonb_typeof(p_ids) <> 'array' or jsonb_array_length(p_ids) > 500 then raise exception 'قائمة غير صالحة'; end if;
  delete from whatsapp_contacts where id::text in (select jsonb_array_elements_text(p_ids));
  get diagnostics n = row_count;
  perform _wa_audit(p_u, 'حذف جهات اتصال', jsonb_build_object('count', n));
  return jsonb_build_object('deleted', n);
end $$;

create or replace function public.wa_contacts_set_consent(p_u text, p_p text, p_ids jsonb, p_status text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare n int;
begin
  perform _wa_need(p_u, p_p);
  if p_status not in ('granted','unknown','revoked') then raise exception 'حالة غير صالحة'; end if;
  if jsonb_typeof(p_ids) <> 'array' or jsonb_array_length(p_ids) > 2000 then raise exception 'قائمة غير صالحة'; end if;
  update whatsapp_contacts set consent_status = p_status,
         consent_at = case when p_status='granted' then now() else consent_at end, updated_at = now()
   where id::text in (select jsonb_array_elements_text(p_ids));
  get diagnostics n = row_count;
  perform _wa_audit(p_u, 'تحديث حالة الموافقة', jsonb_build_object('status', p_status, 'count', n));
  return jsonb_build_object('updated', n);
end $$;

-- استيراد (Excel/CSV بعد التحويل في المتصفح). p_dry_run=true يعرض النتيجة المتوقعة دون حفظ.
create or replace function public.wa_contacts_import(p_u text, p_p text, p_rows jsonb, p_category text default null,
  p_source text default 'استيراد ملف', p_consent text default 'unknown', p_update boolean default false, p_dry_run boolean default true) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare s whatsapp_settings; it jsonb; ph text; cat text; ex uuid; seen text[] := '{}';
        n_new int := 0; n_upd int := 0; n_dup int := 0; n_inv int := 0; bad jsonb := '[]'::jsonb; idx int := 0;
begin
  perform _wa_need(p_u, p_p);
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 3000 then raise exception 'الحد الأقصى 3000 صف في المرة'; end if;
  if p_consent not in ('granted','unknown') then raise exception 'حالة موافقة غير صالحة'; end if;
  if p_category is not null and p_category <> '' and p_category not in
     ('المتبرعون','المتطوعون','الحالات الإنسانية','المستفيدون','عملاء المتجر','الإدارة') then raise exception 'تصنيف غير صالح'; end if;
  select * into s from whatsapp_settings where id = 1;
  for it in select value from jsonb_array_elements(p_rows) loop
    idx := idx + 1;
    ph := wa_norm_phone(it->>'phone', s.country_code);
    if ph is null then
      n_inv := n_inv + 1;
      if jsonb_array_length(bad) < 30 then bad := bad || jsonb_build_object('row', idx, 'phone', it->>'phone'); end if;
      continue;
    end if;
    if ph = any(seen) then n_dup := n_dup + 1; continue; end if;
    seen := seen || ph;
    cat := coalesce(nullif(it->>'category',''), nullif(p_category,''));
    if cat is not null and cat not in ('المتبرعون','المتطوعون','الحالات الإنسانية','المستفيدون','عملاء المتجر','الإدارة') then cat := nullif(p_category,''); end if;
    select id into ex from whatsapp_contacts where phone = ph;
    if ex is not null then
      if p_update then
        n_upd := n_upd + 1;
        if not p_dry_run then
          update whatsapp_contacts set name = coalesce(nullif(trim(it->>'name'),''), name), category = coalesce(cat, category),
                 notes = coalesce(nullif(it->>'notes',''), notes), updated_at = now() where id = ex;
        end if;
      else n_dup := n_dup + 1; end if;
    else
      n_new := n_new + 1;
      if not p_dry_run then
        insert into whatsapp_contacts(name, phone, category, source, consent_status, consent_at, notes, created_by)
        values (coalesce(trim(it->>'name'),''), ph, cat, left(coalesce(p_source,'استيراد ملف'),80), p_consent,
                case when p_consent='granted' then now() end, nullif(it->>'notes',''), p_u);
      end if;
    end if;
  end loop;
  if not p_dry_run then
    perform _wa_audit(p_u, 'استيراد جهات اتصال', jsonb_build_object('new', n_new, 'updated', n_upd, 'duplicates', n_dup, 'invalid', n_inv));
  end if;
  return jsonb_build_object('dry_run', p_dry_run, 'new', n_new, 'updated', n_upd, 'duplicates', n_dup, 'invalid', n_inv, 'invalid_rows', bad);
end $$;

-- ربط جهات الاتصال ببيانات الجمعية الموجودة (الحالات/المتطوعون/المتبرعون/المتطوعون المقبولون) — الموافقة تبقى "غير محددة"
create or replace function public.wa_contacts_sync_assoc(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare s whatsapp_settings; r record; ph text; n_new int := 0; n_seen int := 0; cat text; nm text; ref text;
begin
  perform _wa_need(p_u, p_p, true);
  select * into s from whatsapp_settings where id = 1;
  if to_regclass('public.records') is not null then
    for r in execute $q$
      select kind, id, data from records where kind in ('cases','volunteers','donations','memberships')$q$ loop
      if r.kind = 'cases' then
        ph := wa_norm_phone(coalesce(nullif(r.data->>'wa',''), nullif(r.data->>'phone',''), nullif(r.data->>'wifePhone',''), r.data->>'husbandPhone'), s.country_code);
        cat := 'الحالات الإنسانية'; nm := coalesce(r.data->>'name', r.data->>'husband','');
      elsif r.kind = 'volunteers' then
        ph := wa_norm_phone(coalesce(nullif(r.data->>'whatsapp',''), r.data->>'phone'), s.country_code);
        cat := 'المتطوعون'; nm := coalesce(r.data->>'name','');
      elsif r.kind = 'donations' then
        ph := wa_norm_phone(r.data->>'phone', s.country_code); cat := 'المتبرعون'; nm := coalesce(r.data->>'donor','');
      else
        ph := wa_norm_phone(coalesce(nullif(r.data->>'wa',''), r.data->>'phone'), s.country_code); cat := 'المستفيدون'; nm := coalesce(r.data->>'name','');
      end if;
      continue when ph is null;
      n_seen := n_seen + 1;
      ref := r.kind || ':' || r.id;
      insert into whatsapp_contacts(name, phone, category, source, source_ref, created_by)
      values (nm, ph, cat, 'بيانات الجمعية', ref, p_u) on conflict (phone) do nothing;
      if found then n_new := n_new + 1; end if;
    end loop;
  end if;
  if to_regclass('public.volunteer_applications') is not null then
    for r in execute $q$ select id, payload from volunteer_applications where status = 'مقبول'$q$ loop
      ph := wa_norm_phone(coalesce(nullif(r.payload->>'whatsapp',''), r.payload->>'phone'), s.country_code);
      continue when ph is null;
      n_seen := n_seen + 1;
      insert into whatsapp_contacts(name, phone, category, source, source_ref, created_by)
      values (coalesce(r.payload->>'name',''), ph, 'المتطوعون', 'طلبات المتطوعين', 'volunteer_applications:' || r.id, p_u)
      on conflict (phone) do nothing;
      if found then n_new := n_new + 1; end if;
    end loop;
  end if;
  perform _wa_audit(p_u, 'مزامنة جهات الاتصال من بيانات الجمعية', jsonb_build_object('seen', n_seen, 'new', n_new));
  return jsonb_build_object('seen', n_seen, 'new', n_new);
end $$;

-- ============================================================ الإعدادات
create or replace function public.wa_settings_get(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare s whatsapp_settings;
begin
  perform _wa_need(p_u, p_p);
  select * into s from whatsapp_settings where id = 1;
  return to_jsonb(s);
end $$;

create or replace function public.wa_settings_save(p_u text, p_p text, p_s jsonb) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare s whatsapp_settings; k text; cur jsonb; n jsonb; tid text;
begin
  perform _wa_need(p_u, p_p, true);
  select * into s from whatsapp_settings where id = 1;
  if p_s ? 'phone_number_id' and coalesce(p_s->>'phone_number_id','') !~ '^[0-9]{0,32}$' then raise exception 'Phone Number ID أرقام فقط'; end if;
  if p_s ? 'waba_id' and coalesce(p_s->>'waba_id','') !~ '^[0-9]{0,32}$' then raise exception 'WhatsApp Business Account ID أرقام فقط'; end if;
  if p_s ? 'api_version' and p_s->>'api_version' !~ '^v[0-9]{1,2}\.[0-9]$' then raise exception 'صيغة إصدار الواجهة غير صحيحة (مثال v21.0)'; end if;
  if p_s ? 'country_code' and p_s->>'country_code' !~ '^[0-9]{1,3}$' then raise exception 'رمز الدولة غير صالح'; end if;
  if p_s ? 'window_start' and ((p_s->>'window_start')::int not between 0 and 23) then raise exception 'ساعة غير صالحة'; end if;
  if p_s ? 'window_end' and ((p_s->>'window_end')::int not between 1 and 24) then raise exception 'ساعة غير صالحة'; end if;
  if p_s ? 'msgs_per_second' and ((p_s->>'msgs_per_second')::int not between 1 and 30) then raise exception 'السرعة بين 1 و30 رسالة/ثانية'; end if;
  if p_s ? 'daily_cap' and ((p_s->>'daily_cap')::int not between 1 and 100000) then raise exception 'الحد اليومي غير صالح'; end if;
  cur := s.notifications;
  if p_s ? 'notifications' then
    for k in select jsonb_object_keys(cur) loop
      if p_s->'notifications' ? k then
        n := p_s->'notifications'->k;
        tid := nullif(n->>'template_id','');
        if tid is not null and not exists(select 1 from whatsapp_templates where id = tid::uuid) then raise exception 'قالب غير موجود'; end if;
        cur := jsonb_set(cur, array[k], jsonb_build_object('enabled', coalesce((n->>'enabled')::boolean,false), 'template_id', to_jsonb(tid)));
      end if;
    end loop;
  end if;
  if coalesce((p_s->>'enabled')::boolean, s.enabled) and
     (coalesce(nullif(p_s->>'phone_number_id', ''), s.phone_number_id) is null or coalesce(nullif(p_s->>'waba_id',''), s.waba_id) is null) then
    raise exception 'أدخل Phone Number ID و WhatsApp Business Account ID قبل تفعيل الإرسال';
  end if;
  update whatsapp_settings set
    enabled         = coalesce((p_s->>'enabled')::boolean, enabled),
    phone_number_id = case when p_s ? 'phone_number_id' then nullif(p_s->>'phone_number_id','') else phone_number_id end,
    waba_id         = case when p_s ? 'waba_id' then nullif(p_s->>'waba_id','') else waba_id end,
    api_version     = coalesce(p_s->>'api_version', api_version),
    business_name   = coalesce(nullif(trim(p_s->>'business_name'),''), business_name),
    country_code    = coalesce(p_s->>'country_code', country_code),
    daily_cap       = coalesce((p_s->>'daily_cap')::int, daily_cap),
    msgs_per_second = coalesce((p_s->>'msgs_per_second')::int, msgs_per_second),
    window_start    = coalesce((p_s->>'window_start')::int, window_start),
    window_end      = coalesce((p_s->>'window_end')::int, window_end),
    links           = case when p_s ? 'links' and jsonb_typeof(p_s->'links')='object' then links || (p_s->'links') else links end,
    notifications   = cur,
    updated_at      = now()
  where id = 1;
  perform _wa_audit(p_u, 'تعديل إعدادات واتساب', jsonb_build_object('keys', (select jsonb_agg(k) from jsonb_object_keys(p_s) k)));
  select * into s from whatsapp_settings where id = 1;
  return to_jsonb(s);
end $$;

-- ============================================================ القوالب
create or replace function public.wa_templates_list(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _wa_need(p_u, p_p);
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.is_builtin desc, t.created_at) from whatsapp_templates t), '[]'::jsonb);
end $$;

create or replace function public.wa_template_save(p_u text, p_p text, p_t jsonb) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare tid uuid; rec whatsapp_templates; b text; mn text;
begin
  perform _wa_need(p_u, p_p, true);
  b := trim(coalesce(p_t->>'body',''));
  if b = '' or length(b) > 1024 then raise exception 'نص القالب مطلوب (حتى 1024 حرفًا)'; end if;
  if coalesce(trim(p_t->>'name'),'') = '' then raise exception 'اسم القالب مطلوب'; end if;
  mn := nullif(trim(p_t->>'meta_name'),'');
  if mn is not null and mn !~ '^[a-z0-9_]{1,512}$' then raise exception 'اسم القالب عند Meta: حروف إنجليزية صغيرة وأرقام وشرطة سفلية فقط'; end if;
  if coalesce(p_t->>'kind','meta') = 'meta' and mn is null then raise exception 'قالب Meta يحتاج اسمه المعتمد (meta_name)'; end if;
  begin tid := nullif(p_t->>'id','')::uuid; exception when others then raise exception 'معرّف غير صالح'; end;
  if tid is null then
    insert into whatsapp_templates(name, kind, meta_name, language, category, meta_status, body, param_keys, header_type, created_by)
    values (trim(p_t->>'name'), coalesce(p_t->>'kind','meta'), mn, coalesce(nullif(p_t->>'language',''),'ar'),
            coalesce(nullif(p_t->>'category',''),'UTILITY'), coalesce(nullif(p_t->>'meta_status',''),'draft'), b,
            _wa_param_keys(b), nullif(p_t->>'header_type',''), p_u) returning * into rec;
  else
    update whatsapp_templates set name = trim(p_t->>'name'), kind = coalesce(p_t->>'kind', kind), meta_name = mn,
           language = coalesce(nullif(p_t->>'language',''), language), category = coalesce(nullif(p_t->>'category',''), category),
           body = b, param_keys = _wa_param_keys(b), header_type = nullif(p_t->>'header_type',''),
           meta_status = coalesce(nullif(p_t->>'meta_status',''), meta_status), active = coalesce((p_t->>'active')::boolean, active),
           updated_at = now()
     where id = tid returning * into rec;
    if not found then raise exception 'القالب غير موجود'; end if;
  end if;
  perform _wa_audit(p_u, 'حفظ قالب', jsonb_build_object('id', rec.id, 'name', rec.name));
  return to_jsonb(rec);
end $$;

create or replace function public.wa_template_delete(p_u text, p_p text, p_id uuid) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _wa_need(p_u, p_p, true);
  if exists(select 1 from whatsapp_campaigns where template_id = p_id and status in ('scheduled','running','paused')) then
    raise exception 'القالب مستخدم في حملة نشطة';
  end if;
  delete from whatsapp_templates where id = p_id;
  perform _wa_audit(p_u, 'حذف قالب', jsonb_build_object('id', p_id));
  return jsonb_build_object('ok', true);
end $$;

-- مكتبة قوالب جاهزة (قابلة للتعديل). meta_status=draft: تُرسل إلى Meta للاعتماد من Business Manager ثم تُزامَن من الواجهة.
insert into public.whatsapp_templates(name, kind, meta_name, category, body, param_keys, is_builtin)
select v.name, 'meta', v.meta_name, v.cat, v.body, public._wa_param_keys(v.body), true
from (values
 ('ترحيب بالمشترك','jkh_welcome','UTILITY','أهلًا {الاسم}، شكرًا لتواصلكم مع {اسم_الجمعية}. يسعدنا خدمتكم.'),
 ('تأكيد استلام طلب تطوع','jkh_volunteer_received','UTILITY','أهلًا {الاسم}، تم استلام طلب التطوع رقم {رقم_الطلب} وهو قيد المراجعة. سنوافيكم بالقرار قريبًا. {اسم_الجمعية}'),
 ('قبول طلب تطوع','jkh_volunteer_accepted','UTILITY','أهلًا {الاسم}، يسعدنا إبلاغكم بقبول طلب التطوع رقم {رقم_الطلب}. مرحبًا بكم في {اسم_الجمعية}، وسنتواصل معكم لتحديد الخطوات التالية.'),
 ('اعتذار عن طلب تطوع','jkh_volunteer_rejected','UTILITY','أهلًا {الاسم}، نشكركم على اهتمامكم بالتطوع مع {اسم_الجمعية}. نعتذر عن عدم تمكننا من قبول الطلب رقم {رقم_الطلب} حاليًا، ونرحّب بتقديمكم مستقبلًا.'),
 ('شكر على تبرع','jkh_donation_thanks','UTILITY','شكرًا لكم {الاسم} على تبرعكم رقم {رقم_التبرع} بقيمة {قيمة_التبرع} جنيهًا. جزاكم الله خيرًا. {اسم_الجمعية}'),
 ('تأكيد استلام طلب متجر','jkh_store_order','UTILITY','أهلًا {الاسم}، تم استلام طلبكم رقم {رقم_الطلب} من متجر {اسم_الجمعية} وجارٍ مراجعته.'),
 ('تأكيد استلام حالة','jkh_case_received','UTILITY','أهلًا {الاسم}، تم استلام طلبكم برقم {رقم_الحالة} لدى {اسم_الجمعية} وسيتم التواصل معكم عند اكتمال المراجعة.'),
 ('تحديث حالة الطلب','jkh_case_status','UTILITY','أهلًا {الاسم}، تم تحديث طلبكم رقم {رقم_الحالة}. للاستفسار تواصلوا مع {اسم_الجمعية}.'),
 ('دعوة لنشاط','jkh_activity_invite','MARKETING','أهلًا {الاسم}، تدعوكم {اسم_الجمعية} للمشاركة في نشاطنا القادم. للتفاصيل رُدّوا بكلمة: نشاط')
) as v(name, meta_name, cat, body)
where not exists (select 1 from public.whatsapp_templates where is_builtin);

-- ============================================================ الحملات
create or replace function public._wa_prepare_campaign(p_id uuid) returns int
language plpgsql security definer set search_path=public as $$
declare c whatsapp_campaigns; n int;
begin
  select * into c from whatsapp_campaigns where id = p_id;
  insert into whatsapp_campaign_recipients(campaign_id, contact_id, phone, name, params, idempotency_key)
  select c.id, ct.id, ct.phone, ct.name, jsonb_build_object('الاسم', ct.name, 'رقم_الهاتف', ct.phone), c.id::text || ':' || ct.phone
    from whatsapp_contacts ct where ct.id in (select _wa_audience_ids(c.audience))
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public._wa_prepare_campaign(uuid) from public, anon, authenticated;

create or replace function public.wa_campaign_save(p_u text, p_p text, p_c jsonb) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare cid uuid; rec whatsapp_campaigns; mode text; tid uuid; cur text;
begin
  perform _wa_need(p_u, p_p);
  if coalesce(trim(p_c->>'name'),'') = '' then raise exception 'اسم الحملة مطلوب'; end if;
  mode := coalesce(nullif(p_c->>'message_mode',''), 'template');
  if mode not in ('template','text') then raise exception 'نوع الرسالة غير صالح'; end if;
  begin tid := nullif(p_c->>'template_id','')::uuid; exception when others then raise exception 'قالب غير صالح'; end;
  if mode = 'template' and tid is not null and not exists(select 1 from whatsapp_templates where id = tid) then raise exception 'القالب غير موجود'; end if;
  if jsonb_typeof(coalesce(p_c->'audience','{}'::jsonb)) <> 'object' then raise exception 'الجمهور غير صالح'; end if;
  if nullif(p_c->>'media_url','') is not null and p_c->>'media_url' !~* '^https://' then raise exception 'رابط المرفق يجب أن يبدأ بـ https://'; end if;
  begin cid := nullif(p_c->>'id','')::uuid; exception when others then raise exception 'معرّف غير صالح'; end;
  if cid is null then
    insert into whatsapp_campaigns(name, description, audience, message_mode, template_id, body, media_url, media_type, created_by)
    values (trim(p_c->>'name'), p_c->>'description', coalesce(p_c->'audience','{"categories":[],"contact_ids":[]}'::jsonb), mode, tid,
            p_c->>'body', nullif(p_c->>'media_url',''), nullif(p_c->>'media_type',''), p_u) returning * into rec;
  else
    select status into cur from whatsapp_campaigns where id = cid;
    if cur is null then raise exception 'الحملة غير موجودة'; end if;
    if cur <> 'draft' then raise exception 'لا يمكن تعديل حملة بعد بدئها أو جدولتها'; end if;
    update whatsapp_campaigns set name = trim(p_c->>'name'), description = p_c->>'description',
           audience = coalesce(p_c->'audience', audience), message_mode = mode, template_id = tid, body = p_c->>'body',
           media_url = nullif(p_c->>'media_url',''), media_type = nullif(p_c->>'media_type',''), updated_at = now()
     where id = cid returning * into rec;
  end if;
  perform _wa_audit(p_u, 'حفظ حملة', jsonb_build_object('id', rec.id, 'name', rec.name));
  return to_jsonb(rec);
end $$;

create or replace function public.wa_campaigns_list(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _wa_need(p_u, p_p);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select c.*, t.name as template_name, t.meta_status as template_status,
      coalesce(r.total,0) as total, coalesce(r.pending,0) as pending, coalesce(r.sent,0) as sent,
      coalesce(r.delivered,0) as delivered, coalesce(r.read,0) as read, coalesce(r.failed,0) as failed, coalesce(r.skipped,0) as skipped
    from whatsapp_campaigns c
    left join whatsapp_templates t on t.id = c.template_id
    left join lateral (select count(*) total,
        count(*) filter (where status in ('pending','sending')) pending,
        count(*) filter (where status in ('sent','delivered','read')) sent,
        count(*) filter (where status in ('delivered','read')) delivered,
        count(*) filter (where status = 'read') read,
        count(*) filter (where status = 'failed') failed,
        count(*) filter (where status = 'skipped') skipped
      from whatsapp_campaign_recipients where campaign_id = c.id) r on true
  ) x), '[]'::jsonb);
end $$;

create or replace function public.wa_campaign_recipients(p_u text, p_p text, p_id uuid, p_status text default null, p_limit int default 100) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _wa_need(p_u, p_p);
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select id, phone, name, status, error, attempts, sent_at from whatsapp_campaign_recipients
     where campaign_id = p_id and (p_status is null or p_status = '' or status = p_status)
     order by id limit least(greatest(p_limit,1),500)) x), '[]'::jsonb);
end $$;

-- إجراءات الحملة: start / schedule / pause / resume / cancel
create or replace function public.wa_campaign_action(p_u text, p_p text, p_id uuid, p_action text, p_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare c whatsapp_campaigns; s whatsapp_settings; t whatsapp_templates; n int; eligible int;
begin
  perform _wa_need(p_u, p_p, p_action in ('start','schedule','resume'));
  select * into c from whatsapp_campaigns where id = p_id for update;
  if not found then raise exception 'الحملة غير موجودة'; end if;
  select * into s from whatsapp_settings where id = 1;
  if p_action in ('start','schedule','resume') then
    if not s.enabled then raise exception 'الإرسال غير مفعّل. أكمل إعدادات واتساب واختبر الاتصال ثم فعّل الإرسال.'; end if;
  end if;
  if p_action in ('start','schedule') then
    if c.status <> 'draft' then raise exception 'يمكن بدء الحملات المسودة فقط'; end if;
    if c.message_mode = 'template' then
      select * into t from whatsapp_templates where id = c.template_id;
      if not found then raise exception 'اختر قالبًا لهذه الحملة'; end if;
      if t.kind = 'meta' and t.meta_status <> 'approved' then raise exception 'القالب غير معتمد من Meta (الحالة: %)', t.meta_status; end if;
    elsif coalesce(trim(c.body),'') = '' then raise exception 'نص الرسالة فارغ'; end if;
    select count(*) into eligible from _wa_audience_ids(c.audience);
    if eligible = 0 then raise exception 'لا يوجد مستلمون مؤهلون (يلزم أن تكون الموافقة "ممنوحة" والاشتراك فعّالًا)'; end if;
    if p_action = 'start' then
      n := _wa_prepare_campaign(p_id);
      update whatsapp_campaigns set status='running', started_at = now(), updated_at = now() where id = p_id;
    else
      if p_at is null or p_at < now() + interval '1 minute' then raise exception 'اختر موعدًا مستقبليًا'; end if;
      update whatsapp_campaigns set status='scheduled', scheduled_at = p_at, updated_at = now() where id = p_id;
    end if;
  elsif p_action = 'pause' then
    if c.status not in ('running','scheduled') then raise exception 'لا يمكن إيقاف هذه الحملة'; end if;
    update whatsapp_campaigns set status='paused', updated_at = now() where id = p_id;
  elsif p_action = 'resume' then
    if c.status <> 'paused' then raise exception 'الحملة ليست متوقفة'; end if;
    if c.started_at is null then n := _wa_prepare_campaign(p_id); end if;
    update whatsapp_campaigns set status='running', started_at = coalesce(started_at, now()), updated_at = now() where id = p_id;
  elsif p_action = 'cancel' then
    if c.status in ('completed','cancelled','failed') then raise exception 'الحملة منتهية'; end if;
    update whatsapp_campaign_recipients set status='skipped', error='cancelled' where campaign_id = p_id and status = 'pending';
    update whatsapp_campaigns set status='cancelled', completed_at = now(), updated_at = now() where id = p_id;
  else raise exception 'إجراء غير معروف'; end if;
  perform _wa_audit(p_u, 'حملة: ' || p_action, jsonb_build_object('id', p_id));
  select * into c from whatsapp_campaigns where id = p_id;
  return to_jsonb(c);
end $$;

create or replace function public.wa_campaign_delete(p_u text, p_p text, p_id uuid) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare st text;
begin
  perform _wa_need(p_u, p_p, true);
  select status into st from whatsapp_campaigns where id = p_id;
  if st is null then raise exception 'الحملة غير موجودة'; end if;
  if st in ('running','scheduled') then raise exception 'أوقف الحملة أو ألغِها أولًا'; end if;
  delete from whatsapp_campaigns where id = p_id;
  perform _wa_audit(p_u, 'حذف حملة', jsonb_build_object('id', p_id));
  return jsonb_build_object('ok', true);
end $$;

-- ============================================================ رسائل مجدولة، سجل الرسائل
create or replace function public.wa_schedule_create(p_u text, p_p text, p_phone text, p_name text, p_template_id uuid,
  p_body text, p_params jsonb, p_send_at timestamptz) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare s whatsapp_settings; ph text; rec whatsapp_scheduled_messages;
begin
  perform _wa_need(p_u, p_p);
  select * into s from whatsapp_settings where id = 1;
  ph := wa_norm_phone(p_phone, s.country_code);
  if ph is null then raise exception 'رقم الهاتف غير صالح'; end if;
  if p_template_id is null and coalesce(trim(p_body),'') = '' then raise exception 'اختر قالبًا أو اكتب نص الرسالة'; end if;
  if p_send_at is null or p_send_at < now() then raise exception 'اختر موعدًا مستقبليًا'; end if;
  if exists(select 1 from whatsapp_opt_outs where phone = ph and resubscribed_at is null) then raise exception 'هذا الرقم ألغى اشتراكه'; end if;
  insert into whatsapp_scheduled_messages(phone, contact_id, name, template_id, body, params, send_at, source, created_by)
  values (ph, (select id from whatsapp_contacts where phone = ph), p_name, p_template_id, nullif(trim(p_body),''), coalesce(p_params,'{}'), p_send_at, 'manual', p_u)
  returning * into rec;
  perform _wa_audit(p_u, 'جدولة رسالة', jsonb_build_object('id', rec.id, 'at', p_send_at));
  return to_jsonb(rec);
end $$;

create or replace function public.wa_scheduled_list(p_u text, p_p text, p_status text default null, p_limit int default 100) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _wa_need(p_u, p_p);
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select m.id, m.phone, m.name, m.send_at, m.status, m.source, m.event_type, m.last_error, m.attempts, m.created_at, t.name as template_name
      from whatsapp_scheduled_messages m left join whatsapp_templates t on t.id = m.template_id
     where (p_status is null or p_status = '' or m.status = p_status)
     order by m.created_at desc limit least(greatest(p_limit,1),300)) x), '[]'::jsonb);
end $$;

create or replace function public.wa_scheduled_cancel(p_u text, p_p text, p_id uuid) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare n int;
begin
  perform _wa_need(p_u, p_p);
  update whatsapp_scheduled_messages set status = 'cancelled', processed_at = now() where id = p_id and status = 'pending';
  get diagnostics n = row_count;
  perform _wa_audit(p_u, 'إلغاء رسالة مجدولة', jsonb_build_object('id', p_id, 'count', n));
  return jsonb_build_object('cancelled', n);
end $$;

create or replace function public.wa_messages_list(p_u text, p_p text, p_search text default null, p_status text default null,
  p_direction text default null, p_limit int default 50, p_offset int default 0) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare q text := nullif(trim(coalesce(p_search,'')),''); total int; rows jsonb;
begin
  perform _wa_need(p_u, p_p);
  select count(*) into total from whatsapp_messages m
   where (q is null or m.phone like '%'||regexp_replace(q,'\D','','g')||'%' or m.body ilike '%'||q||'%' or m.template_name ilike '%'||q||'%')
     and (p_status is null or p_status='' or m.status = p_status) and (p_direction is null or p_direction='' or m.direction = p_direction);
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into rows from (
    select m.id, m.direction, m.phone, c.name as contact_name, m.msg_type, left(m.body, 400) as body, m.template_name, m.status,
           m.error_code, m.error_message, m.source, m.campaign_id, m.created_at, m.sent_at, m.delivered_at, m.read_at
      from whatsapp_messages m left join whatsapp_contacts c on c.id = m.contact_id
     where (q is null or m.phone like '%'||regexp_replace(q,'\D','','g')||'%' or m.body ilike '%'||q||'%' or m.template_name ilike '%'||q||'%')
       and (p_status is null or p_status='' or m.status = p_status) and (p_direction is null or p_direction='' or m.direction = p_direction)
     order by m.created_at desc limit least(greatest(p_limit,1),300) offset greatest(p_offset,0)) x;
  return jsonb_build_object('total', total, 'rows', rows);
end $$;

-- ============================================================ الردود التلقائية
create or replace function public.wa_autoreplies_list(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _wa_need(p_u, p_p);
  return coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order, a.created_at) from whatsapp_auto_replies a), '[]'::jsonb);
end $$;

create or replace function public.wa_autoreply_save(p_u text, p_p text, p_r jsonb) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare rid uuid; rec whatsapp_auto_replies; kw text;
begin
  perform _wa_need(p_u, p_p, true);
  kw := trim(coalesce(p_r->>'keyword',''));
  if kw = '' or length(kw) > 60 then raise exception 'الكلمة المفتاحية مطلوبة (حتى 60 حرفًا)'; end if;
  if coalesce(trim(p_r->>'reply_body'),'') = '' or length(p_r->>'reply_body') > 1000 then raise exception 'نص الرد مطلوب (حتى 1000 حرف)'; end if;
  if coalesce(p_r->>'match_type','contains') not in ('exact','contains') then raise exception 'نوع المطابقة غير صالح'; end if;
  begin rid := nullif(p_r->>'id','')::uuid; exception when others then raise exception 'معرّف غير صالح'; end;
  if rid is null then
    insert into whatsapp_auto_replies(keyword, match_type, reply_body, active, sort_order)
    values (kw, coalesce(p_r->>'match_type','contains'), trim(p_r->>'reply_body'), coalesce((p_r->>'active')::boolean,true), coalesce((p_r->>'sort_order')::int,100))
    returning * into rec;
  else
    update whatsapp_auto_replies set keyword = kw, match_type = coalesce(p_r->>'match_type', match_type), reply_body = trim(p_r->>'reply_body'),
           active = coalesce((p_r->>'active')::boolean, active), sort_order = coalesce((p_r->>'sort_order')::int, sort_order), updated_at = now()
     where id = rid returning * into rec;
    if not found then raise exception 'الرد غير موجود'; end if;
  end if;
  perform _wa_audit(p_u, 'حفظ رد تلقائي', jsonb_build_object('id', rec.id, 'keyword', kw));
  return to_jsonb(rec);
end $$;

create or replace function public.wa_autoreply_delete(p_u text, p_p text, p_id uuid) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _wa_need(p_u, p_p, true);
  delete from whatsapp_auto_replies where id = p_id;
  perform _wa_audit(p_u, 'حذف رد تلقائي', jsonb_build_object('id', p_id));
  return jsonb_build_object('ok', true);
end $$;

-- ردود جاهزة للتعديل (غير مفعّلة حتى تُضبط الروابط من الإعدادات)
insert into public.whatsapp_auto_replies(keyword, match_type, reply_body, active, sort_order)
select v.k, 'contains', v.b, false, v.o from (values
 ('تبرع',  'شكرًا لاهتمامكم بالتبرع لـ {اسم_الجمعية}. يمكنكم التبرع من خلال متجر التبرعات: {رابط_المتجر}', 10),
 ('تطوع',  'يسعدنا انضمامكم لفريق المتطوعين. سجّلوا بياناتكم من هنا: {رابط_التطوع}', 20),
 ('حالة',  'لتسجيل حالة أو متابعة طلب سابق استخدموا الرابط: {رابط_الحالات}', 30),
 ('نشاط',  'تعرّفوا على أنشطة {اسم_الجمعية} وفعالياتها من هنا: {رابط_الأنشطة}', 40),
 ('مساعدة','للتواصل مع {اسم_الجمعية}: {بيانات_التواصل}', 50)
) v(k, b, o)
where not exists (select 1 from public.whatsapp_auto_replies);

-- ============================================================ إلغاء الاشتراك
create or replace function public._wa_optout_apply(p_phone text, p_source text, p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare cid uuid;
begin
  select id into cid from whatsapp_contacts where phone = p_phone;
  insert into whatsapp_opt_outs(phone, contact_id, reason, source) values (p_phone, cid, left(p_reason,200), p_source)
  on conflict (phone) do update set resubscribed_at = null, created_at = now(), source = excluded.source, reason = excluded.reason, contact_id = excluded.contact_id;
  update whatsapp_contacts set subscription_status = 'unsubscribed', updated_at = now() where phone = p_phone;
  update whatsapp_campaign_recipients set status = 'skipped', error = 'opted_out' where phone = p_phone and status = 'pending';
  update whatsapp_scheduled_messages set status = 'skipped', last_error = 'opted_out', processed_at = now() where phone = p_phone and status = 'pending';
end $$;
revoke all on function public._wa_optout_apply(text,text,text) from public, anon, authenticated;

create or replace function public.wa_optouts_list(p_u text, p_p text, p_limit int default 200) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _wa_need(p_u, p_p);
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select o.phone, c.name, o.reason, o.source, o.created_at, o.resubscribed_at
      from whatsapp_opt_outs o left join whatsapp_contacts c on c.phone = o.phone
     order by o.created_at desc limit least(greatest(p_limit,1),500)) x), '[]'::jsonb);
end $$;

create or replace function public.wa_optout_add(p_u text, p_p text, p_phone text, p_reason text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare s whatsapp_settings; ph text;
begin
  perform _wa_need(p_u, p_p);
  select * into s from whatsapp_settings where id = 1;
  ph := wa_norm_phone(p_phone, s.country_code);
  if ph is null then raise exception 'رقم الهاتف غير صالح'; end if;
  perform _wa_optout_apply(ph, 'manual', coalesce(p_reason, 'إضافة يدوية'));
  perform _wa_audit(p_u, 'إضافة إلى إلغاء الاشتراك', jsonb_build_object('phone', ph));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.wa_optout_remove(p_u text, p_p text, p_phone text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _wa_need(p_u, p_p, true);
  update whatsapp_opt_outs set resubscribed_at = now() where phone = p_phone and resubscribed_at is null;
  update whatsapp_contacts set subscription_status = 'subscribed', updated_at = now() where phone = p_phone;
  perform _wa_audit(p_u, 'إعادة اشتراك', jsonb_build_object('phone', p_phone));
  return jsonb_build_object('ok', true);
end $$;

-- ============================================================ لوحة التحكم والتقارير
create or replace function public.wa_overview(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare s whatsapp_settings; d0 timestamptz := (date_trunc('day', now() at time zone 'Africa/Cairo')) at time zone 'Africa/Cairo';
begin
  perform _wa_need(p_u, p_p);
  select * into s from whatsapp_settings where id = 1;
  return jsonb_build_object(
    'configured', (s.phone_number_id is not null and s.waba_id is not null),
    'enabled', s.enabled, 'last_test_ok', s.last_test_ok, 'last_test_at', s.last_test_at, 'last_test_msg', s.last_test_msg,
    'last_webhook_at', s.last_webhook_at,
    'today', (select jsonb_build_object(
        'out', count(*) filter (where direction='out'),
        'delivered', count(*) filter (where direction='out' and status in ('delivered','read')),
        'failed', count(*) filter (where direction='out' and status='failed'),
        'in', count(*) filter (where direction='in')) from whatsapp_messages where created_at >= d0),
    'running_campaigns', (select count(*) from whatsapp_campaigns where status='running'),
    'scheduled_campaigns', (select count(*) from whatsapp_campaigns where status='scheduled'),
    'pending_scheduled', (select count(*) from whatsapp_scheduled_messages where status='pending'),
    'pending_recipients', (select count(*) from whatsapp_campaign_recipients where status in ('pending','sending')),
    'contacts', (select count(*) from whatsapp_contacts),
    'opt_outs', (select count(*) from whatsapp_opt_outs where resubscribed_at is null),
    'recent_failures', coalesce((select jsonb_agg(to_jsonb(f)) from (
        select phone, error_code, left(error_message,160) as error_message, created_at from whatsapp_messages
         where status='failed' order by created_at desc limit 5) f), '[]'::jsonb));
end $$;

create or replace function public.wa_reports(p_u text, p_p text, p_from date default null, p_to date default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare f date := coalesce(p_from, (now() at time zone 'Africa/Cairo')::date - 29); t date := coalesce(p_to, (now() at time zone 'Africa/Cairo')::date);
begin
  perform _wa_need(p_u, p_p);
  if t - f > 400 then raise exception 'المدة أطول من المسموح (400 يوم)'; end if;
  return jsonb_build_object(
    'from', f, 'to', t,
    'totals', (select jsonb_build_object(
        'total', count(*),
        'outbound', count(*) filter (where direction='out'),
        'inbound', count(*) filter (where direction='in'),
        'accepted', count(*) filter (where direction='out' and status in ('sent','delivered','read')),
        'delivered', count(*) filter (where direction='out' and status in ('delivered','read')),
        'read', count(*) filter (where direction='out' and status='read'),
        'failed', count(*) filter (where direction='out' and status='failed'))
       from whatsapp_messages where (created_at at time zone 'Africa/Cairo')::date between f and t),
    'campaigns', (select jsonb_build_object(
        'total', count(*), 'active', count(*) filter (where status in ('running','scheduled','paused')),
        'completed', count(*) filter (where status='completed')) from whatsapp_campaigns),
    'contacts', (select jsonb_build_object('total', count(*), 'subscribed', count(*) filter (where subscription_status='subscribed'),
        'unsubscribed', count(*) filter (where subscription_status='unsubscribed')) from whatsapp_contacts),
    'opt_outs', jsonb_build_object(
        'total', (select count(*) from whatsapp_opt_outs where resubscribed_at is null),
        'period', (select count(*) from whatsapp_opt_outs where (created_at at time zone 'Africa/Cairo')::date between f and t)),
    'daily', coalesce((select jsonb_agg(to_jsonb(x) order by x.d) from (
        select (created_at at time zone 'Africa/Cairo')::date as d,
               count(*) filter (where direction='out' and status in ('sent','delivered','read')) as accepted,
               count(*) filter (where direction='out' and status in ('delivered','read')) as delivered,
               count(*) filter (where direction='out' and status='read') as read,
               count(*) filter (where direction='out' and status='failed') as failed,
               count(*) filter (where direction='in') as inbound
          from whatsapp_messages where (created_at at time zone 'Africa/Cairo')::date between f and t group by 1) x), '[]'::jsonb),
    'monthly', coalesce((select jsonb_agg(to_jsonb(x) order by x.m) from (
        select to_char(created_at at time zone 'Africa/Cairo','YYYY-MM') as m,
               count(*) filter (where direction='out' and status in ('sent','delivered','read')) as accepted,
               count(*) filter (where direction='out' and status in ('delivered','read')) as delivered,
               count(*) filter (where direction='out' and status='read') as read,
               count(*) filter (where direction='out' and status='failed') as failed,
               count(*) filter (where direction='in') as inbound
          from whatsapp_messages where created_at >= (now() - interval '12 months') group by 1) x), '[]'::jsonb));
end $$;

create or replace function public.wa_audit_list(p_u text, p_p text, p_limit int default 200) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _wa_need(p_u, p_p, true);
  return coalesce((select jsonb_agg(to_jsonb(a)) from (
    select id, username, action, details, created_at from whatsapp_audit_logs order by id desc limit least(greatest(p_limit,1),500)) a), '[]'::jsonb);
end $$;

-- ============================================================ ربط أحداث الجمعية
create or replace function public._wa_emit(p_type text, p_key text, p_phone text, p_name text, p_params jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare s whatsapp_settings; cfg jsonb; ph text; tid uuid; st text := 'pending'; err text; burst int;
begin
  begin
    select * into s from whatsapp_settings where id = 1;
    if not found then return; end if;
    cfg := s.notifications -> p_type;
    if coalesce((cfg->>'enabled')::boolean, false) is not true then return; end if;
    ph := wa_norm_phone(p_phone, s.country_code);
    if ph is null then return; end if;
    begin tid := nullif(cfg->>'template_id','')::uuid; exception when others then tid := null; end;
    select count(*) into burst from whatsapp_scheduled_messages where event_type = p_type and created_at > now() - interval '60 seconds';
    if tid is null then st := 'skipped'; err := 'no_template';
    elsif burst >= 25 then st := 'skipped'; err := 'burst_guard';
    elsif exists(select 1 from whatsapp_opt_outs where phone = ph and resubscribed_at is null) then st := 'skipped'; err := 'opted_out';
    end if;
    insert into whatsapp_scheduled_messages(phone, contact_id, name, template_id, params, send_at, status, source, event_type, event_key, last_error, processed_at)
    values (ph, (select id from whatsapp_contacts where phone = ph), p_name, tid, coalesce(p_params,'{}'::jsonb), now(), st, 'event',
            p_type, p_key, err, case when st = 'skipped' then now() end)
    on conflict (event_key) where event_key is not null do nothing;    -- منع تكرار الإشعار لنفس الحدث
  exception when others then
    raise warning 'wa_emit failed (%): %', p_type, sqlerrm;            -- لا يُفشل العملية الأصلية أبدًا
  end;
end $$;
revoke all on function public._wa_emit(text,text,text,text,jsonb) from public, anon, authenticated;

create or replace function public._wa_trg_volunteer() returns trigger
language plpgsql security definer set search_path=public as $$
declare p jsonb := coalesce(new.payload, '{}'::jsonb); ph text := coalesce(nullif(p->>'whatsapp',''), p->>'phone'); nm text := p->>'name';
        prm jsonb := jsonb_build_object('الاسم', p->>'name', 'رقم_الطلب', new.code);
begin
  begin
    if tg_op = 'INSERT' then
      perform _wa_emit('volunteer_received', 'volunteer_received:' || new.id, ph, nm, prm);
    elsif new.status is distinct from old.status then
      if new.status = 'مقبول' then perform _wa_emit('volunteer_accepted', 'volunteer_accepted:' || new.id, ph, nm, prm);
      elsif new.status = 'مرفوض' then perform _wa_emit('volunteer_rejected', 'volunteer_rejected:' || new.id, ph, nm, prm);
      end if;
    end if;
  exception when others then raise warning 'wa volunteer trigger: %', sqlerrm; end;
  return new;
end $$;

create or replace function public._wa_trg_records() returns trigger
language plpgsql security definer set search_path=public as $$
declare d jsonb := new.data; ph text;
begin
  begin
    if new.kind = 'donations' then
      if tg_op = 'INSERT' and coalesce(d->>'phone','') <> ''
         and (coalesce(d->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or (d->>'date')::date >= current_date - 3) then   -- لا إشعار لتبرعات قديمة تُعاد كتابتها
        perform _wa_emit('donation_thanks', 'donation_thanks:' || new.id, d->>'phone', d->>'donor',
          jsonb_build_object('الاسم', d->>'donor', 'رقم_التبرع', d->>'no', 'قيمة_التبرع', d->>'amount'));
      end if;
    elsif new.kind = 'cases' then
      ph := coalesce(nullif(d->>'wa',''), nullif(d->>'phone',''), nullif(d->>'wifePhone',''), d->>'husbandPhone');
      if tg_op = 'INSERT' then
        perform _wa_emit('case_received', 'case_received:' || new.id, ph, d->>'name',
          jsonb_build_object('الاسم', d->>'name', 'رقم_الحالة', d->>'no'));
      elsif coalesce(old.data->>'fileStatus','') is distinct from coalesce(d->>'fileStatus','') and coalesce(d->>'fileStatus','') <> '' then
        -- نص الإشعار عام ولا يتضمن حالة الملف أو أي بيانات إنسانية
        perform _wa_emit('case_status_changed', 'case_status:' || new.id || ':' || (d->>'fileStatus'), ph, d->>'name',
          jsonb_build_object('الاسم', d->>'name', 'رقم_الحالة', d->>'no'));
      end if;
    end if;
  exception when others then raise warning 'wa records trigger: %', sqlerrm; end;
  return new;
end $$;

do $$ begin
  if to_regclass('public.volunteer_applications') is not null then
    drop trigger if exists wa_volunteer_ins on public.volunteer_applications;
    create trigger wa_volunteer_ins after insert on public.volunteer_applications for each row execute function public._wa_trg_volunteer();
    drop trigger if exists wa_volunteer_upd on public.volunteer_applications;
    create trigger wa_volunteer_upd after update of status on public.volunteer_applications for each row execute function public._wa_trg_volunteer();
  end if;
  if to_regclass('public.records') is not null then
    drop trigger if exists wa_records_ins on public.records;
    create trigger wa_records_ins after insert on public.records for each row when (new.kind in ('donations','cases')) execute function public._wa_trg_records();
    drop trigger if exists wa_records_upd on public.records;
    create trigger wa_records_upd after update on public.records for each row when (new.kind = 'cases') execute function public._wa_trg_records();
  end if;
end $$;

-- طلبات المتجر: جداول المتجر تُدار عبر دالة donation-store خارج هذه الحزمة، لذلك يوفَّر مدخل عام يستدعيه الخادم بعد تسجيل الطلب:
--   select wa_svc_emit('store_order_received', 'store_order:' || <order_id>, <phone>, <name>, jsonb_build_object('الاسم', <name>, 'رقم_الطلب', <order_no>));
create or replace function public.wa_svc_emit(p_type text, p_key text, p_phone text, p_name text, p_params jsonb) returns void
language sql security definer set search_path=public as $$ select public._wa_emit(p_type, p_key, p_phone, p_name, p_params); $$;

-- ============================================================ دوال الخادم فقط (service_role): العامل والـ Webhook
create or replace function public.wa_svc_tick() returns jsonb
language plpgsql security definer set search_path=public as $$
declare c record; started int := 0; stale_r int; stale_s int; done_n int := 0;
begin
  for c in select id from whatsapp_campaigns where status = 'scheduled' and scheduled_at <= now() for update skip locked loop
    perform _wa_prepare_campaign(c.id);
    update whatsapp_campaigns set status = 'running', started_at = now(), updated_at = now() where id = c.id;
    started := started + 1;
  end loop;
  -- إرسال قد يكون نُفّذ دون تأكيد حفظ: لا نعيده حتى لا تتكرر الرسالة (أقصى حرص ضد التكرار)
  update whatsapp_campaign_recipients set status = 'failed', error = 'stale_unknown_outcome' where status = 'sending' and claimed_at < now() - interval '10 minutes';
  get diagnostics stale_r = row_count;
  update whatsapp_scheduled_messages set status = 'failed', last_error = 'stale_unknown_outcome', processed_at = now() where status = 'processing' and claimed_at < now() - interval '10 minutes';
  get diagnostics stale_s = row_count;
  update whatsapp_campaigns c set status = case when not exists(select 1 from whatsapp_campaign_recipients r where r.campaign_id = c.id and r.status not in ('failed','skipped'))
                                             and exists(select 1 from whatsapp_campaign_recipients r where r.campaign_id = c.id and r.status = 'failed')
                                           then 'failed' else 'completed' end,
         completed_at = now(), updated_at = now()
   where c.status = 'running' and not exists(select 1 from whatsapp_campaign_recipients r where r.campaign_id = c.id and r.status in ('pending','sending'));
  get diagnostics done_n = row_count;
  return jsonb_build_object('started', started, 'stale_recipients', stale_r, 'stale_scheduled', stale_s, 'completed', done_n);
end $$;

create or replace function public.wa_svc_claim_recipients(p_limit int) returns jsonb
language plpgsql security definer set search_path=public as $$
declare res jsonb;
begin
  with pick as (
    select r.id from whatsapp_campaign_recipients r join whatsapp_campaigns c on c.id = r.campaign_id
     where c.status = 'running' and r.status = 'pending' and (r.next_attempt_at is null or r.next_attempt_at <= now())
     order by r.id limit greatest(p_limit,0) for update of r skip locked),
  upd as (
    update whatsapp_campaign_recipients r set status = 'sending', attempts = r.attempts + 1, claimed_at = now()
      from pick where r.id = pick.id returning r.*)
  select coalesce(jsonb_agg(jsonb_build_object(
      'recipient_id', u.id, 'campaign_id', u.campaign_id, 'phone', u.phone, 'name', u.name, 'params', u.params,
      'attempts', u.attempts, 'idempotency_key', u.idempotency_key, 'contact_id', u.contact_id,
      'mode', c.message_mode, 'body', c.body, 'media_url', c.media_url, 'media_type', c.media_type,
      'last_inbound_at', ct.last_inbound_at,
      'template', case when t.id is null then null else to_jsonb(t) end)), '[]'::jsonb)
    into res
    from upd u join whatsapp_campaigns c on c.id = u.campaign_id
    left join whatsapp_templates t on t.id = c.template_id
    left join whatsapp_contacts ct on ct.id = u.contact_id;
  return res;
end $$;

create or replace function public.wa_svc_claim_scheduled(p_limit int) returns jsonb
language plpgsql security definer set search_path=public as $$
declare res jsonb;
begin
  with pick as (
    select m.id from whatsapp_scheduled_messages m
     where m.status = 'pending' and m.send_at <= now() and (m.next_attempt_at is null or m.next_attempt_at <= now())
     order by m.send_at limit greatest(p_limit,0) for update skip locked),
  upd as (
    update whatsapp_scheduled_messages m set status = 'processing', attempts = m.attempts + 1, claimed_at = now()
      from pick where m.id = pick.id returning m.*)
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', u.id, 'phone', u.phone, 'name', u.name, 'params', u.params, 'body', u.body, 'attempts', u.attempts,
      'source', u.source, 'event_type', u.event_type, 'event_key', u.event_key, 'contact_id', u.contact_id,
      'last_inbound_at', ct.last_inbound_at,
      'template', case when t.id is null then null else to_jsonb(t) end)), '[]'::jsonb)
    into res
    from upd u left join whatsapp_templates t on t.id = u.template_id
    left join whatsapp_contacts ct on ct.phone = u.phone;
  return res;
end $$;

-- عدد الرسائل الجماعية المقبولة اليوم (لحد الإرسال اليومي)
create or replace function public.wa_svc_sent_today() returns int
language sql security definer set search_path=public as $$
  select count(*)::int from whatsapp_messages
   where direction = 'out' and source = 'campaign' and status <> 'failed'
     and created_at >= (date_trunc('day', now() at time zone 'Africa/Cairo')) at time zone 'Africa/Cairo';
$$;

-- تحديث حالة رسالة من Webhook (لا رجوع للخلف: sent < delivered < read، والفشل لا يطغى على تسليم مؤكد)
create or replace function public.wa_svc_record_status(p_wa_id text, p_status text, p_ts timestamptz, p_code text, p_msg text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare m whatsapp_messages; rank_old int; rank_new int; ns text;
begin
  if p_status not in ('sent','delivered','read','failed') then return jsonb_build_object('ignored', true); end if;
  select * into m from whatsapp_messages where wa_message_id = p_wa_id for update;
  if not found then return jsonb_build_object('unknown_message', true); end if;
  rank_old := case m.status when 'queued' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else -1 end;
  rank_new := case p_status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else -1 end;
  if p_status = 'failed' then
    if m.status in ('delivered','read') then return jsonb_build_object('ignored', true); end if;
    ns := 'failed';
  elsif rank_new > rank_old or m.status = 'failed' then ns := p_status;   -- الفشل المبكر قد يُصحَّح بتسليم لاحق
  else return jsonb_build_object('ignored', true); end if;
  update whatsapp_messages set status = ns, status_updated_at = now(),
         sent_at = case when ns in ('sent','delivered','read') then coalesce(sent_at, p_ts) else sent_at end,
         delivered_at = case when ns in ('delivered','read') then coalesce(delivered_at, p_ts) else delivered_at end,
         read_at = case when ns = 'read' then coalesce(read_at, p_ts) else read_at end,
         error_code = case when ns = 'failed' then left(p_code,40) else null end,
         error_message = case when ns = 'failed' then left(p_msg,500) else null end
   where id = m.id;
  if m.recipient_id is not null then
    update whatsapp_campaign_recipients set status = ns, error = case when ns='failed' then left(coalesce(p_code,'') || ' ' || coalesce(p_msg,''),300) else null end
     where id = m.recipient_id;
  end if;
  return jsonb_build_object('status', ns);
end $$;

-- رسالة واردة: إنشاء/تحديث جهة الاتصال + نافذة 24 ساعة + حفظ الرسالة (تكرار wa_message_id يُتجاهل)
create or replace function public.wa_svc_inbound(p_phone text, p_name text, p_wa_id text, p_type text, p_body text, p_ts timestamptz) returns jsonb
language plpgsql security definer set search_path=public as $$
declare cid uuid; ins int;
begin
  select id into cid from whatsapp_contacts where phone = p_phone;
  if cid is null then
    insert into whatsapp_contacts(name, phone, source, last_inbound_at, consent_status, consent_at)
    values (coalesce(nullif(p_name,''),''), p_phone, 'رسالة واردة', p_ts, 'unknown', null) returning id into cid;
  else
    update whatsapp_contacts set last_inbound_at = greatest(coalesce(last_inbound_at, p_ts), p_ts),
           name = case when name = '' then coalesce(nullif(p_name,''), name) else name end, updated_at = now() where id = cid;
  end if;
  insert into whatsapp_messages(direction, contact_id, phone, msg_type, body, wa_message_id, status, source, created_at)
  values ('in', cid, p_phone, left(coalesce(p_type,'text'),30), left(p_body,2000), p_wa_id, 'received', 'inbound', p_ts)
  on conflict (wa_message_id) where wa_message_id is not null do nothing;
  get diagnostics ins = row_count;
  return jsonb_build_object('contact_id', cid, 'duplicate', ins = 0);
end $$;

create or replace function public.wa_svc_optout(p_phone text, p_reason text) returns void
language sql security definer set search_path=public as $$ select public._wa_optout_apply(p_phone, 'keyword', p_reason); $$;

create or replace function public.wa_svc_resubscribe(p_phone text) returns void
language plpgsql security definer set search_path=public as $$
begin
  update whatsapp_opt_outs set resubscribed_at = now() where phone = p_phone and resubscribed_at is null;
  update whatsapp_contacts set subscription_status = 'subscribed', updated_at = now() where phone = p_phone;
end $$;

do $$ declare f text; begin
  foreach f in array array['wa_svc_tick()','wa_svc_claim_recipients(int)','wa_svc_claim_scheduled(int)','wa_svc_sent_today()',
    'wa_svc_record_status(text,text,timestamptz,text,text)','wa_svc_inbound(text,text,text,text,text,timestamptz)',
    'wa_svc_optout(text,text)','wa_svc_resubscribe(text)','wa_svc_emit(text,text,text,text,jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function public.%s to service_role', f);
    end if;
  end loop;
end $$;

-- دوال الواجهة (تتحقق من جلسة الموظف داخليًا)
do $$ declare f text; begin
  foreach f in array array[
    'wa_audience_count(text,text,jsonb)','wa_contacts_list(text,text,text,text,text,text,int,int)','wa_contact_save(text,text,jsonb)',
    'wa_contact_delete(text,text,jsonb)','wa_contacts_set_consent(text,text,jsonb,text)',
    'wa_contacts_import(text,text,jsonb,text,text,text,boolean,boolean)','wa_contacts_sync_assoc(text,text)',
    'wa_settings_get(text,text)','wa_settings_save(text,text,jsonb)','wa_templates_list(text,text)','wa_template_save(text,text,jsonb)',
    'wa_template_delete(text,text,uuid)','wa_campaign_save(text,text,jsonb)','wa_campaigns_list(text,text)',
    'wa_campaign_recipients(text,text,uuid,text,int)','wa_campaign_action(text,text,uuid,text,timestamptz)','wa_campaign_delete(text,text,uuid)',
    'wa_schedule_create(text,text,text,text,uuid,text,jsonb,timestamptz)','wa_scheduled_list(text,text,text,int)','wa_scheduled_cancel(text,text,uuid)',
    'wa_messages_list(text,text,text,text,text,int,int)','wa_autoreplies_list(text,text)','wa_autoreply_save(text,text,jsonb)',
    'wa_autoreply_delete(text,text,uuid)','wa_optouts_list(text,text,int)','wa_optout_add(text,text,text,text)','wa_optout_remove(text,text,text)',
    'wa_overview(text,text)','wa_reports(text,text,date,date)','wa_audit_list(text,text,int)'] loop
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
