-- جمعية الخير للجميع | الإصدار 51 | طبقة المحاسبة الموثقة: قسم «التسوية والإجراءات المحاسبية»
-- تغييرات إضافية فقط: لا يحذف ولا يعدّل أي جدول أو دالة موجودة.
-- قبل التشغيل: خذ نسخة احتياطية من «النسخ الاحتياطي» داخل النظام.
-- شغّل الملف كاملًا مرة واحدة داخل SQL Editor في Supabase. إعادة تشغيله آمنة.
--
-- الصلاحيات (تُمنح من «المستخدمون والصلاحيات»، ومدير النظام يملكها كلها):
--   settle         عرض وإنشاء مسودات مستندات التسوية
--   settle_review  مراجعة المحاسب
--   settle_approve اعتماد المسؤول (المدير التنفيذي / رئيس المجلس)
--   settle_post    ترحيل المستندات المعتمدة (أثر مالي فعلي)
--   settle_admin   دليل الحسابات ومراكز التكلفة والأرصدة الافتتاحية والإعدادات
-- حسابات «المحاسب» القديمة (بدون صلاحيات مخصصة) تحصل تلقائيًا على: settle, settle_review, settle_post, settle_admin.

create extension if not exists pgcrypto;

-- ============ الجداول ============
create table if not exists public.fin_seq(
  doc_type text not null, yr int not null, last int not null default 0,
  primary key (doc_type, yr));

create table if not exists public.fin_settings(key text primary key, value text not null);
insert into public.fin_settings(key,value) values ('separation','on') on conflict (key) do nothing;

create table if not exists public.fin_accounts(
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  acc_type text not null check (acc_type in ('asset','liability','equity','revenue','expense')),
  parent_id uuid references public.fin_accounts(id),
  active boolean not null default true,
  created_by text, created_at timestamptz not null default now());

create table if not exists public.fin_cost_centers(
  id uuid primary key default gen_random_uuid(),
  code text not null unique, name text not null,
  active boolean not null default true,
  created_by text, created_at timestamptz not null default now());

-- معرّف العملية الموحد (تستخدمه المراحل التالية لربط المستندات بالعملية الأصلية)
create table if not exists public.fin_operations(
  id uuid primary key default gen_random_uuid(),
  kind text not null, ref text not null,
  created_by text, created_at timestamptz not null default now(),
  unique (kind, ref));

create table if not exists public.fin_documents(
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('cash_out','advance_req','advance_settle','journal','cash_report')),
  doc_no text not null unique,
  yr int not null, seq int not null,
  doc_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft','review','reviewed','approved','posted','cancelled')),
  amount numeric(14,2) not null default 0 check (amount >= 0),
  payload jsonb not null default '{}'::jsonb,
  operation_id uuid references public.fin_operations(id),
  client_key text,
  created_by text not null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by text, reviewed_at timestamptz,
  approved_by text, approved_at timestamptz,
  posted_by text, posted_at timestamptz,
  cancelled_by text, cancelled_at timestamptz, cancel_reason text,
  reversed_by text, reversed_at timestamptz, reversal_reason text,
  unique (doc_type, yr, seq));
create unique index if not exists fin_documents_client_key_uq on public.fin_documents(client_key) where client_key is not null;
create index if not exists fin_documents_type_status on public.fin_documents(doc_type, status, doc_date desc);

create table if not exists public.fin_approvals(
  id bigserial primary key,
  doc_id uuid not null references public.fin_documents(id),
  step text not null check (step in ('review','approve')),
  decision text not null check (decision in ('approved','rejected')),
  username text not null, note text,
  at timestamptz not null default now());

create table if not exists public.fin_journal_entries(
  id uuid primary key default gen_random_uuid(),
  entry_no text not null unique,
  doc_id uuid references public.fin_documents(id),
  entry_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft','posted','reversed')),
  description text,
  reversal_of uuid references public.fin_journal_entries(id),
  reversal_reason text,
  posted_by text, posted_at timestamptz,
  created_by text, created_at timestamptz not null default now());
create unique index if not exists fin_entries_doc_uq on public.fin_journal_entries(doc_id) where reversal_of is null;

create table if not exists public.fin_journal_lines(
  id bigserial primary key,
  entry_id uuid not null references public.fin_journal_entries(id),
  line_no int not null,
  account_id uuid not null references public.fin_accounts(id),
  cost_center_id uuid references public.fin_cost_centers(id),
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  memo text,
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0)));
create index if not exists fin_lines_entry on public.fin_journal_lines(entry_id);

create table if not exists public.fin_cash_moves(
  id bigserial primary key,
  box text not null default 'main',
  move_date date not null,
  kind text not null check (kind in ('opening','payment','advance_return','reversal','receipt')),
  direction text not null check (direction in ('in','out')),
  amount numeric(14,2) not null check (amount > 0 or kind = 'opening'),
  doc_id uuid references public.fin_documents(id),
  doc_no text, note text,
  created_by text, created_at timestamptz not null default now());
create index if not exists fin_cash_moves_box_date on public.fin_cash_moves(box, move_date, id);

create table if not exists public.fin_advances(
  id uuid primary key default gen_random_uuid(),
  advance_no text not null unique,
  requester text not null, job text,
  amount numeric(14,2) not null check (amount > 0),
  purpose text, due_date date,
  status text not null default 'open' check (status in ('open','settled')),
  req_doc_id uuid references public.fin_documents(id),
  cash_doc_id uuid references public.fin_documents(id),
  settled_doc_id uuid references public.fin_documents(id),
  settled_at timestamptz,
  created_by text, created_at timestamptz not null default now());

create table if not exists public.fin_audit(
  id bigserial primary key,
  at timestamptz not null default now(),
  username text, action text not null,
  ref_type text, ref_id text, details jsonb);

