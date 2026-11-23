set role anon;
do $$
declare d jsonb; id1 uuid; idr uuid; ida uuid; idc uuid; idar uuid; idas uuid; tb jsonb; lg jsonb; adv jsonb; aid uuid; cd jsonb; x jsonb; cnt int; bal numeric;
begin
 select (e->>'id')::uuid into id1 from jsonb_array_elements(fin_doc_list('admin','a','journal',null,null,50)) e limit 1;
 perform t_fails(10,'maker (no review perm) cannot review',format($q$select fin_doc_decide('maker','a','%s','review','approved',null)$q$,id1),'صلاحية');
 -- separation: rev creates and tries to review own
 d := fin_doc_save('rev','a','journal',null,current_date,'{"explanation":"قيد rev"}'::jsonb,'[{"account_code":"11","debit":"5"},{"account_code":"41","credit":"5"}]'::jsonb,'k-j2'); idr := (d->>'id')::uuid;
 perform fin_doc_submit('rev','a',idr);
 perform t_fails(11,'creator cannot review own doc (separation)',format($q$select fin_doc_decide('rev','a','%s','review','approved',null)$q$,idr),'الفصل');
 perform t_fails(12,'cannot approve before review',format($q$select fin_doc_decide('apr','a','%s','approve','approved',null)$q$,id1),'لم تتم مراجعته');
 perform t_fails(13,'rejection needs reason',format($q$select fin_doc_decide('rev','a','%s','review','rejected','')$q$,id1),'سبب الرفض');
 perform fin_doc_decide('rev','a',id1,'review','approved','ok');
 perform t_fails(14,'cannot post unapproved doc',format($q$select fin_doc_post('pst','a','%s')$q$,id1),'معتمد');
 perform fin_doc_decide('apr','a',id1,'approve','approved','ok');
 perform t_fails(15,'poster without perm blocked',format($q$select fin_doc_post('apr','a','%s')$q$,id1),'صلاحية');
 d := fin_doc_post('pst','a',id1);
 perform t_ok(16,'entry posted',d->>'entry_status'='posted',d->>'entry_status');
 perform t_fails(17,'posted doc not editable',format($q$select fin_doc_save('maker','a','journal','%s',current_date,'{"explanation":"x"}'::jsonb,'[]'::jsonb)$q$,id1),'المسودة');
 perform t_fails(18,'double post blocked',format($q$select fin_doc_post('pst','a','%s')$q$,id1),'معتمد');
 tb := fin_trial_balance('acc1','a',null,null);
 perform t_ok(19,'trial balance totals equal',(select sum((e->>'debit')::numeric)=sum((e->>'credit')::numeric) and sum((e->>'debit')::numeric)=100 from jsonb_array_elements(tb) e),tb::text);
 lg := fin_ledger('acc1','a','41',null,null);
 perform t_ok(20,'ledger of 41 has 2 credit lines total 100',(select count(*)=2 and sum((e->>'credit')::numeric)=100 from jsonb_array_elements(lg) e),lg::text);
 -- reversal
 d := fin_doc_reverse('admin','a',id1,'اختبار العكس');
 tb := fin_trial_balance('acc1','a',null,null);
 perform t_ok(21,'after reversal trial balance nets to zero',(select sum((e->>'balance')::numeric)=0 and bool_and((e->>'balance')::numeric=0) from jsonb_array_elements(tb) e),tb::text);
 perform t_fails(22,'reverse only once',format($q$select fin_doc_reverse('admin','a','%s','تاني')$q$,id1),'');
 -- cash
 d := fin_doc_save('maker','a','cash_out',null,current_date,'{"amount":"500","beneficiary":"محمد","reason":"مساعدة"}'::jsonb,null,'k-c1'); idc := (d->>'id')::uuid;
 perform fin_doc_submit('maker','a',idc); perform fin_doc_decide('rev','a',idc,'review','approved'); perform fin_doc_decide('apr','a',idc,'approve','approved');
 perform t_fails(23,'cash_out blocked when treasury empty',format($q$select fin_doc_post('pst','a','%s')$q$,idc),'لا يكفي');
 perform fin_cash_opening('admin','a',current_date,1000);
 perform t_fails(24,'opening balance only once',$q$select fin_cash_opening('admin','a',current_date,5)$q$,'مُدخل');
 perform fin_doc_post('pst','a',idc);
 cd := fin_cash_day('acc1','a',current_date);
 perform t_ok(25,'cash day: opening move 1000 in, 500 out, balance 500',(cd->>'book_balance')::numeric=500 and (cd->>'payments')::numeric=500,cd::text);
 -- advance
 d := fin_doc_save('maker','a','advance_req',null,current_date,'{"amount":"300","requester":"أحمد","purpose":"شراء","settle_due":"2026-12-31"}'::jsonb,null,'k-a1'); idar := (d->>'id')::uuid;
 perform t_fails(26,'advance requires pledge',format($q$select fin_doc_submit('maker','a','%s')$q$,idar),'التعهد');
 d := fin_doc_save('maker','a','advance_req',idar,current_date,'{"amount":"300","requester":"أحمد","purpose":"شراء","settle_due":"2026-12-31","pledge":"true"}'::jsonb);
 perform fin_doc_submit('maker','a',idar); perform fin_doc_decide('rev','a',idar,'review','approved'); perform fin_doc_decide('apr','a',idar,'approve','approved'); perform fin_doc_post('pst','a',idar);
 adv := fin_advances_list('acc1','a','open'); aid := (adv->0->>'id')::uuid;
 perform t_ok(27,'advance record opened',jsonb_array_length(adv)=1 and (adv->0->>'amount')::numeric=300,adv::text);
 perform t_fails(28,'cannot settle before cash disbursed',format($q$select fin_doc_save('maker','a','advance_settle',null,current_date,'{"advance_id":"%s","expenses":[{"amount":"100"}]}'::jsonb)$q$,aid),'لم يُصرف');
 perform t_fails(29,'cash_out for advance must equal advance amount',format($q$select fin_doc_save('maker','a','cash_out',null,current_date,'{"amount":"250","beneficiary":"أحمد","reason":"سلفة","advance_id":"%s"}'::jsonb)$q$,aid),'يجب أن يساوي');
 d := fin_doc_save('maker','a','cash_out',null,current_date,format('{"amount":"300","beneficiary":"أحمد","reason":"سلفة","advance_id":"%s"}',aid)::jsonb); idc := (d->>'id')::uuid;
 perform fin_doc_submit('maker','a',idc); perform fin_doc_decide('rev','a',idc,'review','approved'); perform fin_doc_decide('apr','a',idc,'approve','approved'); perform fin_doc_post('pst','a',idc);
 perform t_fails(30,'settlement spent > advance blocked',format($q$select fin_doc_save('maker','a','advance_settle',null,current_date,'{"advance_id":"%s","expenses":[{"amount":"400"}]}'::jsonb)$q$,aid),'تتجاوز');
 d := fin_doc_save('maker','a','advance_settle',null,current_date,format('{"advance_id":"%s","expenses":[{"amount":"180","desc":"أدوات"},{"amount":"20","accepted":false}]}',aid)::jsonb); idas := (d->>'id')::uuid;
 perform t_ok(31,'settlement computed: spent 180 returned 120',(d->'payload'->>'spent')::numeric=180 and (d->'payload'->>'returned')::numeric=120,(d->'payload')::text);
 perform fin_doc_submit('maker','a',idas); perform fin_doc_decide('rev','a',idas,'review','approved'); perform fin_doc_decide('apr','a',idas,'approve','approved'); perform fin_doc_post('pst','a',idas);
 cd := fin_cash_day('acc1','a',current_date);
 perform t_ok(32,'treasury after: 1000-500-300+120=320',(cd->>'book_balance')::numeric=320,cd::text);
 perform t_ok(33,'advance closed',(select (fin_advances_list('acc1','a','settled'))->0->>'status')='settled');
 perform t_fails(34,'closed advance cannot be settled again',format($q$select fin_doc_save('maker','a','advance_settle',null,current_date,'{"advance_id":"%s","expenses":[{"amount":"1"}]}'::jsonb)$q$,aid),'مسواة');
 -- numbering uniqueness
 perform t_ok(35,'doc numbers unique & sequential per type',(select count(distinct e->>'doc_no')=count(*) from jsonb_array_elements(fin_doc_list('admin','a',null,null,null,500)) e));
 perform t_ok(36,'audit trail has entries',jsonb_array_length(fin_audit_list('admin','a',500))>20);
 EXCEPTION WHEN others THEN perform t_ok(-1,'script error',false,SQLERRM);
