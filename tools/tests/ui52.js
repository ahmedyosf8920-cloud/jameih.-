const {chromium}=require('playwright');const {execFileSync}=require('child_process');const fs=require('fs');
const S51=fs.readFileSync('/home/claude/jkh50/jkh-fin51.js','utf8'),S52=fs.readFileSync('/home/claude/jkh50/jkh-fin52.js','utf8');
const q=v=>v===null||v===undefined?'NULL':typeof v==='object'?"'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb":typeof v==='boolean'?String(v):"'"+String(v).replace(/'/g,"''")+"'";
function pg(fn,a){const args=Object.entries(a).map(([k,v])=>k+'=>'+q(v)).join(',');const sql=`set role anon; select public.${fn}(${args});`;
 try{const out=execFileSync('psql',['-h','/tmp/pgt','-p','5499','-U','postgres','-d','u','-At','-q','-c',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const lines=out.trim().split('\n').filter(x=>x!=='SET');return lines.length?JSON.parse(lines[lines.length-1]):null}
 catch(e){const m=(e.stderr||'').toString();const mm=m.match(/ERROR:\s*(.*)/);throw new Error(mm?mm[1]:m)}}
const res=[];const ok=(n,c,i)=>{res.push(!!c);console.log(c?'PASS':'FAIL',n,c?'':(i||''))};
(async()=>{const b=await chromium.launch();const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e)));
 let alerts=[],prompts=[];p.on('dialog',async d=>{if(d.type()==='alert'){alerts.push(d.message());await d.accept()}else if(d.type()==='prompt'){await d.accept(prompts.shift()||'')}else await d.accept()});
 await p.exposeFunction('__pg',(fn,a)=>{try{return {ok:pg(fn,a)}}catch(e){return {err:e.message}}});
 await p.setContent('<div id="app"><main></main></div>');
 await p.evaluate(()=>{window.JKH_LOGO='';window.toast=m=>{(window.__t=window.__t||[]).push(m)};window.session={role:'مدير النظام',permissions:null};window.__inboxCred={u:'admin',p:'a'};
  window.JKH_SUPABASE_URL='https://x.supabase.co';window.__up=[];window.sb={};window.JKHDocs={upload:async(c,b,path,file,o)=>{window.__up.push(path);return{data:{path},error:null}},resolve:async u=>u};
  window.JKHRpc=async(fn,a)=>{const r=await window.__pg(fn,{p_u:window.__inboxCred.u,p_p:'a',...(a||{})});if(r.err)throw new Error(r.err);return r.ok}});
 await p.addScriptTag({content:S51});await p.addScriptTag({content:S52});
 const as=async(u,role,perms)=>p.evaluate(([u,role,perms])=>{const o=document.getElementById('f51ov');if(o)o.remove();window.__inboxCred={u,p:'a'};window.session={role,permissions:perms}},[u,role,perms]);
 const R=(fn,a)=>p.evaluate(([fn,a])=>window.JKHRpc(fn,a),[fn,a||{}]);
 const wait=ms=>p.waitForTimeout(ms);
 // ---- stock via UI (legacy keeper role, no explicit perms) ----
 await as('keeper','مسؤول مخازن',null);
 await p.evaluate(()=>window.renderF52Stock());await p.waitForSelector('[data-tab=set]');await p.click('[data-tab=set]');await p.waitForSelector('#f52nw');
 await p.click('#f52nw');await p.fill('#f52wf [name=code]','W1');await p.fill('#f52wf [name=name]','المخزن الرئيسي');await p.click('#f52wf button[type=submit]');await wait(700);
 await p.click('#f52nw');await p.fill('#f52wf [name=code]','W2');await p.fill('#f52wf [name=name]','فرعي');await p.click('#f52wf button[type=submit]');await wait(700);
 await p.click('#f52ni');await p.fill('#f52if [name=code]','BAG');await p.fill('#f52if [name=name]','شنطة غذائية');await p.fill('#f52if [name=min]','5');await p.click('#f52if button[type=submit]');await wait(700);
 ok('keeper legacy can create warehouse+item via UI',(await R('fin_stock_lists')).items.length===1);
 await p.click('[data-tab=mov]');await p.waitForSelector('#f52mf');
 await p.fill('#f52mf [name=qty]','30');await p.fill('#f52mf [name=cost]','50');await p.click('#f52mf button[type=submit]');await wait(700);
 await p.click('[data-tab=bal]');await wait(700);let t=await p.textContent('#f52s');ok('receive 30 shows 30 in balances',t.includes('30')&&t.includes('1,500.00'),t.slice(0,160));
 await p.click('[data-tab=mov]');await p.waitForSelector('#f52mf');await p.selectOption('#f52mf [name=kind]','issue');await p.fill('#f52mf [name=qty]','31');alerts=[];await p.click('#f52mf button[type=submit]');await wait(700);
 ok('issue 31 blocked in UI',alerts.some(a=>a.includes('أكبر من الرصيد')),alerts.join('|'));
 await p.fill('#f52mf [name=qty]','30');await p.fill('#f52mf [name=ref]','طلب 77');await p.click('#f52mf button[type=submit]');await wait(700);
 const bal=await R('fin_stock_balances');ok('issue 30 -> zero balance row gone',bal.length===0,JSON.stringify(bal));
 // count flow
 await p.click('[data-tab=mov]');await p.waitForSelector('#f52mf');await p.selectOption('#f52mf [name=kind]','receipt');await p.fill('#f52mf [name=qty]','10');await p.click('#f52mf button[type=submit]');await wait(600);
 await p.click('[data-tab=cnt]');await p.waitForSelector('#f52nc');await p.click('#f52nc');await p.waitForSelector('#f52cr input');await p.fill('#f52cr [data-k=actual]','8');await p.fill('#f52cr [data-k=reason]','تالف');await p.click('#f52cf button[type=submit]');await wait(800);
 const cnts=await R('fin_stock_counts_list');ok('count saved pending',cnts.length===1&&cnts[0].status==='pending');
 await as('admin','مدير النظام',null);await p.evaluate(()=>{window.renderF52Stock()});await p.click('[data-tab=cnt]');await p.waitForSelector('[data-ok]');await p.click('[data-ok]');await wait(900);
 ok('count approved -> balance 8',(await R('fin_stock_balances'))[0].qty==8);
 // ---- dashboard ----
 await p.evaluate(()=>window.renderF52Dash());await p.waitForSelector('#f52d .met');await wait(400);t=await p.textContent('#f52d');ok('dashboard renders sections',t.includes('المالية')&&t.includes('المخازن')&&t.includes('الإشعارات'),t.slice(0,120));
 prompts=['2026-01-31','اختبار'];await p.click('#f52pc');await wait(900);t=await p.textContent('#f52d');ok('period closed via UI',t.includes('2026-01-31'),t.slice(0,300));
 prompts=['تصحيح',''];await p.click('#f52po');await wait(900);t=await p.textContent('#f52d');ok('period reopened',t.includes('لا يوجد'),'');
 // ---- minutes ----
 await as('min1','مخصص',['fin52','fin_minutes']);await p.evaluate(()=>window.renderF52Min());await p.waitForSelector('#f52nm');await p.click('#f52nm');await p.waitForSelector('#f52f');
 await p.fill('#f52f [name=place]','مقر الجمعية');await p.fill('#f52f [name=agenda]','افتتاح\nالميزانية');
 const names=['أحمد','محمد','علي'];for(let i=0;i<3;i++){await p.fill(`#f52at [data-i="${i}"][data-k=name]`,names[i]);await p.fill(`#f52at [data-i="${i}"][data-k=role]`,i?'عضو':'رئيس')}
 await p.fill('#f52de [data-i="0"][data-k=text]','اعتماد الميزانية');await p.fill('#f52de [data-i="0"][data-k=votes_for]','3');
 await p.click('#f52f button[type=submit]');await p.waitForSelector('#f52sb');
 ok('minute drafted & numbered',(await p.textContent('#f52ov .f51box, .f51box')).includes('محضر-'));
 await p.click('#f52sb');await wait(800);
 await as('min2','مخصص',['fin52','fin_minutes_approve','fin_minutes']);await p.evaluate(()=>window.renderF52Min());await p.waitForSelector('tr.row');await p.click('tr.row');await p.waitForSelector('#f52ap');
 await p.click('#f52ap');await wait(900);const ml=await R('fin_minutes_list');ok('minute approved via UI',ml[0].status==='approved');
 // print
 const ph=await p.evaluate(m=>{let h='';window.JKHNative={printHtml:x=>{h=x}};return new Promise(r=>{window.renderF52Min();setTimeout(()=>{document.querySelector('tr.row').click();setTimeout(()=>{document.getElementById('f52pr').click();delete window.JKHNative;r(h)},300)},500)})},null);
 ok('minute print has signature boxes + decision',ph.includes('رئيس المجلس')&&ph.includes('اعتماد الميزانية')&&!ph.includes('مسودة — غير معتمد'),ph.length);
 // ---- archive ----
 await as('arch1','مخصص',['fin52','fin_archive']);await p.evaluate(()=>window.renderF52Arch());await p.waitForSelector('#f52nu');await p.click('#f52nu');await p.waitForSelector('#f52uf');
 fs.writeFileSync('/tmp/scan.pdf','%PDF-1.4 test');await p.setInputFiles('#f52uf [name=file]','/tmp/scan.pdf');await p.fill('#f52uf [name=title]','عقد إيجار');await p.fill('#f52uf [name=category]','عقود');await p.fill('#f52uf [name=view]','arch2');
 await p.click('#f52uf button[type=submit]');await wait(1000);
 const up=await p.evaluate(()=>window.__up);ok('file uploaded to private archive path',up.length===1&&/^archive\/\d{4}\/[0-9a-f-]{36}-/.test(up[0]),JSON.stringify(up));
 t=await p.textContent('#f52a');ok('archive lists doc',t.includes('عقد إيجار'),t.slice(0,100));
 await as('arch2','مخصص',['fin52','fin_archive']);await p.evaluate(()=>window.renderF52Arch());await wait(700);t=await p.textContent('#f52a');ok('granted user sees doc, no download button',t.includes('عقد إيجار')&&!t.includes('تنزيل'),t.slice(0,140));
 await as('res','باحث اجتماعي',[]);await p.evaluate(()=>window.renderF52Arch());await wait(700);t=await p.textContent('#f52a');ok('user without perm denied by server',t.includes('صلاحية'),t.slice(0,120));
 // ---- bank ----
 await as('admin','مدير النظام',null);
 await R('fin_account_save',{p_code:'13',p_name:'البنك',p_type:'asset',p_parent_code:null,p_active:true});await R('fin_account_save',{p_code:'41',p_name:'تبرعات',p_type:'revenue',p_parent_code:null,p_active:true});
 await p.evaluate(()=>window.renderF52Bank());await p.waitForSelector('#f52nb');await p.click('#f52nb');await p.fill('#f52bf [name=code]','NBE');await p.fill('#f52bf [name=name]','الأهلي');await p.fill('#f52bf [name=acc]','13');await p.click('#f52bf button[type=submit]');await wait(900);
 const d=await R('fin_doc_save',{p_type:'journal',p_id:null,p_date:new Date().toISOString().slice(0,10),p_payload:{explanation:'تبرع'},p_lines:[{account_code:'13',debit:'500'},{account_code:'41',credit:'500'}],p_client_key:'bk'});
 await R('fin_doc_submit',{p_id:d.id});await as('rev','مخصص',['settle_review']);await R('fin_doc_decide',{p_id:d.id,p_step:'review',p_decision:'approved',p_note:null});
 await as('apr','مخصص',['settle_approve']);await R('fin_doc_decide',{p_id:d.id,p_step:'approve',p_decision:'approved',p_note:null});await as('pst','مخصص',['settle_post']);await R('fin_doc_post',{p_id:d.id});
 await as('bank1','مخصص',['fin52','fin_bank']);await p.evaluate(()=>window.renderF52Bank());await p.waitForSelector('#f52bi');await p.click('#f52bi');
 const today=new Date().toISOString().slice(0,10);await p.fill('#f52ta',`${today},500,إيداع تبرع,R1\n${today},-20.5,رسوم,`);await p.click('#f52go');await wait(1000);
 await p.waitForSelector('input[name=bl]');await p.check('input[name=bl][data-a="500"]');await p.check('input[name=jl]');await p.click('#f52bm');await wait(900);
 t=await p.textContent('#f52b');ok('bank match done; recon explained',t.includes('479.50')&&t.includes('✔'),t.slice(0,260));
 ok('no JS errors',errs.length===0,errs.join('|'));
 await b.close();const f=res.filter(x=>!x).length;console.log(res.length+' tests, '+f+' failed');process.exit(f?1:0)})();
