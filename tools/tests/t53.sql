-- اختبارات قبول الإصدار 53 (تُشغَّل بعد stub + v51 + v52 + v53)
insert into staff_users values
 ('keeper','a','مسؤول مخازن',null),
 ('rep','a','مخصص','["fin_report"]'),
 ('buyer','a','مخصص','["fin_purchase"]'),
 ('buyap','a','مخصص','["fin_purchase_approve"]'),
 ('buyboth','a','مخصص','["fin_purchase","fin_purchase_approve"]'),
 ('pm','a','مخصص','["fin_project"]'),
 ('fam','a','مخصص','["fin_family"]'),
 ('nop','a','مخصص','[]') on conflict do nothing;
create table if not exists tr(n text, ok boolean, info text);
truncate tr;
create or replace function ok(n text, c boolean, i text default null) returns void language sql security definer as $$ insert into tr values(n, coalesce(c,false), i) $$;
create or replace function errs(q text, pat text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return (pat is null or sqlerrm like '%'||pat||'%'); end $$;
create or replace function pj(lines jsonb, d date) returns void language plpgsql as $$
declare x jsonb; id uuid;
begin
  x := fin_doc_save('maker','a','journal',null,d,'{"explanation":"قيد اختبار 53"}'::jsonb,lines);
  id := (x->>'id')::uuid;
  perform fin_doc_submit('maker','a',id);
  perform fin_doc_decide('rev','a',id,'review','approved',null);
  perform fin_doc_decide('apr','a',id,'approve','approved',null);
  perform fin_doc_post('pst','a',id);
end $$;

do $$ declare j jsonb; k jsonb; k2 jsonb; p jsonb; pid uuid; poid uuid; po2 uuid; r jsonb; rep jsonb; bs jsonb; cf jsonb; is_ jsonb; n int; pay jsonb; pp jsonb; d date := date '2026-01-31'; begin
 -- حسابات
 perform fin_account_save('admin','a','1','الأصول','asset',null,true); perform fin_account_save('admin','a','11','الخزينة','asset','1',true); perform fin_account_save('admin','a','12','البنك','asset','1',true);
 perform fin_account_save('admin','a','2','الخصوم','liability',null,true); perform fin_account_save('admin','a','21','موردون','liability','2',true);
 perform fin_account_save('admin','a','3','حقوق الملكية','equity',null,true); perform fin_account_save('admin','a','31','رصيد افتتاحي','equity','3',true);
 perform fin_account_save('admin','a','4','الإيرادات','revenue',null,true); perform fin_account_save('admin','a','41','التبرعات','revenue','4',true);
 perform fin_account_save('admin','a','5','المصروفات','expense',null,true); perform fin_account_save('admin','a','51','مساعدات','expense','5',true);
 -- مشروع (ينشئ مركز تكلفة بنفس الكود)
 j := fin_project_save('pm','a',null,'PRJ1','مشروع الإطعام','غذائي','إطعام','أسر',date '2026-01-01',date '2026-12-31',1000,'تبرعات','أ. محمد','[{"name":"شراء","pct":50},{"name":"توزيع","pct":0}]'::jsonb,null,'pk1');
 pid := (j->>'id')::uuid;
 perform ok('project created + cost center auto', j->>'code'='PRJ1' and exists(select 1 from fin_cost_centers where code='PRJ1'));
 perform ok('project client_key idempotent', (fin_project_save('pm','a',null,'PRJ1','x','','','',null,null,0,'','',null,null,'pk1')->>'id')::uuid = pid);
 perform ok('project duplicate code rejected', errs($q$select fin_project_save('pm','a',null,'PRJ1','y','','','',null,null,0,'','',null,null,null)$q$,'مستخدم'));
 perform ok('project pct>100 rejected', errs($q$select fin_project_save('pm','a',null,'PRJ9','y','','','',null,null,0,'','','[{"name":"a","pct":150}]'::jsonb,null,null)$q$,'0 و100'));
 perform ok('project negative budget rejected', errs($q$select fin_project_save('pm','a',null,'PRJ9','y','','','',null,null,-1,'','',null,null,null)$q$,'سالبة'));
 perform ok('project needs permission', errs($q$select fin_projects_list('nop','a')$q$,'صلاحية'));

 -- قيود
 perform pj('[{"account_code":"11","debit":"1000"},{"account_code":"31","credit":"1000"}]'::jsonb, date '2026-01-05');
 perform pj('[{"account_code":"11","debit":"500"},{"account_code":"41","credit":"500","cost_center":"PRJ1"}]'::jsonb, date '2026-01-10');
 perform pj('[{"account_code":"51","debit":"200","cost_center":"PRJ1"},{"account_code":"11","credit":"200"}]'::jsonb, date '2026-01-15');
 perform pj('[{"account_code":"12","debit":"300"},{"account_code":"11","credit":"300"}]'::jsonb, date '2026-01-20');
 perform pj('[{"account_code":"51","debit":"100"},{"account_code":"21","credit":"100"}]'::jsonb, date '2026-01-25');

 -- القوائم
 perform ok('cashflow without cash accounts -> error', errs($q$select fin_cash_flow('rep','a',date '2026-01-01',date '2026-01-31')$q$,'حدّد حسابات النقدية'));
 perform ok('account_cash needs admin perm', errs($q$select fin_account_cash('rep','a','11',true)$q$,'صلاحية'));
 perform ok('cash accounts list', jsonb_array_length(fin_cash_accounts_list('rep','a'))=3); perform fin_account_cash('admin','a','11',true); perform fin_account_cash('admin','a','12',true);
 perform ok('account_cash only asset', errs($q$select fin_account_cash('admin','a','41',true)$q$,'الأصول'));
 is_ := fin_income_statement('rep','a',date '2026-01-01',d);
 perform ok('income: rev 500 exp 300 surplus 200', (is_->>'total_revenue')::numeric=500 and (is_->>'total_expense')::numeric=300 and (is_->>'surplus')::numeric=200, is_::text);
 perform ok('income by cost center PRJ1: rev 500 exp 200', (fin_income_statement('rep','a',date '2026-01-01',d,'PRJ1')->>'total_expense')::numeric=200 and (fin_income_statement('rep','a',date '2026-01-01',d,'PRJ1')->>'total_revenue')::numeric=500);
 perform ok('income period filter excludes (before 01-12 => rev 0)', (fin_income_statement('rep','a',date '2026-01-01',date '2026-01-04')->>'total_revenue')::numeric=0);
 perform ok('income bad period rejected', errs($q$select fin_income_statement('rep','a',date '2026-02-01',date '2026-01-01')$q$,'فترة'));
 perform ok('unknown cost center rejected', errs($q$select fin_income_statement('rep','a',date '2026-01-01',date '2026-01-31','NOPE')$q$,'غير موجود'));
 bs := fin_balance_sheet('rep','a',d);
 perform ok('balance sheet: assets 1300 = liab 100 + equity 1200', (bs->>'total_assets')::numeric=1300 and (bs->>'total_liabilities')::numeric=100 and (bs->>'total_equity')::numeric=1200 and (bs->>'balanced')::boolean, bs::text);
 perform ok('balance sheet as-of earlier date balanced (01-10: 1500 = 1000+500)', (fin_balance_sheet('rep','a',date '2026-01-10')->>'balanced')::boolean and (fin_balance_sheet('rep','a',date '2026-01-10')->>'total_assets')::numeric=1500);
 cf := fin_cash_flow('rep','a',date '2026-01-01',d);
 perform ok('cashflow: opening 0 closing 1300 net 1300', (cf->>'opening')::numeric=0 and (cf->>'closing')::numeric=1300 and (cf->>'net_change')::numeric=1300, cf::text);
 perform ok('cashflow rows reconcile with net change', (cf->>'rows_net')::numeric=(cf->>'net_change')::numeric, cf::text);
 perform ok('cashflow internal transfer (cash->bank) excluded', not exists(select 1 from jsonb_array_elements(cf->'rows') x where (x->>'inflow')::numeric=300));
 perform ok('cashflow second period opening = prior closing', (fin_cash_flow('rep','a',date '2026-02-01',date '2026-02-28')->>'opening')::numeric=1300);
 perform ok('statements blocked without fin_report', errs($q$select fin_balance_sheet('buyer','a',null)$q$,'صلاحية') and errs($q$select fin_cash_flow('nop','a',date '2026-01-01',date '2026-01-31')$q$,'صلاحية'));
 perform ok('legacy محاسب has fin_report', fin_balance_sheet('acc1','a',d) is not null);
 perform ok('draft/unposted entries ignored', (select count(*) from fin_journal_entries where status='draft')=0);
 -- مخزن + مشتريات
 perform fin_wh_save('keeper','a','W1','الرئيسي','أمين'); perform fin_item_save('keeper','a','RICE','أرز','كيس','غذاء',5);
 j := fin_supplier_save('buyer','a','S1','مورد الأرز','0100','القاهرة',true);
 perform ok('supplier saved', j->>'code'='S1');
 perform ok('supplier needs perm', errs($q$select fin_supplier_save('nop','a','S2','x')$q$,'صلاحية'));
 perform ok('PO empty lines rejected', errs($q$select fin_purchase_save('buyer','a',null,'S1',null,null,'[]'::jsonb)$q$,'بندًا'));
 perform ok('PO bad qty rejected', errs($q$select fin_purchase_save('buyer','a',null,'S1',null,null,'[{"desc":"x","qty":"-1","unit_price":"5"}]'::jsonb)$q$,'الكمية'));
 perform ok('PO unknown item rejected', errs($q$select fin_purchase_save('buyer','a',null,'S1',null,null,'[{"item_code":"ZZ","desc":"x","qty":"1","unit_price":"5"}]'::jsonb)$q$,'الصنف غير موجود'));
 perform ok('PO unknown project rejected', errs($q$select fin_purchase_save('buyer','a',null,'S1',null,'NOPE','[{"desc":"x","qty":"1","unit_price":"5"}]'::jsonb)$q$,'المشروع'));
 j := fin_purchase_save('buyboth','a',null,'S1',date '2026-02-01','PRJ1','[{"item_code":"RICE","desc":"أرز","qty":"40","unit_price":"25.50"},{"desc":"نقل","qty":"1","unit_price":"100"}]'::jsonb,'ملاحظة','po-ck1');
 poid := (j->>'id')::uuid;
 perform ok('PO total = 40*25.5+100 = 1120', (j->>'total')::numeric=1120 and j->>'po_no' like 'شراء-2026-%', j::text);
 perform ok('PO client_key idempotent', (fin_purchase_save('buyboth','a',null,'S1',date '2026-02-01','PRJ1','[{"desc":"x","qty":"1","unit_price":"1"}]'::jsonb,null,'po-ck1')->>'id')::uuid=poid);
 perform ok('PO edit in draft ok', (fin_purchase_save('buyboth','a',poid,'S1',date '2026-02-01','PRJ1','[{"item_code":"RICE","desc":"أرز","qty":"40","unit_price":"25.50"},{"desc":"نقل","qty":"1","unit_price":"100"}]'::jsonb,'ملاحظة 2')->>'total')::numeric=1120);
 perform ok('cannot approve draft', errs(format($q$select fin_purchase_decide('buyap','a','%s',true)$q$,poid),'ليس بانتظار'));
 perform ok('cannot order draft', errs(format($q$select fin_purchase_order('buyer','a','%s')$q$,poid),'حالة'));
 perform fin_purchase_submit('buyboth','a',poid);
 perform ok('cannot edit after submit', errs(format($q$select fin_purchase_save('buyboth','a','%s','S1',null,null,'[{"desc":"x","qty":"1","unit_price":"1"}]'::jsonb)$q$,poid),'المسودة'));
 perform ok('creator cannot approve own PO', errs(format($q$select fin_purchase_decide('buyboth','a','%s',true)$q$,poid),'أنشأته بنفسك'));
 perform ok('buyer without approve perm blocked', errs(format($q$select fin_purchase_decide('buyer','a','%s',true)$q$,poid),'صلاحية'));
 perform ok('reject needs reason', errs(format($q$select fin_purchase_decide('buyap','a','%s',false)$q$,poid),'سبب'));
 j := fin_purchase_decide('buyap','a',poid,false,'السعر مرتفع');
 perform ok('reject returns to draft with note', j->>'status'='draft' and (j->>'notes') like '%السعر مرتفع%');
 perform fin_purchase_submit('buyboth','a',poid); j := fin_purchase_decide('buyap','a',poid,true);
 perform ok('approved', j->>'status'='approved' and j->>'approved_by'='buyap');
 perform ok('cannot receive before ordered', errs(format($q$select fin_purchase_receive('keeper','a','%s','W1')$q$,poid),'حالة'));
 perform fin_purchase_order('buyer','a',poid);
 perform ok('receive needs stock perm', errs(format($q$select fin_purchase_receive('buyer','a','%s','W1')$q$,poid),'صلاحية'));
 perform ok('receive needs active warehouse', errs(format($q$select fin_purchase_receive('keeper','a','%s','NOPE')$q$,poid),'مخزنًا'));
 j := fin_purchase_receive('keeper','a',poid,'W1',current_date);
 perform ok('receive -> status received, 1 stock line', j->>'status'='received' and (j->>'stock_lines')::int=1, j::text);
 perform ok('stock balance W1 RICE = 40', (select (x->>'qty')::numeric from jsonb_array_elements(fin_stock_balances('keeper','a','W1')) x where x->>'item'='RICE')=40);
 perform ok('stock receipt carries project + cost 25.5', exists(select 1 from fin_stock_moves where ref like 'شراء-%' and project_code='PRJ1' and unit_cost=25.50 and qty=40));
 perform ok('receive twice blocked (stock once)', errs(format($q$select fin_purchase_receive('keeper','a','%s','W1')$q$,poid),'حالة') and (select sum(qty) from fin_stock_moves where kind='receipt')=40);
 perform ok('cancel after receive blocked', errs(format($q$select fin_purchase_cancel('buyer','a','%s','x')$q$,poid),'بعد الاستلام'));
 perform ok('invoice amount mismatch needs reason', errs(format($q$select fin_purchase_invoice('buyer','a','%s','INV-1',null,1000,null)$q$,poid),'يختلف'));
 perform ok('invoice needs number', errs(format($q$select fin_purchase_invoice('buyer','a','%s','',null,1120,null)$q$,poid),'رقم الفاتورة'));
 perform ok('pay before invoice blocked', errs(format($q$select fin_purchase_pay('acc1','a','%s')$q$,poid),'سجّل فاتورة'));
 j := fin_purchase_invoice('buyer','a',poid,'INV-1',date '2026-02-03',1000,'خصم كمية');
 perform ok('invoice with reason accepted', j->>'status'='invoiced' and (j->>'invoice_amount')::numeric=1000);
 j := fin_purchase_save('buyboth','a',null,'S1',date '2026-02-05',null,'[{"desc":"خدمة","qty":"1","unit_price":"50"}]'::jsonb); po2 := (j->>'id')::uuid;
 perform fin_purchase_submit('buyboth','a',po2); perform fin_purchase_decide('buyap','a',po2,true); perform fin_purchase_order('buyer','a',po2); perform fin_purchase_receive('keeper','a',po2,'W1');
 perform ok('service-only PO receive adds no stock lines', (select count(*) from fin_stock_moves where ref=(select po_no from fin_purchases where id=po2))=0);
 perform ok('duplicate supplier invoice number blocked', errs(format($q$select fin_purchase_invoice('buyer','a','%s','inv-1',null,50,null)$q$,po2),'مسجّلة من قبل'));
 perform ok('pay needs settle perm too', errs(format($q$select fin_purchase_pay('buyer','a','%s')$q$,poid),'صلاحية'));
 pay := fin_purchase_pay('acc1','a',poid);
 perform ok('pay creates draft cash_out doc 1000 (not posted)', exists(select 1 from fin_documents d where d.id=(pay->>'doc_id')::uuid and d.status='draft' and d.amount=1000 and d.doc_type='cash_out') and pay->'purchase'->>'status'='payment_requested', pay::text);
 perform ok('pay twice blocked', errs(format($q$select fin_purchase_pay('acc1','a','%s')$q$,poid),'سجّل فاتورة'));
 perform ok('no cash move until doc posted', not exists(select 1 from fin_cash_moves where doc_id=(pay->>'doc_id')::uuid));
 -- إلغاء
 j := fin_purchase_save('buyer','a',null,'S1',null,null,'[{"desc":"x","qty":"1","unit_price":"9"}]'::jsonb); 
 perform ok('cancel needs reason', errs(format($q$select fin_purchase_cancel('buyer','a','%s','')$q$,(j->>'id')::uuid),'سبب'));
 perform ok('cancel draft ok', fin_purchase_cancel('buyer','a',(j->>'id')::uuid,'لا حاجة')->>'status'='cancelled');
 perform ok('cancelled cannot be edited', errs(format($q$select fin_purchase_submit('buyer','a','%s')$q$,(j->>'id')::uuid),'حالة'));
 perform ok('PO list search by supplier', jsonb_array_length(fin_purchase_list('buyer','a','مورد الأرز',null))>=3);
 perform ok('PO list status filter', jsonb_array_length(fin_purchase_list('buyer','a',null,'cancelled'))=1);
 perform ok('PO list shows pay doc no', (select x->>'pay_doc_no' from jsonb_array_elements(fin_purchase_list('buyer','a','INV-1',null)) x limit 1) is not null);
 perform ok('PO list needs perm', errs($q$select fin_purchase_list('nop','a')$q$,'صلاحية'));

 -- مخزن: صرف لأسرة ومشروع + توافق التوقيع القديم
 perform ok('old 15-arg stock_move still works', (fin_stock_move('keeper','a','receipt',current_date,'W1','RICE',10,20,null,null,null,null,null,null,'old-ck')->>'move_no') is not null);
 perform fin_stock_move('keeper','a','issue',current_date,'W1','RICE',5,0,null,null,'توزيع',null,null,null,'is-1','PRJ1','C-77');
 perform ok('issue stores project+case', exists(select 1 from fin_stock_moves where kind='issue' and project_code='PRJ1' and case_ref='C-77' and qty=5));
 perform ok('issue over balance still blocked', errs($q$select fin_stock_move('keeper','a','issue',current_date,'W1','RICE',9999)$q$,'أكبر من الرصيد'));

 -- ملف المشروع
 perform fin_project_member('pm','a',pid,'C-77',true,'مستفيد');
 perform fin_project_member('pm','a',pid,'C-88',true,null);
 perform fin_project_member('pm','a',pid,'C-88',false,null);
 r := fin_project_report('pm','a',pid);
 perform ok('project report: budget 1000, expense 200, revenue 500, remaining 800', (r->>'budget')::numeric=1000 and (r->>'total_expense')::numeric=200 and (r->>'total_revenue')::numeric=500 and (r->>'remaining')::numeric=800 and (r->>'budget_pct')::numeric=20.0, r::text);
 perform ok('project report: PO received 1120 linked', (r->>'purchases_received')::numeric=1120 and jsonb_array_length(r->'purchases')=1);
 perform ok('project report: stock issued 5 bags valued', (r->'stock_issued'->0->>'qty')::numeric=5 and (r->>'stock_value')::numeric>0, r::text);
 perform ok('project report: beneficiaries = 1 (ended one excluded)', (r->>'beneficiaries_count')::int=1 and r->'beneficiaries'->0->>'case_ref'='C-77');
 perform ok('project progress = avg activities 25', (r->>'progress')::numeric=25);
 perform ok('projects list has progress', (fin_projects_list('pm','a')->0->>'progress')::numeric=25);
 perform ok('project report needs perm', errs(format($q$select fin_project_report('buyer','a','%s')$q$,pid),'صلاحية'));
 j := fin_project_save('pm','a',pid,null,'مشروع الإطعام (معدل)','غذائي','','',null,null,1500,'','',null,null,null);
 perform ok('project edit budget', (j->>'budget')::numeric=1500);
 perform ok('close needs reason', errs(format($q$select fin_project_set_status('pm','a','%s','closed','')$q$,pid),'السبب'));
 perform fin_project_set_status('pm','a',pid,'closed','انتهى');
 perform ok('closed project cannot be edited', errs(format($q$select fin_project_save('pm','a','%s',null,'x','','','',null,null,1,'','',null,null,null)$q$,pid),'مغلق'));
 perform ok('closed project: no new beneficiary', errs(format($q$select fin_project_member('pm','a','%s','C-99',true)$q$,pid),'غير نشط'));
 perform ok('closed project: no new PO', errs($q$select fin_purchase_save('buyer','a',null,'S1',null,'PRJ1','[{"desc":"x","qty":"1","unit_price":"1"}]'::jsonb)$q$,'غير نشط'));
 perform fin_project_set_status('pm','a',pid,'active','إعادة فتح');
 perform ok('reopen then edit ok', fin_project_save('pm','a',pid,null,'مشروع الإطعام','غذائي','','',null,null,1500,'','',null,null,null) is not null);

 -- ملف الأسرة
 perform ok('family needs perm', errs($q$select fin_family_file('nop','a','C-77')$q$,'صلاحية') and errs($q$select fin_family_status_set('buyer','a','C-77','active','x')$q$,'صلاحية'));
 perform fin_family_event_add('fam','a','C-77','visit','زيارة ميدانية — الحالة مستقرة','ev-1');
 perform ok('family event idempotent', (select count(*) from fin_family_events where client_key='ev-1')=1 and (fin_family_event_add('fam','a','C-77','visit','زيارة','ev-1')->>'text') like 'زيارة ميدانية%');
 perform ok('family status needs reason', errs($q$select fin_family_status_set('fam','a','C-77','suspended','')$q$,'سبب'));
 perform ok('family bad status rejected', errs($q$select fin_family_status_set('fam','a','C-77','zzz','x')$q$,'حالة'));
 perform fin_family_status_set('fam','a','C-77','under_review','مراجعة بيانات الدخل');
 r := fin_family_file('fam','a','C-77');
 perform ok('family file: status+events(2)+project+in-kind aid', r->'status'->>'status'='under_review' and jsonb_array_length(r->'events')=2 and jsonb_array_length(r->'projects')=1 and (r->'in_kind_aid'->0->>'qty')::numeric=5, r::text);
 perform ok('family file other case is empty', jsonb_array_length(fin_family_file('fam','a','C-00')->'in_kind_aid')=0 and fin_family_file('fam','a','C-00')->'status' = 'null'::jsonb);

 -- أمان الجداول
 set local role anon;
 perform ok('anon can call new RPCs (grants)', fin_income_statement('rep','a',date '2026-01-01',d) is not null and fin_purchase_list('buyer','a') is not null and fin_projects_list('pm','a') is not null and fin_family_file('fam','a','C-77') is not null and fin_balance_sheet('rep','a',null) is not null and fin_suppliers_list('buyer','a') is not null);
 perform ok('anon 17-arg stock_move grant', (fin_stock_move('keeper','a','receipt',current_date,'W1','RICE',1,1,null,null,null,null,null,null,'anon-ck','PRJ1',null)->>'move_no') is not null);
 perform ok('anon cannot read purchases', errs($q$select * from fin_purchases$q$,'permission'));
 perform ok('anon cannot read projects / family tables', errs($q$select * from fin_projects$q$,'permission') and errs($q$select * from fin_family_events$q$,'permission') and errs($q$select * from fin_suppliers$q$,'permission'));
 perform ok('anon cannot call internal helper', errs($q$select _fin_po_json(null)$q$,'permission'));
 reset role;
 perform ok('family events immutable', errs($q$update fin_family_events set text='x'$q$,'تعديل') or errs($q$update fin_family_events set text='x'$q$,null));
 perform ok('family events not deletable', errs($q$delete from fin_family_events$q$,null));
 perform ok('purchases not deletable', errs($q$delete from fin_purchases$q$,'لا يجوز حذف'));
 perform ok('projects not deletable', errs($q$delete from fin_projects$q$,'لا يجوز حذف'));
 perform ok('stock moves still immutable', errs($q$update fin_stock_moves set qty=1$q$,null));
end $$;
select n, ok, info from tr where not ok order by n;
select count(*) total, count(*) filter (where not ok) failed from tr;