end $$;
reset role;
-- immutability as superuser (triggers apply to everyone)
do $$ begin
  begin update fin_journal_entries set description='hack' where status='reversed'; perform t_ok(40,'reversed entry update blocked',false); exception when others then perform t_ok(40,'reversed entry update blocked',true,sqlerrm); end;
  begin delete from fin_journal_lines; perform t_ok(41,'lines delete blocked',false); exception when others then perform t_ok(41,'lines delete blocked',true,sqlerrm); end;
  begin delete from fin_documents; perform t_ok(42,'docs delete blocked',false); exception when others then perform t_ok(42,'docs delete blocked',true,sqlerrm); end;
  begin update fin_audit set action='x'; perform t_ok(43,'audit update blocked',false); exception when others then perform t_ok(43,'audit update blocked',true,sqlerrm); end;
  begin update fin_cash_moves set amount=1; perform t_ok(44,'cash moves update blocked',false); exception when others then perform t_ok(44,'cash moves update blocked',true,sqlerrm); end;
  begin update fin_documents set amount=1 where status='posted'; perform t_ok(45,'posted doc update blocked',false); exception when others then perform t_ok(45,'posted doc update blocked',true,sqlerrm); end;
end $$;
select n,name,ok,coalesce(left(info,90),'') from public.t_res where n>=10 or n<0 order by n;
