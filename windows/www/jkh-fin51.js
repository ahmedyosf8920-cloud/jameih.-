/* JKH Fin v51 — التسوية والإجراءات المحاسبية الموثقة (واجهة طبقة الخادم fin_v51_core.sql)
   كل الأرقام والاعتمادات والترحيل تتم داخل قاعدة البيانات؛ هذه الواجهة تعرض وتطلب فقط.
   لا تحفظ شيئًا في EXTRA ولا تحذف أي بيانات موجودة. */
(function(){'use strict';
 const $=id=>document.getElementById(id);
 const E=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const TYPES={cash_out:'إذن صرف نقدية',advance_req:'طلب صرف سلفة مؤقتة',advance_settle:'كشف تسوية سلفة',journal:'إذن تسوية / قيد يومية',cash_report:'كشف حركة الخزينة اليومي'};
 const ST={draft:'مسودة',review:'بانتظار المراجعة',reviewed:'تمت المراجعة',approved:'معتمد',posted:'مرحّل',cancelled:'ملغى'};
 const SC={draft:'#7a8f82',review:'#e0762a',reviewed:'#1d7fd1',approved:'#2fa04f',posted:'#075b36',cancelled:'#b3261e'};
 const ACCT={asset:'أصول',liability:'خصوم',equity:'حقوق ملكية',revenue:'إيرادات',expense:'مصروفات'};
 const M2=v=>(Math.round((Number(v)||0)*100)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const today=()=>new Date().toISOString().slice(0,10);
 const uid=()=>(crypto.randomUUID?crypto.randomUUID():'k'+Date.now()+Math.random().toString(16).slice(2));
 let CACHE={accounts:[],cc:[],advances:[]};
 function R(fn,a){if(typeof window.JKHRpc!=='function')return Promise.reject(new Error('الاتصال بقاعدة البيانات غير جاهز'));return window.JKHRpc(fn,a)}
 const msg=e=>{const m=(e&&(e.message||e.error_description||e.details))||String(e);return String(m).replace(/^.*?:\s*(?=[؀-ۿ])/,'')};
 const say=m=>{try{window.toast?window.toast(m):alert(m)}catch(e){alert(m)}};
 const fail=e=>{alert('لم تتم العملية: '+msg(e))};
 const me=()=>{try{return (window.__inboxCred&&window.__inboxCred.u)||''}catch(e){return ''}};
 const perms=()=>{try{const s=session;if(!s)return[];if(s.role==='مدير النظام')return['settle','settle_review','settle_approve','settle_post','settle_admin'];
   if(Array.isArray(s.permissions))return s.permissions;if(s.role==='محاسب')return['settle','settle_review','settle_post','settle_admin'];return[]}catch(e){return[]}};
 const has=k=>perms().includes(k);

 /* ---------- المبلغ بالحروف (جنيه مصري) ---------- */
 const ones=['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة','عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'];
 const tens=['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
 const hund=['','مائة','مائتان','ثلاثمائة','أربعمائة','خمسمائة','ستمائة','سبعمائة','ثمانمائة','تسعمائة'];
 function below1000(n){const p=[];const h=Math.floor(n/100),r=n%100;if(h)p.push(hund[h]);
  if(r){if(r<20)p.push(ones[r]);else{const t=Math.floor(r/10),o=r%10;p.push(o?ones[o]+' و'+tens[t]:tens[t])}}
  return p.join(' و')}
 function intWords(n){if(n===0)return'صفر';const parts=[];
  const bil=Math.floor(n/1e9),mil=Math.floor(n/1e6)%1000,th=Math.floor(n/1e3)%1000,rest=n%1000;
  if(bil)parts.push(bil===1?'مليار':bil===2?'ملياران':bil<=10?below1000(bil)+' مليارات':below1000(bil)+' مليارًا');
  if(mil)parts.push(mil===1?'مليون':mil===2?'مليونان':mil<=10?below1000(mil)+' ملايين':below1000(mil)+' مليونًا');
  if(th)parts.push(th===1?'ألف':th===2?'ألفان':th<=10?below1000(th)+' آلاف':below1000(th)+' ألفًا');
  if(rest)parts.push(below1000(rest));
  return parts.join(' و')}
 const noun=(n,zero,few,many)=>{const r=n%100;return r===0?zero:(r>=3&&r<=10?few:many)};
 function tafqeet(v){const x=Math.round((Number(v)||0)*100);if(!(x>0))return'';const pounds=Math.floor(x/100),pi=x%100;
  let s=pounds?(pounds===1?'جنيه واحد':pounds===2?'جنيهان':intWords(pounds)+noun(pounds,' جنيه',' جنيهات',' جنيهًا')):'';
  if(pi){const pw=pi===1?'قرش واحد':pi===2?'قرشان':intWords(pi)+(pi<=10?' قروش':' قرشًا');s+=(s?' و':'')+pw}
  return s+' مصريًا فقط لا غير'}

 /* ---------- واجهة عامة ---------- */
 function style(){if($('f51style'))return;const s=document.createElement('style');s.id='f51style';
  s.textContent='.f51{direction:rtl;color:#20372b}.f51 h3{margin:0 0 8px;color:#075b36}.f51bar{display:flex;gap:7px;flex-wrap:wrap;margin:8px 0;align-items:center}'+
  '.f51 button{border:0;border-radius:8px;padding:8px 12px;cursor:pointer;background:#e7efe9;color:#075b36;font-weight:700;font-family:inherit}.f51 button.p{background:#075b36;color:#fff}.f51 button.g{background:#c9a227;color:#fff}.f51 button.d{background:#b3261e;color:#fff}.f51 button:disabled{opacity:.5;cursor:default}'+
  '.f51 table{width:100%;border-collapse:collapse;background:#fff;font-size:13px}.f51 th{background:#075b36;color:#fff;padding:7px;text-align:right}.f51 td{padding:6px 7px;border-bottom:1px solid #e4eee7}.f51 tr.row:hover{background:#f4f9f5}'+
  '.f51 .tw{overflow:auto;border-radius:10px;border:1px solid #d9e6dd}.f51 .bd{display:inline-block;border-radius:20px;padding:2px 9px;color:#fff;font-size:12px}'+
  '.f51 input,.f51 select,.f51 textarea{padding:7px;border:1px solid #c9d8ce;border-radius:7px;font-family:inherit;box-sizing:border-box}.f51 .met{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:8px 0}.f51 .m{background:#fff;border:1px solid #d9e6dd;border-radius:11px;padding:10px;text-align:center}.f51 .m b{display:block;font-size:19px;color:#075b36}'+
  '.f51ov{position:fixed;inset:0;background:#0008;z-index:9990;display:flex;align-items:center;justify-content:center;padding:10px}.f51box{background:#fff;border-radius:15px;width:100%;max-width:860px;max-height:94vh;overflow:auto;padding:16px;direction:rtl}'+
  '.f51box .g2{display:grid;grid-template-columns:1fr 1fr;gap:9px}.f51box label{display:flex;flex-direction:column;gap:3px;font-size:13px}.f51box .w{grid-column:1/-1}.f51box input,.f51box select,.f51box textarea{padding:8px;border:1px solid #c9d8ce;border-radius:7px;font-family:inherit;width:100%;box-sizing:border-box}'+
  '.f51box .words{background:#fff8e1;border:1px dashed #c9a227;border-radius:8px;padding:7px;font-weight:700;color:#6b5400;min-height:20px}.f51box button{border:0;border-radius:8px;padding:8px 12px;cursor:pointer;background:#e7efe9;color:#075b36;font-weight:700;font-family:inherit}.f51box button.p{background:#075b36;color:#fff}.f51box button.d{background:#b3261e;color:#fff}.f51box button.g{background:#c9a227;color:#fff}'+
  '@media(max-width:640px){.f51box .g2{grid-template-columns:1fr}}';
  document.head.appendChild(s)}
 function overlay(html){close();const o=document.createElement('div');o.id='f51ov';o.className='f51ov';o.innerHTML='<div class="f51box">'+html+'</div>';document.body.appendChild(o);return o}
 function close(){const o=$('f51ov');if(o)o.remove()}
 function badge(s){return '<span class="bd" style="background:'+(SC[s]||'#777')+'">'+E(ST[s]||s)+'</span>'}

 async function loadRef(){try{const [a,v]=await Promise.all([R('fin_accounts_list'),R('fin_advances_list')]);
   CACHE.accounts=(a&&a.accounts)||(Array.isArray(a)?a:[]);CACHE.cc=(a&&a.cost_centers)||[];CACHE.advances=v||[]}catch(e){}}

 /* ---------- صفحة المستندات ---------- */
 let filt={type:'',status:'',q:''};
 async function pageDocs(){const b=$('f51Docs');if(!b)return;style();
  b.innerHTML='<div class="f51"><h3>📑 مستندات التسوية والإجراءات المحاسبية</h3>'+
   '<div class="f51bar">'+Object.entries(TYPES).map(([k,v])=>'<button class="p" data-new="'+k+'">＋ '+v+'</button>').join('')+'</div>'+
   '<div class="f51bar"><select id="f51t"><option value="">كل الأنواع</option>'+Object.entries(TYPES).map(([k,v])=>'<option value="'+k+'"'+(filt.type===k?' selected':'')+'>'+v+'</option>').join('')+'</select>'+
   '<select id="f51s"><option value="">كل الحالات</option>'+Object.entries(ST).map(([k,v])=>'<option value="'+k+'"'+(filt.status===k?' selected':'')+'>'+v+'</option>').join('')+'</select>'+
   '<input id="f51q" placeholder="بحث بالرقم أو الاسم أو البيان" value="'+E(filt.q)+'" style="min-width:220px"><button id="f51go">بحث</button></div>'+
   '<div id="f51list" class="tw"><p style="padding:12px">جارٍ التحميل…</p></div></div>';
  b.querySelectorAll('[data-new]').forEach(x=>x.onclick=()=>openForm(x.dataset.new));
  $('f51go').onclick=()=>{filt={type:$('f51t').value,status:$('f51s').value,q:$('f51q').value};pageDocs()};
  await loadRef();
  try{const l=await R('fin_doc_list',{p_type:filt.type||null,p_status:filt.status||null,p_q:filt.q||null,p_limit:200});
   $('f51list').innerHTML='<table><thead><tr><th>الرقم</th><th>النوع</th><th>التاريخ</th><th>المبلغ</th><th>الحالة</th><th>أنشأه</th></tr></thead><tbody>'+
    (l.length?l.map(d=>'<tr class="row" data-id="'+d.id+'" style="cursor:pointer"><td><b>'+E(d.doc_no)+'</b></td><td>'+E(TYPES[d.doc_type]||d.doc_type)+'</td><td>'+E(d.doc_date)+'</td><td>'+M2(d.amount)+'</td><td>'+badge(d.status)+'</td><td>'+E(d.created_by)+'</td></tr>').join(''):'<tr><td colspan="6" style="text-align:center;padding:14px">لا توجد مستندات.</td></tr>')+'</tbody></table>';
   $('f51list').querySelectorAll('tr.row').forEach(r=>r.onclick=()=>openDoc(r.dataset.id))}
  catch(e){$('f51list').innerHTML='<p style="padding:12px;color:#b3261e">تعذر التحميل: '+E(msg(e))+'<br>تأكد من تنفيذ ملف fin_v51_core.sql على قاعدة البيانات.</p>'}}

 /* ---------- نماذج الإدخال ---------- */
 const acctOpts=sel=>'<option value="">— اختر الحساب —</option>'+CACHE.accounts.filter(a=>a.active!==false).map(a=>'<option value="'+E(a.code)+'"'+(a.code===sel?' selected':'')+'>'+E(a.code+' — '+a.name)+'</option>').join('');
 const ccOpts=sel=>'<option value="">بدون</option>'+CACHE.cc.map(c=>'<option value="'+E(c.code)+'"'+(c.code===sel?' selected':'')+'>'+E(c.code+' — '+c.name)+'</option>').join('');
 const fld=(n,l,t,v,w,extra)=>'<label class="'+(w?'w':'')+'">'+l+'<input name="'+n+'" type="'+(t||'text')+'" value="'+E(v==null?'':v)+'" '+(extra||'')+'></label>';
 const area=(n,l,v)=>'<label class="w">'+l+'<textarea name="'+n+'" rows="2">'+E(v||'')+'</textarea></label>';

 async function openForm(type,doc){
  style();await loadRef();const P=(doc&&doc.payload)||{};const key=doc?null:uid();let h='<div style="display:flex;justify-content:space-between"><h3>'+E(TYPES[type])+(doc?' — '+E(doc.doc_no):'')+'</h3><button type="button" id="f51x">إغلاق ✕</button></div><form id="f51f" class="g2">';
  h+=fld('date','التاريخ','date',doc?doc.doc_date:today());
  if(type==='cash_out'){
   h+=fld('beneficiary','اسم المستفيد / المستلم','text',P.beneficiary)+fld('amount','المبلغ (جنيه)','number',P.amount,false,'step="0.01" min="0.01"');
   h+='<div class="w words" id="f51w"></div>';
   h+='<label>سلفة مرتبطة (اختياري)<select name="advance_id"><option value="">— صرف عادي —</option>'+CACHE.advances.filter(a=>a.status==='open'&&!a.disbursed).map(a=>'<option value="'+a.id+'"'+(P.advance_id===a.id?' selected':'')+'>'+E(a.advance_no+' — '+a.requester+' — '+M2(a.amount))+'</option>').join('')+'</select></label>'+fld('job','المشروع / مركز التكلفة','text',P.job)+
      area('reason','سبب الصرف / البيان',P.reason)}
  else if(type==='advance_req'){
   h+=fld('requester','اسم طالب السلفة','text',P.requester)+fld('job','الوظيفة / الجهة','text',P.job)+fld('amount','المبلغ المطلوب','number',P.amount,false,'step="0.01" min="0.01"')+fld('settle_due','موعد التسوية','date',P.settle_due);
   h+='<div class="w words" id="f51w"></div>'+area('purpose','الغرض من السلفة',P.purpose)+
      '<label class="w" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="pledge" style="width:auto" '+(P.pledge==='true'||P.pledge===true?'checked':'')+'> أقرّ وأتعهد بتقديم مستندات الصرف ورد المتبقي في الموعد المحدد</label>'}
  else if(type==='advance_settle'){
   h+='<label class="w">السلفة المراد تسويتها<select name="advance_id">'+'<option value="">— اختر —</option>'+CACHE.advances.filter(a=>a.status==='open'&&a.disbursed).map(a=>'<option value="'+a.id+'" data-amt="'+a.amount+'"'+(P.advance_id===a.id?' selected':'')+'>'+E(a.advance_no+' — '+a.requester+' — '+M2(a.amount))+'</option>').join('')+'</select></label>'+
      '<div class="w"><b>المصروفات الفعلية</b><div id="f51ex"></div><button type="button" id="f51addex">＋ بند مصروف</button></div>'+
      '<div class="w met" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px"><div class="m">المستلم<b id="f51r">0.00</b></div><div class="m">المنصرف المقبول<b id="f51s2">0.00</b></div><div class="m">المتبقي المردود<b id="f51m">0.00</b></div></div>'}
  else if(type==='journal'){
   h+=area('explanation','شرح العملية (سبب التسوية)',P.explanation)+'<div class="w"><b>بنود القيد</b><div class="tw" style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th>الحساب</th><th>مركز التكلفة</th><th>مدين</th><th>دائن</th><th>بيان</th><th></th></tr></thead><tbody id="f51ln"></tbody></table></div><button type="button" id="f51addln">＋ سطر</button> <span id="f51bal" style="font-weight:700"></span></div>'}
  else if(type==='cash_report'){
   h+=fld('actual_balance','الرصيد الفعلي بالخزينة (جرد)','number',P.actual_balance,false,'step="0.01" min="0"')+area('notes','ملاحظات',P.notes)}
  h+='<div class="w" style="display:flex;gap:8px;flex-wrap:wrap"><button class="p" type="submit">💾 حفظ كمسودة</button></div></form>';
  const o=overlay(h);$('f51x').onclick=close;const f=$('f51f');
  const val=n=>f.elements[n]?f.elements[n].value:'';
  if($('f51w')){const upd=()=>{$('f51w').textContent=tafqeet(val('amount'))||'المبلغ بالحروف'};f.elements.amount.oninput=upd;upd()}
  let ex=(P.expenses&&P.expenses.length?P.expenses:[{}]).map(x=>({...x}));
  function drawEx(){const c=$('f51ex');if(!c)return;c.innerHTML='<table style="width:100%;border-collapse:collapse"><thead><tr><th>البيان</th><th>المبلغ</th><th>مقبول</th><th></th></tr></thead><tbody>'+ex.map((x,i)=>'<tr><td><input data-i="'+i+'" data-k="desc" value="'+E(x.desc)+'"></td><td><input type="number" step="0.01" min="0" data-i="'+i+'" data-k="amount" value="'+E(x.amount)+'"></td><td><input type="checkbox" style="width:auto" data-i="'+i+'" data-k="accepted" '+(x.accepted===false||x.accepted==='false'?'':'checked')+'></td><td><button type="button" data-del="'+i+'">✕</button></td></tr>').join('')+'</tbody></table>';
   c.querySelectorAll('input').forEach(inp=>inp.oninput=inp.onchange=()=>{const x=ex[+inp.dataset.i];x[inp.dataset.k]=inp.type==='checkbox'?inp.checked:inp.value;calc()});
   c.querySelectorAll('[data-del]').forEach(bt=>bt.onclick=()=>{ex.splice(+bt.dataset.del,1);if(!ex.length)ex.push({});drawEx();calc()});calc()}
  function calc(){if(!$('f51r'))return;const sel=f.elements.advance_id,opt=sel&&sel.selectedOptions[0];const rec=opt&&opt.dataset.amt?Number(opt.dataset.amt):0;
   const sp=ex.reduce((s,x)=>s+((x.accepted===false||x.accepted==='false')?0:(Number(x.amount)||0)),0);$('f51r').textContent=M2(rec);$('f51s2').textContent=M2(sp);$('f51m').textContent=M2(rec-sp)}
  if(type==='advance_settle'){drawEx();f.elements.advance_id.onchange=calc;$('f51addex').onclick=()=>{ex.push({});drawEx()}}
  let ln=(doc&&doc.lines&&doc.lines.length?doc.lines:[{},{}]).map(x=>({...x}));
  function drawLn(){const t=$('f51ln');if(!t)return;t.innerHTML=ln.map((x,i)=>'<tr><td><select data-i="'+i+'" data-k="account_code">'+acctOpts(x.account_code)+'</select></td><td><select data-i="'+i+'" data-k="cost_center">'+ccOpts(x.cost_center)+'</select></td><td><input type="number" step="0.01" min="0" data-i="'+i+'" data-k="debit" value="'+(Number(x.debit)?x.debit:'')+'"></td><td><input type="number" step="0.01" min="0" data-i="'+i+'" data-k="credit" value="'+(Number(x.credit)?x.credit:'')+'"></td><td><input data-i="'+i+'" data-k="memo" value="'+E(x.memo)+'"></td><td><button type="button" data-del="'+i+'">✕</button></td></tr>').join('');
   t.querySelectorAll('input,select').forEach(el=>el.oninput=el.onchange=()=>{ln[+el.dataset.i][el.dataset.k]=el.value;bal()});
   t.querySelectorAll('[data-del]').forEach(bt=>bt.onclick=()=>{ln.splice(+bt.dataset.del,1);if(ln.length<2)ln.push({});drawLn()});bal()}
  function bal(){const el=$('f51bal');if(!el)return;const d=ln.reduce((s,x)=>s+(Number(x.debit)||0),0),c=ln.reduce((s,x)=>s+(Number(x.credit)||0),0),ok=Math.abs(d-c)<0.005&&d>0;
   el.innerHTML='مدين '+M2(d)+' — دائن '+M2(c)+' — '+(ok?'<span style="color:#075b36">✔ متوازن</span>':'<span style="color:#b3261e">✘ غير متوازن (فرق '+M2(d-c)+')</span>')}
  if(type==='journal'){drawLn();$('f51addln').onclick=()=>{ln.push({});drawLn()}}
  let busy=false;
  f.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const btn=f.querySelector('[type=submit]');btn.disabled=true;
   try{const pl={};['beneficiary','amount','advance_id','job','reason','requester','settle_due','purpose','explanation','actual_balance','notes'].forEach(n=>{if(f.elements[n])pl[n]=f.elements[n].value});
    if(f.elements.pledge)pl.pledge=f.elements.pledge.checked?'true':'false';
    if(type==='advance_settle')pl.expenses=ex.filter(x=>x.desc||x.amount).map(x=>({desc:x.desc||'',amount:String(x.amount||0),accepted:!(x.accepted===false||x.accepted==='false')}));
    let lines=null;if(type==='journal')lines=ln.filter(x=>x.account_code).map(x=>({account_code:x.account_code,cost_center:x.cost_center||null,debit:x.debit?String(x.debit):null,credit:x.credit?String(x.credit):null,memo:x.memo||null}));
    const d=await R('fin_doc_save',{p_type:type,p_id:doc?doc.id:null,p_date:val('date')||today(),p_payload:pl,p_lines:lines,p_client_key:key});
    close();say('تم الحفظ كمسودة — '+d.doc_no);pageDocs();openDoc(d.id)}
   catch(er){fail(er)}finally{busy=false;btn.disabled=false}}}

 /* ---------- تفاصيل المستند وسير العمل ---------- */
 async function openDoc(id){try{style();const d=await R('fin_doc_get',{p_id:id});showDoc(d)}catch(e){fail(e)}}
 function payRows(d){const P=d.payload||{};const L={beneficiary:'المستفيد',amount:'المبلغ',job:'المشروع / الجهة',reason:'سبب الصرف',requester:'طالب السلفة',settle_due:'موعد التسوية',purpose:'الغرض',pledge:'إقرار وتعهد',explanation:'شرح العملية',actual_balance:'الرصيد الفعلي',notes:'ملاحظات',advance_no:'رقم السلفة',received:'المستلم',spent:'المنصرف المقبول',returned:'المتبقي المردود',book_balance:'الرصيد الدفتري',difference:'الفرق'};
  return Object.keys(L).filter(k=>P[k]!==undefined&&P[k]!==''&&P[k]!==null).map(k=>[L[k],k==='pledge'?(P[k]===true||P[k]==='true'?'نعم':'لا'):(['amount','received','spent','returned','actual_balance','book_balance','difference'].includes(k)?M2(P[k]):P[k])])}
 function showDoc(d){
  const me_=me(),P=d.payload||{};let h='<div style="display:flex;justify-content:space-between;align-items:center"><h3>'+E(TYPES[d.doc_type])+' — '+E(d.doc_no)+' '+badge(d.status)+'</h3><button type="button" id="f51x">إغلاق ✕</button></div>';
  h+='<div class="g2"><div><b>التاريخ:</b> '+E(d.doc_date)+'</div><div><b>أنشأه:</b> '+E(d.created_by)+'</div>'+payRows(d).map(r=>'<div><b>'+E(r[0])+':</b> '+E(r[1])+'</div>').join('')+'</div>';
  if(d.amount>0&&d.doc_type!=='journal')h+='<div class="words" style="margin:8px 0">'+E(tafqeet(d.amount))+'</div>';
  if(P.expenses&&P.expenses.length)h+='<table style="width:100%;border-collapse:collapse;margin:8px 0"><thead><tr><th>البيان</th><th>المبلغ</th><th>مقبول</th></tr></thead><tbody>'+P.expenses.map(x=>'<tr><td>'+E(x.desc)+'</td><td>'+M2(x.amount)+'</td><td>'+(x.accepted===false?'مرفوض':'مقبول')+'</td></tr>').join('')+'</tbody></table>';
  if(d.lines&&d.lines.length){const td=d.lines.reduce((s,x)=>s+Number(x.debit||0),0),tc=d.lines.reduce((s,x)=>s+Number(x.credit||0),0);
   h+='<table style="width:100%;border-collapse:collapse;margin:8px 0"><thead><tr><th>الحساب</th><th>مركز</th><th>مدين</th><th>دائن</th><th>بيان</th></tr></thead><tbody>'+d.lines.map(x=>'<tr><td>'+E(x.account_code+' — '+x.account_name)+'</td><td>'+E(x.cost_center||'')+'</td><td>'+(Number(x.debit)?M2(x.debit):'')+'</td><td>'+(Number(x.credit)?M2(x.credit):'')+'</td><td>'+E(x.memo||'')+'</td></tr>').join('')+'<tr style="font-weight:700"><td colspan="2">الإجمالي</td><td>'+M2(td)+'</td><td>'+M2(tc)+'</td><td>'+(Math.abs(td-tc)<0.005?'متوازن':'غير متوازن')+'</td></tr></tbody></table>'}
  if(d.approvals&&d.approvals.length)h+='<div><b>سجل الاعتماد:</b><ul>'+d.approvals.map(a=>'<li>'+E((a.step==='review'?'مراجعة':'اعتماد')+' — '+(a.decision==='approved'?'موافقة':'رفض')+' — '+a.username+' — '+String(a.at||'').slice(0,16).replace('T',' ')+(a.note?' — '+a.note:''))+'</li>').join('')+'</ul></div>';
  if(d.cancel_reason)h+='<p style="color:#b3261e">سبب الإلغاء: '+E(d.cancel_reason)+'</p>';
  const own=d.created_by===me_||(window.session&&session.role==='مدير النظام');
  let bt='<button type="button" id="f51pr">🖨 طباعة</button>';
  if(d.status==='draft'&&own)bt+=' <button class="g" type="button" id="f51ed">✏ تعديل</button> <button class="p" type="button" id="f51sub">📤 إرسال للمراجعة</button>';
  if(d.status==='review'&&has('settle_review'))bt+=' <button class="p" type="button" data-dec="review|approved">✔ مراجعة</button> <button class="d" type="button" data-dec="review|rejected">✘ رفض</button>';
  if(d.status==='reviewed'&&has('settle_approve'))bt+=' <button class="p" type="button" data-dec="approve|approved">✔ اعتماد</button> <button class="d" type="button" data-dec="approve|rejected">✘ رفض</button>';
  if(d.status==='approved'&&has('settle_post'))bt+=' <button class="g" type="button" id="f51post">📌 ترحيل وتنفيذ</button>';
  if(['draft','review','reviewed','approved'].includes(d.status)&&(own||has('settle_admin')))bt+=' <button class="d" type="button" id="f51can">إلغاء المستند</button>';
  if(d.status==='posted'&&!d.reversed_at&&has('settle_admin'))bt+=' <button class="d" type="button" id="f51rev">↩ عكس المستند</button>';
  h+='<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px">'+bt+'</div>';
  overlay(h);$('f51x').onclick=close;
  const act=async(fn,args,okmsg)=>{try{await R(fn,args);say(okmsg);const n=await R('fin_doc_get',{p_id:d.id});showDoc(n);pageDocs()}catch(e){fail(e)}};
  $('f51pr').onclick=()=>print(d);
  if($('f51ed'))$('f51ed').onclick=()=>{close();openForm(d.doc_type,d)};
  if($('f51sub'))$('f51sub').onclick=()=>act('fin_doc_submit',{p_id:d.id},'أُرسل للمراجعة');
  document.querySelectorAll('#f51ov [data-dec]').forEach(b=>b.onclick=()=>{const[s,dc]=b.dataset.dec.split('|');let note=null;if(dc==='rejected'){note=prompt('اكتب سبب الرفض:');if(!note)return}else{note=prompt('ملاحظة (اختياري):')||null}act('fin_doc_decide',{p_id:d.id,p_step:s,p_decision:dc,p_note:note},dc==='approved'?'تم':'تم الرفض وإعادته للمسودة')});
  if($('f51post'))$('f51post').onclick=()=>{if(confirm('سيتم ترحيل المستند وتنفيذ أثره المالي مرة واحدة ولا يمكن تعديله بعد ذلك. متابعة؟'))act('fin_doc_post',{p_id:d.id},'تم الترحيل')};
  if($('f51can'))$('f51can').onclick=()=>{const r=prompt('سبب الإلغاء:');if(r)act('fin_doc_cancel',{p_id:d.id,p_reason:r},'أُلغي المستند')};
  if($('f51rev'))$('f51rev').onclick=()=>{const r=prompt('سبب العكس (سيُنشأ مستند عكسي ولا يُحذف الأصل):');if(r&&confirm('تأكيد العكس؟'))act('fin_doc_reverse',{p_id:d.id,p_reason:r},'تم العكس')}}

 /* ---------- الطباعة الرسمية ---------- */
 function print(d){const P=d.payload||{};const logo=window.JKH_LOGO?'<img src="'+window.JKH_LOGO+'" style="height:70px">':'';
  const draft=!['approved','posted'].includes(d.status);
  const rows=payRows(d).map(r=>'<tr><th>'+E(r[0])+'</th><td>'+E(r[1])+'</td></tr>').join('');
  const exp=(P.expenses&&P.expenses.length)?'<h4>بنود المصروفات</h4><table><tr><th>م</th><th>البيان</th><th>المبلغ</th><th>الحالة</th></tr>'+P.expenses.map((x,i)=>'<tr><td>'+(i+1)+'</td><td>'+E(x.desc)+'</td><td>'+M2(x.amount)+'</td><td>'+(x.accepted===false?'مرفوض':'مقبول')+'</td></tr>').join('')+'</table>':'';
  const td=(d.lines||[]).reduce((s,x)=>s+Number(x.debit||0),0),tc=(d.lines||[]).reduce((s,x)=>s+Number(x.credit||0),0);
  const lines=(d.lines&&d.lines.length)?'<h4>بنود القيد</h4><table><tr><th>الحساب</th><th>مركز التكلفة</th><th>مدين</th><th>دائن</th><th>بيان</th></tr>'+d.lines.map(x=>'<tr><td>'+E(x.account_code+' — '+x.account_name)+'</td><td>'+E(x.cost_center||'')+'</td><td>'+(Number(x.debit)?M2(x.debit):'')+'</td><td>'+(Number(x.credit)?M2(x.credit):'')+'</td><td>'+E(x.memo||'')+'</td></tr>').join('')+'<tr><th colspan="2">الإجمالي</th><th>'+M2(td)+'</th><th>'+M2(tc)+'</th><th></th></tr></table>':'';
  const ap=(d.approvals||[]).map(a=>E((a.step==='review'?'مراجعة':'اعتماد')+': '+a.username+' — '+String(a.at||'').slice(0,10))).join(' | ');
  const sig=['المُعِدّ','المراجع','المعتمد','المستلم / المستفيد'].map(x=>'<div class="sg"><b>'+x+'</b><br><br>الاسم: ................<br><br>التوقيع: ................</div>').join('');
  const html='<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>'+E(d.doc_no)+'</title><style>@page{size:A4;margin:14mm}body{font-family:Cairo,Tahoma,Arial,sans-serif;color:#17301f;margin:0}.hd{display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid #c9a227;padding-bottom:8px}.hd h1{margin:0;font-size:20px;color:#075b36}.hd small{color:#555}.ttl{background:#075b36;color:#fff;text-align:center;padding:8px;font-size:18px;margin:12px 0;border-radius:6px}table{width:100%;border-collapse:collapse;margin:8px 0}th,td{border:1px solid #9bb5a2;padding:6px 8px;text-align:right;font-size:13px}th{background:#eaf3ec;width:28%}.words{border:1.5px dashed #c9a227;background:#fffbe9;padding:8px;font-weight:700;margin:8px 0}.sgs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:26px}.sg{border:1px solid #9bb5a2;border-radius:6px;padding:8px;font-size:12px;min-height:90px}.wm{position:fixed;top:40%;right:10%;font-size:70px;color:#b3261e22;transform:rotate(-20deg)}.ft{margin-top:14px;font-size:11px;color:#555;text-align:center;border-top:1px solid #ccc;padding-top:6px}</style></head><body>'+
   (draft?'<div class="wm">مسودة — غير معتمد</div>':'')+
   '<div class="hd"><div><h1>جمعية الخير للجميع</h1><small>مشهرة برقم 2069 لسنة 2018 — كوم أبو خلاد – مركز ناصر – بني سويف</small></div>'+logo+'</div>'+
   '<div class="ttl">'+E(TYPES[d.doc_type])+'</div><table><tr><th>رقم المستند</th><td>'+E(d.doc_no)+'</td><th>التاريخ</th><td>'+E(d.doc_date)+'</td></tr><tr><th>الحالة</th><td>'+E(ST[d.status])+'</td><th>أنشأه</th><td>'+E(d.created_by)+'</td></tr></table>'+
   '<table>'+rows+'</table>'+(d.amount>0&&d.doc_type!=='journal'?'<div class="words">'+E(M2(d.amount))+' جنيه — '+E(tafqeet(d.amount))+'</div>':'')+exp+lines+
   (ap?'<p style="font-size:12px">سجل الاعتماد الإلكتروني: '+ap+'</p>':'')+'<div class="sgs">'+sig+'</div><div class="ft">خانات التوقيع تُستكمل يدويًا بعد الطباعة — لا يتم التوقيع أو الاعتماد نيابةً عن أي شخص. صدر من نظام جمعية الخير للجميع</div></body></html>';
  if(window.JKHNative&&typeof JKHNative.printHtml==='function'){try{JKHNative.printHtml(html,d.doc_no);return}catch(e){}}
  const f=document.createElement('iframe');f.style.cssText='position:fixed;width:0;height:0;border:0';document.body.appendChild(f);
  f.contentDocument.open();f.contentDocument.write(html);f.contentDocument.close();
  setTimeout(()=>{try{f.contentWindow.focus();f.contentWindow.print()}catch(e){const w=window.open('');w.document.write(html);w.document.close()}setTimeout(()=>f.remove(),4000)},500)}

 /* ---------- الخزينة اليومية ---------- */
 async function pageCash(){const b=$('f51Cash');if(!b)return;style();let dt=b.dataset.dt||today();
  b.innerHTML='<div class="f51"><h3>🏦 كشف حركة الخزينة اليومي</h3><div class="f51bar"><input type="date" id="f51d" value="'+dt+'"><button id="f51ld">عرض</button><button class="g" id="f51cr">📝 كشف جرد وإقفال يومي</button>'+(has('settle_admin')?'<button id="f51op">رصيد افتتاحي</button>':'')+'</div><div id="f51cb">جارٍ التحميل…</div></div>';
  $('f51ld').onclick=()=>{b.dataset.dt=$('f51d').value;pageCash()};$('f51cr').onclick=()=>openForm('cash_report');
  if($('f51op'))$('f51op').onclick=async()=>{const a=prompt('الرصيد الافتتاحي للخزينة (يُدخل مرة واحدة فقط):');if(a==null||a==='')return;try{await R('fin_cash_opening',{p_date:$('f51d').value||today(),p_amount:Number(a)});say('تم تسجيل الرصيد الافتتاحي');pageCash()}catch(e){fail(e)}};
  try{const c=await R('fin_cash_day',{p_date:dt});
   $('f51cb').innerHTML='<div class="met"><div class="m">رصيد أول اليوم<b>'+M2(c.opening)+'</b></div><div class="m">المقبوضات<b>'+M2(c.receipts)+'</b></div><div class="m">المدفوعات<b>'+M2(c.payments)+'</b></div><div class="m">الرصيد الدفتري<b>'+M2(c.book_balance)+'</b></div></div>'+
    (c.opening_done?'':'<p style="color:#b3261e">⚠ لم يُسجّل رصيد افتتاحي للخزينة بعد؛ لن يُسمح بالصرف قبل وجود رصيد.</p>')+
    '<div class="tw"><table><thead><tr><th>المستند</th><th>النوع</th><th>البيان</th><th>وارد</th><th>صادر</th><th>الرصيد بعد</th></tr></thead><tbody>'+(c.moves.length?c.moves.map(m=>'<tr><td>'+E(m.doc_no||'')+'</td><td>'+E(m.kind)+'</td><td>'+E(m.note||'')+'</td><td>'+(m.direction==='in'?M2(m.amount):'')+'</td><td>'+(m.direction==='out'?M2(m.amount):'')+'</td><td>'+M2(m.balance_after)+'</td></tr>').join(''):'<tr><td colspan="6" style="text-align:center;padding:12px">لا حركات في هذا اليوم.</td></tr>')+'</tbody></table></div>'}
  catch(e){$('f51cb').innerHTML='<p style="color:#b3261e">'+E(msg(e))+'</p>'}}

 /* ---------- السلف والعهد ---------- */
 async function pageAdv(){const b=$('f51Adv');if(!b)return;style();b.innerHTML='<div class="f51"><h3>🧾 السلف والعهد</h3><div id="f51al">جارٍ التحميل…</div></div>';
  try{const l=await R('fin_advances_list');$('f51al').innerHTML='<div class="tw"><table><thead><tr><th>رقم السلفة</th><th>الطالب</th><th>المبلغ</th><th>الغرض</th><th>موعد التسوية</th><th>الحالة</th></tr></thead><tbody>'+(l.length?l.map(a=>'<tr><td>'+E(a.advance_no)+'</td><td>'+E(a.requester)+'</td><td>'+M2(a.amount)+'</td><td>'+E(a.purpose||'')+'</td><td>'+E(a.due_date||'')+'</td><td>'+(a.status==='settled'?badge('posted').replace('مرحّل','مسواة'):(a.overdue?'<span class="bd" style="background:#b3261e">متأخرة</span>':(a.disbursed?'<span class="bd" style="background:#e0762a">عهدة مفتوحة</span>':'<span class="bd" style="background:#7a8f82">لم تُصرف</span>')))+'</td></tr>').join(''):'<tr><td colspan="6" style="text-align:center;padding:12px">لا توجد سلف.</td></tr>')+'</tbody></table></div>'}
  catch(e){$('f51al').innerHTML='<p style="color:#b3261e">'+E(msg(e))+'</p>'}}

 /* ---------- دليل الحسابات والأستاذ وميزان المراجعة ---------- */
 async function pageAcc(){const b=$('f51Acc');if(!b)return;style();await loadRef();const adm=has('settle_admin');
  b.innerHTML='<div class="f51"><h3>📚 دليل الحسابات والأستاذ وميزان المراجعة</h3><div class="f51bar">'+(adm?'<button class="p" id="f51na">＋ حساب</button><button id="f51nc">＋ مركز تكلفة</button><button id="f51au">🕵 سجل التدقيق</button>':'')+'<button id="f51tb">⚖ ميزان المراجعة</button><select id="f51lc"><option value="">دفتر الأستاذ — اختر حسابًا</option>'+CACHE.accounts.map(a=>'<option value="'+E(a.code)+'">'+E(a.code+' — '+a.name)+'</option>').join('')+'</select></div><div id="f51ab"></div></div>';
  const box=$('f51ab');
  box.innerHTML='<div class="tw"><table><thead><tr><th>الكود</th><th>اسم الحساب</th><th>النوع</th><th>الأب</th></tr></thead><tbody>'+(CACHE.accounts.length?CACHE.accounts.map(a=>'<tr><td>'+E(a.code)+'</td><td>'+E(a.name)+'</td><td>'+E(ACCT[a.acc_type||a.type]||'')+'</td><td>'+E(a.parent||'')+'</td></tr>').join(''):'<tr><td colspan="4" style="text-align:center;padding:12px">لا توجد حسابات بعد — أضف دليل الحسابات أولًا.</td></tr>')+'</tbody></table></div>';
  if($('f51na'))$('f51na').onclick=()=>{overlay('<h3>حساب جديد</h3><form id="f51af" class="g2">'+fld('code','الكود','text','')+fld('name','الاسم','text','')+'<label>النوع<select name="type">'+Object.entries(ACCT).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label><label>الحساب الأب<select name="parent"><option value="">— رئيسي —</option>'+CACHE.accounts.map(a=>'<option value="'+E(a.code)+'">'+E(a.code+' — '+a.name)+'</option>').join('')+'</select></label><div class="w" style="display:flex;gap:8px"><button class="p" type="submit">حفظ</button><button type="button" id="f51x">إلغاء</button></div></form>');$('f51x').onclick=close;
   $('f51af').onsubmit=async e=>{e.preventDefault();const f=e.target.elements;try{await R('fin_account_save',{p_code:f.code.value,p_name:f.name.value,p_type:f.type.value,p_parent_code:f.parent.value||null,p_active:true});close();say('تم حفظ الحساب');pageAcc()}catch(er){fail(er)}}};
  if($('f51nc'))$('f51nc').onclick=async()=>{const c=prompt('كود مركز التكلفة:');if(!c)return;const n=prompt('اسم مركز التكلفة:');if(!n)return;try{await R('fin_cc_save',{p_code:c,p_name:n,p_active:true});say('تم');pageAcc()}catch(e){fail(e)}};
  $('f51tb').onclick=async()=>{try{const t=await R('fin_trial_balance',{});const D=t.reduce((s,x)=>s+Number(x.debit),0),C=t.reduce((s,x)=>s+Number(x.credit),0);
   box.innerHTML='<h4>ميزان المراجعة (القيود المرحّلة فقط)</h4><div class="tw"><table><thead><tr><th>الكود</th><th>الحساب</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead><tbody>'+t.map(x=>'<tr><td>'+E(x.code)+'</td><td>'+E(x.name)+'</td><td>'+M2(x.debit)+'</td><td>'+M2(x.credit)+'</td><td>'+M2(x.balance)+'</td></tr>').join('')+'<tr style="font-weight:700"><td colspan="2">الإجمالي</td><td>'+M2(D)+'</td><td>'+M2(C)+'</td><td>'+(Math.abs(D-C)<0.005?'✔ متطابق':'✘ غير متطابق')+'</td></tr></tbody></table></div>'}catch(e){fail(e)}};
  $('f51lc').onchange=async()=>{const c=$('f51lc').value;if(!c)return;try{const l=await R('fin_ledger',{p_code:c});let run=0;
   box.innerHTML='<h4>دفتر الأستاذ — '+E(c)+'</h4><div class="tw"><table><thead><tr><th>القيد</th><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead><tbody>'+(l.length?l.map(x=>{run+=Number(x.debit)-Number(x.credit);return'<tr><td>'+E(x.entry_no)+(x.status==='reversed'?' (معكوس)':'')+'</td><td>'+E(x.date)+'</td><td>'+E(x.memo||'')+'</td><td>'+M2(x.debit)+'</td><td>'+M2(x.credit)+'</td><td>'+M2(run)+'</td></tr>'}).join(''):'<tr><td colspan="6" style="text-align:center;padding:12px">لا حركة مرحّلة.</td></tr>')+'</tbody></table></div>'}catch(e){fail(e)}};
  if($('f51au'))$('f51au').onclick=async()=>{try{const l=await R('fin_audit_list',{p_limit:200});box.innerHTML='<h4>سجل التدقيق (للإضافة فقط)</h4><div class="tw"><table><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>المرجع</th></tr></thead><tbody>'+l.map(x=>'<tr><td>'+E(String(x.at||x.created_at||'').slice(0,19).replace('T',' '))+'</td><td>'+E(x.username)+'</td><td>'+E(x.action)+'</td><td>'+E(x.ref_id||x.entity_id||'')+'</td></tr>').join('')+'</tbody></table></div>'}catch(e){fail(e)}}}

 function boot(){const m=document.querySelector('#app main');if(!m)return;['f51Docs','f51Cash','f51Adv','f51Acc'].forEach(i=>{if(!$(i))m.insertAdjacentHTML('beforeend','<section id="'+i+'" class="page"></section>')})}
 boot();document.addEventListener('DOMContentLoaded',boot);
 window.renderF51Docs=pageDocs;window.renderF51Cash=pageCash;window.renderF51Adv=pageAdv;window.renderF51Acc=pageAcc;
 window.JKHFin51={tafqeet,openForm,openDoc,print,_R:R,style,overlay,close,E,M2,has,msg,fail,say,uid,today,badge};
})();
