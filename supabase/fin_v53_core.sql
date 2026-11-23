-- جمعية الخير للجميع | الإصدار 53 | القوائم المالية، الموردون والمشتريات، ملف المشروع، ملف الأسرة الموحّد، ربط المخزن بالمشروع والأسرة
-- إضافات فقط. يتطلب fin_v51_core.sql ثم fin_v52_ops.sql. إعادة التشغيل آمنة. خذ نسخة احتياطية قبل التشغيل.
-- الوحيد الذي يُستبدل: الدالة fin_stock_move (تُضاف لها معاملات اختيارية p_project, p_case فقط؛ نفس السلوك السابق عند عدم استخدامها).
--
-- صلاحيات جديدة: fin_report (القوائم المالية) | fin_purchase (موردون ومشتريات) | fin_purchase_approve (اعتماد أوامر الشراء)
--                fin_project (المشروعات) | fin_family (ملف الأسرة الموحّد: الحالة والملاحظات والارتباطات)
-- الأدوار القديمة بلا صلاحيات مخصصة: محاسب ← fin_report, fin_purchase, fin_project | باحث اجتماعي ← fin_family

create or replace function public._fin_can(p_u text, p_role text, p_perm text) returns boolean
language plpgsql security definer set search_path=public, extensions as $$
declare pm jsonb;
begin
  if p_role is null then return false; end if;
  if p_role = 'مدير النظام' then return true; end if;
  select permissions into pm from staff_users where username = trim(p_u);
  if pm is null then
    if p_role = 'محاسب' and p_perm in ('settle','settle_review','settle_post','settle_admin','fin_bank','fin_report','fin_purchase','fin_project') then return true; end if;
    if p_role = 'مسؤول مخازن' and p_perm in ('fin_stock','fin_stock_admin') then return true; end if;
    if p_role = 'باحث اجتماعي' and p_perm in ('fin_archive','fin_family') then return true; end if;
    return false;
  end if;
  return pm ? p_perm;
end $$;
revoke all on function public._fin_can(text,text,text) from public, anon, authenticated;

-- ============ المشروعات ============
create table if not exists public.fin_projects(
  id uuid primary key default gen_random_uuid(), code text unique not null, name text not null, ptype text, objective text, target_group text,
  start_date date, end_date date, budget numeric(14,2) not null default 0 check (budget >= 0), funding_source text, manager text,
  status text not null default 'active' check (status in ('active','closed','archived')), activities jsonb not null default '[]', notes text,
  client_key text unique, created_by text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  status_by text, status_at timestamptz, status_reason text);
create table if not exists public.fin_project_members(
  id bigserial primary key, project_id uuid not null references public.fin_projects(id), case_ref text not null, note text,
  added_by text not null, added_at timestamptz not null default now(), ended_at timestamptz, ended_by text, unique (project_id, case_ref));
alter table public.fin_projects enable row level security; alter table public.fin_project_members enable row level security;
revoke all on public.fin_projects, public.fin_project_members from public, anon, authenticated;
create or replace function public._fin_project_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'لا يجوز حذف المشروع. استخدم الإغلاق أو الأرشفة بسبب.'; end if;
  new.updated_at := now(); return new;
end $$;
drop trigger if exists fin_projects_guard on public.fin_projects;
create trigger fin_projects_guard before update or delete on public.fin_projects for each row execute function public._fin_project_guard();

-- أعمدة جديدة على حركات المخزن (إضافة فقط): المشروع والأسرة
alter table public.fin_stock_moves add column if not exists project_code text;
alter table public.fin_stock_moves add column if not exists case_ref text;
create index if not exists fin_stock_moves_proj on public.fin_stock_moves(project_code) where project_code is not null;
create index if not exists fin_stock_moves_case on public.fin_stock_moves(case_ref) where case_ref is not null;
alter table public.fin_accounts add column if not exists is_cash boolean not null default false;