-- ============ الإغلاق عن العامة (الوصول عبر الدوال فقط) ============
do $$ declare t text; begin
  foreach t in array array['fin_seq','fin_settings','fin_accounts','fin_cost_centers','fin_operations','fin_documents','fin_approvals','fin_journal_entries','fin_journal_lines','fin_cash_moves','fin_advances','fin_audit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence public.fin_approvals_id_seq, public.fin_journal_lines_id_seq, public.fin_cash_moves_id_seq, public.fin_audit_id_seq from public, anon, authenticated;

-- ============ حماية السجلات المرحّلة (Triggers) ============
create or replace function public._fin_no_change() returns trigger language plpgsql as $$
begin raise exception 'هذا السجل للإضافة فقط ولا يمكن تعديله أو حذفه (%)', tg_table_name; end $$;

drop trigger if exists fin_audit_immutable on public.fin_audit;
create trigger fin_audit_immutable before update or delete on public.fin_audit for each row execute function public._fin_no_change();
drop trigger if exists fin_approvals_immutable on public.fin_approvals;
create trigger fin_approvals_immutable before update or delete on public.fin_approvals for each row execute function public._fin_no_change();
drop trigger if exists fin_cash_moves_immutable on public.fin_cash_moves;
create trigger fin_cash_moves_immutable before update or delete on public.fin_cash_moves for each row execute function public._fin_no_change();

create or replace function public._fin_doc_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'لا يجوز حذف مستندات التسوية. استخدم الإلغاء أو القيد العكسي.'; end if;
  if old.status = 'posted' then
    if new.status <> 'posted' or new.payload is distinct from old.payload or new.amount is distinct from old.amount
       or new.doc_date is distinct from old.doc_date or new.doc_no is distinct from old.doc_no or new.doc_type is distinct from old.doc_type then
      raise exception 'المستند مرحّل ولا يمكن تعديله. استخدم القيد العكسي.';
    end if;
  end if;
  if old.status = 'cancelled' then raise exception 'المستند ملغى ولا يمكن تعديله'; end if;
  return new;
end $$;
drop trigger if exists fin_documents_guard on public.fin_documents;
create trigger fin_documents_guard before update or delete on public.fin_documents for each row execute function public._fin_doc_guard();

create or replace function public._fin_entry_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'لا يجوز حذف القيود اليومية. استخدم القيد العكسي.'; end if;
  if old.status in ('posted','reversed') then
    if old.status = 'posted' and new.status = 'reversed' and current_setting('fin.allow_reverse', true) = '1'
       and new.entry_no = old.entry_no and new.entry_date = old.entry_date and new.description is not distinct from old.description then
      return new;
    end if;
    raise exception 'القيد مرحّل ولا يمكن تعديله. صحّح بقيد عكسي موثّق.';
  end if;
  return new;
end $$;
drop trigger if exists fin_entries_guard on public.fin_journal_entries;
create trigger fin_entries_guard before update or delete on public.fin_journal_entries for each row execute function public._fin_entry_guard();

create or replace function public._fin_line_guard() returns trigger language plpgsql as $$
declare st text; eid uuid;
begin
  eid := case when tg_op = 'INSERT' then new.entry_id else old.entry_id end;
  select status into st from fin_journal_entries where id = eid;
  if st is distinct from 'draft' and not (tg_op = 'INSERT' and current_setting('fin.allow_reverse', true) = '1') then
    raise exception 'بنود القيد المرحّل لا تُعدَّل ولا تُحذف';
  end if;
  if tg_op = 'DELETE' then return old; end if; return new;
end $$;
drop trigger if exists fin_lines_guard on public.fin_journal_lines;
create trigger fin_lines_guard before insert or update or delete on public.fin_journal_lines for each row execute function public._fin_line_guard();

-- ============ دوال مساعدة داخلية ============
create or replace function public._fin_need(p_u text, p_p text, p_perm text) returns text
language plpgsql security definer set search_path=public, extensions as $$
declare r text; pm jsonb;
begin
  r := _staff_role(p_u, p_p);
  if r is null then raise exception 'غير مصرح. سجّل الدخول من جديد.'; end if;
  if r = 'مدير النظام' then return r; end if;
  select permissions into pm from staff_users where username = trim(p_u);
  if pm is null then
    if r = 'محاسب' and p_perm in ('settle','settle_review','settle_post','settle_admin') then return r; end if;
    raise exception 'ليست لديك صلاحية لهذه العملية';
  end if;
  if pm ? p_perm then return r; end if;
  raise exception 'ليست لديك صلاحية لهذه العملية';
end $$;

create or replace function public._fin_audit(p_user text, p_action text, p_ref_type text, p_ref_id text, p_details jsonb default null) returns void
language sql security definer set search_path=public as $$
  insert into fin_audit(username, action, ref_type, ref_id, details) values (left(coalesce(p_user,''),60), left(p_action,160), p_ref_type, p_ref_id, p_details);
$$;

create or replace function public._fin_prefix(p_type text) returns text language sql immutable as $$
  select case p_type when 'cash_out' then 'صرف' when 'advance_req' then 'سلفة' when 'advance_settle' then 'تسوية'
    when 'journal' then 'قيد' when 'cash_report' then 'خزينة' else 'مستند' end $$;

create or replace function public._fin_next(p_type text, p_yr int) returns int
language plpgsql security definer set search_path=public as $$
declare v int;
begin
  insert into fin_seq(doc_type, yr, last) values (p_type, p_yr, 1)
  on conflict (doc_type, yr) do update set last = fin_seq.last + 1 returning last into v;
  return v;
end $$;

create or replace function public._fin_amount(p_val text, p_required boolean) returns numeric
language plpgsql immutable as $$
begin
  if p_val is null or btrim(p_val) = '' then
    if p_required then raise exception 'المبلغ مطلوب'; end if; return 0;
  end if;
  if p_val !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' then raise exception 'المبلغ غير صالح'; end if;
  return p_val::numeric(14,2);
end $$;

create or replace function public._fin_doc_json(d public.fin_documents) returns jsonb
language sql stable security definer set search_path=public as $$
  select to_jsonb(d) || jsonb_build_object(
    'approvals', coalesce((select jsonb_agg(jsonb_build_object('step',a.step,'decision',a.decision,'username',a.username,'note',a.note,'at',a.at) order by a.id) from fin_approvals a where a.doc_id = d.id), '[]'::jsonb),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('account_code',ac.code,'account_name',ac.name,'cost_center',cc.code,'debit',l.debit,'credit',l.credit,'memo',l.memo) order by l.line_no)
        from fin_journal_entries e join fin_journal_lines l on l.entry_id = e.id join fin_accounts ac on ac.id = l.account_id
        left join fin_cost_centers cc on cc.id = l.cost_center_id where e.doc_id = d.id and e.reversal_of is null), '[]'::jsonb),
    'entry_status', (select e.status from fin_journal_entries e where e.doc_id = d.id and e.reversal_of is null))
