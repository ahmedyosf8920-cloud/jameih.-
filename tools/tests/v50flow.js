const {chromium}=require('playwright');const fs=require('fs');
const SRC=fs.readFileSync('/home/claude/jkh50/jkh-integrated-v50.js','utf8');
const res=[];const ok=(n,c,i)=>{res.push(c);console.log(c?'PASS':'FAIL',n,c?'':(i||''))};
(async()=>{const b=await chromium.launch();const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e)));
 let alerts=[],prompts=[];p.on('dialog',async d=>{if(d.type()==='alert'){alerts.push(d.message());await d.accept()}else if(d.type()==='prompt'){await d.accept(prompts.shift()||'')}else await d.accept()});
 await p.setContent('<div id="app"><main></main></div><nav id="nav"></nav>');
 await p.evaluate(()=>{window.EXTRA={};window.saves=0;window.save=()=>{window.saves++};window.cases=[];window.session={role:'باحث اجتماعي',username:'u1',permissions:null}});
 await p.addScriptTag({content:SRC});
 const open=k=>p.evaluate(k=>{JKHIntegrated50.open(k)},k);
 const as=(u,role)=>p.evaluate(([u,role])=>{window.session={role,username:u,permissions:null}},[u,role]);
 // stock: receive 30 bags once
 await open('stock');await p.fill('#v50move [name=item]','شنطة غذائية');await p.fill('#v50move [name=qty]','30');await p.click('#v50move button');
 let bal=await p.evaluate(()=>window.EXTRA.v50StockMoves.filter(x=>x.item==='شنطة غذائية').reduce((s,x)=>s+(x.kind==='وارد'?x.qty:-x.qty),0));ok('receive 30 bags -> balance 30 (one move)',bal===30&&await p.evaluate(()=>window.EXTRA.v50StockMoves.length)===1,bal);
 // issue 40 blocked
 await open('stock');alerts=[];await p.selectOption('#v50move [name=kind]','صرف');await p.fill('#v50move [name=item]','شنطة غذائية');await p.fill('#v50move [name=qty]','40');await p.click('#v50move button');
 ok('issue 40 blocked (balance 30)',alerts.some(a=>a.includes('أكبر من الرصيد')),alerts.join('|'));
 // aid request 30
 await open('workflow');await p.fill('#v50aid [name=caseNo]','1001');await p.fill('#v50aid [name=kind]','شنطة غذائية');await p.fill('#v50aid [name=qty]','30');await p.click('#v50aid button');
 const rid=await p.evaluate(()=>window.EXTRA.v50AidRequests[0].id);
 const next=async(n)=>{prompts=[String(n)];await p.click(`[data-next="${rid}"]`);await p.waitForTimeout(50)};
 alerts=[];await next(5);ok('cannot skip stages',alerts.some(a=>a.includes('بالتتابع')),alerts.join('|'));
 await next(2);await next(3);
 ok('creator cannot approve own request',alerts.some(a=>a.includes('أنشأ الطلب')),alerts.join('|'));
 await as('boss','مدير النظام');await open('workflow');
 // other (non-admin) user approves
 await as('u2','باحث اجتماعي');await open('workflow');await next(3);
 let st=await p.evaluate(()=>window.EXTRA.v50AidRequests[0].stage);ok('other user approves',st==='معتمد',st);
 await next(4);await next(5);
 const iss=await p.evaluate(()=>window.EXTRA.v50StockMoves.filter(x=>x.kind==='صرف').length);
 const bal2=await p.evaluate(()=>window.EXTRA.v50StockMoves.reduce((s,x)=>s+(x.kind==='وارد'?x.qty:-x.qty),0));
 ok('distribute 30 bags -> one issue, balance 0',iss===1&&bal2===0,iss+'/'+bal2);
 // second request cannot distribute (no stock)
 await open('workflow');await p.fill('#v50aid [name=caseNo]','1002');await p.fill('#v50aid [name=kind]','شنطة غذائية');await p.fill('#v50aid [name=qty]','5');await p.click('#v50aid button');
 const rid2=await p.evaluate(()=>window.EXTRA.v50AidRequests[1].id);
 await as('u3','باحث اجتماعي');await open('workflow');
 const nx=async n=>{prompts=[String(n)];await p.click(`[data-next="${rid2}"]`);await p.waitForTimeout(50)};
 await nx(2);await nx(3);await nx(4);alerts=[];await nx(5);
 ok('distribute unavailable qty blocked',alerts.some(a=>a.includes('غير كافٍ')),alerts.join('|'));
 // re-moving to same stage does not double-issue
 const iss2=await p.evaluate(()=>window.EXTRA.v50StockMoves.filter(x=>x.kind==='صرف').length);ok('no duplicate issue',iss2===1,iss2);
 // default-deny
 await p.evaluate(()=>{window.session=null;document.getElementById('jkhV50Nav')?.remove()});
 const vis=await p.evaluate(()=>{document.getElementById('jkhV50Nav')?.remove();JKHIntegrated50.open('registry');return !!document.getElementById('jkhV50Nav')});
 ok('no session -> module nav not created',vis===false);
 ok('no JS errors',errs.length===0,errs.join('|'));await b.close();process.exit(res.includes(false)?1:0)})();
