create table public.t_res(n int, name text, ok boolean, info text);
grant all on public.t_res to anon;
create or replace function public.t_ok(n int, name text, c boolean, info text default null) returns void language plpgsql security definer as $$ begin insert into t_res values(n,name,coalesce(c,false),info); end $$;
create or replace function public.t_fails(n int, name text, q text, frag text) returns void language plpgsql security definer as $$
declare m text; begin
  begin execute q; insert into t_res values(n,name,false,'no error raised');
  exception when others then get stacked diagnostics m = message_text; insert into t_res values(n,name, position(frag in m)>0, m); end;
end $$;
grant execute on function public.t_ok(int,text,boolean,text), public.t_fails(int,text,text,text) to anon;
set role anon;
do $$
declare d jsonb; id1 uuid; id2 uuid; id3 uuid; cnt int; tb jsonb; aid uuid; cid uuid; sid uuid; adv jsonb; x jsonb;
begin
 begin perform 1 from public.fin_documents limit 1; perform t_ok(0,'anon cannot read fin_documents',false); exception when insufficient_privilege then perform t_ok(0,'anon cannot read fin_documents',true); end;
 begin insert into public.fin_audit(username,action) values('x','y'); perform t_ok(0,'anon cannot write fin_audit',false); exception when insufficient_privilege then perform t_ok(0,'anon cannot write fin_audit',true); end;
 perform t_fails(1,'wrong password rejected',$q$select fin_accounts_list('admin','bad')$q$,'غير مصرح');
 perform t_fails(2,'user without permission blocked',$q$select fin_accounts_list('res','a')$q$,'صلاحية');
 perform fin_account_save('admin','a','1','الأصول','asset',null,true);
 perform fin_account_save('admin','a','11','الخزينة','asset','1',true);
 perform fin_account_save('admin','a','4','الإيرادات','revenue',null,true);
 perform fin_account_save('admin','a','41','التبرعات النقدية','revenue','4',true);
 perform fin_account_save('admin','a','5','المصروفات','expense',null,true);
 perform fin_account_save('admin','a','51','مساعدات نقدية','expense','5',true);
 perform fin_cc_save('admin','a','P1','مشروع كفالة',true);
 perform t_fails(3,'maker cannot manage accounts',$q$select fin_account_save('maker','a','99','x','asset',null,true)$q$,'صلاحية');
 -- journal
 d := fin_doc_save('maker','a','journal',null,current_date,'{"explanation":"قيد اختبار"}'::jsonb,'[{"account_code":"11","debit":"100"},{"account_code":"41","credit":"90"}]'::jsonb,'k-j1');
 id1 := (d->>'id')::uuid;
 perform t_ok(4,'doc number format قيد-YYYY-0001',d->>'doc_no' like 'قيد-%-0001',d->>'doc_no');
 perform t_fails(5,'unbalanced entry blocked at submit',format($q$select fin_doc_submit('maker','a','%s')$q$,id1),'غير متوازن');
 d := fin_doc_save('maker','a','journal',null,current_date,'{"explanation":"قيد اختبار"}'::jsonb,'[]'::jsonb,'k-j1');
 perform t_ok(6,'same client_key returns same doc (no duplicate)',(d->>'id')::uuid=id1,d->>'doc_no');
 perform t_fails(7,'account must exist',format($q$select fin_doc_save('maker','a','journal','%s',current_date,'{"explanation":"x"}'::jsonb,'[{"account_code":"zzz","debit":"5"},{"account_code":"41","credit":"5"}]'::jsonb)$q$,id1),'الحساب غير موجود');
 perform t_fails(8,'invalid amount text rejected',format($q$select fin_doc_save('maker','a','journal','%s',current_date,'{"explanation":"x"}'::jsonb,'[{"account_code":"11","debit":"1e3"},{"account_code":"41","credit":"5"}]'::jsonb)$q$,id1),'المبلغ غير صالح');
 d := fin_doc_save('maker','a','journal',id1,current_date,'{"explanation":"قيد اختبار متوازن"}'::jsonb,'[{"account_code":"11","debit":"100","cost_center":"P1"},{"account_code":"41","credit":"60"},{"account_code":"41","credit":"40"}]'::jsonb);
 d := fin_doc_submit('maker','a',id1);
 perform t_ok(9,'multi-line balanced entry submitted',d->>'status'='review',d->>'status');

 EXCEPTION WHEN others THEN perform t_ok(-1,'script error t1',false,SQLERRM);
end $$;
select n,name,ok,info from public.t_res order by n;