$$;

create or replace function public._fin_set_lines(p_entry uuid, p_lines jsonb, p_user text) returns void
language plpgsql security definer set search_path=public as $$
declare ln jsonb; i int := 0; acc uuid; acc_active boolean; cc uuid; dr numeric(14,2); cr numeric(14,2); v_code text;
begin
  delete from fin_journal_lines where entry_id = p_entry;
  if p_lines is null then return; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'بنود القيد غير صالحة'; end if;
  if jsonb_array_length(p_lines) > 200 then raise exception 'عدد بنود القيد كبير جدًا'; end if;
  for ln in select * from jsonb_array_elements(p_lines) loop
    i := i + 1;
    v_code := btrim(coalesce(ln->>'account_code',''));
    if v_code = '' then raise exception 'البند %: اختر الحساب', i; end if;
    select id, active into acc, acc_active from fin_accounts where fin_accounts.code = v_code limit 1;
    if acc is null then raise exception 'البند %: الحساب غير موجود (%)', i, v_code; end if;
    if not acc_active then raise exception 'البند %: الحساب غير نشط (%)', i, v_code; end if;
    cc := null;
    if btrim(coalesce(ln->>'cost_center','')) <> '' then
      select id into cc from fin_cost_centers where fin_cost_centers.code = btrim(ln->>'cost_center') and active;
      if cc is null then raise exception 'البند %: مركز التكلفة غير موجود', i; end if;
    end if;
    dr := _fin_amount(nullif(ln->>'debit',''), false);
    cr := _fin_amount(nullif(ln->>'credit',''), false);
    if (dr > 0 and cr > 0) or (dr = 0 and cr = 0) then raise exception 'البند %: أدخل مبلغًا مدينًا أو دائنًا فقط', i; end if;
    insert into fin_journal_lines(entry_id, line_no, account_id, cost_center_id, debit, credit, memo)
    values (p_entry, i, acc, cc, dr, cr, left(nullif(ln->>'memo',''), 300));
  end loop;
end $$;

create or replace function public._fin_entry_check(p_entry uuid) returns void
language plpgsql security definer set search_path=public as $$
declare n int; d numeric; c numeric;
begin
  select count(*), coalesce(sum(debit),0), coalesce(sum(credit),0) into n, d, c from fin_journal_lines where entry_id = p_entry;
  if n < 2 then raise exception 'القيد يحتاج بندين على الأقل (مدين ودائن)'; end if;
  if d <> c then raise exception 'القيد غير متوازن: إجمالي المدين % لا يساوي إجمالي الدائن %', d, c; end if;
  if d <= 0 then raise exception 'إجمالي القيد يجب أن يكون أكبر من صفر'; end if;
end $$;

create or replace function public._fin_box_balance(p_box text, p_upto date) returns numeric
language sql stable security definer set search_path=public as $$
  select coalesce(sum(case direction when 'in' then amount else -amount end), 0)
  from fin_cash_moves where box = p_box and (p_upto is null or move_date <= p_upto) $$;

create or replace function public._fin_sep() returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select value from fin_settings where key = 'separation'), 'on') <> 'off' $$;

-- ============ الإعدادات ============
create or replace function public.fin_settings_get(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _fin_need(p_u, p_p, 'settle');
  return (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from fin_settings)
    || jsonb_build_object('opening_done', exists(select 1 from fin_cash_moves where kind = 'opening' and box = 'main'));
end $$;

create or replace function public.fin_setting_set(p_u text, p_p text, p_key text, p_value text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _fin_need(p_u, p_p, 'settle_admin');
  if p_key <> 'separation' or p_value not in ('on','off') then raise exception 'إعداد غير صالح'; end if;
  insert into fin_settings(key, value) values (p_key, p_value) on conflict (key) do update set value = excluded.value;
  perform _fin_audit(trim(p_u), 'تغيير إعداد التسوية', 'setting', p_key, jsonb_build_object('value', p_value));
  return jsonb_build_object('ok', true);
end $$;

-- ============ دليل الحسابات ومراكز التكلفة ============
create or replace function public.fin_accounts_list(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _fin_need(p_u, p_p, 'settle');
  return jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'code',a.code,'name',a.name,'acc_type',a.acc_type,'parent',(select code from fin_accounts x where x.id = a.parent_id),'active',a.active) order by a.code) from fin_accounts a), '[]'::jsonb),
    'cost_centers', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'name',c.name,'active',c.active) order by c.code) from fin_cost_centers c), '[]'::jsonb));
end $$;

