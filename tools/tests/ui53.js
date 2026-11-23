const {chromium}=require('playwright');const {execFileSync}=require('child_process');const fs=require('fs');
const SRC=['jkh-fin51.js','jkh-fin52.js','jkh-fin53.js'].map(f=>fs.readFileSync('/home/claude/jkh50/'+f,'utf8'));
const q=v=>v===null||v===undefined?'NULL':typeof v==='object'?"'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb":typeof v==='boolean'?String(v):"'"+String(v).replace(/'/g,"''")+"'";
function pg(fn,a){const args=Object.entries(a).map(([k,v])=>k+'=>'+q(v)).join(',');const sql=`set role anon; select public.${fn}(${args});`;
 try{const out=execFileSync('psql',['-h','/tmp/pgt','-p','5499','-U','postgres','-d','u','-At','-q','-c',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const lines=out.trim().split('\n').filter(x=>x!=='SET');return lines.length?JSON.parse(lines[lines.length-1]):null}
 catch(e){const m=(e.stderr||'').toString();const mm=m.match(/ERROR:\s*(.*)/);throw new Error(mm?mm[1]:m)}}
function sqlq(s){return execFileSync('psql',['-h','/tmp/pgt','-p','5499','-U','postgres','-d','u','-At','-q','-c',s],{encoding:'utf8'}).trim()}
const res=[];const ok=(n,c,i)=>{res.push(!!c);console.log(c?'PASS':'FAIL',n,c?'':(i||''))};
(async()=>{const b=await chromium.launch();const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e)));
 let alerts=[],prompts=[];p.on('dialog',async d=>{if(d.type()==='alert'){alerts.push(d.message());await d.accept()}else if(d.type()==='prompt'){await d.accept(prompts.shift()||'')}else await d.accept()});
 await p.exposeFunction('__pg',(fn,a)=>{try{return {ok:pg(fn,a)}}catch(e){return {err:e.message}}});
 await p.setContent('<div id="app"><main></main></div>');
 await p.evaluate(()=>{window.JKH_LOGO='';window.toast=m=>{(window.__t=window.__t||[]).push(m)};window.session={role:'مدير النظام',permissions:null};window.__inboxCred={u:'admin',p:'a'};window.EXTRA={};window.__saves=0;window.save=()=>{window.__saves++};
  window.cases=[{id:'c1',caseNo:'C-1',name:'محمد أحمد علي',phone:'0100 111',nid:'111',members:4,address:'بني سويف'},{id:'c2',caseNo:'C-2',name:'محمد  أحمد علي',phone:'01009999',nid:'222'},{id:'c3',caseNo:'C-3',name:'سعاد',phone:'0100111',nid:'333'}];
  window.distributions=[{id:'d1',caseNo:'C-1',type:'سلة',qty:1,date:'2026-01-01'}];
  window.JKHRpc=async(fn,a)=>{const r=await window.__pg(fn,{p_u:window.__inboxCred.u,p_p:'a',...(a||{})});if(r.err)throw new Error(r.err);return r.ok}});
 for(const s of SRC)await p.addScriptTag({content:s});
 const as=async(u,role,perms)=>p.evaluate(([u,role,perms])=>{const o=document.getElementById('f51ov');if(o)o.remove();window.__inboxCred={u,p:'a'};window.session={role,permissions:perms}},[u,role,perms]);
 const R=(fn,a)=>p.evaluate(([fn,a])=>window.JKHRpc(fn,a),[fn,a||{}]);
 const wait=ms=>p.waitForTimeout(ms);
 // ---- بيانات أساسية ----
 for(const [c,n,t,par] of [['1','الأصول','asset',null],['11','الخزينة','asset','1'],['3','حقوق','equity',null],['31','افتتاحي','equity','3'],['4','إيرادات','revenue',null],['41','تبرعات','revenue','4'],['5','مصروفات','expense',null],['51','مساعدات','expense','5']])await R('fin_account_save',{p_code:c,p_name:n,p_type:t,p_parent_code:par,p_active:true});
 ok('accounts seeded',Number(sqlq("select count(*) from fin_accounts"))===8,sqlq("select count(*) from fin_accounts"));
 await R('fin_account_cash',{p_code:'11',p_is_cash:true});
 const pj=async(lines)=>{await as('maker','مخصص',['settle']);const d=await R('fin_doc_save',{p_type:'journal',p_id:null,p_date:'2026-02-10',p_payload:{explanation:'x'},p_lines:lines,p_client_key:null});await R('fin_doc_submit',{p_id:d.id});
  await as('rev','مخصص',['settle','settle_review']);await R('fin_doc_decide',{p_id:d.id,p_step:'review',p_decision:'approved',p_note:null});await as('apr','مخصص',['settle','settle_approve']);await R('fin_doc_decide',{p_id:d.id,p_step:'approve',p_decision:'approved',p_note:null});await as('pst','مخصص',['settle','settle_post']);await R('fin_doc_post',{p_id:d.id})};
 await pj([{account_code:'11',debit:'1000'},{account_code:'31',credit:'1000'}]);await pj([{account_code:'11',debit:'400'},{account_code:'41',credit:'400'}]);await pj([{account_code:'51',debit:'150'},{account_code:'11',credit:'150'}]);
 // ---- القوائم ----
 await as('acc1','محاسب',null);
 await p.evaluate(()=>{window.__s=1});
 await p.evaluate(()=>document.querySelector('#app main').insertAdjacentHTML('beforeend','<section id="x"></section>'));
 await p.evaluate(()=>window.renderF53Rep());await p.waitForSelector('#f53go');
 await p.fill('#f53f','2026-01-01');await p.fill('#f53t','2026-12-31');await p.click('#f53go');await wait(600);
 let t=await p.textContent('#f53r');ok('income statement shows revenue 400, expense 150, surplus 250',t.includes('400.00')&&t.includes('150.00')&&t.includes('250.00'),t.slice(0,300));
 await p.click('[data-tab=bs]');await wait(700);t=await p.textContent('#f53r');ok('balance sheet balanced (assets 1,250.00)',t.includes('1,250.00')&&t.includes('✅'),t.slice(0,300));
 await p.click('[data-tab=cf]');await wait(700);t=await p.textContent('#f53r');ok('cash flow shows closing 1,250.00 and net change',t.includes('1,250.00')&&t.includes('صافي التغير'),t.slice(0,300));
 await p.click('[data-tab=set]');await wait(700);ok('cash accounts tab: 11 checked',await p.isChecked('[data-c="11"]'));
 await as('res2','مخصص',[]);await p.evaluate(()=>window.renderF53Rep());await wait(600);t=await p.textContent('#f53r');ok('statements without permission show error',t.includes('صلاحية'),t.slice(0,150));
 // ---- المشروعات ----
 await as('admin','مدير النظام',null);
 await p.evaluate(()=>window.renderF53Proj());await p.waitForSelector('#f53np');await p.click('#f53np');
 await p.fill('#f53pj [name=code]','PX1');await p.fill('#f53pj [name=name]','مشروع كسوة');await p.fill('#f53pj [name=budget]','5000');await p.fill('#f53ac input[data-k=name]','شراء');await p.fill('#f53ac input[data-k=pct]','40');await p.click('#f53pj button[type=submit]');await wait(900);
 t=await p.textContent('#f53p');ok('project created via UI with progress 40%',t.includes('PX1')&&t.includes('40%'),t.slice(0,200));
 await p.click('[data-r]');await p.waitForSelector('#f53mc');await p.fill('#f53mc','C-1');await p.click('#f53ma');await wait(900);await p.waitForSelector('#f53mc');
 t=await p.textContent('#f51ov');ok('project report shows budget 5,000.00 and beneficiary C-1',t.includes('5,000.00')&&t.includes('C-1'),t.slice(0,300));
 // ---- المشتريات ----
 await p.evaluate(()=>window.JKHFin51.close());
 await p.evaluate(()=>window.renderF53Buy());await p.waitForSelector('[data-tab=sup]');await p.click('[data-tab=sup]');await p.waitForSelector('#f53ns');await p.click('#f53ns');
 await p.fill('#f53sf [name=code]','S9');await p.fill('#f53sf [name=name]','مورد ملابس');await p.click('#f53sf button[type=submit]');await wait(800);
 ok('supplier created via UI',(await R('fin_suppliers_list')).some(s=>s.code==='S9'));
 await R('fin_wh_save',{p_code:'W1',p_name:'الرئيسي',p_keeper:'أ',p_active:true});await R('fin_item_save',{p_code:'COAT',p_name:'جاكيت',p_unit:'قطعة',p_category:'كسوة',p_min:0,p_active:true});
 await p.click('[data-tab=new]');await p.waitForSelector('#f53pf');await p.selectOption('#f53l select[data-k=item_code]','COAT');await p.fill('#f53l input[data-k=qty]','10');await p.fill('#f53l input[data-k=unit_price]','75.5');await wait(200);
 t=await p.textContent('#f53tot');ok('PO form total live = 755.00',t.includes('755.00'),t);
 await p.selectOption('#f53pf [name=proj]','PX1');await p.click('#f53pf button[type=submit]');await wait(900);
 t=await p.textContent('#f53b');ok('PO saved as draft and listed',t.includes('شراء-2026-')&&t.includes('مسودة')&&t.includes('755.00'),t.slice(0,300));
 await p.click('[data-sub]');await wait(800);t=await p.textContent('#f53b');ok('PO submitted -> waiting approval',t.includes('بانتظار الاعتماد'));
 alerts=[];await p.click('[data-ok]');await wait(800);ok('creator (even admin) cannot approve own PO',alerts.some(a=>a.includes('أنشأته بنفسك')),alerts.join('|'));
 await as('buyap','مخصص',['fin_purchase_approve','fin_purchase']);await p.evaluate(()=>window.renderF53Buy());await p.waitForSelector('[data-ok]');await p.click('[data-ok]');await wait(800);await as('admin','مدير النظام',null);await p.evaluate(()=>window.renderF53Buy());await p.waitForSelector('[data-ord]');await p.click('[data-ord]');await wait(800);prompts=['W1'];await p.click('[data-rec]');await wait(1000);
 ok('PO received -> stock 10 COAT in W1',Number(sqlq("select coalesce(sum(qty),0) from fin_stock_moves where kind='receipt'"))===10);
 prompts=['INV-77','755'];await p.click('[data-inv]');await wait(900);t=await p.textContent('#f53b');ok('invoice registered',t.includes('INV-77'));
 await p.click('[data-pay]');await wait(1000);t=await p.textContent('#f53b');ok('payment requested: draft cash_out doc created',t.includes('طُلب السداد')&&Number(sqlq("select count(*) from fin_documents where doc_type='cash_out' and status='draft' and amount=755"))===1,t.slice(0,300));
 // ---- ربط وترحيل القديم ----
 await p.evaluate(()=>{window.EXTRA.v50StockMoves=[{id:'m1',kind:'وارد',item:'بطانية',qty:20,unit:'قطعة',unitCost:100,warehouse:'',date:'2026-01-01'},{id:'m2',kind:'وارد',item:'بطانية',qty:10,unit:'قطعة',unitCost:130,date:'2026-01-02'},{id:'m3',kind:'صرف',item:'بطانية',qty:5,date:'2026-01-03'},{id:'m4',kind:'وارد',item:'صفر',qty:3,date:'2026-01-01'},{id:'m5',kind:'صرف',item:'صفر',qty:3,date:'2026-01-02'}];
  window.EXTRA.v50AidRequests=[{id:'aid-111111111111',caseNo:'C-1',kind:'بطانية',qty:4,stage:'تم التوزيع',projectId:'PX1'},{id:'aid-2',caseNo:'C-3',kind:'صنف غير مرحّل',qty:1,stage:'تم التوزيع'},{id:'aid-3',caseNo:'C-3',kind:'بطانية',qty:999,stage:'تم التوزيع'}]});
 await p.evaluate(()=>window.renderF53Link());await p.waitForSelector('#f53mg');t=await p.textContent('#f53k');
 ok('link page previews legacy balance 25 and zero-balance item flagged',t.includes('بطانية')&&t.includes('25')&&t.includes('لا يُرحَّل'),t.slice(0,400));
 await p.click('#f53mg');await wait(1500);
 const bl=sqlq("select coalesce(sum(case when kind in ('receipt','transfer_in','adjust_plus') then qty else -qty end),0) from fin_stock_moves m join fin_items i on i.id=m.item_id where i.name='بطانية'");
 ok('migration: opening receipt 25 in server warehouse',Number(bl)===25,bl);
 ok('migration cost = weighted avg (20*100+10*130)/30 = 110',Number(sqlq("select unit_cost from fin_stock_moves m join fin_items i on i.id=m.item_id where i.name='بطانية'"))===110);
 ok('zero-balance item not migrated',Number(sqlq("select count(*) from fin_items where name='صفر'"))===0);
 await p.evaluate(()=>window.renderF53Link());await wait(800);const n1=sqlq("select count(*) from fin_stock_moves m join fin_items i on i.id=m.item_id where i.name='بطانية'");
 await p.evaluate(()=>{delete window.EXTRA.v53Migrated});await p.evaluate(()=>window.renderF53Link());await p.waitForSelector('#f53mg');await p.click('#f53mg');await wait(1500);
 ok('migration re-run does not duplicate (idempotent on server)',sqlq("select count(*) from fin_stock_moves m join fin_items i on i.id=m.item_id where i.name='بطانية'")===n1);
 ok('legacy data untouched (5 moves, original balances)',await p.evaluate(()=>window.EXTRA.v50StockMoves.length===5));
 // خطاف التوزيع
 await p.evaluate(()=>{const a=window.EXTRA.v50AidRequests;window.JKHBridge.aidDistributed(a[0]);window.JKHBridge.aidDistributed(a[1]);window.JKHBridge.aidDistributed(a[2])});await wait(2500);
 ok('aid distributed -> server issue 4 (with project+case), flagged serverIssued',Number(sqlq("select coalesce(sum(qty),0) from fin_stock_moves where kind='issue' and case_ref='C-1' and project_code='PX1'"))===4&&await p.evaluate(()=>window.EXTRA.v50AidRequests[0].serverIssued===true));
 await p.evaluate(()=>window.JKHBridge.aidDistributed(window.EXTRA.v50AidRequests[0]));await wait(800);
 ok('hook is idempotent (still one issue of 4)',Number(sqlq("select count(*) from fin_stock_moves where kind='issue' and case_ref='C-1'"))===1);
 ok('unlinked item: no server issue, no queue entry',Number(sqlq("select count(*) from fin_stock_moves where case_ref='C-3' and kind='issue'"))===0);
 const pend=await p.evaluate(()=>(window.EXTRA.v53Pending||[]).map(x=>x.aidId));
 ok('over-balance aid -> queued with reason, local state intact',pend.includes('aid-3')&&!pend.includes('aid-2')&&await p.evaluate(()=>window.EXTRA.v50AidRequests[2].stage==='تم التوزيع'),JSON.stringify(pend));
 // ---- ملف الأسرة ----
 await as('rs2','باحث اجتماعي',null);
 await p.evaluate(()=>window.renderF53Fam());await p.waitForSelector('#f53fq');await p.fill('#f53fq','محمد');await p.click('#f53fg');await wait(400);
 t=await p.textContent('#f53f');ok('family search finds both similar names',t.includes('C-1')&&t.includes('C-2'));
 await p.click('[data-o="C-1"]');await p.waitForSelector('#f53nf');t=await p.textContent('#f53f');
 ok('family file merges local data + project + in-kind aid',t.includes('محمد أحمد علي')&&t.includes('PX1')&&t.includes('بطانية'),t.slice(0,500));
 await p.fill('#f53nf [name=text]','زيارة: الحالة مستقرة');await p.click('#f53nf button[type=submit]');await wait(900);await p.waitForSelector('#f53sf');
 ok('family note appended',(await p.textContent('#f53f')).includes('الحالة مستقرة'));
 await p.fill('#f53sf [name=reason]','مراجعة');await p.selectOption('#f53sf [name=status]','under_review');await p.click('#f53sf button[type=submit]');await wait(900);
 ok('family status changed with event',(await p.textContent('#f53f')).includes('قيد المراجعة'));
 await p.click('#f53bk');await p.click('[data-tab=d]');await wait(400);t=await p.textContent('#f53f');ok('duplicates tab lists same-name / same-phone groups, no auto-merge',t.includes('الاسم')&&t.includes('الهاتف')&&t.includes('لا يتم الدمج تلقائيًا'),t.slice(0,300));
 ok('no uncaught page errors',errs.length===0,errs.join(' | '));
 console.log(res.filter(x=>x).length+'/'+res.length+' passed');await b.close();process.exit(res.every(x=>x)?0:1)})().catch(e=>{console.log('ERR',e);process.exit(2)});
