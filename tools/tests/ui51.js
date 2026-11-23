const {chromium}=require('playwright');const {execFileSync}=require('child_process');const fs=require('fs');
const SRC=fs.readFileSync('/home/claude/jkh50/jkh-fin51.js','utf8');
const q=v=>v===null||v===undefined?'NULL':typeof v==='object'?"'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb":typeof v==='boolean'?String(v):"'"+String(v).replace(/'/g,"''")+"'";
function pg(fn,a){const args=Object.entries(a).map(([k,v])=>k+'=>'+q(v)).join(',');
 const sql=`set role anon; select public.${fn}(${args});`;
 try{const out=execFileSync('psql',['-h','/tmp/pgt','-p','5499','-U','postgres','-d','u','-At','-q','-c',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const lines=out.trim().split('\n').filter(x=>x!=='SET');return lines.length?JSON.parse(lines[lines.length-1]):null}
 catch(e){const m=(e.stderr||'').toString();const mm=m.match(/ERROR:\s*(.*)/);throw new Error(mm?mm[1]:m)}}
const res=[];const ok=(n,c,i)=>{res.push([n,!!c,i]);console.log((c?'PASS':'FAIL'),n,c?'':(i||''))};
(async()=>{const b=await chromium.launch();const pg_=await b.newPage();const errs=[];pg_.on('pageerror',e=>errs.push(String(e)));
 let alerts=[],prompts=[];pg_.on('dialog',async d=>{if(d.type()==='alert'){alerts.push(d.message());await d.accept()}else if(d.type()==='prompt'){await d.accept(prompts.shift()||'x')}else await d.accept()});
 await pg_.exposeFunction('__pg',(fn,a)=>{try{return {ok:pg(fn,a)}}catch(e){return {err:e.message}}});
 await pg_.setContent('<div id="app"><main></main></div>');
 await pg_.evaluate(()=>{window.JKH_LOGO='';window.toast=m=>{(window.__t=window.__t||[]).push(m)};window.session={role:'مدير النظام',permissions:null};window.__inboxCred={u:'admin',p:'a'};
  window.JKHRpc=async(fn,a)=>{const r=await window.__pg(fn,{p_u:window.__inboxCred.u,p_p:'a',...(a||{})});if(r.err)throw new Error(r.err);return r.ok}});
 await pg_.addScriptTag({content:SRC});
 const as=async(u,role,perms)=>pg_.evaluate(([u,role,perms])=>{const o=document.getElementById('f51ov');if(o)o.remove();window.__inboxCred={u,p:'a'};window.session={role,permissions:perms}},[u,role,perms]);const _unused=async(u,role,perms)=>pg_.evaluate(([u,role,perms])=>{window.__inboxCred={u,p:'a'};window.session={role,permissions:perms}},[u,role,perms]);
 const R=(fn,a)=>pg_.evaluate(([fn,a])=>window.JKHRpc(fn,a),[fn,a||{}]);
 // tafqeet
 const T=await pg_.evaluate(()=>[1,2,3,11,21,100,101,250,1250.5,2000,10500.25,1000000,0.5].map(x=>JKHFin51.tafqeet(x)));
 console.log(T.join('\n'));
 ok('tafqeet 1250.5',T[8]==='ألف ومائتان وخمسون جنيهًا وخمسون قرشًا مصريًا فقط لا غير',T[8]);
 ok('tafqeet 1',T[0]==='جنيه واحد مصريًا فقط لا غير',T[0]);
 ok('tafqeet 0.5 piasters only',T[12]==='خمسون قرشًا مصريًا فقط لا غير',T[12]);
 // admin: accounts via UI form
 await as('admin','مدير النظام',null);
 await pg_.evaluate(()=>window.renderF51Acc());await pg_.waitForSelector('#f51na');
 await pg_.click('#f51na');await pg_.fill('#f51af [name=code]','11');await pg_.fill('#f51af [name=name]','الخزينة');await pg_.selectOption('#f51af [name=type]','asset');await pg_.click('#f51af button[type=submit]');
 await pg_.waitForTimeout(800);
 for(const [c,n,t] of [['41','التبرعات النقدية','revenue'],['51','مساعدات نقدية','expense'],['12','عهد وسلف','asset']])await R('fin_account_save',{p_code:c,p_name:n,p_type:t,p_parent_code:null,p_active:true});
 const acc=await R('fin_accounts_list');ok('account added via UI',acc.accounts.some(a=>a.code==='11'));
 await R('fin_cc_save',{p_code:'P1',p_name:'مشروع',p_active:true});
 // journal via UI (maker)
 await as('maker2','مخصص',['settle']);
 await pg_.evaluate(()=>window.renderF51Docs());await pg_.waitForSelector('[data-new=journal]');
 await pg_.click('[data-new=journal]');await pg_.waitForSelector('#f51ln select');
 await pg_.fill('#f51f [name=explanation]','تسوية تبرع نقدي');
 const sel=async(i,k,v)=>pg_.selectOption(`#f51ln [data-i="${i}"][data-k="${k}"]`,v);
 const inp=async(i,k,v)=>pg_.fill(`#f51ln [data-i="${i}"][data-k="${k}"]`,v);
 await sel(0,'account_code','11');await inp(0,'debit','500');await sel(1,'account_code','41');await inp(1,'credit','400');
 const balTxt=await pg_.textContent('#f51bal');ok('UI shows unbalanced',balTxt.includes('غير متوازن'),balTxt);
 await pg_.click('#f51f button[type=submit]');await pg_.waitForSelector('#f51sub');
 let docs=await R('fin_doc_list',{p_type:'journal'});ok('draft saved with number',docs.length===1&&/^قيد-\d{4}-0001$/.test(docs[0].doc_no),JSON.stringify(docs.map(d=>d.doc_no)));
 alerts=[];await pg_.click('#f51sub');await pg_.waitForTimeout(700);
 ok('unbalanced submit blocked with message',alerts.some(a=>a.includes('لا يساوي')),alerts.join('|'));
 // fix: edit
 await pg_.click('#f51ed');await pg_.waitForSelector('#f51ln select');await inp(1,'credit','500');
 await pg_.click('#f51f button[type=submit]');await pg_.waitForSelector('#f51sub');
 await pg_.click('#f51sub');await pg_.waitForTimeout(700);
 docs=await R('fin_doc_list',{p_type:'journal'});ok('balanced submitted',docs[0].status==='review',docs[0].status);
 const jid=docs[0].id;
 // creator cannot review (no perm -> no button)
 await pg_.evaluate(id=>JKHFin51.openDoc(id),jid);await pg_.waitForSelector('#f51pr');
 ok('maker sees no review button',await pg_.locator('[data-dec]').count()===0);
 // reviewer
 await as('rev','مخصص',['settle','settle_review']);await pg_.evaluate(id=>JKHFin51.openDoc(id),jid);await pg_.waitForSelector('[data-dec]');
 prompts=['ok'];await pg_.click('[data-dec="review|approved"]');await pg_.waitForTimeout(800);
 ok('reviewed',(await R('fin_doc_get',{p_id:jid})).status==='reviewed');
 await as('apr','مخصص',['settle','settle_approve']);await pg_.evaluate(id=>JKHFin51.openDoc(id),jid);await pg_.waitForSelector('[data-dec]');
 prompts=['ok'];await pg_.click('[data-dec="approve|approved"]');await pg_.waitForTimeout(800);
 ok('approved',(await R('fin_doc_get',{p_id:jid})).status==='approved');
 await as('pst','مخصص',['settle','settle_post']);await pg_.evaluate(id=>JKHFin51.openDoc(id),jid);await pg_.waitForSelector('#f51post');
 await pg_.click('#f51post');await pg_.waitForTimeout(800);
 ok('posted',(await R('fin_doc_get',{p_id:jid})).status==='posted');
 ok('posted has no edit/post buttons',await pg_.locator('#f51ed,#f51post,#f51sub').count()===0);
 // trial balance through UI
 await as('admin','مدير النظام',null);await pg_.evaluate(()=>window.renderF51Acc());await pg_.waitForSelector('#f51tb');await pg_.click('#f51tb');await pg_.waitForTimeout(600);
 const tb=await pg_.textContent('#f51ab');ok('trial balance shows 500 and matched',tb.includes('500.00')&&tb.includes('متطابق'),tb.slice(0,200));
 // cash
 await pg_.evaluate(()=>window.renderF51Cash());await pg_.waitForSelector('#f51op');
 prompts=['1000'];await pg_.click('#f51op');await pg_.waitForTimeout(800);
 let cashTxt=await pg_.textContent('#f51cb');ok('cash opening 1,000.00 shown',cashTxt.includes('1,000.00'),cashTxt.slice(0,200));
 // advance request -> cash_out -> settle (all by DB roles through UI forms for maker)
 await as('maker2','مخصص',['settle']);
 await pg_.evaluate(()=>window.renderF51Docs());await pg_.click('[data-new=advance_req]');await pg_.waitForSelector('#f51f');
 await pg_.fill('#f51f [name=requester]','أحمد');await pg_.fill('#f51f [name=amount]','300');await pg_.fill('#f51f [name=settle_due]','2030-01-01');await pg_.fill('#f51f [name=purpose]','شراء أدوات');
 const w=await pg_.textContent('#f51w');ok('amount in words live',w.includes('ثلاثمائة'),w);
 await pg_.click('#f51f button[type=submit]');await pg_.waitForSelector('#f51sub');
 alerts=[];await pg_.click('#f51sub');await pg_.waitForTimeout(700);ok('pledge required',alerts.some(a=>a.includes('الإقرار')),alerts.join('|'));
 await pg_.click('#f51ed');await pg_.waitForSelector('#f51f');await pg_.check('#f51f [name=pledge]');await pg_.click('#f51f button[type=submit]');await pg_.waitForSelector('#f51sub');await pg_.click('#f51sub');await pg_.waitForTimeout(700);
 const adoc=(await R('fin_doc_list',{p_type:'advance_req'}))[0];ok('advance req submitted',adoc.status==='review');
 const flow=async(id)=>{await as('rev','مخصص',['settle','settle_review']);await R('fin_doc_decide',{p_id:id,p_step:'review',p_decision:'approved',p_note:null});
  await as('apr','مخصص',['settle','settle_approve']);await R('fin_doc_decide',{p_id:id,p_step:'approve',p_decision:'approved',p_note:null});
  await as('pst','مخصص',['settle','settle_post']);await R('fin_doc_post',{p_id:id})};
 await flow(adoc.id);
 const advs=await R('fin_advances_list');ok('advance record open',advs.length===1&&advs[0].status==='open'&&!advs[0].disbursed);
 // cash_out for the advance via UI
 await as('maker2','مخصص',['settle']);await pg_.evaluate(()=>window.renderF51Docs());await pg_.click('[data-new=cash_out]');await pg_.waitForSelector('#f51f');
 await pg_.fill('#f51f [name=beneficiary]','أحمد');await pg_.fill('#f51f [name=amount]','300');await pg_.selectOption('#f51f [name=advance_id]',advs[0].id);await pg_.fill('#f51f [name=reason]','صرف سلفة');
 await pg_.click('#f51f button[type=submit]');await pg_.waitForSelector('#f51sub');await pg_.click('#f51sub');await pg_.waitForTimeout(700);
 const cdoc=(await R('fin_doc_list',{p_type:'cash_out'}))[0];ok('cash_out submitted',cdoc.status==='review',cdoc.status);await flow(cdoc.id);
 // settlement via UI
 await as('maker2','مخصص',['settle']);await pg_.evaluate(()=>window.renderF51Docs());await pg_.click('[data-new=advance_settle]');await pg_.waitForSelector('#f51f');
 await pg_.selectOption('#f51f [name=advance_id]',advs[0].id);
 await pg_.fill('#f51ex [data-i="0"][data-k="desc"]','أدوات');await pg_.fill('#f51ex [data-i="0"][data-k="amount"]','180');
 const mtxt=await pg_.textContent('#f51m');ok('settlement remaining computed 120.00',mtxt==='120.00',mtxt);
 await pg_.click('#f51f button[type=submit]');await pg_.waitForSelector('#f51sub');await pg_.click('#f51sub');await pg_.waitForTimeout(700);
 const sdoc=(await R('fin_doc_list',{p_type:'advance_settle'}))[0];ok('settle submitted',sdoc.status==='review',sdoc.status);await flow(sdoc.id);
 await as('admin','مدير النظام',null);await pg_.evaluate(()=>window.renderF51Cash());await pg_.waitForSelector('#f51cb .met');await pg_.waitForTimeout(500);
 cashTxt=await pg_.textContent('#f51cb');ok('treasury 1000-300+120=820.00',cashTxt.includes('820.00'),cashTxt.slice(0,300));
 await pg_.evaluate(()=>window.renderF51Adv());await pg_.waitForTimeout(600);const at=await pg_.textContent('#f51al');ok('advance shown settled',at.includes('مسواة'),at.slice(0,200));
 // print html generation (no crash) + draft watermark
 const pr=await pg_.evaluate(async id=>{const d=await JKHFin51._R('fin_doc_get',{p_id:id});let html='';const w=window.JKHNative={printHtml:h=>{html=h}};JKHFin51.print(d);delete window.JKHNative;return html},cdoc.id);
 ok('print html has doc no + signatures + words',pr.includes(cdoc.doc_no)&&pr.includes('التوقيع')&&pr.includes('ثلاثمائة جنيه'),pr.length);
 ok('no JS errors',errs.length===0,errs.join('|'));
 await b.close();const f=res.filter(r=>!r[1]).length;console.log(res.length+' tests, '+f+' failed');process.exit(f?1:0)})();