create or replace function public.fin_account_save(p_u text, p_p text, p_code text, p_name text, p_type text, p_parent_code text default null, p_active boolean default true) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare v_code text := btrim(coalesce(p_code,'')); par uuid; ex fin_accounts;
begin
  perform _fin_need(p_u, p_p, 'settle_admin');
  if v_code = '' or btrim(coalesce(p_name,'')) = '' then raise exception 'رمز الحساب واسمه مطلوبان'; end if;
  if p_type not in ('asset','liability','equity','revenue','expense') then raise exception 'نوع الحساب غير صالح'; end if;
  if btrim(coalesce(p_parent_code,'')) <> '' then
    select id into par from fin_accounts where code = btrim(p_parent_code);
    if par is null then raise exception 'الحساب الأب غير موجود'; end if;
  end if;
  select * into ex from fin_accounts where code = v_code;
  if found then
    if ex.acc_type <> p_type and exists(select 1 from fin_journal_lines where account_id = ex.id) then
      raise exception 'لا يمكن تغيير نوع حساب عليه حركة';
    end if;
    if par = ex.id then raise exception 'لا يمكن أن يكون الحساب أبًا لنفسه'; end if;
    update fin_accounts set name = btrim(p_name), acc_type = p_type, parent_id = par, active = coalesce(p_active, true) where id = ex.id;
  else
    insert into fin_accounts(code, name, acc_type, parent_id, active, created_by) values (v_code, btrim(p_name), p_type, par, coalesce(p_active, true), trim(p_u));
  end if;
  perform _fin_audit(trim(p_u), case when found then 'تعديل حساب' else 'إضافة حساب' end, 'account', v_code, jsonb_build_object('name', p_name, 'type', p_type, 'active', p_active));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.fin_cc_save(p_u text, p_p text, p_code text, p_name text, p_active boolean default true) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare v_code text := btrim(coalesce(p_code,''));
begin
  perform _fin_need(p_u, p_p, 'settle_admin');
  if v_code = '' or btrim(coalesce(p_name,'')) = '' then raise exception 'رمز مركز التكلفة واسمه مطلوبان'; end if;
  insert into fin_cost_centers(code, name, active, created_by) values (v_code, btrim(p_name), coalesce(p_active, true), trim(p_u))
  on conflict (code) do update set name = excluded.name, active = excluded.active;
  perform _fin_audit(trim(p_u), 'حفظ مركز تكلفة', 'cost_center', v_code, jsonb_build_object('name', p_name, 'active', p_active));
  return jsonb_build_object('ok', true);
end $$;

-- ============ الرصيد الافتتاحي والخزينة ============
create or replace function public.fin_cash_opening(p_u text, p_p text, p_date date, p_amount numeric) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _fin_need(p_u, p_p, 'settle_admin');
  if p_amount is null or p_amount < 0 then raise exception 'الرصيد الافتتاحي غير صالح'; end if;
  if exists(select 1 from fin_cash_moves where kind = 'opening' and box = 'main') then raise exception 'الرصيد الافتتاحي مُدخل من قبل ولا يُكرَّر. صحّح بقيد موثّق.'; end if;
  if exists(select 1 from fin_cash_moves where box = 'main') then raise exception 'توجد حركات على الخزينة قبل الرصيد الافتتاحي'; end if;
  insert into fin_cash_moves(box, move_date, kind, direction, amount, note, created_by)
  values ('main', coalesce(p_date, current_date), 'opening', 'in', p_amount, 'رصيد أول المدة', trim(p_u));
  perform _fin_audit(trim(p_u), 'رصيد افتتاحي للخزينة', 'cash', 'main', jsonb_build_object('amount', p_amount, 'date', coalesce(p_date, current_date)));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.fin_cash_day(p_u text, p_p text, p_date date) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare v_date date := coalesce(p_date, current_date); v_open numeric; v_in numeric; v_out numeric; mv jsonb;
begin
  perform _fin_need(p_u, p_p, 'settle');
  v_open := _fin_box_balance('main', v_date - 1);
  select coalesce(sum(amount) filter (where direction = 'in'), 0), coalesce(sum(amount) filter (where direction = 'out'), 0)
    into v_in, v_out from fin_cash_moves where box = 'main' and move_date = v_date;
  select coalesce(jsonb_agg(jsonb_build_object('doc_no', doc_no, 'kind', kind, 'direction', direction, 'amount', amount, 'note', note, 'balance_after', bal) order by id), '[]'::jsonb) into mv
  from (select m.*, v_open + sum(case m.direction when 'in' then m.amount else -m.amount end) over (order by m.id) as bal
        from fin_cash_moves m where m.box = 'main' and m.move_date = v_date) x;
  return jsonb_build_object('date', v_date, 'opening', v_open, 'receipts', v_in, 'payments', v_out, 'book_balance', v_open + v_in - v_out, 'moves', mv,
    'opening_done', exists(select 1 from fin_cash_moves where kind = 'opening' and box = 'main'));
end $$;

