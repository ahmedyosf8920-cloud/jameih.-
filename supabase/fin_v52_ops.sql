-- جمعية الخير للجميع | الإصدار 52 | المخازن بالخادم، التسويات البنكية، إقفال الفترات، محاضر المجلس، الأرشيف، اللوحة، الإشعارات
-- إضافات فقط. يتطلب تشغيل fin_v51_core.sql أولًا. إعادة التشغيل آمنة. خذ نسخة احتياطية قبل التشغيل.
--
-- صلاحيات جديدة (تمنح من «المستخدمون والصلاحيات»؛ مدير النظام يملكها كلها):
--   fin_stock  حركات المخزن | fin_stock_admin  المخازن والأصناف | fin_stock_approve  اعتماد الجرد
--   fin_bank   التسويات البنكية | fin_minutes  إعداد المحاضر | fin_minutes_approve  اعتماد المحاضر
--   fin_archive  الأرشيف | fin_archive_admin  إدارة صلاحيات الأرشيف
-- الأدوار القديمة بدون صلاحيات مخصصة: محاسب ← fin_bank | مسؤول مخازن ← fin_stock, fin_stock_admin | باحث اجتماعي ← fin_archive

-- ============ التحقق من الصلاحية (يوسّع _fin_need دون تغيير سلوكه السابق) ============
create or replace function public._fin_can(p_u text, p_role text, p_perm text) returns boolean
language plpgsql security definer set search_path=public, extensions as $$
declare pm jsonb;
begin
  if p_role is null then return false; end if;
  if p_role = 'مدير النظام' then return true; end if;
  select permissions into pm from staff_users where username = trim(p_u);
  if pm is null then
    if p_role = 'محاسب' and p_perm in ('settle','settle_review','settle_post','settle_admin','fin_bank') then return true; end if;
    if p_role = 'مسؤول مخازن' and p_perm in ('fin_stock','fin_stock_admin') then return true; end if;
    if p_role = 'باحث اجتماعي' and p_perm = 'fin_archive' then return true; end if;
    return false;
  end if;
  return pm ? p_perm;
end $$;

create or replace function public._fin_need(p_u text, p_p text, p_perm text) returns text
language plpgsql security definer set search_path=public, extensions as $$
declare r text;
begin
  r := _staff_role(p_u, p_p);
  if r is null then raise exception 'غير مصرح. سجّل الدخول من جديد.'; end if;
  if not _fin_can(p_u, r, p_perm) then raise exception 'ليست لديك صلاحية لهذه العملية'; end if;
  return r;
end $$;
revoke all on function public._fin_can(text,text,text), public._fin_need(text,text,text) from public, anon, authenticated;

-- ============ إقفال الفترات ============
create table if not exists public.fin_period_log(
  id bigserial primary key, at timestamptz not null default now(), action text not null check (action in ('close','reopen')),
  through date, by_user text not null, note text);
alter table public.fin_period_log enable row level security;
revoke all on public.fin_period_log from public, anon, authenticated;
drop trigger if exists fin_period_log_immutable on public.fin_period_log;
create trigger fin_period_log_immutable before update or delete on public.fin_period_log for each row execute function public._fin_no_change();

create or replace function public._fin_closed_through() returns date language sql stable security definer set search_path=public as $$
  select nullif(value,'')::date from fin_settings where key='closed_through' $$;
revoke all on function public._fin_closed_through() from public, anon, authenticated;

create or replace function public._fin_period_guard() returns trigger language plpgsql as $$
declare c date := _fin_closed_through(); d date;
begin
  if c is null then return new; end if;
  if tg_table_name = 'fin_journal_entries' then
    if new.status = 'posted' and old.status is distinct from 'posted' and new.entry_date <= c then
      raise exception 'الفترة المالية مقفلة حتى % — لا يمكن الترحيل بتاريخ داخلها', c;
    end if;
  elsif tg_table_name = 'fin_cash_moves' then
    if new.move_date <= c then raise exception 'الفترة المالية مقفلة حتى % — لا يمكن تسجيل حركة خزينة بتاريخ داخلها', c; end if;
  elsif tg_table_name = 'fin_stock_moves' then
    if new.move_date <= c then raise exception 'الفترة المالية مقفلة حتى % — لا يمكن تسجيل حركة مخزنية بتاريخ داخلها', c; end if;
  end if;
  return new;
end $$;
drop trigger if exists fin_entries_period on public.fin_journal_entries;
create trigger fin_entries_period before update on public.fin_journal_entries for each row execute function public._fin_period_guard();
drop trigger if exists fin_cash_period on public.fin_cash_moves;
create trigger fin_cash_period before insert on public.fin_cash_moves for each row execute function public._fin_period_guard();

create or replace function public.fin_period_close(p_u text, p_p text, p_through date, p_note text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare c date; n int;
begin
  perform _fin_need(p_u,p_p,'settle_admin');
  if p_through is null or p_through >= current_date then raise exception 'يجب أن يكون تاريخ الإقفال قبل اليوم'; end if;
  c := _fin_closed_through();
  if c is not null and p_through <= c then raise exception 'الفترة مقفلة بالفعل حتى %', c; end if;
  select count(*) into n from fin_documents where doc_date <= p_through and status in ('draft','review','reviewed','approved');
  if n > 0 then raise exception 'لا يمكن الإقفال: يوجد % مستند/مستندات غير مرحّلة أو ملغاة بتاريخ داخل الفترة', n; end if;
  insert into fin_settings(key,value) values ('closed_through', p_through::text) on conflict (key) do update set value = excluded.value;
  insert into fin_period_log(action,through,by_user,note) values ('close',p_through,trim(p_u),left(p_note,500));
  perform _fin_audit(trim(p_u),'إقفال فترة مالية','period',p_through::text,jsonb_build_object('note',p_note));
  return jsonb_build_object('closed_through', p_through);
end $$;

create or replace function public.fin_period_reopen(p_u text, p_p text, p_to date, p_reason text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare c date;
begin
  perform _fin_need(p_u,p_p,'settle_admin');
  if btrim(coalesce(p_reason,'')) = '' then raise exception 'سبب إعادة الفتح مطلوب'; end if;
  c := _fin_closed_through();
  if c is null then raise exception 'لا توجد فترة مقفلة'; end if;
  if p_to is not null and p_to >= c then raise exception 'تاريخ إعادة الفتح يجب أن يسبق تاريخ الإقفال الحالي (%)', c; end if;
  update fin_settings set value = coalesce(p_to::text,'') where key='closed_through';
  insert into fin_period_log(action,through,by_user,note) values ('reopen',p_to,trim(p_u),left(p_reason,500));
  perform _fin_audit(trim(p_u),'إعادة فتح فترة','period',coalesce(p_to::text,'all'),jsonb_build_object('reason',p_reason));
  return jsonb_build_object('closed_through', p_to);
end $$;

create or replace function public.fin_period_status(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _fin_need(p_u,p_p,'settle');
  return jsonb_build_object('closed_through', _fin_closed_through(),
    'log', coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc) from (select * from fin_period_log order by id desc limit 30) x), '[]'::jsonb));
end $$;

