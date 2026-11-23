const {chromium}=require('playwright');const dir=process.argv[2]||'/home/claude/jkh55';
const ok=(n,c,i)=>console.log(c?'PASS':'FAIL',n,c?'':(i||''));
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1300,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
 await pg.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
 await pg.goto('file://'+dir+'/index.html');await pg.waitForTimeout(800);
 await pg.evaluate(()=>{session={role:'مدير النظام',name:'أدمن',permissions:null};document.getElementById('login').style.display='none';document.getElementById('app').classList.add('show');
  cases.push({id:'c1',no:'101',name:'محمد أحمد (محدّث)',nid:'28703052200667',husband:'x',wife:'',husbandNid:'',wifeNid:'',phone:'0100',date:'2026-01-01',needs:[],family:[],status:'جديدة',researcher:'x',docs:[],visits:[],aid:[]});
  const rows=[];for(let i=1;i<=25;i++)rows.push(i===1?{caseId:'c1',caseNo:'101',caseName:'قديم',name:'قديم',qty:'2',received:true}:{caseName:'حالة '+i,name:'حالة '+i,caseNo:'9'+i,qty:'1',received:i%2===0});
  EXTRA.sheets=[{id:'s1',name:'كشف تجريبي',date:'2026-10-01',type:'مواد غذائية',qty:'1',kind:'gen',status:'تحت التسليم',addToDist:false,rows},{id:'s2',name:'كشف مسلّم',date:'2026-09-01',type:'نقدي',qty:'1',kind:'gen',status:'تم التسليم',addToDist:false,rows:rows.slice(0,3)}];
  renderAll();window.goPage('pendingSheets')});await pg.waitForTimeout(500);
 ok('button on list rows (both statuses)',(await pg.$$('#sheetsTable [data-v60]')).length===2);
 const h=await pg.evaluate(()=>JKHVouchers60.build(EXTRA.sheets[0],{seal:true}));
 const d=await pg.evaluate(h=>{const p=new DOMParser().parseFromString(h,'text/html');return {pages:p.querySelectorAll('.pg').length,v:p.querySelectorAll('.v:not(.e)').length,e:p.querySelectorAll('.v.e').length,seals:p.querySelectorAll('.st svg').length,n1:p.querySelector('.num b').textContent,nm:p.querySelector('.nm').textContent,last:[...p.querySelectorAll('.num b')].pop().textContent,ft:[...p.querySelectorAll('.ft')].map(x=>x.textContent)}},h);
 ok('25 rows -> 3 pages, 25 vouchers, 5 empty cells',d.pages===3&&d.v===25&&d.e===5,JSON.stringify(d));
 ok('numbers 01..25 and live case name',d.n1==='01'&&d.last==='25'&&d.nm==='محمد أحمد (محدّث)');
 ok('seal on every voucher',d.seals===25);
 ok('footer range',/01 إلى 10 من 25/.test(d.ft[0])&&/21 إلى 25 من 25/.test(d.ft[2]),d.ft.join('|'));
 const h2=await pg.evaluate(()=>JKHVouchers60.build(EXTRA.sheets[0],{seal:false,onlyPending:true}));
 const d2=await pg.evaluate(h=>{const p=new DOMParser().parseFromString(h,'text/html');return {v:p.querySelectorAll('.v:not(.e)').length,s:p.querySelectorAll('.st svg').length,first:p.querySelector('.num b').textContent}},h2);
 ok('only-pending: 12 vouchers, original numbers kept, no seal',d2.v===12&&d2.s===0&&d2.first==='03',JSON.stringify(d2));
 // dialog + print path
 await pg.evaluate(()=>{window.__p=null;window.JKHNative={printHtml:(h)=>{window.__p=h}}});
 await pg.click('#sheetsTable [data-v60="s1"]');await pg.waitForSelector('#v60Ov');await pg.click('#v60Go');await pg.waitForTimeout(200);
 ok('dialog prints via native',await pg.evaluate(()=>!!window.__p&&window.__p.includes('بون استلام')));
 // inside open sheet
 await pg.evaluate(()=>Sheets.open('s2'));await pg.waitForTimeout(300);
 ok('button inside open sheet',(await pg.$$('#shOv [data-v60]')).length===1);
 // real pdf layout check
 const pg2=await b.newPage();await pg2.setContent(h);const pdf=await pg2.pdf({format:'A4',preferCSSPageSize:true});
 const pages=(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)||[]).length;ok('PDF is exactly 3 A4 pages',pages===3,pages);
 await pg2.screenshot({path:'/tmp/v60_p1.png',fullPage:false});

 // ---- v60b: قصاصة + بيانات اختيارية ----
 await pg.evaluate(()=>{const c=cases.find(z=>z.id==='c1');c.husband='زوج اختبار';c.wife='زوجة اختبار';c.phone='01012345678'});
 const hs=await pg.evaluate(()=>JKHVouchers60.build(EXTRA.sheets[0],{seal:true,stub:true,husband:true,wife:true,phone:true}));
 const ds=await pg.evaluate(h=>{const p=new DOMParser().parseFromString(h,'text/html');return {pages:p.querySelectorAll('.pg').length,v:p.querySelectorAll('.v:not(.e)').length,stubs:p.querySelectorAll('.stub').length,sigs:p.querySelectorAll('.sig').length,mainSg:p.querySelectorAll('.main .sg').length,txt:p.querySelector('.v').textContent}},hs);
 ok('stub mode: 25 rows -> 4 pages (8/page), 25 stubs, signature only on stub',ds.pages===4&&ds.v===25&&ds.stubs===25&&ds.sigs===25&&ds.mainSg===0,JSON.stringify(ds));
 ok('fields shown when ticked (husband/wife/full phone)',/زوج اختبار/.test(ds.txt)&&/زوجة اختبار/.test(ds.txt)&&/01012345678/.test(ds.txt));
 const hn=await pg.evaluate(()=>JKHVouchers60.build(EXTRA.sheets[0],{}));
 ok('default: no fields, no stub (10/page)',!/زوج اختبار|01012345678/.test(hn)&&!/class="stub"/.test(hn)&&/صفحة 1 \/ 3/.test(hn));
 const pg3=await b.newPage();await pg3.setContent(hs);const pdf2=await pg3.pdf({format:'A4',preferCSSPageSize:true});
 ok('stub PDF is exactly 4 A4 pages',(pdf2.toString('latin1').match(/\/Type\s*\/Page[^s]/g)||[]).length===4);
 await pg3.screenshot({path:'/tmp/v60_stub.png'});
 await pg.evaluate(()=>{window.__p=null;const o=document.getElementById('shOv');if(o)o.remove()});await pg.click('#sheetsTable [data-v60="s1"]');await pg.waitForSelector('#v60Ov');
 await pg.check('#v60Stub');await pg.check('#v60P');await pg.click('#v60Go');await pg.waitForTimeout(200);
 ok('dialog passes stub+phone options',await pg.evaluate(()=>/class="stub"/.test(window.__p)&&/التليفون/.test(window.__p)&&!/الزوجة:/.test(window.__p)));
 ok('no page errors',errs.length===0,errs.join('|'));
 await b.close()})();