-- ============ المستندات ============
create or replace function public.fin_doc_save(p_u text, p_p text, p_type text, p_id uuid, p_date date, p_payload jsonb, p_lines jsonb default null, p_client_key text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare r text; d fin_documents; v_user text := trim(p_u); v_yr int; v_seq int; v_amt numeric(14,2) := 0; v_no text; v_pay jsonb; v_entry uuid; adv fin_advances;
        v_recv numeric(14,2); v_spent numeric(14,2); it jsonb; v_date date := coalesce(p_date, current_date);
begin
  r := _fin_need(p_u, p_p, 'settle');
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'بيانات المستند غير صالحة'; end if;
  if pg_column_size(p_payload) > 200000 then raise exception 'حجم بيانات المستند كبير جدًا'; end if;
  v_pay := p_payload;

  if p_id is null then
    if p_type not in ('cash_out','advance_req','advance_settle','journal','cash_report') then raise exception 'نوع مستند غير معروف'; end if;
    if p_client_key is not null then
      select * into d from fin_documents where client_key = p_client_key;
      if found then return _fin_doc_json(d); end if;
    end if;
  else
    select * into d from fin_documents where id = p_id for update;
    if not found then raise exception 'المستند غير موجود'; end if;
    if d.status <> 'draft' then raise exception 'لا يمكن تعديل مستند خرج من حالة المسودة'; end if;
    if d.created_by <> v_user and r <> 'مدير النظام' then raise exception 'يمكن لمنشئ المستند فقط تعديله'; end if;
    p_type := d.doc_type;
  end if;

  if p_type in ('cash_out','advance_req') then
    v_amt := _fin_amount(v_pay->>'amount', true);
    if v_amt <= 0 then raise exception 'المبلغ يجب أن يكون أكبر من صفر'; end if;
  elsif p_type = 'advance_settle' then
    select * into adv from fin_advances where id = nullif(v_pay->>'advance_id','')::uuid;
    if not found then raise exception 'اختر السلفة المراد تسويتها'; end if;
    if adv.status <> 'open' then raise exception 'السلفة مسواة من قبل'; end if;
    if adv.cash_doc_id is null then raise exception 'لم يُصرف مبلغ هذه السلفة بإذن صرف نقدية مرحّل بعد'; end if;
    if exists(select 1 from fin_documents x where x.doc_type = 'advance_settle' and x.payload->>'advance_id' = adv.id::text
              and x.status in ('draft','review','reviewed','approved') and (p_id is null or x.id <> p_id)) then
      raise exception 'يوجد كشف تسوية آخر قيد الإجراء لنفس السلفة';
    end if;
    v_recv := adv.amount; v_spent := 0;
    if jsonb_typeof(coalesce(v_pay->'expenses','[]'::jsonb)) <> 'array' then raise exception 'بنود المصروفات غير صالحة'; end if;
    for it in select * from jsonb_array_elements(coalesce(v_pay->'expenses','[]'::jsonb)) loop
      if coalesce((it->>'accepted')::boolean, true) then v_spent := v_spent + _fin_amount(it->>'amount', true); end if;
    end loop;
    if v_spent > v_recv then raise exception 'المصروفات المقبولة (%) تتجاوز مبلغ السلفة (%)', v_spent, v_recv; end if;
    v_pay := v_pay || jsonb_build_object('advance_no', adv.advance_no, 'requester', adv.requester, 'received', v_recv, 'spent', v_spent, 'remaining', v_recv - v_spent, 'returned', v_recv - v_spent);
    v_amt := v_spent;
  elsif p_type = 'cash_report' then
    v_amt := _fin_amount(v_pay->>'actual_balance', false);
  end if;

  if p_type = 'cash_out' and btrim(coalesce(v_pay->>'advance_id','')) <> '' then
    select * into adv from fin_advances where id = (v_pay->>'advance_id')::uuid;
    if not found then raise exception 'السلفة المرتبطة غير موجودة'; end if;
    if adv.status <> 'open' or adv.cash_doc_id is not null then raise exception 'تم صرف هذه السلفة من قبل أو أُغلقت'; end if;
    if adv.amount <> v_amt then raise exception 'مبلغ إذن الصرف (%) يجب أن يساوي مبلغ السلفة (%)', v_amt, adv.amount; end if;
  end if;

  if p_id is null then
    v_yr := extract(year from v_date)::int;
    v_seq := _fin_next(p_type, v_yr);
    v_no := _fin_prefix(p_type) || '-' || v_yr || '-' || lpad(v_seq::text, 4, '0');
    insert into fin_documents(doc_type, doc_no, yr, seq, doc_date, amount, payload, client_key, created_by)
    values (p_type, v_no, v_yr, v_seq, v_date, v_amt, v_pay, p_client_key, v_user) returning * into d;
    if p_type = 'journal' then
      insert into fin_journal_entries(entry_no, doc_id, entry_date, description, created_by)
      values (v_no, d.id, v_date, left(v_pay->>'explanation', 500), v_user) returning id into v_entry;
    end if;
    perform _fin_audit(v_user, 'إنشاء مسودة ' || _fin_prefix(p_type), 'document', d.id::text, jsonb_build_object('doc_no', v_no, 'amount', v_amt));
  else
    update fin_documents set doc_date = v_date, amount = v_amt, payload = v_pay, updated_at = now() where id = d.id returning * into d;
    perform _fin_audit(v_user, 'تعديل مسودة ' || _fin_prefix(p_type), 'document', d.id::text, jsonb_build_object('doc_no', d.doc_no, 'amount', v_amt));
  end if;

  if p_type = 'journal' then
    select id into v_entry from fin_journal_entries where doc_id = d.id and reversal_of is null;
    update fin_journal_entries set entry_date = v_date, description = left(v_pay->>'explanation', 500) where id = v_entry;
    perform _fin_set_lines(v_entry, p_lines, v_user);
  end if;
  select * into d from fin_documents where id = d.id;
  return _fin_doc_json(d);
end $$;

create or replace function public.fin_doc_submit(p_u text, p_p text, p_id uuid) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare r text; d fin_documents; v_user text := trim(p_u); v_entry uuid; v_pay jsonb;
begin
  r := _fin_need(p_u, p_p, 'settle');
  select * into d from fin_documents where id = p_id for update;
  if not found then raise exception 'المستند غير موجود'; end if;
  if d.status <> 'draft' then raise exception 'المستند ليس مسودة'; end if;
  if d.created_by <> v_user and r <> 'مدير النظام' then raise exception 'يمكن لمنشئ المستند فقط إرساله للمراجعة'; end if;
  v_pay := d.payload;
  if d.doc_type = 'cash_out' then
    if btrim(coalesce(v_pay->>'beneficiary','')) = '' then raise exception 'اسم المستفيد مطلوب'; end if;
    if btrim(coalesce(v_pay->>'reason','')) = '' then raise exception 'سبب الصرف مطلوب'; end if;
  elsif d.doc_type = 'advance_req' then
    if btrim(coalesce(v_pay->>'requester','')) = '' then raise exception 'اسم طالب السلفة مطلوب'; end if;
    if btrim(coalesce(v_pay->>'purpose','')) = '' then raise exception 'الغرض من السلفة مطلوب'; end if;
    if btrim(coalesce(v_pay->>'settle_due','')) = '' then raise exception 'موعد التسوية مطلوب'; end if;
    if coalesce(v_pay->>'pledge','') <> 'true' then raise exception 'يجب الإقرار والتعهد برد المتبقي'; end if;
  elsif d.doc_type = 'journal' then
    select id into v_entry from fin_journal_entries where doc_id = d.id and reversal_of is null;
    perform _fin_entry_check(v_entry);
    if btrim(coalesce(v_pay->>'explanation','')) = '' then raise exception 'شرح العملية مطلوب'; end if;
  elsif d.doc_type = 'advance_settle' then
    if jsonb_array_length(coalesce(v_pay->'expenses','[]'::jsonb)) = 0 and (v_pay->>'returned')::numeric <> (v_pay->>'received')::numeric then
      raise exception 'أدخل المصروفات الفعلية أو ردّ كامل المبلغ';
    end if;
  end if;
  update fin_documents set status = 'review', updated_at = now() where id = d.id returning * into d;
  perform _fin_audit(v_user, 'إرسال للمراجعة', 'document', d.id::text, jsonb_build_object('doc_no', d.doc_no));
  return _fin_doc_json(d);
end $$;

create or replace function public.fin_doc_decide(p_u text, p_p text, p_id uuid, p_step text, p_decision text, p_note text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare d fin_documents; v_user text := trim(p_u);
begin
  if p_step not in ('review','approve') or p_decision not in ('approved','rejected') then raise exception 'قرار غير صالح'; end if;
  perform _fin_need(p_u, p_p, case p_step when 'review' then 'settle_review' else 'settle_approve' end);
  select * into d from fin_documents where id = p_id for update;
  if not found then raise exception 'المستند غير موجود'; end if;
  if p_step = 'review' and d.status <> 'review' then raise exception 'المستند ليس في مرحلة المراجعة'; end if;
  if p_step = 'approve' and d.status <> 'reviewed' then raise exception 'المستند لم تتم مراجعته بعد'; end if;
  if _fin_sep() and d.created_by = v_user then raise exception 'لا يجوز أن تراجع أو تعتمد مستندًا أنشأته بنفسك (الفصل بين التنفيذ والاعتماد)'; end if;
  if p_decision = 'rejected' and btrim(coalesce(p_note,'')) = '' then raise exception 'اكتب سبب الرفض'; end if;
  insert into fin_approvals(doc_id, step, decision, username, note) values (d.id, p_step, p_decision, v_user, left(p_note, 500));
  if p_decision = 'rejected' then
    update fin_documents set status = 'draft', updated_at = now() where id = d.id returning * into d;
  elsif p_step = 'review' then
    update fin_documents set status = 'reviewed', reviewed_by = v_user, reviewed_at = now(), updated_at = now() where id = d.id returning * into d;
  else
    update fin_documents set status = 'approved', approved_by = v_user, approved_at = now(), updated_at = now() where id = d.id returning * into d;
  end if;
  perform _fin_audit(v_user, (case p_step when 'review' then 'مراجعة' else 'اعتماد' end) || (case p_decision when 'approved' then '' else ' (رفض)' end), 'document', d.id::text, jsonb_build_object('doc_no', d.doc_no, 'note', p_note));
  return _fin_doc_json(d);
end $$;

create or replace function public.fin_doc_post(p_u text, p_p text, p_id uuid) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare d fin_documents; v_user text := trim(p_u); v_entry uuid; adv fin_advances; snap jsonb; v_bal numeric; v_actual numeric; v_date date;
begin
  perform _fin_need(p_u, p_p, 'settle_post');
  select * into d from fin_documents where id = p_id for update;
  if not found then raise exception 'المستند غير موجود'; end if;
  if d.status <> 'approved' then raise exception 'لا يُرحَّل إلا مستند معتمد'; end if;

  if d.doc_type = 'cash_out' then
    if _fin_box_balance('main', null) < d.amount then
      raise exception 'رصيد الخزينة (%) لا يكفي لصرف %. أدخل الرصيد الافتتاحي أو أضف مقبوضات أولًا.', _fin_box_balance('main', null), d.amount;
    end if;
    insert into fin_cash_moves(box, move_date, kind, direction, amount, doc_id, doc_no, note, created_by)
    values ('main', d.doc_date, 'payment', 'out', d.amount, d.id, d.doc_no, left(d.payload->>'beneficiary', 200), v_user);
    if btrim(coalesce(d.payload->>'advance_id','')) <> '' then
      select * into adv from fin_advances where id = (d.payload->>'advance_id')::uuid for update;
      if adv.status <> 'open' or adv.cash_doc_id is not null then raise exception 'تم صرف هذه السلفة من قبل أو أُغلقت'; end if;
      update fin_advances set cash_doc_id = d.id where id = adv.id;
    end if;
  elsif d.doc_type = 'advance_req' then
    insert into fin_advances(advance_no, requester, job, amount, purpose, due_date, req_doc_id, created_by)
    values (d.doc_no, d.payload->>'requester', d.payload->>'job', d.amount, d.payload->>'purpose', nullif(d.payload->>'settle_due','')::date, d.id, v_user);
  elsif d.doc_type = 'advance_settle' then
    select * into adv from fin_advances where id = (d.payload->>'advance_id')::uuid for update;
    if adv.status <> 'open' then raise exception 'السلفة مسواة من قبل'; end if;
    update fin_advances set status = 'settled', settled_doc_id = d.id, settled_at = now() where id = adv.id;
    if (d.payload->>'returned')::numeric > 0 then
      insert into fin_cash_moves(box, move_date, kind, direction, amount, doc_id, doc_no, note, created_by)
      values ('main', d.doc_date, 'advance_return', 'in', (d.payload->>'returned')::numeric, d.id, d.doc_no, 'مبلغ مرتد من تسوية ' || adv.advance_no, v_user);
    end if;
  elsif d.doc_type = 'journal' then
    select id into v_entry from fin_journal_entries where doc_id = d.id and reversal_of is null for update;
    perform _fin_entry_check(v_entry);
    update fin_journal_entries set status = 'posted', posted_by = v_user, posted_at = now() where id = v_entry;
  elsif d.doc_type = 'cash_report' then
    v_date := coalesce(nullif(d.payload->>'date','')::date, d.doc_date);
    v_bal := _fin_box_balance('main', v_date);
    v_actual := coalesce(nullif(d.payload->>'actual_balance','')::numeric, 0);
    snap := jsonb_build_object('date', v_date, 'opening', _fin_box_balance('main', v_date - 1),
      'receipts', (select coalesce(sum(amount),0) from fin_cash_moves where box='main' and move_date=v_date and direction='in'),
      'payments', (select coalesce(sum(amount),0) from fin_cash_moves where box='main' and move_date=v_date and direction='out'),
      'book_balance', v_bal, 'actual_balance', v_actual, 'difference', v_actual - v_bal);
    update fin_documents set payload = payload || jsonb_build_object('snapshot', snap) where id = d.id;
  end if;
  update fin_documents set status = 'posted', posted_by = v_user, posted_at = now(), updated_at = now() where id = d.id returning * into d;
  perform _fin_audit(v_user, 'ترحيل مستند', 'document', d.id::text, jsonb_build_object('doc_no', d.doc_no, 'amount', d.amount));
  return _fin_doc_json(d);
end $$;

create or replace function public.fin_doc_cancel(p_u text, p_p text, p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare r text; d fin_documents; v_user text := trim(p_u);
begin
  r := _fin_need(p_u, p_p, 'settle');
  if btrim(coalesce(p_reason,'')) = '' then raise exception 'اكتب سبب الإلغاء'; end if;
  select * into d from fin_documents where id = p_id for update;
  if not found then raise exception 'المستند غير موجود'; end if;
  if d.status = 'posted' then raise exception 'المستند مرحّل. استخدم القيد العكسي بدل الإلغاء.'; end if;
  if d.status = 'cancelled' then raise exception 'المستند ملغى من قبل'; end if;
  if d.created_by <> v_user and r <> 'مدير النظام' then
    perform _fin_need(p_u, p_p, 'settle_approve');
  end if;
  update fin_documents set status = 'cancelled', cancelled_by = v_user, cancelled_at = now(), cancel_reason = left(p_reason, 300), updated_at = now() where id = d.id returning * into d;
  perform _fin_audit(v_user, 'إلغاء مستند', 'document', d.id::text, jsonb_build_object('doc_no', d.doc_no, 'reason', p_reason));
  return _fin_doc_json(d);
end $$;

-- قيد عكسي لمستند مرحّل (قيد يومية أو إذن صرف نقدية)
create or replace function public.fin_doc_reverse(p_u text, p_p text, p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare d fin_documents; v_user text := trim(p_u); e fin_journal_entries; v_new uuid; v_yr int; v_seq int; v_no text;
begin
  perform _fin_need(p_u, p_p, 'settle_post');
  if btrim(coalesce(p_reason,'')) = '' then raise exception 'اكتب سبب القيد العكسي'; end if;
  select * into d from fin_documents where id = p_id for update;
  if not found then raise exception 'المستند غير موجود'; end if;
  if d.status <> 'posted' or d.reversed_at is not null then raise exception 'يُعكَس المستند المرحّل مرة واحدة فقط'; end if;
  if d.doc_type = 'journal' then
    select * into e from fin_journal_entries where doc_id = d.id and reversal_of is null for update;
    v_yr := extract(year from current_date)::int;
    v_seq := _fin_next('journal_reversal', v_yr);
    v_no := 'عكس-' || v_yr || '-' || lpad(v_seq::text, 4, '0');
    perform set_config('fin.allow_reverse', '1', true);
    insert into fin_journal_entries(entry_no, doc_id, entry_date, status, description, reversal_of, reversal_reason, posted_by, posted_at, created_by)
    values (v_no, null, current_date, 'posted', 'قيد عكسي للقيد ' || e.entry_no, e.id, left(p_reason, 300), v_user, now(), v_user) returning id into v_new;
    insert into fin_journal_lines(entry_id, line_no, account_id, cost_center_id, debit, credit, memo)
    select v_new, line_no, account_id, cost_center_id, credit, debit, 'عكس: ' || coalesce(memo, '') from fin_journal_lines where entry_id = e.id;
    update fin_journal_entries set status = 'reversed' where id = e.id;
    perform set_config('fin.allow_reverse', '0', true);
  elsif d.doc_type = 'cash_out' then
    if btrim(coalesce(d.payload->>'advance_id','')) <> '' then raise exception 'إذن صرف مرتبط بسلفة. أغلق السلفة بالتسوية بدل العكس.'; end if;
    insert into fin_cash_moves(box, move_date, kind, direction, amount, doc_id, doc_no, note, created_by)
    values ('main', current_date, 'reversal', 'in', d.amount, d.id, d.doc_no, 'عكس إذن الصرف: ' || left(p_reason, 150), v_user);
  else
    raise exception 'هذا النوع من المستندات لا يُعكَس';
  end if;
  update fin_documents set reversed_by = v_user, reversed_at = now(), reversal_reason = left(p_reason, 300), updated_at = now() where id = d.id returning * into d;
  perform _fin_audit(v_user, 'قيد عكسي', 'document', d.id::text, jsonb_build_object('doc_no', d.doc_no, 'reason', p_reason));
  return _fin_doc_json(d);
end $$;

create or replace function public.fin_doc_list(p_u text, p_p text, p_type text default null, p_status text default null, p_q text default null, p_limit int default 200) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare v_q text := nullif(btrim(coalesce(p_q,'')), '');
begin
  perform _fin_need(p_u, p_p, 'settle');
  return coalesce((select jsonb_agg(_fin_doc_json(x) order by x.created_at desc) from (
    select * from fin_documents
    where (p_type is null or doc_type = p_type) and (p_status is null or status = p_status)
      and (v_q is null or doc_no ilike '%' || v_q || '%' or payload::text ilike '%' || v_q || '%')
    order by created_at desc limit least(greatest(coalesce(p_limit,200),1),500)) x), '[]'::jsonb);
end $$;

create or replace function public.fin_doc_get(p_u text, p_p text, p_id uuid) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare d fin_documents;
begin
  perform _fin_need(p_u, p_p, 'settle');
  select * into d from fin_documents where id = p_id;
  if not found then raise exception 'المستند غير موجود'; end if;
  return _fin_doc_json(d);
end $$;

create or replace function public.fin_advances_list(p_u text, p_p text, p_status text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _fin_need(p_u, p_p, 'settle');
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'advance_no',a.advance_no,'requester',a.requester,'job',a.job,'amount',a.amount,'purpose',a.purpose,'due_date',a.due_date,
      'status',a.status,'disbursed',a.cash_doc_id is not null,'overdue',(a.status='open' and a.due_date is not null and a.due_date < current_date),'settled_at',a.settled_at) order by a.created_at desc)
    from fin_advances a where p_status is null or a.status = p_status), '[]'::jsonb);
end $$;

create or replace function public.fin_audit_list(p_u text, p_p text, p_limit int default 200) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _fin_need(p_u, p_p, 'settle_admin');
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc) from (select * from fin_audit order by id desc limit least(greatest(coalesce(p_limit,200),1),1000)) x), '[]'::jsonb);
end $$;