-- ============ المخازن بالخادم (أرصدة مستقلة لكل مخزن) ============
create table if not exists public.fin_warehouses(id uuid primary key default gen_random_uuid(), code text unique not null, name text not null, keeper text, active boolean not null default true);
create table if not exists public.fin_items(id uuid primary key default gen_random_uuid(), code text unique not null, name text not null, unit text, category text, min_qty numeric(14,3) not null default 0, active boolean not null default true);
create table if not exists public.fin_stock_moves(
  id bigserial primary key, move_no text not null, move_date date not null,
  kind text not null check (kind in ('receipt','issue','transfer_out','transfer_in','adjust_plus','adjust_minus')),
  warehouse_id uuid not null references public.fin_warehouses(id), item_id uuid not null references public.fin_items(id),
  qty numeric(14,3) not null check (qty > 0), unit_cost numeric(14,2) not null default 0,
  source text, ref text, batch_no text, expiry date, note text, transfer_id uuid, client_key text,
  created_by text not null, created_at timestamptz not null default now());
create unique index if not exists fin_stock_moves_ck on public.fin_stock_moves(client_key, kind) where client_key is not null;
create index if not exists fin_stock_moves_wi on public.fin_stock_moves(warehouse_id, item_id);
create table if not exists public.fin_stock_counts(
  id uuid primary key default gen_random_uuid(), count_no text unique not null, warehouse_id uuid not null references public.fin_warehouses(id),
  count_date date not null, status text not null default 'pending' check (status in ('pending','adjusted','rejected')),
  lines jsonb not null, note text, client_key text unique, created_by text not null, created_at timestamptz not null default now(),
  decided_by text, decided_at timestamptz, decision_note text);
do $$ declare t text; begin
  foreach t in array array['fin_warehouses','fin_items','fin_stock_moves','fin_stock_counts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop; end $$;
drop trigger if exists fin_stock_moves_immutable on public.fin_stock_moves;
create trigger fin_stock_moves_immutable before update or delete on public.fin_stock_moves for each row execute function public._fin_no_change();
drop trigger if exists fin_stock_period on public.fin_stock_moves;
create trigger fin_stock_period before insert on public.fin_stock_moves for each row execute function public._fin_period_guard();

create or replace function public._fin_stock_bal(p_wh uuid, p_item uuid) returns numeric language sql stable security definer set search_path=public as $$
  select coalesce(sum(case when kind in ('receipt','transfer_in','adjust_plus') then qty else -qty end),0) from fin_stock_moves where warehouse_id=p_wh and item_id=p_item $$;
revoke all on function public._fin_stock_bal(uuid,uuid) from public, anon, authenticated;

create or replace function public.fin_wh_save(p_u text, p_p text, p_code text, p_name text, p_keeper text default null, p_active boolean default true) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare w fin_warehouses;
begin
  perform _fin_need(p_u,p_p,'fin_stock_admin');
  if btrim(coalesce(p_code,''))='' or btrim(coalesce(p_name,''))='' then raise exception 'كود واسم المخزن مطلوبان'; end if;
  insert into fin_warehouses(code,name,keeper,active) values (btrim(p_code),btrim(p_name),nullif(btrim(coalesce(p_keeper,'')),''),coalesce(p_active,true))
   on conflict (code) do update set name=excluded.name, keeper=excluded.keeper, active=excluded.active returning * into w;
  perform _fin_audit(trim(p_u),'حفظ مخزن','warehouse',w.code,null);
  return to_jsonb(w);
end $$;

create or replace function public.fin_item_save(p_u text, p_p text, p_code text, p_name text, p_unit text default null, p_category text default null, p_min numeric default 0, p_active boolean default true) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare i fin_items;
begin
  perform _fin_need(p_u,p_p,'fin_stock_admin');
  if btrim(coalesce(p_code,''))='' or btrim(coalesce(p_name,''))='' then raise exception 'كود واسم الصنف مطلوبان'; end if;
  if coalesce(p_min,0) < 0 then raise exception 'الحد الأدنى لا يكون سالبًا'; end if;
  insert into fin_items(code,name,unit,category,min_qty,active) values (btrim(p_code),btrim(p_name),p_unit,p_category,coalesce(p_min,0),coalesce(p_active,true))
   on conflict (code) do update set name=excluded.name, unit=excluded.unit, category=excluded.category, min_qty=excluded.min_qty, active=excluded.active returning * into i;
  perform _fin_audit(trim(p_u),'حفظ صنف','item',i.code,null);
  return to_jsonb(i);
end $$;

create or replace function public.fin_stock_lists(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _fin_need(p_u,p_p,'fin_stock');
  return jsonb_build_object(
    'warehouses', coalesce((select jsonb_agg(to_jsonb(w) order by w.code) from fin_warehouses w),'[]'::jsonb),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.code) from fin_items i),'[]'::jsonb));
end $$;

-- p_kind: receipt | issue | transfer (إلى p_to_wh)
create or replace function public.fin_stock_move(p_u text, p_p text, p_kind text, p_date date, p_wh text, p_item text, p_qty numeric, p_cost numeric default 0,
  p_to_wh text default null, p_source text default null, p_ref text default null, p_batch text default null, p_expiry date default null, p_note text default null, p_client_key text default null) returns jsonb
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
    insert into fin_stock_moves(move_no,move_date,kind,warehouse_id,item_id,qty,unit_cost,source,ref,batch_no,expiry,note,client_key,created_by)
    values (v_no,v_date,'receipt',w.id,it.id,p_qty,coalesce(p_cost,0),p_source,p_ref,p_batch,p_expiry,p_note,p_client_key,v_user);
  else
    perform pg_advisory_xact_lock(hashtext(w.id::text || it.id::text));
    bal := _fin_stock_bal(w.id, it.id);
    if p_qty > bal then raise exception 'الكمية المطلوبة (%) أكبر من الرصيد المتاح (%) للصنف % في المخزن %', p_qty, bal, it.name, w.name; end if;
    if p_kind = 'issue' then
      insert into fin_stock_moves(move_no,move_date,kind,warehouse_id,item_id,qty,unit_cost,source,ref,note,client_key,created_by)
      values (v_no,v_date,'issue',w.id,it.id,p_qty,0,p_source,p_ref,p_note,p_client_key,v_user);
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

create or replace function public.fin_stock_balances(p_u text, p_p text, p_wh text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _fin_need(p_u,p_p,'fin_stock');
  return coalesce((select jsonb_agg(x order by x->>'wh', x->>'item') from (
    select jsonb_build_object('wh',w.code,'wh_name',w.name,'item',i.code,'item_name',i.name,'unit',i.unit,'qty',b.q,'min_qty',i.min_qty,'low',b.q <= i.min_qty and i.min_qty > 0,
      'avg_cost',round(coalesce(b.avgc,0),2),'value',round(b.q*coalesce(b.avgc,0),2)) x
    from (select warehouse_id, item_id,
            sum(case when kind in ('receipt','transfer_in','adjust_plus') then qty else -qty end) q,
            (sum(qty*unit_cost) filter (where kind in ('receipt','transfer_in') and unit_cost>0) / nullif(sum(qty) filter (where kind in ('receipt','transfer_in') and unit_cost>0),0)) avgc
          from fin_stock_moves group by 1,2) b
    join fin_warehouses w on w.id=b.warehouse_id join fin_items i on i.id=b.item_id
    where b.q <> 0 and (p_wh is null or w.code = btrim(p_wh))) t), '[]'::jsonb);
end $$;

create or replace function public.fin_stock_card(p_u text, p_p text, p_item text, p_wh text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare w uuid; i uuid;
begin
  perform _fin_need(p_u,p_p,'fin_stock');
  select id into w from fin_warehouses where code=btrim(p_wh); select id into i from fin_items where code=btrim(p_item);
  if w is null or i is null then raise exception 'المخزن أو الصنف غير موجود'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('move_no',move_no,'date',move_date,'kind',kind,'qty',qty,'ref',ref,'source',source,'note',note,'by',created_by,'balance',bal) order by id) from (
    select m.*, sum(case when kind in ('receipt','transfer_in','adjust_plus') then qty else -qty end) over (order by id) bal
    from fin_stock_moves m where warehouse_id=w and item_id=i) x), '[]'::jsonb);
