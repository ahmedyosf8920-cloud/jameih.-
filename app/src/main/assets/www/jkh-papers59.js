/* v59 — إعادة استخدام الكشوف + استيراد كشف من ملف (Excel/CSV) وتعديله (إضافة فقط)
   - «🔁 إعادة استخدام»: ينشئ كشفًا جديدًا من كشف سابق (نفس الأسماء والكميات) بدون تسجيل استلام.
   - «📥 استيراد كشف من ملف»: من الكمبيوتر أو الموبايل (xlsx / csv)، مع معاينة قابلة للتعديل قبل الحفظ.
   - «✏ تعديل»: محرر صفوف للكشوف المستوردة وكشوف الجهات (تعديل/إضافة/حذف صفوف).
   قراءة xlsx مدمجة (لا تحتاج مكتبة ولا إنترنت). ملفات xls القديمة تحتاج مكتبة Excel المحمّلة أو حفظها xlsx/csv. */
(function(){
 'use strict';
 const G=id=>document.getElementById(id);
 const E=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const uid=()=>(window.crypto&&crypto.randomUUID)?crypto.randomUUID():'v59'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
 const pad=n=>String(n).padStart(2,'0');
 const todayISO=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
 const X=()=>{window.EXTRA=window.EXTRA||{};return window.EXTRA};
 const SH=()=>X().sheets=X().sheets||[];
 const CASES=()=>{try{return Array.isArray(cases)?cases:[]}catch(e){return[]}};
 const persist=()=>{try{if(typeof window.save==='function')window.save()}catch(e){}};
 const say=m=>{try{if(typeof window.tst==='function')return window.tst(m)}catch(e){}try{if(typeof window.toast==='function')return window.toast(m)}catch(e){}};
 const digits=s=>String(s==null?'':s).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g,'');
 const normAr=s=>String(s==null?'':s).replace(/[ً-ْـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
 const AIDS=['مواد غذائية','مبلغ نقدي','ملابس','بطاطين','أجهزة وأدوات','مستلزمات مدرسية','أدوية وعلاج','كراتين رمضان','لحوم','أخرى'];

 /* ================= قراءة الملفات ================= */
 function parseCSV(text){
  text=String(text).replace(/^﻿/,'');
  const first=text.split(/\r?\n/,1)[0]||'';const cnt=c=>first.split(c).length-1;
  const d=[['\t',cnt('\t')],[';',cnt(';')],[',',cnt(',')]].sort((a,b)=>b[1]-a[1])[0][0];
  const rows=[];let row=[],cur='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
   if(q){if(c==='"'){if(text[i+1]==='"'){cur+='"';i++}else q=false}else cur+=c}
   else if(c==='"')q=true;
   else if(c===d){row.push(cur);cur=''}
   else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cur);cur='';rows.push(row);row=[]}
   else cur+=c}
  if(cur!==''||row.length){row.push(cur);rows.push(row)}
  return rows;
 }
 function decodeText(buf){try{return new TextDecoder('utf-8',{fatal:true}).decode(buf)}catch(e){try{return new TextDecoder('windows-1256').decode(buf)}catch(_){return new TextDecoder().decode(buf)}}}
 async function unzip(buf){
  const dv=new DataView(buf),u8=new Uint8Array(buf);let eocd=-1;
  for(let i=u8.length-22;i>=Math.max(0,u8.length-65557);i--){if(dv.getUint32(i,true)===0x06054b50){eocd=i;break}}
  if(eocd<0)throw new Error('ملف Excel غير صالح');
  const n=dv.getUint16(eocd+10,true);let p=dv.getUint32(eocd+16,true);const files={};
  for(let k=0;k<n;k++){if(dv.getUint32(p,true)!==0x02014b50)break;
   const method=dv.getUint16(p+10,true),csize=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),el=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),lho=dv.getUint32(p+42,true);
   files[new TextDecoder().decode(u8.subarray(p+46,p+46+nl))]={method,csize,lho};p+=46+nl+el+cl}
  return {files,async read(name){const f=files[name];if(!f)return null;const lp=f.lho,start=lp+30+dv.getUint16(lp+26,true)+dv.getUint16(lp+28,true),data=u8.subarray(start,start+f.csize);
   if(f.method===0)return new TextDecoder().decode(data);
   if(f.method!==8)throw new Error('ضغط غير مدعوم داخل ملف Excel');
   if(typeof DecompressionStream==='undefined')throw new Error('هذا المتصفح لا يدعم قراءة xlsx مباشرة — احفظ الملف بصيغة CSV');
   const out=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));return new TextDecoder().decode(await new Response(out).arrayBuffer())}};
 }
 async function readXlsx(buf){
  const z=await unzip(buf);
  const P=s=>new DOMParser().parseFromString(s,'application/xml');
  let sheetPath='xl/worksheets/sheet1.xml';
  try{const wb=P(await z.read('xl/workbook.xml')),rels=P(await z.read('xl/_rels/workbook.xml.rels')),sh=wb.getElementsByTagName('sheet')[0];
   const rid=sh&&(sh.getAttribute('r:id')||sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'));
   [...rels.getElementsByTagName('Relationship')].forEach(r=>{if(r.getAttribute('Id')===rid){const t=r.getAttribute('Target');sheetPath=t.charAt(0)==='/'?t.slice(1):'xl/'+t}})}catch(e){}
  if(!z.files[sheetPath]){const any=Object.keys(z.files).find(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n));if(any)sheetPath=any}
  const shared=[];const sst=await z.read('xl/sharedStrings.xml');
  if(sst)[...P(sst).getElementsByTagName('si')].forEach(si=>shared.push([...si.getElementsByTagName('t')].map(t=>t.textContent).join('')));
  const sx=await z.read(sheetPath);if(!sx)throw new Error('لم يُعثر على ورقة بيانات داخل الملف');
  const colIdx=ref=>{const m=/^([A-Z]+)/i.exec(ref||'');let n=0;if(m)for(const ch of m[1].toUpperCase())n=n*26+ch.charCodeAt(0)-64;return n-1};
  const rows=[];
  [...P(sx).getElementsByTagName('row')].forEach(r=>{const out=[];let pos=0;
   [...r.getElementsByTagName('c')].forEach(c=>{const ref=c.getAttribute('r'),i=ref?colIdx(ref):pos;pos=i+1;const t=c.getAttribute('t'),v=c.getElementsByTagName('v')[0];let val='';
    if(t==='s')val=shared[+(v&&v.textContent)]||'';
    else if(t==='inlineStr')val=[...c.getElementsByTagName('t')].map(x=>x.textContent).join('');
    else if(v){val=v.textContent;if(!t||t==='n'){if(/e\+?\d+$/i.test(val)&&isFinite(+val)&&Math.abs(+val)<1e21)val=Number(val).toFixed(0)}}
    out[i]=String(val==null?'':val)});
   const r2=[];for(let i=0;i<out.length;i++)r2.push(out[i]==null?'':out[i]);rows.push(r2)});
  return rows;
 }
 async function readFileRows(file){
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(['csv','txt','tsv'].includes(ext))return parseCSV(decodeText(await file.arrayBuffer()));
  if(ext==='xlsx')return readXlsx(await file.arrayBuffer());
  if(ext==='xls'){
   if(window.XLSX){const wb=XLSX.read(await file.arrayBuffer(),{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]];return XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''}).map(r=>r.map(v=>String(v)))}
   throw new Error('ملف xls القديم: افتحه في Excel واحفظه بصيغة xlsx أو CSV ثم اخترْه.');
  }
  throw new Error('الصيغ المدعومة: xlsx أو csv');
 }

 /* ================= ربط الأعمدة ================= */
 const FIELDS=[['name','الاسم *'],['nid','الرقم القومي'],['phone','الهاتف'],['address','العنوان'],['members','عدد الأفراد'],['qty','الكمية / المبلغ'],['caseNo','رقم الحالة'],['note','ملاحظات']];
 const SYN={
  name:[/^(اسم|الاسم|اسم الحاله|اسم المستفيد|المستفيد|اسم الاسره|الاسره|الحاله|اسم المستلم|المستلم)$/,/اسم(?!.*(زوج|ابن|اب\b|ام\b))/],
  nid:[/(رقم قومي|الرقم القومي|بطاقه|الرقم الوطني|قومي)/],
  phone:[/(هاتف|تليفون|موبايل|محمول|واتس|رقم التليفون|تلفون)/],
  address:[/(عنوان|قريه|منطقه|محل الاقامه|بلد)/],
  members:[/(عدد الافراد|الافراد|افراد)/],
  qty:[/(كميه|مبلغ|قيمه|مقدار|عدد الكراتين|المساعده)/],
  caseNo:[/(رقم الحاله|كود الحاله|رقم الملف|كود)/],
  note:[/(ملاحظ)/]};
 function autoMap(headers){const map={};const used=new Set();
  ['caseNo','nid','phone','members','qty','address','note','name'].forEach(f=>{
   for(const re of SYN[f]){const i=headers.findIndex((h,k)=>!used.has(k)&&re.test(normAr(h)));if(i>=0){map[f]=i;used.add(i);break}}});
  return map}
 function looksHeader(r){const n=(r||[]).filter(x=>String(x).trim()).length;if(n<2)return false;const m=autoMap(r.map(x=>String(x)));return m.name!=null||Object.keys(m).length>=2}
 const normPhone=v=>{let d=digits(v);if(d.length===10&&d.charAt(0)==='1')d='0'+d;return d};
 const normNid=v=>{const d=digits(v);return d};

 function buildRows(raw,map,hasHeader){
  const body=hasHeader?raw.slice(1):raw,out=[];
  body.forEach(r=>{if(!r||!r.some(c=>String(c).trim()))return;
   const g=f=>map[f]==null?'':String(r[map[f]]==null?'':r[map[f]]).trim();
   const o={name:g('name'),nid:normNid(g('nid')),phone:normPhone(g('phone')),address:g('address'),members:g('members'),qty:g('qty'),caseNo:g('caseNo'),note:g('note')};
   if(o.name||o.nid||o.phone)out.push(o)});
  return out;
 }
 function findCase(o){const nid=o.nid;if(nid&&nid.length===14){const c=CASES().find(c=>[c.nid,c.husbandNid,c.wifeNid].some(v=>digits(v)===nid));if(c)return c}return null}

 /* ================= نافذة المعاينة/التعديل ================= */
 function overlay(html,wide){const old=G('v59Ov');if(old)old.remove();const o=document.createElement('div');o.id='v59Ov';
  o.style.cssText='position:fixed;inset:0;z-index:10001;background:#0009;display:flex;align-items:center;justify-content:center;padding:8px';
  o.innerHTML='<div dir="rtl" style="background:#fff;border-radius:16px;width:100%;max-width:'+(wide?'1100':'560')+'px;max-height:96vh;overflow:auto;padding:14px">'+html+'</div>';
  document.body.appendChild(o);o.addEventListener('mousedown',e=>{if(e.target===o&&!o.__keep)o.remove()});return o}
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){const o=G('v59Ov');if(o)o.remove()}});

 const metaHtml=(m)=>'<div class="formgrid" style="margin:6px 0"><div class="field"><label>اسم الكشف *</label><input id="v59Name" value="'+E(m.name)+'"></div>'+
  '<div class="field"><label>تاريخ التسليم</label><input id="v59Date" type="date" value="'+E(m.date)+'"></div>'+
  '<div class="field"><label>نوع المساعدة</label><input id="v59Type" list="v59aids" value="'+E(m.type)+'"><datalist id="v59aids">'+AIDS.map(a=>'<option value="'+a+'">').join('')+'</datalist></div>'+
  '<div class="field"><label>كمية افتراضية للصفوف الفارغة</label><input id="v59Qty" value="'+E(m.qty)+'"></div>'+
  '<div class="field" style="grid-column:1/-1"><label>ملاحظات الكشف</label><input id="v59Note" value="'+E(m.note||'')+'"></div></div>';

 function tableHtml(rows,link){
  const th='<tr><th>م</th><th>الاسم</th><th>الرقم القومي</th><th>الهاتف</th><th>العنوان</th><th>الأفراد</th><th>الكمية</th><th>رقم الحالة</th><th></th></tr>';
  const f=(i,k,w,lk)=>'<td><input data-i="'+i+'" data-f="'+k+'" value="'+E(rows[i][k])+'" '+(lk?'disabled ':'')+'style="width:'+w+';min-width:60px"></td>';
  return '<table style="width:100%;font-size:13px"><thead>'+th+'</thead><tbody>'+rows.map((r,i)=>{const c=link?findCase(r):null,lk=!!r._locked;
   return '<tr><td>'+(i+1)+(c||r.caseId?' 🔗':'')+(r.received?' ✅':'')+'</td>'+f(i,'name','170px',lk)+f(i,'nid','140px',lk)+f(i,'phone','110px',lk)+f(i,'address','150px',lk)+f(i,'members','50px',lk)+f(i,'qty','80px')+f(i,'caseNo','70px',lk)+'<td><button type="button" class="danger" data-del="'+i+'">✕</button></td></tr>'}).join('')+'</tbody></table>'}

 function rowFromState(o,qtyDef){
  const c=o._caseId?CASES().find(z=>z.id===o._caseId):null;
  if(c)return {caseId:c.id,caseNo:c.no,caseName:c.name,name:c.name,qty:o.qty||qtyDef,received:false,inserted:false};
  return {caseId:'imp:'+uid(),caseNo:o.caseNo||'—',caseName:o.name,name:o.name,husband:'',wife:'',husbandNid:o.nid,wifeNid:'',nid:o.nid,phones:o.phone?[o.phone]:[],phone:o.phone,address:o.address,members:o.members,social:'',fileStatus:'',note:o.note||'',qty:o.qty||qtyDef,received:false,inserted:false,imported:true};
 }

 /* ----- استيراد ----- */
 function startImport(){
  const inp=document.createElement('input');inp.type='file';inp.accept='.xlsx,.xls,.csv,.txt,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';
  inp.onchange=async()=>{const file=inp.files[0];if(!file)return;
   try{const raw=await readFileRows(file);if(!raw.length)throw new Error('الملف فارغ');showImport(file,raw)}catch(e){alert('تعذّر قراءة الملف: '+(e.message||e))}};
  inp.click();
 }
 function showImport(file,raw){
  const hdrAuto=looksHeader(raw[0]);let hasHeader=hdrAuto;const ncol=Math.max(...raw.slice(0,50).map(r=>r.length),1);
  const heads=()=>Array.from({length:ncol},(_,i)=>hasHeader&&raw[0][i]!=null&&String(raw[0][i]).trim()?String(raw[0][i]).trim():'عمود '+(i+1));
  let map=hasHeader?autoMap(heads()):{name:0,phone:undefined};
  if(!hasHeader)map={name:0};
  let rows=buildRows(raw,map,hasHeader),linkOn=true;
  const draw=()=>{
   const hs=heads(),linked=rows.filter(r=>findCase(r)).length;
   const o=overlay('<div style="display:flex;justify-content:space-between;gap:8px"><h3 style="margin:0">📥 استيراد كشف من ملف — '+E(file.name)+'</h3><button type="button" class="secondary" id="v59x">✕ إغلاق</button></div>'+
    '<div class="notice" style="margin:6px 0">راجع الأعمدة والأسماء وعدّل ما تريد قبل الحفظ. الصفوف: <b>'+rows.length+'</b>'+(linked?' — منها <b>'+linked+'</b> مطابقة لحالات مسجّلة بالرقم القومي (🔗)':'')+'.</div>'+
    metaHtml({name:file.name.replace(/\.[^.]+$/,''),date:todayISO(),type:'مواد غذائية',qty:'1',note:'مستورد من ملف: '+file.name})+
    '<div style="margin:6px 0"><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="v59H" style="width:auto" '+(hasHeader?'checked':'')+'> الصف الأول عناوين أعمدة</label></div>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;margin:6px 0">'+FIELDS.map(([k,l])=>'<label style="font-size:12px">'+l+'<select data-m="'+k+'"><option value="">— بدون —</option>'+hs.map((h,i)=>'<option value="'+i+'"'+(map[k]===i?' selected':'')+'>'+E(h)+'</option>').join('')+'</select></label>').join('')+'</div>'+
    '<label style="display:flex;gap:6px;align-items:center;margin:4px 0"><input type="checkbox" id="v59L" style="width:auto" '+(linkOn?'checked':'')+'> ربط الأسماء المطابقة بسجل الحالات تلقائيًا (بالرقم القومي فقط)</label>'+
    '<div style="overflow:auto;max-height:42vh;border:1px solid #dde;border-radius:10px" id="v59T">'+tableHtml(rows,linkOn)+'</div>'+
    '<div class="toolbar" style="margin-top:8px"><button type="button" class="secondary" id="v59Add">＋ إضافة صف</button><button type="button" class="primary" id="v59Ok" style="flex:2">حفظ الكشف</button></div>',true);
   o.querySelector('#v59x').onclick=()=>o.remove();
   const keep=()=>({name:G('v59Name').value,date:G('v59Date').value,type:G('v59Type').value,qty:G('v59Qty').value,note:G('v59Note').value});
   let meta=keep();
   const redraw=()=>{meta=keep();draw();const o2=G('v59Ov');G('v59Name').value=meta.name;G('v59Date').value=meta.date;G('v59Type').value=meta.type;G('v59Qty').value=meta.qty;G('v59Note').value=meta.note};
   o.querySelector('#v59H').onchange=e=>{hasHeader=e.target.checked;map=hasHeader?autoMap(heads()):{name:0};rows=buildRows(raw,map,hasHeader);redraw()};
   o.querySelectorAll('[data-m]').forEach(s=>s.onchange=()=>{const k=s.dataset.m;if(s.value==='')delete map[k];else map[k]=+s.value;rows=buildRows(raw,map,hasHeader);redraw()});
   o.querySelector('#v59L').onchange=e=>{linkOn=e.target.checked;redraw()};
   const bind=()=>{o.querySelectorAll('#v59T [data-f]').forEach(i=>i.oninput=()=>{rows[+i.dataset.i][i.dataset.f]=i.value});o.querySelectorAll('#v59T [data-del]').forEach(b=>b.onclick=()=>{rows.splice(+b.dataset.del,1);redraw()})};bind();
   o.querySelector('#v59Add').onclick=()=>{rows.push({name:'',nid:'',phone:'',address:'',members:'',qty:'',caseNo:'',note:''});redraw()};
   o.querySelector('#v59Ok').onclick=()=>{
    const m=keep();if(!m.name.trim())return alert('اكتب اسم الكشف');const use=rows.filter(r=>String(r.name).trim()||r.nid||r.phone);if(!use.length)return alert('لا توجد صفوف للحفظ');
    if(use.some(r=>!String(r.name).trim()&&!findCase(r))&&!confirm('بعض الصفوف بدون اسم. متابعة؟'))return;
    const qd=m.qty||'1';
    const sheet={id:uid(),name:m.name.trim(),date:m.date||todayISO(),type:m.type||'مساعدة',qty:qd,note:m.note,kind:'gen',kidFrom:null,kidTo:null,status:'تحت التسليم',addToDist:false,imported:true,
     rows:use.map(r=>rowFromState(Object.assign({},r,{_caseId:linkOn&&findCase(r)?findCase(r).id:null}),qd))};
    SH().unshift(sheet);persist();o.remove();try{window.renderSheets&&window.renderSheets()}catch(e){}
    say('تم إنشاء الكشف ('+sheet.rows.length+' صف)');try{window.Sheets.open(sheet.id)}catch(e){}};
  };
  draw();
 }

 /* ----- تعديل كشف (مستورد / جهة) ----- */
 function editSheet(x){
  const rows=x.rows.map(r=>{const linked=!!(r.caseId&&!String(r.caseId).startsWith('imp:')&&!String(r.caseId).startsWith('ent:')&&CASES().some(c=>c.id===r.caseId));
   const c=linked?CASES().find(c=>c.id===r.caseId):null;
   return {_ref:r,_locked:linked,received:r.received,caseId:linked?r.caseId:null,name:c?c.name:(r.caseName||r.name||''),nid:c?(c.nid||c.husbandNid||''):(r.husbandNid||r.nid||''),phone:c?(c.phone||''):(r.phone||(r.phones||[])[0]||''),address:c?(c.address||c.area||''):(r.address||''),members:c?(c.members||''):(r.members||''),qty:r.qty||'',caseNo:c?c.no:(r.caseNo&&r.caseNo!=='—'&&r.caseNo!=='جهة'?r.caseNo:''),note:r.note||''}});
  const draw=()=>{
   const o=overlay('<div style="display:flex;justify-content:space-between;gap:8px"><h3 style="margin:0">✏ تعديل الكشف</h3><button type="button" class="secondary" id="v59x">✕ إغلاق</button></div>'+
    metaHtml({name:x.name,date:x.date,type:x.type,qty:x.qty||'',note:x.note||''})+
    '<div class="notice" style="margin:6px 0">🔗 = مرتبط بحالة مسجّلة (بياناتها تتعدل من سجل الحالات، وتعدّل الكمية هنا). ✅ = تم تسجيل استلامه.</div>'+
    '<div style="overflow:auto;max-height:46vh;border:1px solid #dde;border-radius:10px" id="v59T">'+tableHtml(rows,false)+'</div>'+
    '<div class="toolbar" style="margin-top:8px"><button type="button" class="secondary" id="v59Add">＋ إضافة صف</button><button type="button" class="primary" id="v59Ok" style="flex:2">حفظ التعديلات</button></div>',true);
   const keep=()=>({name:G('v59Name').value,date:G('v59Date').value,type:G('v59Type').value,qty:G('v59Qty').value,note:G('v59Note').value});
   o.querySelector('#v59x').onclick=()=>o.remove();
   const redraw=()=>{const m=keep();draw();G('v59Name').value=m.name;G('v59Date').value=m.date;G('v59Type').value=m.type;G('v59Qty').value=m.qty;G('v59Note').value=m.note};
   o.querySelectorAll('#v59T [data-f]').forEach(i=>i.oninput=()=>{rows[+i.dataset.i][i.dataset.f]=i.value});
   o.querySelectorAll('#v59T [data-del]').forEach(b=>b.onclick=()=>{const r=rows[+b.dataset.del];if(r.received&&!confirm('هذا الصف مسجّل كمستلم. حذفه؟'))return;rows.splice(+b.dataset.del,1);redraw()});
   o.querySelector('#v59Add').onclick=()=>{rows.push({_ref:null,_locked:false,received:false,caseId:null,name:'',nid:'',phone:'',address:'',members:'',qty:'',caseNo:'',note:''});redraw()};
   o.querySelector('#v59Ok').onclick=()=>{
    const m=keep();if(!m.name.trim())return alert('اكتب اسم الكشف');
    const keepRows=rows.filter(r=>r._ref||r.caseId||String(r.name).trim()||r.nid||r.phone);if(!keepRows.length)return alert('لا توجد صفوف');
    x.name=m.name.trim();x.date=m.date||x.date;x.type=m.type||x.type;x.qty=m.qty||x.qty;x.note=m.note;
    x.rows=keepRows.map(s=>{
     if(s._ref){const r=s._ref;r.qty=s.qty;
      if(!s._locked){r.caseNo=s.caseNo||r.caseNo;r.caseName=s.name;r.name=s.name;r.husbandNid=s.nid;r.nid=s.nid;r.phone=s.phone;r.phones=s.phone?[s.phone]:[];r.address=s.address;r.members=s.members;r.note=s.note}
      return r}
     return rowFromState(s,x.qty||'1')});
    persist();o.remove();try{window.renderSheets&&window.renderSheets()}catch(e){}say('تم حفظ التعديلات')};
  };
  draw();
 }

 /* ----- إعادة استخدام كشف ----- */
 function reuseSheet(x){
  const rc=(x.rows||[]).filter(r=>r.received).length;
  const o=overlay('<div style="display:flex;justify-content:space-between;gap:8px"><h3 style="margin:0">🔁 إعادة استخدام الكشف</h3><button type="button" class="secondary" id="v59x">✕ إغلاق</button></div>'+
   '<div class="notice" style="margin:6px 0">ينشئ كشفًا جديدًا بنفس الأسماء من «'+E(x.name)+'» ('+x.rows.length+' صف) وبدون تسجيل استلام، فتستخدمه مرة تانية. الكشف الأصلي لا يتغير.</div>'+
   metaHtml({name:x.name+' — '+new Date().toLocaleDateString('ar-EG',{month:'long',year:'numeric'}),date:todayISO(),type:x.type,qty:'',note:x.note||''}).replace('كمية افتراضية للصفوف الفارغة','كمية جديدة لكل الصفوف (اتركها فارغة للإبقاء على كمية كل صف)')+
   (rc?'<label style="display:flex;gap:6px;align-items:center;margin:6px 0"><input type="checkbox" id="v59Only" style="width:auto"> استبعاد من استلموا في الكشف الأصلي ('+rc+') وإبقاء من لم يستلم فقط</label>':'')+
   '<div class="toolbar" style="margin-top:8px"><button type="button" class="primary" id="v59Ok" style="flex:2">إنشاء الكشف الجديد</button></div>');
  o.querySelector('#v59x').onclick=()=>o.remove();
  o.querySelector('#v59Ok').onclick=()=>{
   const name=G('v59Name').value.trim();if(!name)return alert('اكتب اسم الكشف');
   const only=G('v59Only')&&G('v59Only').checked,qty=G('v59Qty').value.trim();
   const src=(x.rows||[]).filter(r=>!(only&&r.received));if(!src.length)return alert('لا توجد صفوف لإعادة استخدامها');
   const rows=src.map(r=>{const c=JSON.parse(JSON.stringify(r));c.received=false;c.inserted=false;delete c.minuteId;if(qty)c.qty=qty;if(String(c.caseId||'').startsWith('imp:'))c.caseId='imp:'+uid();return c});
   const ns={id:uid(),name,date:G('v59Date').value||todayISO(),type:G('v59Type').value||x.type,qty:qty||x.qty||'1',note:G('v59Note').value,kind:x.kind||'gen',kidFrom:x.kidFrom==null?null:x.kidFrom,kidTo:x.kidTo==null?null:x.kidTo,status:'تحت التسليم',addToDist:!!x.addToDist,rows,reusedFrom:x.id};
   if(x.imported)ns.imported=true;if(x.entityId){ns.entityId=x.entityId;ns.month=x.month}
   SH().unshift(ns);persist();o.remove();try{window.renderSheets&&window.renderSheets()}catch(e){}
   say('تم إنشاء كشف جديد ('+rows.length+' صف)');try{window.Sheets.open(ns.id)}catch(e){}};
 }

 /* ================= ربط الواجهة ================= */
 function hook(){
  const S=window.Sheets;if(!S||S.__v59)return false;S.__v59=true;
  const oEdit=S.edit;
  S.edit=function(id){const x=SH().find(z=>z.id===id);if(x&&(x.imported||x.entityId)){editSheet(x);return}return oEdit.apply(this,arguments)};
  const oConfirm=S.confirm;
  S.confirm=function(id){const x=SH().find(z=>z.id===id);if(x&&x.imported){const s=G('shAdd2');if(s)s.value='0'}return oConfirm.apply(this,arguments)};
  const oRender=window.renderSheets;
  window.renderSheets=function(){
   const r=oRender.apply(this,arguments);
   try{
    const top=document.querySelector('#pendingSheets .top');
    if(top&&!G('v59Imp')){const b=document.createElement('button');b.id='v59Imp';b.type='button';b.className='secondary';b.textContent='📥 استيراد كشف من ملف';b.style.marginInlineStart='6px';b.onclick=startImport;
     const nb=top.querySelector('button.primary');if(nb)nb.insertAdjacentElement('afterend',b);else top.appendChild(b)}
    document.querySelectorAll('#sheetsTable tbody tr').forEach(tr=>{
     const op=tr.querySelector('button[onclick^="Sheets.open("]');if(!op||tr.querySelector('[data-v59]'))return;
     const m=/Sheets\.open\('([^']+)'\)/.exec(op.getAttribute('onclick'));if(!m)return;const id=m[1],x=SH().find(z=>z.id===id);
     const mk=(t,fn)=>{const b=document.createElement('button');b.type='button';b.className='secondary';b.dataset.v59='1';b.textContent=t;b.style.marginInlineStart='4px';b.onclick=fn;return b};
     op.insertAdjacentElement('afterend',mk('🔁 إعادة استخدام',()=>{const s=SH().find(z=>z.id===id);if(s)reuseSheet(s)}));
     if(x&&(x.imported||x.entityId))op.insertAdjacentElement('afterend',mk('✏ تعديل',()=>{const s=SH().find(z=>z.id===id);if(s)editSheet(s)}));
    });
   }catch(e){}
   return r};
  try{if(G('sheetsTable'))window.renderSheets()}catch(e){}
  return true};

 window.JKHPapers59={parseCSV,readXlsx,readFileRows,autoMap,looksHeader,buildRows,editSheet,reuseSheet,startImport,showImport};
 if(!hook()){let n=0;const t=setInterval(()=>{if(hook()||++n>40)clearInterval(t)},250)}
})();