-- ===== fin_stock_move: إضافة معاملين اختياريين (المشروع/الأسرة) =====
alter table public.fin_stock_moves add column if not exists project_code text;
drop function if exists public.fin_stock_move(text,text,text,date,text,text,numeric,numeric,text,text,text,text,date,text,text);
-- p_kind: receipt | issue | transfer (إلى p_to_wh)
create or replace function public.fin_stock_move(p_u text, p_p text, p_kind text, p_date date, p_wh text, p_item text, p_qty numeric, p_cost numeric default 0,
  p_to_wh text default null, p_source text default null, p_ref text default null, p_batch text default null, p_expiry date default null, p_note text default null, p_client_key text default null, p_project text default null, p_case text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare w fin_warehouses; w2 fin_warehouses; it fin_items; v_date date := coalesce(p_date,current_date); v_yr int; v_no text; v_tid uuid; v_user text := trim(p_u); bal numeric; m fin_stock_moves;
begin
  perform _fin_need(p_u,p_p,'fin_stock');
  if p_kind not in ('receipt','issue','transfer') then raise exception 'نوع حركة غير معروف'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'الكمية يجب أن تكون أكبر من صفر'; end if;
  if coalesce(p_cost,0) < 0 then raise exception 'التكلفة لا تكون سالبة'; end if;
  if v_date > current_date then raise exception 'لا يجوز التاريخ المستقبلي'; end if;
  if p_client_key is not null then
    select * into m from fin_stock_moves where client_key = p_client_key and kind in ('receipt','issue','transfer_out') limit 1;
    if found then return jsonb_build_object('move_no', m.move_no, 'duplicate', true); end if;
  end if;
  select * into w from fin_warehouses where code = btrim(p_wh) and active; if not found then raise exception 'المخزن غير موجود أو غير فعّال'; end if;
  select * into it from fin_items where code = btrim(p_item) and active; if not found then raise exception 'الصنف غير موجود أو غير فعّال'; end if;
  v_yr := extract(year from v_date)::int; v_no := 'خ-' || v_yr || '-' || lpad(_fin_next('stock', v_yr)::text, 5, '0');
  if p_kind = 'receipt' then
    insert into fin_stock_moves(move_no,move_date,kind,warehouse_id,item_id,qty,unit_cost,source,ref,batch_no,expiry,note,client_key,created_by,project_code,case_ref)
    values (v_no,v_date,'receipt',w.id,it.id,p_qty,coalesce(p_cost,0),p_source,p_ref,p_batch,p_expiry,p_note,p_client_key,v_user,nullif(btrim(p_project),''),nullif(btrim(p_case),''));
  else
    perform pg_advisory_xact_lock(hashtext(w.id::text || it.id::text));
    bal := _fin_stock_bal(w.id, it.id);
    if p_qty > bal then raise exception 'الكمية المطلوبة (%) أكبر من الرصيد المتاح (%) للصنف % في المخزن %', p_qty, bal, it.name, w.name; end if;
    if p_kind = 'issue' then
      insert into fin_stock_moves(move_no,move_date,kind,warehouse_id,item_id,qty,unit_cost,source,ref,note,client_key,created_by,project_code,case_ref)
      values (v_no,v_date,'issue',w.id,it.id,p_qty,0,p_source,p_ref,p_note,p_client_key,v_user,nullif(btrim(p_project),''),nullif(btrim(p_case),''));
    else
      select * into w2 from fin_warehouses where code = btrim(coalesce(p_to_wh,'')) and active; if not found then raise exception 'مخزن الوجهة غير موجود'; end if;
      if w2.id = w.id then raise exception 'لا يمكن التحويل لنفس المخزن'; end if;
      v_tid := gen_random_uuid();
      insert into fin_stock_moves(move_no,move_date,kind,warehouse_id,item_id,qty,unit_cost,ref,note,transfer_id,client_key,created_by)
      values (v_no,v_date,'transfer_out',w.id,it.id,p_qty,0,p_ref,p_note,v_tid,p_client_key,v_user);
      insert into fin_stock_moves(move_no,move_date,kind,warehouse_id,item_id,qty,unit_cost,ref,note,transfer_id,client_key,created_by)
      values (v_no,v_date,'transfer_in',w2.id,it.id,p_qty,coalesce((select avg(unit_cost) filter (where unit_cost>0) from fin_stock_moves where warehouse_id=w.id and item_id=it.id and kind in ('receipt','transfer_in')),0),p_ref,p_note,v_tid,p_client_key,v_user);
    end if;
  end if;
  perform _fin_audit(v_user,'حركة مخزنية','stock',v_no,jsonb_build_object('kind',p_kind,'item',it.code,'wh',w.code,'qty',p_qty));
  return jsonb_build_object('move_no', v_no, 'balance', _fin_stock_bal(w.id,it.id));
end $$;



-- ============ القوائم المالية (من القيود المرحّلة فقط) ============
create or replace function public.fin_account_cash(p_u text, p_p text, p_code text, p_is_cash boolean) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _fin_need(p_u,p_p,'settle_admin');
  update fin_accounts set is_cash = coalesce(p_is_cash,false) where code = btrim(p_code) and acc_type = 'asset';
  if not found then raise exception 'حساب الأصول غير موجود'; end if;
  perform _fin_audit(trim(p_u),'تحديد حساب نقدية','account',btrim(p_code),jsonb_build_object('is_cash',p_is_cash));
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.fin_cash_accounts_list(p_u text, p_p text) returns jsonb
language plpgsql stable security definer set search_path=public, extensions as $$
begin
  perform _fin_need(p_u,p_p,'fin_report');
  return coalesce((select jsonb_agg(jsonb_build_object('code',code,'name',name,'is_cash',is_cash) order by code) from fin_accounts where acc_type='asset' and active),'[]'::jsonb);
end $$;

create or replace function public.fin_income_statement(p_u text, p_p text, p_from date, p_to date, p_cc text default null) returns jsonb
language plpgsql stable security definer set search_path=public, extensions as $$
declare rev jsonb; exp_ jsonb; tr numeric; te numeric; cc uuid;
begin
  perform _fin_need(p_u,p_p,'fin_report');
  if p_from is null or p_to is null or p_from > p_to then raise exception 'حدّد فترة صحيحة'; end if;
  if p_cc is not null and btrim(p_cc) <> '' then select id into cc from fin_cost_centers where code = btrim(p_cc); if cc is null then raise exception 'مركز التكلفة غير موجود'; end if; end if;
  with x as (
    select a.code, a.name, a.acc_type, sum(l.credit - l.debit) net
    from fin_journal_lines l join fin_journal_entries e on e.id=l.entry_id and e.status in ('posted','reversed')
    join fin_accounts a on a.id=l.account_id
    where a.acc_type in ('revenue','expense') and e.entry_date between p_from and p_to and (cc is null or l.cost_center_id = cc)
    group by a.id)
  select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name,'amount',net) order by code) filter (where acc_type='revenue'),'[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name,'amount',-net) order by code) filter (where acc_type='expense'),'[]'::jsonb),
         coalesce(sum(net) filter (where acc_type='revenue'),0), coalesce(-sum(net) filter (where acc_type='expense'),0)
  into rev, exp_, tr, te from x;
  return jsonb_build_object('from',p_from,'to',p_to,'revenues',rev,'expenses',exp_,'total_revenue',tr,'total_expense',te,'surplus',tr-te);
end $$;

create or replace function public.fin_balance_sheet(p_u text, p_p text, p_asof date) returns jsonb
language plpgsql stable security definer set search_path=public, extensions as $$
declare d date := coalesce(p_asof, current_date); ass jsonb; lia jsonb; eq jsonb; ta numeric; tl numeric; te numeric; sur numeric;
begin
  perform _fin_need(p_u,p_p,'fin_report');
  with x as (
    select a.code, a.name, a.acc_type, sum(l.debit - l.credit) bal
    from fin_journal_lines l join fin_journal_entries e on e.id=l.entry_id and e.status in ('posted','reversed')
    join fin_accounts a on a.id=l.account_id where e.entry_date <= d group by a.id)
  select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name,'amount',bal) order by code) filter (where acc_type='asset'),'[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name,'amount',-bal) order by code) filter (where acc_type='liability'),'[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name,'amount',-bal) order by code) filter (where acc_type='equity'),'[]'::jsonb),
         coalesce(sum(bal) filter (where acc_type='asset'),0), coalesce(-sum(bal) filter (where acc_type='liability'),0), coalesce(-sum(bal) filter (where acc_type='equity'),0),
         coalesce(-sum(bal) filter (where acc_type in ('revenue','expense')),0)
  into ass, lia, eq, ta, tl, te, sur from x;
  return jsonb_build_object('as_of',d,'assets',ass,'liabilities',lia,'equity',eq,'surplus_to_date',sur,
    'total_assets',ta,'total_liabilities',tl,'total_equity',te + sur,'balanced', ta = tl + te + sur);
