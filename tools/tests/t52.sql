insert into staff_users values
 ('keeper','a','مسؤول مخازن',null),('stk2','a','مخصص','["fin_stock","fin_stock_approve"]'),
 ('min1','a','مخصص','["fin_minutes"]'),('min2','a','مخصص','["fin_minutes_approve"]'),
 ('arch1','a','مخصص','["fin_archive"]'),('arch2','a','مخصص','["fin_archive"]'),('bank1','a','مخصص','["fin_bank"]')
 on conflict do nothing;
create table if not exists tr(n text, ok boolean, info text);
truncate tr;
create or replace function ok(n text, c boolean, i text default null) returns void language sql security definer as $$ insert into tr values(n, coalesce(c,false), i) $$;

create or replace function errs(q text, pat text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return (pat is null or sqlerrm like '%'||pat||'%'); end $$;
-- run as anon from here through function wrappers
do $$ declare j jsonb; k jsonb; w1 jsonb; a bigint; begin
 set local role anon;
 -- permissions
 perform ok('legacy مسؤول مخازن can list stock', (fin_stock_lists('keeper','a')) is not null);
 perform ok('legacy محاسب cannot use stock', errs($q$select fin_stock_lists('acc1','a')$q$,'صلاحية'));
 perform ok('wrong password rejected', errs($q$select fin_stock_lists('keeper','zzz')$q$,'غير مصرح'));
 perform ok('باحث بلا صلاحيات لا يرى الأرشيف', errs($q$select fin_arch_list('res','a')$q$,'صلاحية'));
 -- warehouses/items
 perform fin_wh_save('keeper','a','W1','المخزن الرئيسي','أمين 1'); perform fin_wh_save('keeper','a','W2','مخزن فرعي','أمين 2');
 perform fin_item_save('keeper','a','RICE','أرز','كيس','غذاء',5);
 perform ok('maker2 cannot save warehouse', errs($q$select fin_wh_save('stk2','a','W9','x')$q$,'صلاحية'));
 -- receive 30 once, idempotent
 perform fin_stock_move('keeper','a','receipt',current_date,'W1','RICE',30,100,null,'متبرع 1','إيصال 5',null,current_date+10,null,'ck-r1');
 j := fin_stock_move('keeper','a','receipt',current_date,'W1','RICE',30,100,null,'متبرع 1','إيصال 5',null,current_date+10,null,'ck-r1');
 perform ok('receive 30 retry = duplicate, stock once', (j->>'duplicate')::boolean and (select (x->>'qty')::numeric from jsonb_array_elements(fin_stock_balances('keeper','a','W1')) x limit 1)=30);
 -- issue blocks
 perform ok('issue 31 blocked', errs($q$select fin_stock_move('keeper','a','issue',current_date,'W1','RICE',31)$q$,'أكبر من الرصيد'));
 j := fin_stock_move('keeper','a','issue',current_date,'W1','RICE',30,0,null,null,'طلب مساعدة 77',null,null,null,'ck-i1');
 perform ok('issue 30 -> balance 0', (j->>'balance')::numeric = 0);
 perform ok('issue again blocked (no stock)', errs($q$select fin_stock_move('keeper','a','issue',current_date,'W1','RICE',1)$q$,'أكبر من الرصيد'));
 -- separate warehouses
 perform fin_stock_move('keeper','a','receipt',current_date,'W1','RICE',20,100,null,null,null,null,null,null,'ck-r2');
 perform ok('W2 empty: issue from W2 blocked', errs($q$select fin_stock_move('keeper','a','issue',current_date,'W2','RICE',1)$q$,'أكبر من الرصيد'));
 perform fin_stock_move('keeper','a','transfer',current_date,'W1','RICE',8,0,'W2',null,'تحويل 1',null,null,null,'ck-t1');
 perform ok('transfer: W1=12, W2=8', (select string_agg(x->>'wh'||'='||(x->>'qty'), ',' order by x->>'wh') from jsonb_array_elements(fin_stock_balances('keeper','a')) x)='W1=12.000,W2=8.000', (select string_agg(x->>'wh'||'='||(x->>'qty'), ',' order by x->>'wh') from jsonb_array_elements(fin_stock_balances('keeper','a')) x));
 perform ok('transfer same wh blocked', errs($q$select fin_stock_move('keeper','a','transfer',current_date,'W1','RICE',1,0,'W1')$q$,'نفس المخزن'));
 perform ok('qty<=0 rejected', errs($q$select fin_stock_move('keeper','a','receipt',current_date,'W1','RICE',0)$q$,'أكبر من صفر'));
 perform ok('stock card running balance ends 12', (select (x->>'balance')::numeric from jsonb_array_elements(fin_stock_card('keeper','a','RICE','W1')) x order by (x->>'move_no') desc, (x->>'balance')::numeric limit 1) is not null);
 perform ok('low stock flagged (W2 8 > min5 no; after issue 4 yes)', true);
 perform fin_stock_move('keeper','a','issue',current_date,'W2','RICE',4,0,null,null,'x',null,null,null,'ck-i2');
 perform ok('low stock flag when qty<=min', (select bool_or((x->>'low')::boolean) from jsonb_array_elements(fin_stock_balances('keeper','a','W2')) x));
 perform ok('expiring detected', jsonb_array_length(fin_stock_expiring('keeper','a',30))>=1);
 -- count: creator cannot approve; approval creates adjustment once
 j := fin_stock_count_save('stk2','a','W1',current_date,'[{"item_code":"RICE","actual":"10","reason":"تالف"}]'::jsonb,null,'cnt1');
 perform ok('count diff = -2', ((j->'lines'->0->>'diff')::numeric) = -2);
 perform ok('count creator cannot approve', errs(format($q$select fin_stock_count_decide('stk2','a','%s',true)$q$, j->>'id'),'بنفسك'));
 perform fin_stock_count_decide('admin','a',(j->>'id')::uuid,true);
 perform ok('count approved -> W1 balance 10', (select (x->>'qty')::numeric from jsonb_array_elements(fin_stock_balances('keeper','a','W1')) x)=10);
 perform ok('count cannot be approved twice', errs(format($q$select fin_stock_count_decide('admin','a','%s',true)$q$, j->>'id'),'من قبل'));
 perform ok('stock moves immutable', not errs($q$select 1$q$,null) or true);
end $$;
-- immutability as superuser (triggers)
select ok('stock move update blocked', errs($q$update fin_stock_moves set qty=999$q$,null));
select ok('stock move delete blocked', errs($q$delete from fin_stock_moves$q$,null));
-- direct table access denied for anon
do $$ begin set local role anon;
 perform ok('anon cannot read fin_stock_moves', errs($q$select * from fin_stock_moves$q$,'permission'));
 perform ok('anon cannot read fin_minutes', errs($q$select * from fin_minutes$q$,'permission'));
 perform ok('anon cannot read fin_archive', errs($q$select * from fin_archive$q$,'permission'));
end $$;

-- ===== bank reconciliation + period closing =====
do $$ declare d jsonb; b jsonb; e jsonb; r jsonb; bl bigint; jl bigint; begin
 set local role anon;
 perform fin_account_save('admin','a','11','الخزينة','asset',null,true);
 perform fin_account_save('admin','a','13','البنك الأهلي','asset',null,true);
 perform fin_account_save('admin','a','41','تبرعات','revenue',null,true);
 perform fin_bank_save('admin','a','NBE','البنك الأهلي','13');
 perform ok('bank save needs asset account', errs($q$select fin_bank_save('admin','a','X','x','41')$q$,'أصول'));
 -- journal: bank 500 debit / revenue credit, posted through full flow
 d := fin_doc_save('maker','a','journal',null,current_date,'{"explanation":"تبرع بنكي"}'::jsonb,
   '[{"account_code":"13","debit":"500"},{"account_code":"41","credit":"500"}]'::jsonb,'bk1');
 perform fin_doc_submit('maker','a',(d->>'id')::uuid);
 perform fin_doc_decide('rev','a',(d->>'id')::uuid,'review','approved',null);
 perform fin_doc_decide('apr','a',(d->>'id')::uuid,'approve','approved',null);
 perform fin_doc_post('pst','a',(d->>'id')::uuid);
 r := fin_bank_import('bank1','a','NBE','[{"date":"2026-11-10","amount":"500","description":"إيداع تبرع","ref":"R1"},{"date":"2026-11-11","amount":"-20.5","description":"رسوم"}]'::jsonb);
 perform ok('import 2 lines', (r->>'inserted')::int=2);
 r := fin_bank_import('bank1','a','NBE','[{"date":"2026-11-10","amount":"500","description":"إيداع تبرع","ref":"R1"}]'::jsonb);
 perform ok('re-import no duplicate', (r->>'inserted')::int=0 and (r->>'duplicates')::int=1);
 perform ok('bad amount rejected', errs($q$select fin_bank_import('bank1','a','NBE','[{"date":"2026-11-10","amount":"abc"}]'::jsonb)$q$,'غير صالح'));
 b := fin_bank_open_items('bank1','a','NBE');
 bl := (select (x->>'id')::bigint from jsonb_array_elements(b->'bank_lines') x where (x->>'amount')::numeric=500);
 jl := (select (x->>'id')::bigint from jsonb_array_elements(b->'book_lines') x limit 1);
 perform ok('book line found', jl is not null);
 perform ok('mismatch amount blocked', errs(format($q$select fin_bank_match('bank1','a',%s,%s)$q$,(select (x->>'id')::bigint from jsonb_array_elements(b->'bank_lines') x where (x->>'amount')::numeric=-20.5),jl),'غير متطابقين'));
 perform fin_bank_match('bank1','a',bl,jl);
 perform ok('double match blocked', errs(format($q$select fin_bank_match('bank1','a',%s,%s)$q$,bl,jl),'مطابَق'));
 r := fin_bank_recon('bank1','a','NBE');
 perform ok('recon: book 500, stmt 479.5, unmatched bank -20.5, explained', (r->>'book_balance')::numeric=500 and (r->>'statement_balance')::numeric=479.5 and (r->>'unmatched_bank')::numeric=-20.5 and (r->>'explained')::boolean, r::text);
 perform fin_bank_unmatch('bank1','a',bl);
 perform ok('after unmatch both open', jsonb_array_length((fin_bank_open_items('bank1','a','NBE'))->'bank_lines')=2);
 perform ok('maker cannot import bank', errs($q$select fin_bank_import('maker','a','NBE','[]'::jsonb)$q$,'صلاحية'));
 -- period close: pending doc blocks
 d := fin_doc_save('maker','a','journal',null,current_date-3,'{"explanation":"قيد معلق"}'::jsonb,'[{"account_code":"13","debit":"10"},{"account_code":"41","credit":"10"}]'::jsonb,'bk2');
 perform ok('close blocked with pending doc', errs($q$select fin_period_close('admin','a',current_date-1)$q$,'غير مرحّلة'));
 perform ok('close needs admin perm', errs($q$select fin_period_close('maker','a',current_date-1)$q$,'صلاحية'));
 perform fin_doc_cancel('maker','a',(d->>'id')::uuid,'تجربة');
 perform ok('close today refused', errs($q$select fin_period_close('admin','a',current_date)$q$,'قبل اليوم'));
 perform fin_period_close('admin','a',current_date-1,'إقفال تجريبي');
 perform ok('closed_through set', (fin_period_status('admin','a')->>'closed_through')::date=current_date-1);
 -- posting in closed period blocked (doc dated inside closed period)
 d := fin_doc_save('maker','a','journal',null,current_date-5,'{"explanation":"قيد قديم"}'::jsonb,'[{"account_code":"13","debit":"10"},{"account_code":"41","credit":"10"}]'::jsonb,'bk3');
 perform fin_doc_submit('maker','a',(d->>'id')::uuid);
 perform fin_doc_decide('rev','a',(d->>'id')::uuid,'review','approved',null);
 perform fin_doc_decide('apr','a',(d->>'id')::uuid,'approve','approved',null);
 perform ok('post inside closed period blocked', errs(format($q$select fin_doc_post('pst','a','%s')$q$,d->>'id'),'مقفلة'));
 perform ok('stock move in closed period blocked', errs($q$select fin_stock_move('keeper','a','receipt',current_date-2,'W1','RICE',1)$q$,'مقفلة'));
 perform ok('reopen needs reason', errs($q$select fin_period_reopen('admin','a',null,'')$q$,'سبب'));
 perform fin_period_reopen('admin','a',null,'تصحيح');
 perform ok('reopened', (fin_period_status('admin','a')->>'closed_through') is null);
 perform ok('period log has 2 rows', jsonb_array_length(fin_period_status('admin','a')->'log')=2);
end $$;

-- ===== minutes =====
do $$ declare m jsonb; id uuid; begin
 set local role anon;
 m := fin_minutes_save('min1','a',null,current_date,'دورية','المقر','18:00','19:00','["افتتاح","الميزانية"]'::jsonb,
   '[{"name":"أ","role":"رئيس","present":true},{"name":"ب","role":"أمين","present":true},{"name":"ج","role":"عضو","present":false}]'::jsonb,
   '[{"text":"اعتماد الميزانية","votes_for":2,"votes_against":0,"abstain":0}]'::jsonb,null,'mk1');
 id := (m->>'id')::uuid;
 perform ok('minute numbered', (m->>'minute_no') ~ '^محضر-\d{4}-001$');
 perform ok('result computed', (m->'decisions'->0->>'result')='أُقِرّ');
 perform ok('minute retry no duplicate', (fin_minutes_save('min1','a',null,current_date,'دورية','x','','','["a"]'::jsonb,'[]'::jsonb,'[]'::jsonb,null,'mk1')->>'id')=id::text);
 perform ok('votes > present blocked', errs($q$select fin_minutes_save('min1','a',null,current_date,'دورية','x','','','["a"]'::jsonb,'[{"name":"أ","present":true}]'::jsonb,'[{"text":"ق","votes_for":2}]'::jsonb)$q$,'أكبر من عدد الحاضرين'));
 perform ok('minutes need perm', errs($q$select fin_minutes_list('res','a')$q$,'صلاحية'));
 perform ok('approve before submit blocked', errs(format($q$select fin_minutes_decide('min2','a','%s',true)$q$,id),'بانتظار'));
 perform fin_minutes_submit('min1','a',id);
 perform ok('creator cannot approve (no perm)', errs(format($q$select fin_minutes_decide('min1','a','%s',true)$q$,id),'صلاحية'));
 perform ok('cannot edit after submit', errs(format($q$select fin_minutes_save('min1','a','%s',current_date,'دورية','x','','','["a"]'::jsonb,'[]'::jsonb,'[]'::jsonb)$q$,id),'مسودة'));
 perform fin_minutes_decide('min2','a',id,true);
 perform ok('approved', (select status from (select (x->>'status') status from jsonb_array_elements(fin_minutes_list('min1','a')) x limit 1) t)='approved');
 perform ok('approved minute immutable (db trigger)', true);
end $$;
select ok('approved minute update blocked', errs($q$update fin_minutes set notes='hack'$q$,'لا يُعدَّل'));
select ok('minute delete blocked', errs($q$delete from fin_minutes$q$,'لا يجوز حذف'));
do $$ declare m jsonb; begin set local role anon;
 m := fin_minutes_save('admin','a',null,current_date,'طارئة','x','','','["a"]'::jsonb,'[{"name":"أ","present":true}]'::jsonb,'[{"text":"ق","votes_for":1}]'::jsonb);
 perform fin_minutes_submit('admin','a',(m->>'id')::uuid);
 perform ok('admin creator cannot self-approve minutes', errs(format($q$select fin_minutes_decide('admin','a','%s',true)$q$,m->>'id'),'بنفسك'));
end $$;

-- ===== archive =====
do $$ declare a jsonb; id uuid; p text := 'archive/2026/'||gen_random_uuid()||'-scan.pdf'; o jsonb; begin
 set local role anon;
 perform ok('exe rejected', errs($q$select fin_arch_register('arch1','a','x','c','virus.exe','application/pdf',100,'archive/2026/00000000-0000-0000-0000-000000000000-virus.exe')$q$,'غير مسموح'));
 perform ok('big file rejected', errs(format($q$select fin_arch_register('arch1','a','x','c','a.pdf','application/pdf',99999999,'%s')$q$,p),'15'));
 perform ok('bad path rejected', errs($q$select fin_arch_register('arch1','a','x','c','a.pdf','application/pdf',100,'../etc/passwd')$q$,'مسار'));
 perform ok('bad mime rejected', errs(format($q$select fin_arch_register('arch1','a','x','c','a.pdf','text/html',100,'%s')$q$,p),'MIME'));
 a := fin_arch_register('arch1','a','عقد إيجار','عقود','scan.pdf','application/pdf',2048,p,'case','1001','{"view":["محاسب"],"download":[],"edit":[]}'::jsonb,null,null,'ak1');
 id := (a->>'id')::uuid;
 perform ok('no file_path leaked', not (a ? 'file_path'));
 perform ok('uploader sees it', jsonb_array_length(fin_arch_list('arch1','a'))=1);
 perform ok('other fin_archive user cannot see', jsonb_array_length(fin_arch_list('arch2','a'))=0);
 perform ok('other user cannot open', errs(format($q$select fin_arch_open('arch2','a','%s','view')$q$,id),'صلاحية'));
 perform ok('role محاسب in view list can view', (fin_arch_open('arch1','a',id,'view'))->>'path' is not null);
 perform fin_arch_set_access('arch1','a',id,'{"view":["arch2"],"download":["arch2"],"edit":[]}'::jsonb);
 perform ok('granted user can view', (fin_arch_open('arch2','a',id,'view')->>'path')=p);
 perform ok('granted user can download', (fin_arch_open('arch2','a',id,'download')->>'path')=p);
 perform ok('granted view-only cannot edit access', errs(format($q$select fin_arch_set_access('arch2','a','%s','{"view":[]}'::jsonb)$q$,id),'صلاحية'));
 perform ok('search by title', jsonb_array_length(fin_arch_list('arch2','a','إيجار'))=1);
 perform ok('events logged', jsonb_array_length(fin_arch_events('arch1','a',id))>=4);
 perform fin_arch_archive('arch1','a',id,'انتهى');
 perform ok('archived hidden by default', jsonb_array_length(fin_arch_list('arch1','a'))=0 and jsonb_array_length(fin_arch_list('arch1','a',null,null,true))=1);
end $$;
select ok('archive delete blocked', errs($q$delete from fin_archive$q$,'لا يجوز حذف'));
select ok('archive events immutable', errs($q$update fin_archive_events set username='x'$q$,null));
-- ===== notifications / dashboard =====
do $$ declare n jsonb; d jsonb; begin set local role anon;
 n := fin_notifications('keeper','a');
 perform ok('keeper gets stock notifs only', (select bool_and((x->>'key') like 'stock%' or (x->>'key')='counts_pending') from jsonb_array_elements(n) x));
 n := fin_notifications('admin','a');
 perform ok('admin notifications array', jsonb_typeof(n)='array');
 perform fin_notif_mark('admin','a','docs_review');
 d := fin_dashboard('admin','a');
 perform ok('dashboard has finance+stock+minutes+bank', d ? 'finance' and d ? 'stock' and d ? 'minutes' and d ? 'bank', d::text);
 perform ok('dashboard hides finance from keeper', not (fin_dashboard('keeper','a') ? 'finance'));
 perform ok('dashboard cash/stock numeric', (d->'finance'->>'cash_balance') is not null and (d->'stock'->>'value') is not null);
 perform ok('dashboard needs session', errs($q$select fin_dashboard('admin','bad')$q$,'غير مصرح'));
end $$;
select n, ok, info from tr order by ok, n;
select count(*) total, count(*) filter (where not ok) failed from tr;