end $$;

create or replace function public.fin_stock_expiring(p_u text, p_p text, p_days int default 30) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _fin_need(p_u,p_p,'fin_stock');
  return coalesce((select jsonb_agg(jsonb_build_object('wh',w.code,'item',i.code,'item_name',i.name,'batch',m.batch_no,'expiry',m.expiry,'qty',m.qty) order by m.expiry)
    from fin_stock_moves m join fin_warehouses w on w.id=m.warehouse_id join fin_items i on i.id=m.item_id
    where m.kind='receipt' and m.expiry is not null and m.expiry <= current_date + greatest(coalesce(p_days,30),0)
      and _fin_stock_bal(m.warehouse_id,m.item_id) > 0), '[]'::jsonb);
end $$;

-- الجرد: تسجيل ← اعتماد بشخص آخر ← تسوية مخزنية (مرة واحدة)
create or replace function public.fin_stock_count_save(p_u text, p_p text, p_wh text, p_date date, p_lines jsonb, p_note text default null, p_client_key text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare w fin_warehouses; c fin_stock_counts; el jsonb; it fin_items; out jsonb := '[]'::jsonb; v_yr int; n int;
begin
  perform _fin_need(p_u,p_p,'fin_stock');
  if p_client_key is not null then select * into c from fin_stock_counts where client_key=p_client_key; if found then return to_jsonb(c); end if; end if;
  select * into w from fin_warehouses where code=btrim(p_wh) and active; if not found then raise exception 'المخزن غير موجود'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'أضف بنود الجرد'; end if;
  for el in select * from jsonb_array_elements(p_lines) loop
    select * into it from fin_items where code=btrim(el->>'item_code'); if not found then raise exception 'صنف غير موجود: %', el->>'item_code'; end if;
    if coalesce(el->>'actual','') !~ '^\d+(\.\d{1,3})?$' then raise exception 'الكمية الفعلية غير صالحة للصنف %', it.code; end if;
    out := out || jsonb_build_object('item_code',it.code,'item_name',it.name,'book',_fin_stock_bal(w.id,it.id),'actual',(el->>'actual')::numeric,
         'diff',(el->>'actual')::numeric - _fin_stock_bal(w.id,it.id),'reason',el->>'reason');
  end loop;
  v_yr := extract(year from coalesce(p_date,current_date))::int; n := _fin_next('count', v_yr);
  insert into fin_stock_counts(count_no,warehouse_id,count_date,lines,note,client_key,created_by)
  values ('جرد-'||v_yr||'-'||lpad(n::text,4,'0'), w.id, coalesce(p_date,current_date), out, p_note, p_client_key, trim(p_u)) returning * into c;
  perform _fin_audit(trim(p_u),'تسجيل جرد','count',c.count_no,null);
  return to_jsonb(c);
end $$;

create or replace function public.fin_stock_count_decide(p_u text, p_p text, p_id uuid, p_approve boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare c fin_stock_counts; el jsonb; it fin_items; d numeric; v_yr int;
begin
  perform _fin_need(p_u,p_p,'fin_stock_approve');
  select * into c from fin_stock_counts where id=p_id for update;
  if not found then raise exception 'الجرد غير موجود'; end if;
  if c.status <> 'pending' then raise exception 'تم البت في هذا الجرد من قبل'; end if;
  if c.created_by = trim(p_u) and _fin_sep() then raise exception 'لا يجوز اعتماد جرد أنشأته بنفسك'; end if;
  if not p_approve and btrim(coalesce(p_note,''))='' then raise exception 'اكتب سبب الرفض'; end if;
  if p_approve then
    for el in select * from jsonb_array_elements(c.lines) loop
      select * into it from fin_items where code = el->>'item_code';
      perform pg_advisory_xact_lock(hashtext(c.warehouse_id::text || it.id::text));
      d := (el->>'actual')::numeric - _fin_stock_bal(c.warehouse_id, it.id);   -- الفرق يُحسب لحظة الاعتماد
      if d > 0 then
        insert into fin_stock_moves(move_no,move_date,kind,warehouse_id,item_id,qty,ref,note,created_by) values (c.count_no,current_date,'adjust_plus',c.warehouse_id,it.id,d,c.count_no,coalesce(el->>'reason','تسوية جرد'),trim(p_u));
      elsif d < 0 then
        insert into fin_stock_moves(move_no,move_date,kind,warehouse_id,item_id,qty,ref,note,created_by) values (c.count_no,current_date,'adjust_minus',c.warehouse_id,it.id,-d,c.count_no,coalesce(el->>'reason','تسوية جرد'),trim(p_u));
      end if;
    end loop;
  end if;
  update fin_stock_counts set status = case when p_approve then 'adjusted' else 'rejected' end, decided_by=trim(p_u), decided_at=now(), decision_note=left(p_note,500) where id=c.id returning * into c;
  perform _fin_audit(trim(p_u), case when p_approve then 'اعتماد جرد وتسوية' else 'رفض جرد' end,'count',c.count_no,null);
  return to_jsonb(c);
end $$;

create or replace function public.fin_stock_counts_list(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _fin_need(p_u,p_p,'fin_stock');
  return coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object('wh',(select code from fin_warehouses where id=x.warehouse_id)) order by x.created_at desc) from fin_stock_counts x),'[]'::jsonb);
end $$;

-- ============ التسويات البنكية ============
create table if not exists public.fin_banks(id uuid primary key default gen_random_uuid(), code text unique not null, name text not null, account_id uuid not null references public.fin_accounts(id), active boolean not null default true);
create table if not exists public.fin_bank_lines(
  id bigserial primary key, bank_id uuid not null references public.fin_banks(id), line_date date not null, description text, amount numeric(14,2) not null check (amount <> 0),
  ref text, dedupe text not null, matched_line_id bigint unique references public.fin_journal_lines(id), matched_by text, matched_at timestamptz,
  created_by text not null, created_at timestamptz not null default now(), unique (bank_id, dedupe));
alter table public.fin_banks enable row level security; alter table public.fin_bank_lines enable row level security;
revoke all on public.fin_banks, public.fin_bank_lines from public, anon, authenticated;

create or replace function public.fin_bank_save(p_u text, p_p text, p_code text, p_name text, p_account_code text, p_active boolean default true) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare a uuid; b fin_banks;
begin
  perform _fin_need(p_u,p_p,'settle_admin');
  select id into a from fin_accounts where code=btrim(p_account_code) and acc_type='asset'; if a is null then raise exception 'حساب الأستاذ يجب أن يكون حساب أصول موجودًا'; end if;
  insert into fin_banks(code,name,account_id,active) values (btrim(p_code),btrim(p_name),a,coalesce(p_active,true))
   on conflict (code) do update set name=excluded.name, account_id=excluded.account_id, active=excluded.active returning * into b;
  perform _fin_audit(trim(p_u),'حفظ حساب بنكي','bank',b.code,null);
  return to_jsonb(b);