end $$;

create or replace function public.fin_cash_flow(p_u text, p_p text, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path=public, extensions as $$
declare op numeric; cl numeric; rows_ jsonb; n int; t_open numeric; t_in numeric; t_out numeric;
begin
  perform _fin_need(p_u,p_p,'fin_report');
  if p_from is null or p_to is null or p_from > p_to then raise exception 'حدّد فترة صحيحة'; end if;
  select count(*) into n from fin_accounts where is_cash; if n = 0 then raise exception 'حدّد حسابات النقدية والبنوك أولًا (من الحسابات ← حساب نقدية)'; end if;
  select coalesce(sum(l.debit-l.credit),0) into op from fin_journal_lines l join fin_journal_entries e on e.id=l.entry_id and e.status in ('posted','reversed') join fin_accounts a on a.id=l.account_id and a.is_cash where e.entry_date < p_from;
  select coalesce(sum(l.debit-l.credit),0) into cl from fin_journal_lines l join fin_journal_entries e on e.id=l.entry_id and e.status in ('posted','reversed') join fin_accounts a on a.id=l.account_id and a.is_cash where e.entry_date <= p_to;
  with ent as (
    select e.id, sum(l.debit-l.credit) filter (where a.is_cash) delta,
      bool_or(a.acc_type='revenue') has_rev, bool_or(a.acc_type='expense') has_exp
    from fin_journal_entries e join fin_journal_lines l on l.entry_id=e.id join fin_accounts a on a.id=l.account_id
    where e.status in ('posted','reversed') and e.entry_date between p_from and p_to group by e.id having bool_or(a.is_cash)),
  cls as (select case when has_rev and delta>0 then 'تشغيلية — إيرادات وتبرعات محصّلة' when has_exp and delta<0 then 'تشغيلية — مصروفات مدفوعة'
      when has_rev or has_exp then 'تشغيلية — تسويات إيرادات/مصروفات' else 'أنشطة أخرى (أصول/خصوم/حقوق ملكية)' end cat, delta from ent where delta <> 0)
  select coalesce(jsonb_agg(jsonb_build_object('category',cat,'inflow',inf,'outflow',outf,'net',inf-outf) order by cat),'[]'::jsonb)
  into rows_ from (select cat, coalesce(sum(delta) filter (where delta>0),0) inf, coalesce(-sum(delta) filter (where delta<0),0) outf from cls group by cat) z;
  select coalesce(sum(case when direction='in' then amount else -amount end),0) into t_open from fin_cash_moves where box='main' and move_date < p_from;
  select coalesce(sum(amount) filter (where direction='in' and kind<>'opening'),0), coalesce(sum(amount) filter (where direction='out'),0) into t_in, t_out from fin_cash_moves where box='main' and move_date between p_from and p_to;
  return jsonb_build_object('from',p_from,'to',p_to,'opening',op,'closing',cl,'net_change',cl-op,'rows',rows_,
    'rows_net',(select coalesce(sum((x->>'net')::numeric),0) from jsonb_array_elements(rows_) x),
    'treasury',jsonb_build_object('opening',t_open,'receipts',t_in,'payments',t_out,'closing',t_open + t_in - t_out));
end $$;

-- ============ الموردون والمشتريات ============
create table if not exists public.fin_suppliers(id uuid primary key default gen_random_uuid(), code text unique not null, name text not null, phone text, address text, active boolean not null default true);
create table if not exists public.fin_purchases(
  id uuid primary key default gen_random_uuid(), po_no text unique not null, yr int not null, seq int not null, supplier_id uuid not null references public.fin_suppliers(id),
  po_date date not null, project_code text, lines jsonb not null default '[]', total numeric(14,2) not null default 0, notes text,
  status text not null default 'draft' check (status in ('draft','review','approved','ordered','received','invoiced','payment_requested','cancelled')),
  wh_code text, received_at timestamptz, received_by text,
  invoice_no text, invoice_date date, invoice_amount numeric(14,2), invoice_note text, pay_doc_id uuid references public.fin_documents(id),
  client_key text unique, created_by text not null, created_at timestamptz not null default now(), approved_by text, approved_at timestamptz,
  cancel_reason text, unique (yr, seq));
create unique index if not exists fin_purchases_inv on public.fin_purchases(supplier_id, lower(invoice_no)) where invoice_no is not null and status <> 'cancelled';
alter table public.fin_suppliers enable row level security; alter table public.fin_purchases enable row level security;
revoke all on public.fin_suppliers, public.fin_purchases from public, anon, authenticated;
create or replace function public._fin_purchase_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'لا يجوز حذف أوامر الشراء. استخدم الإلغاء بسبب.'; end if;
  if old.status = 'cancelled' then raise exception 'أمر الشراء ملغى ولا يُعدَّل'; end if;
  return new;
end $$;
drop trigger if exists fin_purchases_guard on public.fin_purchases;
create trigger fin_purchases_guard before update or delete on public.fin_purchases for each row execute function public._fin_purchase_guard();

create or replace function public._fin_po_lines(p_lines jsonb, out o_lines jsonb, out o_total numeric) language plpgsql as $$
declare el jsonb; q numeric; pr numeric; i int := 0;
begin
  o_lines := '[]'::jsonb; o_total := 0;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'أضف بندًا واحدًا على الأقل'; end if;
  for el in select * from jsonb_array_elements(p_lines) loop
    i := i + 1;
    if btrim(coalesce(el->>'desc','')) = '' then raise exception 'البند %: الوصف مطلوب', i; end if;
    if coalesce(el->>'qty','') !~ '^\d+(\.\d{1,3})?$' or (el->>'qty')::numeric <= 0 then raise exception 'البند %: الكمية غير صالحة', i; end if;
    if coalesce(el->>'unit_price','') !~ '^\d+(\.\d{1,2})?$' then raise exception 'البند %: السعر غير صالح', i; end if;
    q := (el->>'qty')::numeric; pr := (el->>'unit_price')::numeric;
    o_lines := o_lines || jsonb_build_object('item_code', nullif(btrim(coalesce(el->>'item_code','')),''), 'desc', btrim(el->>'desc'), 'qty', q, 'unit_price', pr, 'amount', round(q*pr,2));
    o_total := o_total + round(q*pr,2);
  end loop;
end $$;

create or replace function public.fin_supplier_save(p_u text, p_p text, p_code text, p_name text, p_phone text default null, p_address text default null, p_active boolean default true) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare s fin_suppliers;
begin
  perform _fin_need(p_u,p_p,'fin_purchase');
  if btrim(coalesce(p_code,''))='' or btrim(coalesce(p_name,''))='' then raise exception 'كود واسم المورد مطلوبان'; end if;
  insert into fin_suppliers(code,name,phone,address,active) values (btrim(p_code),btrim(p_name),p_phone,p_address,coalesce(p_active,true))
   on conflict (code) do update set name=excluded.name, phone=excluded.phone, address=excluded.address, active=excluded.active returning * into s;
  perform _fin_audit(trim(p_u),'حفظ مورد','supplier',s.code,null);
  return to_jsonb(s);
end $$;

create or replace function public.fin_suppliers_list(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _fin_need(p_u,p_p,'fin_purchase');
  return coalesce((select jsonb_agg(to_jsonb(s) order by s.code) from fin_suppliers s),'[]'::jsonb);
end $$;

create or replace function public.fin_purchase_save(p_u text, p_p text, p_id uuid, p_supplier text, p_date date, p_project text, p_lines jsonb, p_notes text default null, p_client_key text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare s fin_suppliers; pu fin_purchases; l jsonb; t numeric; v_yr int; v_seq int; it text; el jsonb;
begin
  perform _fin_need(p_u,p_p,'fin_purchase');
  select o_lines, o_total into l, t from _fin_po_lines(p_lines);
  select * into s from fin_suppliers where code=btrim(coalesce(p_supplier,'')) and active; if not found then raise exception 'المورد غير موجود أو غير فعّال'; end if;
  if p_project is not null and btrim(p_project) <> '' and not exists (select 1 from fin_projects where code=btrim(p_project) and status='active') then raise exception 'المشروع غير موجود أو غير نشط'; end if;
  for el in select * from jsonb_array_elements(l) loop
    it := el->>'item_code'; if it is not null and not exists (select 1 from fin_items where code=it) then raise exception 'الصنف غير موجود: %', it; end if;
  end loop;
  if p_id is null then
    if p_client_key is not null then select * into pu from fin_purchases where client_key=p_client_key; if found then return to_jsonb(pu); end if; end if;
    v_yr := extract(year from coalesce(p_date,current_date))::int; v_seq := _fin_next('po', v_yr);
    insert into fin_purchases(po_no,yr,seq,supplier_id,po_date,project_code,lines,total,notes,client_key,created_by)
    values ('شراء-'||v_yr||'-'||lpad(v_seq::text,4,'0'),v_yr,v_seq,s.id,coalesce(p_date,current_date),nullif(btrim(coalesce(p_project,'')),''),l,t,p_notes,p_client_key,trim(p_u)) returning * into pu;
    perform _fin_audit(trim(p_u),'إنشاء أمر شراء','purchase',pu.po_no,null);
  else
    select * into pu from fin_purchases where id=p_id for update; if not found then raise exception 'أمر الشراء غير موجود'; end if;
    if pu.status <> 'draft' then raise exception 'لا يُعدَّل إلا أمر الشراء في حالة المسودة'; end if;
    update fin_purchases set supplier_id=s.id, po_date=coalesce(p_date,po_date), project_code=nullif(btrim(coalesce(p_project,'')),''), lines=l, total=t, notes=p_notes where id=pu.id returning * into pu;
    perform _fin_audit(trim(p_u),'تعديل أمر شراء','purchase',pu.po_no,null);
  end if;
  return to_jsonb(pu);
end $$;

create or replace function public._fin_po_step(p_u text, p_p text, p_id uuid, p_from text[], p_to text, p_perm text, p_action text, p_extra boolean default false) returns fin_purchases
language plpgsql security definer set search_path=public, extensions as $$
declare pu fin_purchases;
begin
  perform _fin_need(p_u,p_p,p_perm);
  select * into pu from fin_purchases where id=p_id for update; if not found then raise exception 'أمر الشراء غير موجود'; end if;
  if not (pu.status = any(p_from)) then raise exception 'لا يمكن تنفيذ هذه الخطوة والأمر في حالة: %', pu.status; end if;
  update fin_purchases set status=p_to where id=pu.id returning * into pu;
  perform _fin_audit(trim(p_u),p_action,'purchase',pu.po_no,null);
  return pu;
end $$;
revoke all on function public._fin_po_step(text,text,uuid,text[],text,text,text,boolean) from public, anon, authenticated;

create or replace function public.fin_purchase_submit(p_u text, p_p text, p_id uuid) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin return to_jsonb(_fin_po_step(p_u,p_p,p_id,array['draft'],'review','fin_purchase','إرسال أمر شراء للاعتماد')); end $$;

create or replace function public.fin_purchase_decide(p_u text, p_p text, p_id uuid, p_approve boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare pu fin_purchases;
begin
  perform _fin_need(p_u,p_p,'fin_purchase_approve');
  select * into pu from fin_purchases where id=p_id for update; if not found then raise exception 'أمر الشراء غير موجود'; end if;
  if pu.status <> 'review' then raise exception 'أمر الشراء ليس بانتظار الاعتماد'; end if;
  if pu.created_by = trim(p_u) and _fin_sep() then raise exception 'لا يجوز اعتماد أمر شراء أنشأته بنفسك'; end if;
  if p_approve then update fin_purchases set status='approved', approved_by=trim(p_u), approved_at=now() where id=pu.id returning * into pu;
  else
    if btrim(coalesce(p_note,''))='' then raise exception 'اكتب سبب الرفض'; end if;
    update fin_purchases set status='draft', notes=coalesce(notes,'')||E'\n[رفض الاعتماد من '||trim(p_u)||': '||left(p_note,300)||']' where id=pu.id returning * into pu;
  end if;
  perform _fin_audit(trim(p_u), case when p_approve then 'اعتماد أمر شراء' else 'رفض أمر شراء' end,'purchase',pu.po_no,null);
  return to_jsonb(pu);
end $$;

create or replace function public.fin_purchase_order(p_u text, p_p text, p_id uuid) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin return to_jsonb(_fin_po_step(p_u,p_p,p_id,array['approved'],'ordered','fin_purchase','إصدار أمر توريد')); end $$;

-- الاستلام: يضيف الأصناف المرتبطة بأصناف المخزن إلى المخزن المحدد مرة واحدة (تكلفة = سعر الوحدة)
create or replace function public.fin_purchase_receive(p_u text, p_p text, p_id uuid, p_wh text, p_date date default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare pu fin_purchases; s fin_suppliers; el jsonb; i int := 0; n int := 0;
begin
  perform _fin_need(p_u,p_p,'fin_stock');
  select * into pu from fin_purchases where id=p_id for update; if not found then raise exception 'أمر الشراء غير موجود'; end if;
  if pu.status <> 'ordered' then raise exception 'لا يمكن الاستلام والأمر في حالة: %', pu.status; end if;
  if not exists (select 1 from fin_warehouses where code=btrim(coalesce(p_wh,'')) and active) then raise exception 'اختر مخزنًا فعّالًا للاستلام'; end if;
  select * into s from fin_suppliers where id=pu.supplier_id;
  for el in select * from jsonb_array_elements(pu.lines) loop
    i := i + 1;
    if el->>'item_code' is not null then
      perform fin_stock_move(p_u,p_p,'receipt',coalesce(p_date,current_date),btrim(p_wh),el->>'item_code',(el->>'qty')::numeric,(el->>'unit_price')::numeric,null,s.name,pu.po_no,null,null,'استلام أمر شراء '||pu.po_no,'po-'||pu.id||'-'||i,pu.project_code,null);
      n := n + 1;
    end if;
  end loop;
  update fin_purchases set status='received', wh_code=btrim(p_wh), received_at=now(), received_by=trim(p_u) where id=pu.id returning * into pu;
  perform _fin_audit(trim(p_u),'استلام أمر شراء','purchase',pu.po_no,jsonb_build_object('stock_lines',n));
  return to_jsonb(pu) || jsonb_build_object('stock_lines', n);
end $$;

create or replace function public.fin_purchase_invoice(p_u text, p_p text, p_id uuid, p_invoice_no text, p_invoice_date date, p_amount numeric, p_note text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare pu fin_purchases;
begin
  perform _fin_need(p_u,p_p,'fin_purchase');
  select * into pu from fin_purchases where id=p_id for update; if not found then raise exception 'أمر الشراء غير موجود'; end if;
  if pu.status not in ('received') then raise exception 'تُسجَّل الفاتورة بعد استلام الأصناف/الخدمة (الحالة الآن: %)', pu.status; end if;
  if btrim(coalesce(p_invoice_no,''))='' then raise exception 'رقم الفاتورة مطلوب'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'مبلغ الفاتورة غير صالح'; end if;
  if p_amount <> pu.total and btrim(coalesce(p_note,''))='' then raise exception 'مبلغ الفاتورة (%) يختلف عن أمر الشراء (%) — اكتب سبب الفرق', p_amount, pu.total; end if;
  if exists (select 1 from fin_purchases where supplier_id=pu.supplier_id and lower(invoice_no)=lower(btrim(p_invoice_no)) and status <> 'cancelled') then raise exception 'فاتورة المورد رقم % مسجّلة من قبل', btrim(p_invoice_no); end if;
  update fin_purchases set status='invoiced', invoice_no=btrim(p_invoice_no), invoice_date=coalesce(p_invoice_date,current_date), invoice_amount=p_amount, invoice_note=left(p_note,300) where id=pu.id returning * into pu;
  perform _fin_audit(trim(p_u),'تسجيل فاتورة مورد','purchase',pu.po_no,jsonb_build_object('invoice',pu.invoice_no,'amount',p_amount));
  return to_jsonb(pu);
end $$;

-- سداد الفاتورة: ينشئ «إذن صرف نقدية» مسودة في دورة التسوية والاعتماد القائمة (لا يصرف مباشرة)
create or replace function public.fin_purchase_pay(p_u text, p_p text, p_id uuid) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare pu fin_purchases; s fin_suppliers; d jsonb;
begin
  perform _fin_need(p_u,p_p,'fin_purchase'); perform _fin_need(p_u,p_p,'settle');
  select * into pu from fin_purchases where id=p_id for update; if not found then raise exception 'أمر الشراء غير موجود'; end if;
  if pu.status <> 'invoiced' then raise exception 'سجّل فاتورة المورد أولًا'; end if;
  select * into s from fin_suppliers where id=pu.supplier_id;
  d := fin_doc_save(p_u,p_p,'cash_out',null,current_date,
    jsonb_build_object('beneficiary',s.name,'amount',pu.invoice_amount::text,'job',coalesce(pu.project_code,''),'reason','سداد فاتورة '||pu.invoice_no||' — أمر شراء '||pu.po_no),null,'pay-'||pu.id);
  update fin_purchases set status='payment_requested', pay_doc_id=(d->>'id')::uuid where id=pu.id returning * into pu;
  perform _fin_audit(trim(p_u),'طلب سداد فاتورة مورد','purchase',pu.po_no,jsonb_build_object('doc',d->>'doc_no'));
  return jsonb_build_object('purchase',to_jsonb(pu),'doc_no',d->>'doc_no','doc_id',d->>'id');
end $$;

create or replace function public.fin_purchase_cancel(p_u text, p_p text, p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare pu fin_purchases;
begin
  perform _fin_need(p_u,p_p,'fin_purchase');
  if btrim(coalesce(p_reason,''))='' then raise exception 'سبب الإلغاء مطلوب'; end if;
  select * into pu from fin_purchases where id=p_id for update; if not found then raise exception 'أمر الشراء غير موجود'; end if;
  if pu.status in ('received','invoiced','payment_requested','cancelled') then raise exception 'لا يمكن إلغاء أمر شراء بعد الاستلام (الحالة: %)', pu.status; end if;
  update fin_purchases set status='cancelled', cancel_reason=left(p_reason,300) where id=pu.id returning * into pu;
  perform _fin_audit(trim(p_u),'إلغاء أمر شراء','purchase',pu.po_no,jsonb_build_object('reason',p_reason));
  return to_jsonb(pu);
end $$;

create or replace function public._fin_po_json(pu fin_purchases) returns jsonb
language sql stable security definer set search_path=public as $$
  select to_jsonb(pu) || jsonb_build_object('supplier', (select name from fin_suppliers where id=pu.supplier_id),'supplier_code',(select code from fin_suppliers where id=pu.supplier_id),
    'pay_doc_no',(select doc_no from fin_documents where id=pu.pay_doc_id),'pay_doc_status',(select status from fin_documents where id=pu.pay_doc_id),
    'paid',coalesce((select status='posted' from fin_documents where id=pu.pay_doc_id),false)) $$;
revoke all on function public._fin_po_json(fin_purchases) from public, anon, authenticated;

create or replace function public.fin_purchase_list(p_u text, p_p text, p_q text default null, p_status text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _fin_need(p_u,p_p,'fin_purchase');
  return coalesce((select jsonb_agg(_fin_po_json(x) order by x.created_at desc) from fin_purchases x join fin_suppliers s on s.id=x.supplier_id
    where (p_status is null or p_status='' or x.status=p_status) and (p_q is null or btrim(p_q)='' or x.po_no ilike '%'||btrim(p_q)||'%' or s.name ilike '%'||btrim(p_q)||'%' or x.invoice_no ilike '%'||btrim(p_q)||'%')),'[]'::jsonb);
end $$;

-- ============ المشروعات ============
create or replace function public.fin_project_save(p_u text, p_p text, p_id uuid, p_code text, p_name text, p_ptype text, p_objective text, p_target text, p_start date, p_end date,
  p_budget numeric, p_funding text, p_manager text, p_activities jsonb, p_notes text default null, p_client_key text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare pr fin_projects; el jsonb; i int := 0; acts jsonb := '[]'::jsonb; pc numeric;
begin
  perform _fin_need(p_u,p_p,'fin_project');
  if btrim(coalesce(p_name,''))='' then raise exception 'اسم المشروع مطلوب'; end if;
  if coalesce(p_budget,0) < 0 then raise exception 'الميزانية لا تكون سالبة'; end if;
  if p_start is not null and p_end is not null and p_end < p_start then raise exception 'تاريخ النهاية قبل البداية'; end if;
  if p_activities is not null and jsonb_typeof(p_activities) = 'array' then
    for el in select * from jsonb_array_elements(p_activities) loop
      i := i + 1; if btrim(coalesce(el->>'name','')) = '' then continue; end if;
      pc := coalesce(nullif(el->>'pct','')::numeric,0); if pc < 0 or pc > 100 then raise exception 'نسبة إنجاز النشاط % يجب أن تكون بين 0 و100', i; end if;
      acts := acts || jsonb_build_object('name',btrim(el->>'name'),'start',el->>'start','end',el->>'end','pct',pc,'status',coalesce(el->>'status','قائم'));
    end loop;
  end if;
  if p_id is null then
    if btrim(coalesce(p_code,''))='' then raise exception 'كود المشروع مطلوب'; end if;
    if p_client_key is not null then select * into pr from fin_projects where client_key=p_client_key; if found then return to_jsonb(pr); end if; end if;
    if exists (select 1 from fin_projects where code=btrim(p_code)) then raise exception 'كود المشروع مستخدم من قبل'; end if;
    insert into fin_projects(code,name,ptype,objective,target_group,start_date,end_date,budget,funding_source,manager,activities,notes,client_key,created_by)
    values (btrim(p_code),btrim(p_name),p_ptype,p_objective,p_target,p_start,p_end,coalesce(p_budget,0),p_funding,p_manager,acts,p_notes,p_client_key,trim(p_u)) returning * into pr;
    insert into fin_cost_centers(code,name) values (pr.code, pr.name) on conflict (code) do nothing;   -- مركز تكلفة بنفس كود المشروع ليربط المصروفات والتبرعات
    perform _fin_audit(trim(p_u),'إنشاء مشروع','project',pr.code,null);
  else
    select * into pr from fin_projects where id=p_id for update; if not found then raise exception 'المشروع غير موجود'; end if;
    if pr.status <> 'active' then raise exception 'المشروع % — أعد فتحه أولًا للتعديل', case pr.status when 'closed' then 'مغلق' else 'مؤرشف' end; end if;
    update fin_projects set name=btrim(p_name),ptype=p_ptype,objective=p_objective,target_group=p_target,start_date=p_start,end_date=p_end,budget=coalesce(p_budget,0),funding_source=p_funding,manager=p_manager,activities=acts,notes=p_notes where id=pr.id returning * into pr;
    perform _fin_audit(trim(p_u),'تعديل مشروع','project',pr.code,null);
  end if;
  return to_jsonb(pr);
end $$;

create or replace function public.fin_project_set_status(p_u text, p_p text, p_id uuid, p_status text, p_reason text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare pr fin_projects;
begin
  perform _fin_need(p_u,p_p,'fin_project');
  if p_status not in ('active','closed','archived') then raise exception 'حالة غير معروفة'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'السبب مطلوب'; end if;
  update fin_projects set status=p_status, status_by=trim(p_u), status_at=now(), status_reason=left(p_reason,300) where id=p_id returning * into pr;
  if not found then raise exception 'المشروع غير موجود'; end if;
  perform _fin_audit(trim(p_u),'تغيير حالة مشروع','project',pr.code,jsonb_build_object('status',p_status,'reason',p_reason));
  return to_jsonb(pr);
end $$;

create or replace function public.fin_project_member(p_u text, p_p text, p_id uuid, p_case_ref text, p_add boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare pr fin_projects;
begin
  perform _fin_need(p_u,p_p,'fin_project');
  select * into pr from fin_projects where id=p_id; if not found then raise exception 'المشروع غير موجود'; end if;
  if btrim(coalesce(p_case_ref,''))='' then raise exception 'رقم الحالة/الأسرة مطلوب'; end if;
  if p_add then
    if pr.status <> 'active' then raise exception 'المشروع غير نشط'; end if;
    insert into fin_project_members(project_id,case_ref,note,added_by) values (pr.id,btrim(p_case_ref),left(p_note,200),trim(p_u))
      on conflict (project_id,case_ref) do update set ended_at=null, ended_by=null, note=coalesce(excluded.note,fin_project_members.note);
  else
    update fin_project_members set ended_at=now(), ended_by=trim(p_u) where project_id=pr.id and case_ref=btrim(p_case_ref) and ended_at is null;
  end if;
  perform _fin_audit(trim(p_u),case when p_add then 'إضافة مستفيد لمشروع' else 'إنهاء استفادة من مشروع' end,'project',pr.code,jsonb_build_object('case',p_case_ref));
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.fin_projects_list(p_u text, p_p text, p_status text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _fin_need(p_u,p_p,'fin_project');
  return coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object('progress', coalesce((select round(avg((a->>'pct')::numeric),1) from jsonb_array_elements(x.activities) a),0)) order by x.created_at desc)
    from fin_projects x where p_status is null or p_status='' or x.status=p_status),'[]'::jsonb);
end $$;

create or replace function public.fin_project_report(p_u text, p_p text, p_id uuid) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare pr fin_projects; cc uuid; exp_rows jsonb; exp_t numeric; rev_rows jsonb; rev_t numeric; po_rows jsonb; po_t numeric; po_open numeric; stk jsonb; stk_v numeric; ben jsonb; ben_n int;
begin
  perform _fin_need(p_u,p_p,'fin_project');
  select * into pr from fin_projects where id=p_id; if not found then raise exception 'المشروع غير موجود'; end if;
  select id into cc from fin_cost_centers where code=pr.code;
  select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name,'amount',amt) order by code),'[]'::jsonb), coalesce(sum(amt),0) into exp_rows, exp_t
    from (select a.code,a.name,sum(l.debit-l.credit) amt from fin_journal_lines l join fin_journal_entries e on e.id=l.entry_id and e.status in ('posted','reversed')
          join fin_accounts a on a.id=l.account_id and a.acc_type='expense' where l.cost_center_id=cc group by a.id) z;
  select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name,'amount',amt) order by code),'[]'::jsonb), coalesce(sum(amt),0) into rev_rows, rev_t
    from (select a.code,a.name,sum(l.credit-l.debit) amt from fin_journal_lines l join fin_journal_entries e on e.id=l.entry_id and e.status in ('posted','reversed')
          join fin_accounts a on a.id=l.account_id and a.acc_type='revenue' where l.cost_center_id=cc group by a.id) z;
  select coalesce(jsonb_agg(jsonb_build_object('po_no',po_no,'supplier',(select name from fin_suppliers where id=supplier_id),'status',status,'total',total,'invoice_amount',invoice_amount) order by created_at),'[]'::jsonb),
         coalesce(sum(total) filter (where status in ('received','invoiced','payment_requested')),0), coalesce(sum(total) filter (where status in ('approved','ordered')),0)
    into po_rows, po_t, po_open from fin_purchases where project_code=pr.code and status<>'cancelled';
  select coalesce(jsonb_agg(jsonb_build_object('item_code',code,'item',name,'unit',unit,'qty',q,'value',round(q*c,2)) order by code),'[]'::jsonb), coalesce(sum(round(q*c,2)),0) into stk, stk_v
    from (select i.code,i.name,i.unit,sum(m.qty) q,
            coalesce((select avg(r.unit_cost) filter (where r.unit_cost>0) from fin_stock_moves r where r.item_id=i.id and r.kind in ('receipt','transfer_in')),0) c
          from fin_stock_moves m join fin_items i on i.id=m.item_id where m.project_code=pr.code and m.kind='issue' group by i.id) z;
  select coalesce(jsonb_agg(jsonb_build_object('case_ref',case_ref,'note',note,'added_at',added_at) order by added_at) filter (where ended_at is null),'[]'::jsonb), count(*) filter (where ended_at is null)
    into ben, ben_n from fin_project_members where project_id=pr.id;
  return jsonb_build_object('project',to_jsonb(pr),'progress',coalesce((select round(avg((a->>'pct')::numeric),1) from jsonb_array_elements(pr.activities) a),0),
    'expenses',exp_rows,'total_expense',exp_t,'revenues',rev_rows,'total_revenue',rev_t,'budget',pr.budget,'remaining',pr.budget-exp_t,
    'budget_pct',case when pr.budget>0 then round(exp_t*100/pr.budget,1) else null end,
    'purchases',po_rows,'purchases_received',po_t,'purchases_committed',po_open,'stock_issued',stk,'stock_value',stk_v,'beneficiaries',ben,'beneficiaries_count',ben_n);
end $$;

-- ============ ملف الأسرة الموحّد (الخادم: الحالة والملاحظات + تجميع الارتباطات) ============
create table if not exists public.fin_family_status(case_ref text primary key, status text not null check (status in ('active','under_review','suspended','closed')), reason text, updated_by text not null, updated_at timestamptz not null default now());
create table if not exists public.fin_family_events(
  id bigserial primary key, case_ref text not null, at timestamptz not null default now(), username text not null, kind text not null check (kind in ('note','status','visit','other')),
  text text not null, details jsonb, client_key text unique);
create index if not exists fin_family_events_case on public.fin_family_events(case_ref, at desc);
alter table public.fin_family_status enable row level security; alter table public.fin_family_events enable row level security;
revoke all on public.fin_family_status, public.fin_family_events from public, anon, authenticated;
drop trigger if exists fin_family_events_immutable on public.fin_family_events;
create trigger fin_family_events_immutable before update or delete on public.fin_family_events for each row execute function public._fin_no_change();

create or replace function public.fin_family_event_add(p_u text, p_p text, p_case text, p_kind text, p_text text, p_client_key text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare e fin_family_events;
begin
  perform _fin_need(p_u,p_p,'fin_family');
  if btrim(coalesce(p_case,''))='' then raise exception 'رقم الحالة/الأسرة مطلوب'; end if;
  if coalesce(p_kind,'note') not in ('note','visit','other') then raise exception 'نوع الملاحظة غير صالح'; end if;
  if btrim(coalesce(p_text,''))='' then raise exception 'نص الملاحظة مطلوب'; end if;
  if p_client_key is not null then select * into e from fin_family_events where client_key=p_client_key; if found then return to_jsonb(e); end if; end if;
  insert into fin_family_events(case_ref,username,kind,text,client_key) values (btrim(p_case),trim(p_u),coalesce(p_kind,'note'),left(p_text,2000),p_client_key) returning * into e;
  return to_jsonb(e);
end $$;

create or replace function public.fin_family_status_set(p_u text, p_p text, p_case text, p_status text, p_reason text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare old text; 
begin
  perform _fin_need(p_u,p_p,'fin_family');
  if btrim(coalesce(p_case,''))='' then raise exception 'رقم الحالة/الأسرة مطلوب'; end if;
  if p_status not in ('active','under_review','suspended','closed') then raise exception 'حالة غير معروفة'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'سبب تغيير الحالة مطلوب'; end if;
  select status into old from fin_family_status where case_ref=btrim(p_case);
  insert into fin_family_status(case_ref,status,reason,updated_by) values (btrim(p_case),p_status,left(p_reason,300),trim(p_u))
    on conflict (case_ref) do update set status=excluded.status, reason=excluded.reason, updated_by=excluded.updated_by, updated_at=now();
  insert into fin_family_events(case_ref,username,kind,text,details) values (btrim(p_case),trim(p_u),'status','تغيير الحالة: '||coalesce(old,'—')||' ← '||p_status||' — '||left(p_reason,300),jsonb_build_object('from',old,'to',p_status));
  perform _fin_audit(trim(p_u),'تغيير حالة أسرة','family',btrim(p_case),jsonb_build_object('from',old,'to',p_status));
  return jsonb_build_object('ok',true,'status',p_status);
end $$;

create or replace function public.fin_family_file(p_u text, p_p text, p_case text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare r text; c text := btrim(coalesce(p_case,''));
begin
  r := _fin_need(p_u,p_p,'fin_family');
  if c='' then raise exception 'رقم الحالة/الأسرة مطلوب'; end if;
  return jsonb_build_object('case_ref',c,
    'status',(select to_jsonb(s) from fin_family_status s where s.case_ref=c),
    'events',coalesce((select jsonb_agg(jsonb_build_object('at',e.at,'username',e.username,'kind',e.kind,'text',e.text) order by e.at desc) from fin_family_events e where e.case_ref=c),'[]'::jsonb),
    'projects',coalesce((select jsonb_agg(jsonb_build_object('code',pr.code,'name',pr.name,'status',pr.status,'since',m.added_at,'ended_at',m.ended_at) order by m.added_at) from fin_project_members m join fin_projects pr on pr.id=m.project_id where m.case_ref=c),'[]'::jsonb),
    'in_kind_aid',coalesce((select jsonb_agg(jsonb_build_object('move_no',m.move_no,'date',m.move_date,'item',i.name,'unit',i.unit,'qty',m.qty,'warehouse',w.name,'project',m.project_code) order by m.move_date desc, m.id desc)
        from fin_stock_moves m join fin_items i on i.id=m.item_id join fin_warehouses w on w.id=m.warehouse_id where m.case_ref=c and m.kind='issue'),'[]'::jsonb),
    'documents',coalesce((select jsonb_agg((to_jsonb(a) - 'file_path' - 'access') order by a.uploaded_at desc) from fin_archive a
        where a.archived_at is null and a.ref_id=c and a.ref_type in ('case','family','أسرة','حالة') and _fin_arch_allowed(p_u,r,a,'view')),'[]'::jsonb));
end $$;

-- ============ منح التنفيذ ============
grant execute on function
  public.fin_stock_move(text,text,text,date,text,text,numeric,numeric,text,text,text,text,date,text,text,text,text),
  public.fin_account_cash(text,text,text,boolean), public.fin_cash_accounts_list(text,text), public.fin_income_statement(text,text,date,date,text), public.fin_balance_sheet(text,text,date), public.fin_cash_flow(text,text,date,date),
  public.fin_supplier_save(text,text,text,text,text,text,boolean), public.fin_suppliers_list(text,text),
  public.fin_purchase_save(text,text,uuid,text,date,text,jsonb,text,text), public.fin_purchase_submit(text,text,uuid), public.fin_purchase_decide(text,text,uuid,boolean,text),
  public.fin_purchase_order(text,text,uuid), public.fin_purchase_receive(text,text,uuid,text,date), public.fin_purchase_invoice(text,text,uuid,text,date,numeric,text),
  public.fin_purchase_pay(text,text,uuid), public.fin_purchase_cancel(text,text,uuid,text), public.fin_purchase_list(text,text,text,text),
  public.fin_project_save(text,text,uuid,text,text,text,text,text,date,date,numeric,text,text,jsonb,text,text), public.fin_project_set_status(text,text,uuid,text,text),
  public.fin_project_member(text,text,uuid,text,boolean,text), public.fin_projects_list(text,text,text), public.fin_project_report(text,text,uuid),
  public.fin_family_event_add(text,text,text,text,text,text), public.fin_family_status_set(text,text,text,text,text), public.fin_family_file(text,text,text)
  to anon, authenticated;