-- ============ الصلاحيات على الدوال ============
revoke all on function public._fin_need(text,text,text), public._fin_audit(text,text,text,text,jsonb), public._fin_next(text,int),
  public._fin_doc_json(public.fin_documents), public._fin_set_lines(uuid,jsonb,text), public._fin_entry_check(uuid),
  public._fin_box_balance(text,date), public._fin_sep() from public, anon, authenticated;
grant execute on function
  public.fin_settings_get(text,text), public.fin_setting_set(text,text,text,text),
  public.fin_accounts_list(text,text), public.fin_account_save(text,text,text,text,text,text,boolean), public.fin_cc_save(text,text,text,text,boolean),
  public.fin_cash_opening(text,text,date,numeric), public.fin_cash_day(text,text,date),
  public.fin_doc_save(text,text,text,uuid,date,jsonb,jsonb,text), public.fin_doc_submit(text,text,uuid),
  public.fin_doc_decide(text,text,uuid,text,text,text), public.fin_doc_post(text,text,uuid), public.fin_doc_cancel(text,text,uuid,text),
  public.fin_doc_reverse(text,text,uuid,text), public.fin_doc_list(text,text,text,text,text,int), public.fin_doc_get(text,text,uuid),
  public.fin_advances_list(text,text,text), public.fin_audit_list(text,text,int)
  to anon, authenticated;