end $$;

create or replace function public.fin_banks_list(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _fin_need(p_u,p_p,'fin_bank');
  return coalesce((select jsonb_agg(jsonb_build_object('code',b.code,'name',b.name,'account_code',a.code,'active',b.active) order by b.code) from fin_banks b join fin_accounts a on a.id=b.account_id),'[]'::jsonb);
end $$;

create or replace function public.fin_bank_import(p_u text, p_p text, p_bank text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare b fin_banks; el jsonb; amt numeric; d date; ins int := 0; dup int := 0; k text;
begin
  perform _fin_need(p_u,p_p,'fin_bank');
  select * into b from fin_banks where code=btrim(p_bank) and active; if not found then raise exception 'الحساب البنكي غير موجود'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'لا توجد بنود في كشف البنك'; end if;
  if jsonb_array_length(p_lines) > 2000 then raise exception 'الحد الأقصى 2000 بند في المرة'; end if;
  for el in select * from jsonb_array_elements(p_lines) loop
    if coalesce(el->>'amount','') !~ '^-?\d+(\.\d{1,2})?$' then raise exception 'مبلغ غير صالح: %', el->>'amount'; end if;
    amt := (el->>'amount')::numeric; if amt = 0 then raise exception 'مبلغ صفر غير مقبول'; end if;
    begin d := (el->>'date')::date; exception when others then raise exception 'تاريخ غير صالح: %', el->>'date'; end;
    k := md5(d::text||'|'||amt::text||'|'||coalesce(el->>'ref','')||'|'||coalesce(el->>'description',''));
    insert into fin_bank_lines(bank_id,line_date,description,amount,ref,dedupe,created_by) values (b.id,d,left(el->>'description',300),amt,left(el->>'ref',100),k,trim(p_u))
      on conflict (bank_id,dedupe) do nothing;
    if found then ins := ins + 1; else dup := dup + 1; end if;
  end loop;
  perform _fin_audit(trim(p_u),'استيراد كشف بنك','bank',b.code,jsonb_build_object('inserted',ins,'duplicates',dup));
  return jsonb_build_object('inserted',ins,'duplicates',dup);
end $$;

create or replace function public.fin_bank_open_items(p_u text, p_p text, p_bank text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare b fin_banks;
begin
  perform _fin_need(p_u,p_p,'fin_bank');
  select * into b from fin_banks where code=btrim(p_bank); if not found then raise exception 'الحساب البنكي غير موجود'; end if;
  return jsonb_build_object(
   'bank_lines', coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'date',l.line_date,'description',l.description,'amount',l.amount,'ref',l.ref) order by l.line_date,l.id) from fin_bank_lines l where l.bank_id=b.id and l.matched_line_id is null),'[]'::jsonb),
   'book_lines', coalesce((select jsonb_agg(jsonb_build_object('id',jl.id,'date',e.entry_date,'entry_no',e.entry_no,'memo',coalesce(jl.memo,e.description),'amount',jl.debit-jl.credit) order by e.entry_date,jl.id)
      from fin_journal_lines jl join fin_journal_entries e on e.id=jl.entry_id and e.status in ('posted','reversed')
      where jl.account_id=b.account_id and not exists (select 1 from fin_bank_lines m where m.matched_line_id=jl.id)),'[]'::jsonb));
end $$;

