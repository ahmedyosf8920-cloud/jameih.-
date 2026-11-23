const {chromium}=require('playwright');const dir=process.argv[2]||'/home/claude/jkh55',FX=process.argv[3]||'/tmp/t59';
const res=[];const ok=(n,c,i)=>{res.push(!!c);console.log(c?'PASS':'FAIL',n,c?'':(i||''))};
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1300,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('dialog',d=>d.accept());
 await pg.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
 await pg.goto('file://'+dir+'/index.html');await pg.waitForTimeout(800);
 await pg.evaluate(()=>{session={role:'مدير النظام',name:'أدمن',permissions:null};document.getElementById('login').style.display='none';document.getElementById('app').classList.add('show');
  const mk=(id,no,name,nid)=>({id,no,name,nid,husband:name,wife:'',husbandNid:nid,wifeNid:'',husbandPhone:'0100',wifePhone:'',phone:'0100',wa:'0100',date:'2026-01-01',needs:[],family:[],status:'جديدة',researcher:'x',docs:[],visits:[],aid:[]});
  cases.push(mk('c1','101','محمد أحمد','28703052200667'),mk('c2','102','سعيد علي','29001012200999'));renderAll();
  EXTRA.sheets=[{id:'s1',name:'كشف أصلي',date:'2026-10-01',type:'مواد غذائية',qty:'1',note:'',kind:'gen',status:'تحت التسليم',addToDist:false,rows:[
   {caseId:'c1',caseNo:'101',caseName:'محمد أحمد',name:'محمد أحمد',qty:'2',received:true,inserted:false},{caseId:'c2',caseNo:'102',caseName:'سعيد علي',name:'سعيد علي',qty:'3',received:false,inserted:false}]}];
  window.goPage('pendingSheets')});await pg.waitForTimeout(500);
 ok('module loaded + import button present',await pg.evaluate(()=>!!window.JKHPapers59&&Sheets.__v59===true)&&!!(await pg.$('#v59Imp')));
 // ---------- إعادة الاستخدام ----------
 ok('reuse button on list row',(await pg.$$('#sheetsTable [data-v59]')).length>=1);
 await pg.click('#sheetsTable button:has-text("إعادة استخدام")');await pg.waitForSelector('#v59Only');
 await pg.fill('#v59Name','كشف نوفمبر');await pg.fill('#v59Qty','5');await pg.check('#v59Only');await pg.click('#v59Ok');await pg.waitForTimeout(400);
 let st=await pg.evaluate(()=>({n:EXTRA.sheets.length,a:EXTRA.sheets.find(s=>s.name==='كشف نوفمبر'),o:EXTRA.sheets.find(s=>s.id==='s1')}));
 ok('reuse creates new sheet, only not-received, qty overridden, flags reset',st.n===2&&st.a.rows.length===1&&st.a.rows[0].caseId==='c2'&&st.a.rows[0].qty==='5'&&!st.a.rows[0].received&&st.a.status==='تحت التسليم');
 ok('original sheet untouched',st.o.rows.length===2&&st.o.rows[0].received===true&&st.o.name==='كشف أصلي');
 await pg.keyboard.press('Escape');await pg.evaluate(()=>{const o=document.getElementById('shOv');if(o)o.remove()});
 // ---------- استيراد xlsx ----------
 const imp=async(file)=>{const [fc]=await Promise.all([pg.waitForEvent('filechooser'),pg.click('#v59Imp')]);await fc.setFiles(FX+'/'+file);await pg.waitForSelector('#v59T')};
 await imp('list.xlsx');
 const pv=await pg.evaluate(()=>[...document.querySelectorAll('#v59T tbody tr')].map(tr=>[...tr.querySelectorAll('input')].map(i=>i.value)));
 ok('xlsx: 3 data rows (blank row skipped)',pv.length===3,JSON.stringify(pv));
 ok('xlsx: numeric NID kept exactly (14 digits) + phone leading zero',pv[0][1]==='29001012200123'&&pv[0][2]==='01012345678',JSON.stringify(pv[0]));
 ok('xlsx: header auto-mapping (name/address/members/qty)',pv[1][0]==='منى سعيد'&&pv[1][3]==='مطيريد'&&pv[1][4]==='3'&&pv[0][5]==='2',JSON.stringify(pv));
 ok('xlsx: NID match links to registered case (🔗)',await pg.evaluate(()=>/🔗/.test(document.querySelectorAll('#v59T tbody tr')[1].children[0].textContent)));
 await pg.fill('#v59Name','كشف مستورد');await pg.fill('#v59Qty','1');
 await pg.fill('#v59T tbody tr:nth-child(1) [data-f=name]','سمير علي (معدّل)');   // edit before save
 await pg.click('#v59Add');await pg.fill('#v59T tbody tr:nth-child(4) [data-f=name]','صف مضاف يدويًا');
 await pg.click('#v59Ok');await pg.waitForTimeout(500);
 st=await pg.evaluate(()=>{const s=EXTRA.sheets.find(s=>s.name==='كشف مستورد');return s&&{n:s.rows.length,imp:s.imported,r0:s.rows[0].caseName,r0q:s.rows[0].qty,link:s.rows[1].caseId,add:s.addToDist,r3:s.rows[3]&&s.rows[3].caseName,nid0:s.rows[0].husbandNid}});
 ok('imported sheet saved with edits (4 rows), editable first row',st&&st.n===4&&st.imp&&st.r0==='سمير علي (معدّل)'&&st.r0q==='2'&&st.r3==='صف مضاف يدويًا',JSON.stringify(st));
 ok('linked row keeps real caseId; not added to distributions',st.link==='c1'&&st.add===false);
 await pg.evaluate(()=>{const o=document.getElementById('shOv');if(o)o.remove()});
 // ---------- CSV (UTF-8 BOM + windows-1256) ----------
 for(const f of ['utf8.csv','win1256.csv']){await imp(f);const r=await pg.evaluate(()=>[...document.querySelectorAll('#v59T tbody tr')].map(tr=>[...tr.querySelectorAll('input')].map(i=>i.value)));
  ok('csv '+f+': Arabic decoded, quoted comma/quote handled, qty mapped',r.length===2&&r[0][0]==='حسن محمد'&&r[0][5]==='500'&&r[1][0]==='أحمد "الكبير"'&&r[1][2]==='0100,2'.replace(/\D/g,''),JSON.stringify(r));
  await pg.click('#v59x')}
 // ---------- تعديل كشف مستورد ----------
 await pg.evaluate(()=>{const o=document.getElementById('v59Ov');if(o)o.remove();renderSheets()});
 await pg.click('#sheetsTable tr:has-text("كشف مستورد") button:has-text("تعديل")');await pg.waitForSelector('#v59Ok');
 await pg.fill('#v59Name','كشف مستورد 2');await pg.fill('#v59T tbody tr:nth-child(3) [data-f=qty]','9');await pg.click('#v59T tbody tr:nth-child(4) [data-del]');await pg.click('#v59Ok');await pg.waitForTimeout(400);
 st=await pg.evaluate(()=>{const s=EXTRA.sheets.find(s=>s.name==='كشف مستورد 2');return s&&{n:s.rows.length,q:s.rows[2].qty}});
 ok('edit imported sheet: rename + qty + delete row persisted',st&&st.n===3&&st.q==='9',JSON.stringify(st));
 // ---------- طباعة: خانة التوقيع 2.5 سم ----------
 const html=await pg.evaluate(()=>Sheets.html(EXTRA.sheets.find(s=>s.name==='كشف مستورد 2'),true));
 const pop=await b.newPage({viewport:{width:1123,height:794}});await pop.setContent(html);await pop.waitForTimeout(300);
 const box=await pop.evaluate(()=>{const c=document.querySelector('td.sgc').getBoundingClientRect(),h=document.querySelector('thead th:last-child').getBoundingClientRect();return {w:c.width,h:c.height,hw:h.width}});
 const cm=v=>v/37.795;
 ok('print: signature cell ≥ 2.5cm × 2.5cm',cm(box.w)>=2.45&&cm(box.h)>=2.45,JSON.stringify(box)+' => '+cm(box.w).toFixed(2)+'x'+cm(box.h).toFixed(2));
 await pop.screenshot({path:'/tmp/print59.png'});await pop.close();
 // ---------- تأكيد الاستلام على كشف مستورد ----------
 await pg.evaluate(()=>{const id=EXTRA.sheets.find(s=>s.name==='كشف مستورد 2').id;Sheets.open(id)});await pg.waitForSelector('#shr0');await pg.check('#shr0');
 await pg.evaluate(()=>{const id=EXTRA.sheets.find(s=>s.name==='كشف مستورد 2').id;Sheets.confirm(id)});await pg.waitForSelector('#v56Item',{timeout:4000});
 ok('confirm on imported sheet → delivery dialog; no distribution rows added',await pg.evaluate(()=>distributions.length===0||!distributions.some(d=>String(d.caseId||'').startsWith('imp:'))));
 await pg.click('#v56Skip');
 // ---------- قسم الأوراق والكشوف + الأرشيف ----------
 const M=await pg.evaluate(()=>{renderAll();const m={};document.querySelectorAll('#nav .nav-group').forEach(g=>{m[g.dataset.s]=[...g.querySelectorAll('.nav-sub button')].map(b=>b.dataset.id)});return m});
 ok('papers section exists with the upload page',(M.papers||[]).includes('f52Arch')&&(M.papers||[]).includes('archive')&&!(M.fin52||[]).includes('f52Arch'),JSON.stringify(M.papers));
 const src=require('fs').readFileSync(dir+'/jkh-fin52.js','utf8');
 ok('archive upload: Word + camera + category presets in source',/\.doc,\.docx/.test(src)&&/capture="environment"/.test(src)&&/كشوف توزيع/.test(src)&&/docx:'application\/vnd\.openxmlformats-officedocument\.wordprocessingml/.test(src));
 ok('no page errors',errs.length===0,errs.join(' | '));
 console.log(res.filter(Boolean).length+'/'+res.length);await b.close();process.exit(res.every(Boolean)?0:1)})()