-- ============ دفتر الأستاذ وميزان المراجعة (قراءة فقط من القيود المرحّلة) ============
create or replace function public.fin_trial_balance(p_u text, p_p text, p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path=public, extensions as $$
begin
  perform _fin_need(p_u,p_p,'settle');
  return coalesce((select jsonb_agg(x order by x->>'code') from (
    select jsonb_build_object('code',a.code,'name',a.name,'type',a.acc_type,
      'debit',coalesce(sum(l.debit),0),'credit',coalesce(sum(l.credit),0),
      'balance',coalesce(sum(l.debit),0)-coalesce(sum(l.credit),0)) x
    from fin_accounts a
    join fin_journal_lines l on l.account_id=a.id
    join fin_journal_entries e on e.id=l.entry_id and e.status in ('posted','reversed')
    where (p_from is null or e.entry_date>=p_from) and (p_to is null or e.entry_date<=p_to)
    group by a.id) t), '[]'::jsonb);
end $$;

create or replace function public.fin_ledger(p_u text, p_p text, p_code text, p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path=public, extensions as $$
declare acc uuid;
begin
  perform _fin_need(p_u,p_p,'settle');
  select id into acc from fin_accounts where fin_accounts.code = btrim(p_code);
  if acc is null then raise exception 'الحساب غير موجود'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('entry_no',e.entry_no,'date',e.entry_date,'memo',coalesce(l.memo,e.description),'debit',l.debit,'credit',l.credit,'status',e.status) order by e.entry_date,e.entry_no,l.line_no)
    from fin_journal_lines l join fin_journal_entries e on e.id=l.entry_id and e.status in ('posted','reversed')
    where l.account_id=acc and (p_from is null or e.entry_date>=p_from) and (p_to is null or e.entry_date<=p_to)), '[]'::jsonb);
end $$;
grant execute on function public.fin_trial_balance(text,text,date,date), public.fin_ledger(text,text,text,date,date) to anon, authenticated;