create or replace function public.fin_bank_match(p_u text, p_p text, p_bank_line bigint, p_journal_line bigint) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare l fin_bank_lines; jl fin_journal_lines; b fin_banks;
begin
  perform _fin_need(p_u,p_p,'fin_bank');
  select * into l from fin_bank_lines where id=p_bank_line for update; if not found then raise exception 'بند الكشف غير موجود'; end if;
  if l.matched_line_id is not null then raise exception 'بند الكشف مطابَق من قبل'; end if;
  select * into b from fin_banks where id=l.bank_id;
  select * into jl from fin_journal_lines where id=p_journal_line; if not found then raise exception 'بند القيد غير موجود'; end if;
  if jl.account_id <> b.account_id then raise exception 'بند القيد ليس على حساب هذا البنك'; end if;
  if not exists (select 1 from fin_journal_entries e where e.id=jl.entry_id and e.status in ('posted','reversed')) then raise exception 'القيد غير مرحّل'; end if;
  if (jl.debit - jl.credit) <> l.amount then raise exception 'المبلغان غير متطابقين (الكشف % والقيد %)', l.amount, jl.debit - jl.credit; end if;
  if exists (select 1 from fin_bank_lines where matched_line_id=jl.id) then raise exception 'بند القيد مطابَق مع بند آخر'; end if;
  update fin_bank_lines set matched_line_id=jl.id, matched_by=trim(p_u), matched_at=now() where id=l.id;
  perform _fin_audit(trim(p_u),'مطابقة بنكية','bank_line',l.id::text,jsonb_build_object('journal_line',jl.id));
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.fin_bank_unmatch(p_u text, p_p text, p_bank_line bigint) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  perform _fin_need(p_u,p_p,'fin_bank');
  update fin_bank_lines set matched_line_id=null, matched_by=null, matched_at=null where id=p_bank_line and matched_line_id is not null;
  if not found then raise exception 'البند غير مطابَق'; end if;
  perform _fin_audit(trim(p_u),'إلغاء مطابقة بنكية','bank_line',p_bank_line::text,null);
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.fin_bank_recon(p_u text, p_p text, p_bank text, p_as_of date default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare b fin_banks; v_d date := coalesce(p_as_of,current_date); book numeric; stmt numeric; ub numeric; uk numeric;
begin
  perform _fin_need(p_u,p_p,'fin_bank');
  select * into b from fin_banks where code=btrim(p_bank); if not found then raise exception 'الحساب البنكي غير موجود'; end if;
  select coalesce(sum(jl.debit-jl.credit),0) into book from fin_journal_lines jl join fin_journal_entries e on e.id=jl.entry_id and e.status in ('posted','reversed') where jl.account_id=b.account_id and e.entry_date<=v_d;
  select coalesce(sum(amount),0) into stmt from fin_bank_lines where bank_id=b.id and line_date<=v_d;
  select coalesce(sum(amount),0) into ub from fin_bank_lines where bank_id=b.id and line_date<=v_d and matched_line_id is null;
  select coalesce(sum(jl.debit-jl.credit),0) into uk from fin_journal_lines jl join fin_journal_entries e on e.id=jl.entry_id and e.status in ('posted','reversed')
    where jl.account_id=b.account_id and e.entry_date<=v_d and not exists (select 1 from fin_bank_lines m where m.matched_line_id=jl.id);
  return jsonb_build_object('as_of',v_d,'book_balance',book,'statement_balance',stmt,'unmatched_bank',ub,'unmatched_book',uk,'difference',book-stmt,
     'explained', (book-stmt) = (uk-ub));
end $$;

-- ============ محاضر مجلس الإدارة ============
create table if not exists public.fin_minutes(
  id uuid primary key default gen_random_uuid(), minute_no text unique not null, yr int not null, seq int not null,
  meeting_date date not null, meeting_type text not null default 'دورية', place text, start_time text, end_time text,
  agenda jsonb not null default '[]', attendees jsonb not null default '[]', decisions jsonb not null default '[]', notes text,
  status text not null default 'draft' check (status in ('draft','review','approved','cancelled')),
  client_key text unique, created_by text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  reviewed_by text, reviewed_at timestamptz, approved_by text, approved_at timestamptz, cancel_reason text, unique (yr, seq));
alter table public.fin_minutes enable row level security; revoke all on public.fin_minutes from public, anon, authenticated;
create or replace function public._fin_minutes_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'لا يجوز حذف المحاضر. استخدم الإلغاء بسبب.'; end if;
  if old.status in ('approved','cancelled') and not (old.status='approved' and new.status='cancelled' and new.cancel_reason is not null
     and new.agenda = old.agenda and new.attendees = old.attendees and new.decisions = old.decisions) then
    raise exception 'المحضر المعتمد لا يُعدَّل. أنشئ محضرًا جديدًا يعدّل القرار.'; end if;
  return new;
end $$;
drop trigger if exists fin_minutes_guard on public.fin_minutes;
create trigger fin_minutes_guard before update or delete on public.fin_minutes for each row execute function public._fin_minutes_guard();

create or replace function public._fin_minutes_check(p_att jsonb, p_agenda jsonb, p_dec jsonb) returns jsonb
language plpgsql as $$
declare present int := 0; el jsonb; res jsonb := '[]'::jsonb; f int; a int; ab int; i int := 0;
begin
  if jsonb_typeof(p_att)<>'array' or jsonb_typeof(p_agenda)<>'array' or jsonb_typeof(p_dec)<>'array' then raise exception 'بيانات المحضر غير صالحة'; end if;
  for el in select * from jsonb_array_elements(p_att) loop if coalesce((el->>'present')::boolean,false) then present := present + 1; end if; end loop;
  for el in select * from jsonb_array_elements(p_dec) loop
    i := i + 1;
    f := coalesce(nullif(el->>'votes_for','')::int,0); a := coalesce(nullif(el->>'votes_against','')::int,0); ab := coalesce(nullif(el->>'abstain','')::int,0);
    if f<0 or a<0 or ab<0 then raise exception 'القرار %: عدد الأصوات لا يكون سالبًا', i; end if;
    if f+a+ab > present then raise exception 'القرار %: مجموع الأصوات (%) أكبر من عدد الحاضرين (%)', i, f+a+ab, present; end if;
    if btrim(coalesce(el->>'text','')) = '' then raise exception 'القرار %: نص القرار مطلوب', i; end if;
    res := res || (el || jsonb_build_object('no', i, 'result', case when f > a then 'أُقِرّ' when f < a then 'لم يُقَرّ' else 'تعادل' end));
  end loop;
  return res;
end $$;

create or replace function public.fin_minutes_save(p_u text, p_p text, p_id uuid, p_date date, p_type text, p_place text, p_start text, p_end text, p_agenda jsonb, p_attendees jsonb, p_decisions jsonb, p_notes text default null, p_client_key text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare m fin_minutes; v_yr int; v_seq int; dec jsonb;
begin
  perform _fin_need(p_u,p_p,'fin_minutes');
  dec := _fin_minutes_check(coalesce(p_attendees,'[]'::jsonb), coalesce(p_agenda,'[]'::jsonb), coalesce(p_decisions,'[]'::jsonb));
  if p_date is null then raise exception 'تاريخ الاجتماع مطلوب'; end if;
  if p_id is null then
    if p_client_key is not null then select * into m from fin_minutes where client_key=p_client_key; if found then return to_jsonb(m); end if; end if;
    v_yr := extract(year from p_date)::int; v_seq := _fin_next('minutes', v_yr);
    insert into fin_minutes(minute_no,yr,seq,meeting_date,meeting_type,place,start_time,end_time,agenda,attendees,decisions,notes,client_key,created_by)
    values ('محضر-'||v_yr||'-'||lpad(v_seq::text,3,'0'),v_yr,v_seq,p_date,coalesce(p_type,'دورية'),p_place,p_start,p_end,coalesce(p_agenda,'[]'),coalesce(p_attendees,'[]'),dec,p_notes,p_client_key,trim(p_u)) returning * into m;
    perform _fin_audit(trim(p_u),'إنشاء محضر','minutes',m.minute_no,null);
  else
    select * into m from fin_minutes where id=p_id for update; if not found then raise exception 'المحضر غير موجود'; end if;
    if m.status <> 'draft' then raise exception 'لا يُعدَّل إلا المحضر في حالة المسودة'; end if;
    if m.created_by <> trim(p_u) and _fin_staff_is_admin(p_u,p_p) is not true then raise exception 'يعدّل المحضر منشئه فقط'; end if;
    update fin_minutes set meeting_date=p_date,meeting_type=coalesce(p_type,'دورية'),place=p_place,start_time=p_start,end_time=p_end,agenda=coalesce(p_agenda,'[]'),attendees=coalesce(p_attendees,'[]'),decisions=dec,notes=p_notes,updated_at=now() where id=m.id returning * into m;
    perform _fin_audit(trim(p_u),'تعديل محضر','minutes',m.minute_no,null);
  end if;
  return to_jsonb(m);
end $$;
create or replace function public._fin_staff_is_admin(p_u text, p_p text) returns boolean language sql security definer set search_path=public as $$ select _staff_role(p_u,p_p) = 'مدير النظام' $$;
revoke all on function public._fin_staff_is_admin(text,text) from public, anon, authenticated;

create or replace function public.fin_minutes_submit(p_u text, p_p text, p_id uuid) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare m fin_minutes; present int;
begin
  perform _fin_need(p_u,p_p,'fin_minutes');
  select * into m from fin_minutes where id=p_id for update; if not found then raise exception 'المحضر غير موجود'; end if;
  if m.status <> 'draft' then raise exception 'المحضر ليس مسودة'; end if;
  select count(*) into present from jsonb_array_elements(m.attendees) e where coalesce((e->>'present')::boolean,false);
  if present = 0 then raise exception 'سجّل الحاضرين'; end if;
  if jsonb_array_length(m.agenda) = 0 then raise exception 'جدول الأعمال مطلوب'; end if;
  if jsonb_array_length(m.decisions) = 0 then raise exception 'سجّل قرارًا واحدًا على الأقل'; end if;
  update fin_minutes set status='review', updated_at=now() where id=m.id returning * into m;
  perform _fin_audit(trim(p_u),'إرسال محضر للاعتماد','minutes',m.minute_no,null);
  return to_jsonb(m);
end $$;

create or replace function public.fin_minutes_decide(p_u text, p_p text, p_id uuid, p_approve boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare m fin_minutes;
begin
  perform _fin_need(p_u,p_p,'fin_minutes_approve');
  select * into m from fin_minutes where id=p_id for update; if not found then raise exception 'المحضر غير موجود'; end if;
  if m.status <> 'review' then raise exception 'المحضر ليس بانتظار الاعتماد'; end if;
  if m.created_by = trim(p_u) and _fin_sep() then raise exception 'لا يجوز اعتماد محضر أنشأته بنفسك'; end if;
  if p_approve then update fin_minutes set status='approved', approved_by=trim(p_u), approved_at=now(), updated_at=now() where id=m.id returning * into m;
  else
    if btrim(coalesce(p_note,''))='' then raise exception 'اكتب سبب الرفض'; end if;
    update fin_minutes set status='draft', notes=coalesce(notes,'')||E'\n[رفض الاعتماد من '||trim(p_u)||': '||left(p_note,300)||']', updated_at=now() where id=m.id returning * into m;
  end if;
  perform _fin_audit(trim(p_u), case when p_approve then 'اعتماد محضر' else 'رفض محضر' end,'minutes',m.minute_no,null);
  return to_jsonb(m);
end $$;

create or replace function public.fin_minutes_cancel(p_u text, p_p text, p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare m fin_minutes;
begin
  perform _fin_need(p_u,p_p,'fin_minutes_approve');
  if btrim(coalesce(p_reason,''))='' then raise exception 'سبب الإلغاء مطلوب'; end if;
  update fin_minutes set status='cancelled', cancel_reason=left(p_reason,500), updated_at=now() where id=p_id and status in ('draft','review','approved') returning * into m;
  if not found then raise exception 'تعذر الإلغاء'; end if;
  perform _fin_audit(trim(p_u),'إلغاء محضر','minutes',m.minute_no,jsonb_build_object('reason',p_reason));
  return to_jsonb(m);
end $$;

create or replace function public.fin_minutes_list(p_u text, p_p text, p_q text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  if not _fin_can(p_u,_staff_role(p_u,p_p),'fin_minutes_approve') then perform _fin_need(p_u,p_p,'fin_minutes'); end if;
  return coalesce((select jsonb_agg(to_jsonb(m) order by m.meeting_date desc, m.seq desc) from fin_minutes m
    where p_q is null or btrim(p_q)='' or m.minute_no ilike '%'||btrim(p_q)||'%' or m.decisions::text ilike '%'||btrim(p_q)||'%' or m.agenda::text ilike '%'||btrim(p_q)||'%'),'[]'::jsonb);
end $$;

-- ============ الأرشيف الإلكتروني (بيانات وصلاحيات وسجل؛ الملف نفسه في Storage خاص) ============
create table if not exists public.fin_archive(
  id uuid primary key default gen_random_uuid(), arch_no text unique not null, title text not null, category text, ref_type text, ref_id text,
  file_path text unique not null, file_name text not null, mime text not null, size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  access jsonb not null default '{"view":[],"download":[],"edit":[]}', notes text, version int not null default 1, replaces uuid references public.fin_archive(id),
  archived_at timestamptz, archive_reason text, client_key text unique, uploaded_by text not null, uploaded_at timestamptz not null default now());
create table if not exists public.fin_archive_events(
  id bigserial primary key, at timestamptz not null default now(), arch_id uuid not null references public.fin_archive(id), username text not null, action text not null, details jsonb);
alter table public.fin_archive enable row level security; alter table public.fin_archive_events enable row level security;
revoke all on public.fin_archive, public.fin_archive_events from public, anon, authenticated;
drop trigger if exists fin_archive_events_immutable on public.fin_archive_events;
create trigger fin_archive_events_immutable before update or delete on public.fin_archive_events for each row execute function public._fin_no_change();
create or replace function public._fin_archive_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'لا يجوز حذف مستند من الأرشيف. استخدم الأرشفة بسبب.'; end if;
  if new.file_path <> old.file_path or new.file_name <> old.file_name or new.size_bytes <> old.size_bytes or new.uploaded_by <> old.uploaded_by then raise exception 'بيانات الملف لا تُعدَّل. ارفع نسخة جديدة.'; end if;
  return new;
end $$;
drop trigger if exists fin_archive_guard on public.fin_archive;
create trigger fin_archive_guard before update or delete on public.fin_archive for each row execute function public._fin_archive_guard();

-- هل المستخدم ضمن قائمة مسموحة؟ القائمة تحوي أسماء أدوار أو مفاتيح صلاحيات أو أسماء مستخدمين
create or replace function public._fin_arch_allowed(p_u text, p_role text, a public.fin_archive, p_mode text) returns boolean
language plpgsql security definer set search_path=public as $$
declare lst jsonb := coalesce(a.access -> p_mode, '[]'::jsonb); x text; pm jsonb;
begin
  if p_role = 'مدير النظام' or a.uploaded_by = trim(p_u) or _fin_can(p_u, p_role, 'fin_archive_admin') then return true; end if;
  select permissions into pm from staff_users where username = trim(p_u);
  for x in select jsonb_array_elements_text(lst) loop
    if x = p_role or x = trim(p_u) or (pm is not null and pm ? x) then return true; end if;
  end loop;
  return false;
end $$;
revoke all on function public._fin_arch_allowed(text,text,public.fin_archive,text) from public, anon, authenticated;

create or replace function public.fin_arch_register(p_u text, p_p text, p_title text, p_category text, p_file_name text, p_mime text, p_size bigint, p_path text,
  p_ref_type text default null, p_ref_id text default null, p_access jsonb default null, p_notes text default null, p_replaces uuid default null, p_client_key text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare r text; a fin_archive; v_yr int := extract(year from current_date)::int; n int; ver int := 1;
begin
  r := _fin_need(p_u,p_p,'fin_archive');
  if p_client_key is not null then select * into a from fin_archive where client_key=p_client_key; if found then return to_jsonb(a); end if; end if;
  if btrim(coalesce(p_title,''))='' then raise exception 'عنوان المستند مطلوب'; end if;
  if p_file_name !~* '\.(pdf|png|jpe?g|webp|xlsx?|csv)$' then raise exception 'نوع الملف غير مسموح (PDF أو صور أو Excel أو CSV فقط)'; end if;
  if p_mime !~ '^(application/pdf|image/(png|jpeg|webp)|text/csv|application/vnd\.(ms-excel|openxmlformats-officedocument\.spreadsheetml\.sheet))$' then raise exception 'نوع MIME غير مسموح'; end if;
  if p_size is null or p_size <= 0 or p_size > 15728640 then raise exception 'حجم الملف يجب ألا يتجاوز 15 ميجابايت'; end if;
  if p_path !~ '^archive/[0-9]{4}/[0-9a-f-]{36}-[^/]+$' or p_path like '%..%' then raise exception 'مسار التخزين غير صالح'; end if;
  if p_replaces is not null then select version+1 into ver from fin_archive where id=p_replaces; if ver is null then raise exception 'النسخة المراد استبدالها غير موجودة'; end if; end if;
  n := _fin_next('archive', v_yr);
  insert into fin_archive(arch_no,title,category,ref_type,ref_id,file_path,file_name,mime,size_bytes,access,notes,version,replaces,client_key,uploaded_by)
  values ('أرشيف-'||v_yr||'-'||lpad(n::text,4,'0'),btrim(p_title),p_category,p_ref_type,p_ref_id,p_path,left(p_file_name,200),p_mime,p_size,
     coalesce(p_access,'{"view":[],"download":[],"edit":[]}'::jsonb),p_notes,ver,p_replaces,p_client_key,trim(p_u)) returning * into a;
  insert into fin_archive_events(arch_id,username,action,details) values (a.id,trim(p_u),'upload',jsonb_build_object('version',ver));
  perform _fin_audit(trim(p_u),'تسجيل مستند أرشيف','archive',a.arch_no,null);
  return to_jsonb(a) - 'file_path';
end $$;

create or replace function public.fin_arch_list(p_u text, p_p text, p_q text default null, p_category text default null, p_include_archived boolean default false) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare r text;
begin
  r := _fin_need(p_u,p_p,'fin_archive');
  return coalesce((select jsonb_agg((to_jsonb(a) - 'file_path') || jsonb_build_object('can_download', _fin_arch_allowed(p_u,r,a,'download'), 'can_edit', _fin_arch_allowed(p_u,r,a,'edit')) order by a.uploaded_at desc)
    from fin_archive a
    where _fin_arch_allowed(p_u,r,a,'view') and (p_include_archived or a.archived_at is null)
      and (p_category is null or p_category='' or a.category = p_category)
      and (p_q is null or btrim(p_q)='' or a.title ilike '%'||btrim(p_q)||'%' or a.arch_no ilike '%'||btrim(p_q)||'%' or a.file_name ilike '%'||btrim(p_q)||'%' or a.ref_id ilike '%'||btrim(p_q)||'%' or a.notes ilike '%'||btrim(p_q)||'%')),'[]'::jsonb);
end $$;

-- يعيد مسار التخزين فقط لمن يملك الصلاحية، ويسجل الاطلاع/التنزيل
create or replace function public.fin_arch_open(p_u text, p_p text, p_id uuid, p_mode text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare r text; a fin_archive;
begin
  r := _fin_need(p_u,p_p,'fin_archive');
  if p_mode not in ('view','download') then raise exception 'وضع غير معروف'; end if;
  select * into a from fin_archive where id=p_id; if not found then raise exception 'المستند غير موجود'; end if;
  if not _fin_arch_allowed(p_u,r,a,p_mode) then
    insert into fin_archive_events(arch_id,username,action,details) values (a.id,trim(p_u),'denied',jsonb_build_object('mode',p_mode));
    raise exception 'ليست لديك صلاحية %', case p_mode when 'view' then 'الاطلاع على هذا المستند' else 'تنزيل هذا المستند' end;
  end if;
  insert into fin_archive_events(arch_id,username,action) values (a.id,trim(p_u),p_mode);
  return jsonb_build_object('path',a.file_path,'file_name',a.file_name,'mime',a.mime);
end $$;

create or replace function public.fin_arch_set_access(p_u text, p_p text, p_id uuid, p_access jsonb) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare r text; a fin_archive;
begin
  r := _fin_need(p_u,p_p,'fin_archive');
  select * into a from fin_archive where id=p_id for update; if not found then raise exception 'المستند غير موجود'; end if;
  if not _fin_arch_allowed(p_u,r,a,'edit') then raise exception 'ليست لديك صلاحية تعديل صلاحيات المستند'; end if;
  if jsonb_typeof(p_access) <> 'object' or exists (select 1 from jsonb_object_keys(p_access) k where k not in ('view','download','edit')) then raise exception 'صلاحيات غير صالحة'; end if;
  update fin_archive set access = jsonb_build_object('view',coalesce(p_access->'view','[]'),'download',coalesce(p_access->'download','[]'),'edit',coalesce(p_access->'edit','[]')) where id=a.id returning * into a;
  insert into fin_archive_events(arch_id,username,action,details) values (a.id,trim(p_u),'access_changed',p_access);
  return to_jsonb(a) - 'file_path';
end $$;

create or replace function public.fin_arch_archive(p_u text, p_p text, p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare r text; a fin_archive;
begin
  r := _fin_need(p_u,p_p,'fin_archive');
  select * into a from fin_archive where id=p_id for update; if not found then raise exception 'المستند غير موجود'; end if;
  if not _fin_arch_allowed(p_u,r,a,'edit') then raise exception 'ليست لديك صلاحية'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'سبب الأرشفة مطلوب'; end if;
  update fin_archive set archived_at=now(), archive_reason=left(p_reason,300) where id=a.id returning * into a;
  insert into fin_archive_events(arch_id,username,action,details) values (a.id,trim(p_u),'archived',jsonb_build_object('reason',p_reason));
  return to_jsonb(a) - 'file_path';
end $$;

create or replace function public.fin_arch_events(p_u text, p_p text, p_id uuid) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare r text; a fin_archive;
begin
  r := _fin_need(p_u,p_p,'fin_archive');
  select * into a from fin_archive where id=p_id; if not found then raise exception 'المستند غير موجود'; end if;
  if not _fin_arch_allowed(p_u,r,a,'edit') then raise exception 'ليست لديك صلاحية'; end if;
  return coalesce((select jsonb_agg(to_jsonb(e) order by e.id desc) from fin_archive_events e where e.arch_id=a.id),'[]'::jsonb);
end $$;

-- ============ الإشعارات ============
create table if not exists public.fin_notif_reads(username text not null, nkey text not null, read_at timestamptz not null default now(), primary key (username, nkey));
alter table public.fin_notif_reads enable row level security; revoke all on public.fin_notif_reads from public, anon, authenticated;

create or replace function public._fin_notifs(p_u text, p_role text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare out jsonb := '[]'::jsonb; n int; sep boolean := _fin_sep(); u text := trim(p_u);
begin
  if _fin_can(p_u,p_role,'settle_review') then
    select count(*) into n from fin_documents where status='review' and (not sep or created_by <> u);
    if n>0 then out := out || jsonb_build_object('key','docs_review','type','مراجعة','title',n||' مستند بانتظار مراجعتك','severity','info'); end if; end if;
  if _fin_can(p_u,p_role,'settle_approve') then
    select count(*) into n from fin_documents where status='reviewed' and (not sep or created_by <> u);
    if n>0 then out := out || jsonb_build_object('key','docs_approve','type','اعتماد','title',n||' مستند بانتظار اعتمادك','severity','info'); end if; end if;
  if _fin_can(p_u,p_role,'settle_post') then
    select count(*) into n from fin_documents where status='approved';
    if n>0 then out := out || jsonb_build_object('key','docs_post','type','ترحيل','title',n||' مستند معتمد بانتظار الترحيل','severity','info'); end if; end if;
  if _fin_can(p_u,p_role,'settle') then
    select count(*) into n from fin_advances where status='open' and due_date is not null and due_date < current_date;
    if n>0 then out := out || jsonb_build_object('key','adv_overdue','type','سلف','title',n||' سلفة/عهدة متأخرة التسوية','severity','warn'); end if; end if;
  if _fin_can(p_u,p_role,'fin_stock') then
    select count(*) into n from (select 1 from fin_stock_moves m join fin_items i on i.id=m.item_id group by m.warehouse_id,m.item_id,i.min_qty
       having i.min_qty>0 and sum(case when kind in ('receipt','transfer_in','adjust_plus') then qty else -qty end) <= i.min_qty) q;
    if n>0 then out := out || jsonb_build_object('key','stock_low','type','مخزون','title',n||' صنف عند أو تحت الحد الأدنى','severity','warn'); end if;
    select count(*) into n from fin_stock_moves m where m.kind='receipt' and m.expiry is not null and m.expiry <= current_date+30 and _fin_stock_bal(m.warehouse_id,m.item_id)>0;
    if n>0 then out := out || jsonb_build_object('key','stock_exp','type','صلاحية','title',n||' دفعة تنتهي صلاحيتها خلال 30 يومًا','severity','warn'); end if; end if;
  if _fin_can(p_u,p_role,'fin_stock_approve') then
    select count(*) into n from fin_stock_counts where status='pending' and (not sep or created_by <> u);
    if n>0 then out := out || jsonb_build_object('key','counts_pending','type','جرد','title',n||' جرد بانتظار الاعتماد','severity','info'); end if; end if;
  if _fin_can(p_u,p_role,'fin_bank') then
    select count(*) into n from fin_bank_lines where matched_line_id is null;
    if n>0 then out := out || jsonb_build_object('key','bank_open','type','بنك','title',n||' بند في كشف البنك غير مطابَق','severity','info'); end if; end if;
  if _fin_can(p_u,p_role,'fin_minutes_approve') then
    select count(*) into n from fin_minutes where status='review' and (not sep or created_by <> u);
    if n>0 then out := out || jsonb_build_object('key','minutes_review','type','محاضر','title',n||' محضر بانتظار الاعتماد','severity','info'); end if; end if;
  return out;
end $$;
revoke all on function public._fin_notifs(text,text) from public, anon, authenticated;

create or replace function public.fin_notifications(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare r text := _staff_role(p_u,p_p);
begin
  if r is null then raise exception 'غير مصرح. سجّل الدخول من جديد.'; end if;
  return (select coalesce(jsonb_agg(x || jsonb_build_object('read_at',(select read_at from fin_notif_reads where username=trim(p_u) and nkey = x->>'key'))), '[]'::jsonb) from jsonb_array_elements(_fin_notifs(p_u,r)) x);
end $$;

create or replace function public.fin_notif_mark(p_u text, p_p text, p_key text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
begin
  if _staff_role(p_u,p_p) is null then raise exception 'غير مصرح. سجّل الدخول من جديد.'; end if;
  insert into fin_notif_reads(username,nkey) values (trim(p_u), left(p_key,60)) on conflict (username,nkey) do update set read_at=now();
  return jsonb_build_object('ok',true);
end $$;

-- ============ لوحة المعلومات (من الخادم، كل قسم حسب صلاحية المستخدم) ============
create or replace function public.fin_dashboard(p_u text, p_p text) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare r text := _staff_role(p_u,p_p); o jsonb := '{}'::jsonb; v_cash numeric; tb jsonb;
begin
  if r is null then raise exception 'غير مصرح. سجّل الدخول من جديد.'; end if;
  if _fin_can(p_u,r,'settle') then
    v_cash := _fin_box_balance('main', current_date);
    o := o || jsonb_build_object('finance', jsonb_build_object(
      'cash_balance', v_cash,
      'docs_by_status', coalesce((select jsonb_object_agg(status,c) from (select status,count(*) c from fin_documents group by status) s),'{}'::jsonb),
      'open_advances', (select jsonb_build_object('count',count(*),'amount',coalesce(sum(amount),0),'overdue',count(*) filter (where due_date < current_date)) from fin_advances where status='open'),
      'month_receipts', (select coalesce(sum(amount),0) from fin_cash_moves where box='main' and direction='in' and kind<>'opening' and date_trunc('month',move_date)=date_trunc('month',current_date)),
      'month_payments', (select coalesce(sum(amount),0) from fin_cash_moves where box='main' and direction='out' and date_trunc('month',move_date)=date_trunc('month',current_date)),
      'posted_debit', (select coalesce(sum(l.debit),0) from fin_journal_lines l join fin_journal_entries e on e.id=l.entry_id and e.status in ('posted','reversed')),
      'posted_credit', (select coalesce(sum(l.credit),0) from fin_journal_lines l join fin_journal_entries e on e.id=l.entry_id and e.status in ('posted','reversed')),
      'closed_through', _fin_closed_through()));
  end if;
  if _fin_can(p_u,r,'fin_stock') then
    o := o || jsonb_build_object('stock', jsonb_build_object(
      'warehouses', (select count(*) from fin_warehouses where active), 'items', (select count(*) from fin_items where active),
      'value', (select coalesce(sum(round(b.q*coalesce(b.avgc,0),2)),0) from (select warehouse_id,item_id,
          sum(case when kind in ('receipt','transfer_in','adjust_plus') then qty else -qty end) q,
          (sum(qty*unit_cost) filter (where kind in ('receipt','transfer_in') and unit_cost>0) / nullif(sum(qty) filter (where kind in ('receipt','transfer_in') and unit_cost>0),0)) avgc from fin_stock_moves group by 1,2) b where b.q>0),
      'low', (select count(*) from (select 1 from fin_stock_moves m join fin_items i on i.id=m.item_id group by m.warehouse_id,m.item_id,i.min_qty
          having i.min_qty>0 and sum(case when kind in ('receipt','transfer_in','adjust_plus') then qty else -qty end) <= i.min_qty) q)));
  end if;
  if _fin_can(p_u,r,'fin_minutes') or _fin_can(p_u,r,'fin_minutes_approve') then
    o := o || jsonb_build_object('minutes', coalesce((select jsonb_object_agg(status,c) from (select status,count(*) c from fin_minutes group by status) s),'{}'::jsonb));
  end if;
  if _fin_can(p_u,r,'fin_bank') then
    o := o || jsonb_build_object('bank', jsonb_build_object('unmatched_lines',(select count(*) from fin_bank_lines where matched_line_id is null)));
  end if;
  o := o || jsonb_build_object('notifications', _fin_notifs(p_u,r));
  return o;
end $$;

-- ============ منح التنفيذ ============
grant execute on function
  public.fin_period_close(text,text,date,text), public.fin_period_reopen(text,text,date,text), public.fin_period_status(text,text),
  public.fin_wh_save(text,text,text,text,text,boolean), public.fin_item_save(text,text,text,text,text,text,numeric,boolean), public.fin_stock_lists(text,text),
  public.fin_stock_move(text,text,text,date,text,text,numeric,numeric,text,text,text,text,date,text,text), public.fin_stock_balances(text,text,text),
  public.fin_stock_card(text,text,text,text), public.fin_stock_expiring(text,text,int), public.fin_stock_count_save(text,text,text,date,jsonb,text,text),
  public.fin_stock_count_decide(text,text,uuid,boolean,text), public.fin_stock_counts_list(text,text),
  public.fin_bank_save(text,text,text,text,text,boolean), public.fin_banks_list(text,text), public.fin_bank_import(text,text,text,jsonb), public.fin_bank_open_items(text,text,text),
  public.fin_bank_match(text,text,bigint,bigint), public.fin_bank_unmatch(text,text,bigint), public.fin_bank_recon(text,text,text,date),
  public.fin_minutes_save(text,text,uuid,date,text,text,text,text,jsonb,jsonb,jsonb,text,text), public.fin_minutes_submit(text,text,uuid),
  public.fin_minutes_decide(text,text,uuid,boolean,text), public.fin_minutes_cancel(text,text,uuid,text), public.fin_minutes_list(text,text,text),
  public.fin_arch_register(text,text,text,text,text,text,bigint,text,text,text,jsonb,text,uuid,text), public.fin_arch_list(text,text,text,text,boolean),
  public.fin_arch_open(text,text,uuid,text), public.fin_arch_set_access(text,text,uuid,jsonb), public.fin_arch_archive(text,text,uuid,text), public.fin_arch_events(text,text,uuid),
  public.fin_notifications(text,text), public.fin_notif_mark(text,text,text), public.fin_dashboard(text,text)
  to anon, authenticated;
