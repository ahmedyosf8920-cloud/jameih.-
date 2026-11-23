/* JKH v53 — القوائم المالية، الموردون والمشتريات، ملف المشروع، ملف الأسرة الموحّد، وربط/ترحيل الوحدات القديمة المحفوظة في المتصفح
   واجهة لدوال fin_v53_core.sql. كل الفحوص والصلاحيات داخل قاعدة البيانات. لا يحذف ولا يعدّل بيانات المتصفح القديمة (يقرأها فقط،
   ويضيف مفاتيح v53Link / v53Pending / v53Migrated إلى EXTRA). */
(function(){'use strict';
 const $=id=>document.getElementById(id);
 function F(){return window.JKHFin51||{}}
 const E=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const M2=v=>(Math.round((Number(v)||0)*100)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const Q=v=>(Number(v)||0).toLocaleString('en-US',{maximumFractionDigits:3});
 const today=()=>new Date().toISOString().slice(0,10);
 const uid=()=>{try{if(crypto.randomUUID)return crypto.randomUUID()}catch(e){}const h=[];for(let i=0;i<16;i++)h.push((typeof crypto!=='undefined'&&crypto.getRandomValues?crypto.getRandomValues(new Uint8Array(1))[0]:Math.floor(Math.random()*256)).toString(16).padStart(2,'0'));return h.join('')};
 const R=(fn,a)=>{if(typeof window.JKHRpc!=='function')return Promise.reject(new Error('الاتصال بقاعدة البيانات غير جاهز'));return window.JKHRpc(fn,a)};
 const msg=e=>{const m=(e&&(e.message||e.details))||String(e);return String(m).replace(/^.*?:\s*(?=[؀-ۿ])/,'')};
 const fail=e=>alert('لم تتم العملية: '+msg(e));
 const say=m=>{try{window.toast?window.toast(m):alert(m)}catch(e){alert(m)}};
 const ALL=['fin53','settle','settle_admin','fin_stock','fin_stock_admin','fin_report','fin_purchase','fin_purchase_approve','fin_project','fin_family'];
 const LEG={'محاسب':['settle','settle_admin','fin_report','fin_purchase','fin_project'],'مسؤول مخازن':['fin_stock','fin_stock_admin'],'باحث اجتماعي':['fin_family']};
 const perms=()=>{try{const s=session;if(!s)return[];if(s.role==='مدير النظام')return ALL;if(Array.isArray(s.permissions))return s.permissions;return LEG[s.role]||[]}catch(e){return[]}};
 const has=k=>perms().includes(k);
 const st=()=>{try{F().style&&F().style()}catch(e){}};
 const ov=h=>F().overlay(h);const close=()=>F().close();
 const fld=(n,l,t,v,w,x)=>'<label class="'+(w?'w':'')+'">'+l+'<input name="'+n+'" type="'+(t||'text')+'" value="'+E(v==null?'':v)+'" '+(x||'')+'></label>';
 const sel=(n,l,opts,v,w)=>'<label class="'+(w?'w':'')+'">'+l+'<select name="'+n+'">'+opts.map(o=>{const a=Array.isArray(o)?o:[o,o];return'<option value="'+E(a[0])+'"'+(a[0]===v?' selected':'')+'>'+E(a[1])+'</option>'}).join('')+'</select></label>';
 const area=(n,l,v)=>'<label class="w">'+l+'<textarea name="'+n+'" rows="3">'+E(v||'')+'</textarea></label>';
 const tbl=(heads,rows,empty)=>'<div class="tw"><table><thead><tr>'+heads.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+(rows.length?rows.join(''):'<tr><td colspan="'+heads.length+'" style="text-align:center;padding:12px">'+(empty||'لا توجد بيانات')+'</td></tr>')+'</tbody></table></div>';
 const wrap=(id,title,inner)=>{const b=$(id);if(!b)return null;st();b.innerHTML='<div class="f51"><h3>'+title+'</h3>'+inner+'</div>';return b};
 const guard=async fn=>{try{await fn()}catch(e){fail(e)}};
 const X=()=>window.EXTRA||(window.EXTRA={});
 const arr=k=>(X()[k]=Array.isArray(X()[k])?X()[k]:[]);
 const saveLocal=()=>{try{typeof window.save==='function'&&window.save()}catch(e){}};
 const num=v=>Number(v)||0;
 const isoYear=()=>new Date().getFullYear()+'-01-01';
 function printHtml(html,title){if(window.JKHNative&&typeof JKHNative.printHtml==='function'){try{JKHNative.printHtml(html,title);return}catch(e){}}
  const f=document.createElement('iframe');f.style.cssText='position:fixed;width:0;height:0;border:0';document.body.appendChild(f);f.contentDocument.open();f.contentDocument.write(html);f.contentDocument.close();
  setTimeout(()=>{try{f.contentWindow.focus();f.contentWindow.print()}catch(e){const w=window.open('');w.document.write(html);w.document.close()}setTimeout(()=>f.remove(),4000)},500)}
 function printDoc(title,sub,inner){const logo=window.JKH_LOGO?'<img src="'+window.JKH_LOGO+'" style="height:64px">':'';
  printHtml('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>'+E(title)+'</title><style>@page{size:A4;margin:14mm}body{font-family:Cairo,Tahoma,Arial,sans-serif;color:#17301f;font-size:13px}.hd{display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid #0d6b3f;padding-bottom:8px;margin-bottom:12px}h1{font-size:20px;margin:0}h2{font-size:15px;margin:14px 0 6px;color:#0d6b3f}table{width:100%;border-collapse:collapse;margin:6px 0}th,td{border:1px solid #9bb;padding:5px 7px;text-align:right}th{background:#e8f3ec}td.n{text-align:left;direction:ltr}.tot td{font-weight:bold;background:#f3f8f5}.sg{margin-top:40px;display:flex;justify-content:space-around}</style></head><body><div class="hd"><div><h1>جمعية الخير للجميع</h1><div>'+E(title)+'</div><div>'+E(sub||'')+'</div></div>'+logo+'</div>'+inner+'<div class="sg"><div>المحاسب: ..........</div><div>المدير المالي: ..........</div><div>رئيس المجلس: ..........</div></div><p style="font-size:11px;color:#555">طُبع بتاريخ '+today()+'</p></body></html>',title)}
 const amtRows=(rows,cls)=>rows.map(r=>'<tr><td>'+E(r.code)+'</td><td>'+E(r.name)+'</td><td class="n">'+M2(r.amount)+'</td></tr>').join('')+(rows.length?'':'<tr><td colspan="3">—</td></tr>');

 /* ================= القوائم المالية ================= */
 const S={tab:'inc',from:isoYear(),to:today(),cc:'',asof:today()};
 async function pageRep(){
  const b=wrap('f53Rep','📈 القوائم المالية (من القيود المرحّلة فقط)','<div class="f51bar">'+[['inc','قائمة الدخل (الإيرادات والمصروفات)'],['bs','المركز المالي'],['cf','التدفقات النقدية'],['set','حسابات النقدية']].map(t=>'<button type="button" data-tab="'+t[0]+'"'+(S.tab===t[0]?' class="p"':'')+'>'+t[1]+'</button>').join('')+'</div><div id="f53r">جارٍ التحميل…</div>');if(!b)return;
  b.querySelectorAll('[data-tab]').forEach(x=>x.onclick=()=>{S.tab=x.dataset.tab;pageRep()});
  const body=$('f53r');
  const bar=(withCc,asof)=>'<div class="f51bar">'+(asof?'<label>كما في <input type="date" id="f53a" value="'+E(S.asof)+'"></label>':'<label>من <input type="date" id="f53f" value="'+E(S.from)+'"></label><label>إلى <input type="date" id="f53t" value="'+E(S.to)+'"></label>')+(withCc?'<label>مركز تكلفة/مشروع <input id="f53c" value="'+E(S.cc)+'" placeholder="كود (اختياري)"></label>':'')+'<button class="p" id="f53go">عرض</button><button id="f53pr">🖨 طباعة</button></div>';
  const rd=()=>{if($('f53f')){S.from=$('f53f').value;S.to=$('f53t').value}if($('f53a'))S.asof=$('f53a').value;if($('f53c'))S.cc=$('f53c').value.trim()};
  try{
   if(S.tab==='inc'){const r=await R('fin_income_statement',{p_from:S.from,p_to:S.to,p_cc:S.cc||null});
    const inner='<h2>الإيرادات والتبرعات</h2><table><tr><th>الحساب</th><th>البيان</th><th>المبلغ</th></tr>'+amtRows(r.revenues)+'<tr class="tot"><td colspan="2">إجمالي الإيرادات</td><td class="n">'+M2(r.total_revenue)+'</td></tr></table><h2>المصروفات</h2><table><tr><th>الحساب</th><th>البيان</th><th>المبلغ</th></tr>'+amtRows(r.expenses)+'<tr class="tot"><td colspan="2">إجمالي المصروفات</td><td class="n">'+M2(r.total_expense)+'</td></tr></table><table><tr class="tot"><td>'+(r.surplus>=0?'فائض الفترة':'عجز الفترة')+'</td><td class="n">'+M2(r.surplus)+'</td></tr></table>';
    body.innerHTML=bar(true,false)+inner;$('f53pr').onclick=()=>printDoc('قائمة الدخل','من '+r.from+' إلى '+r.to+(S.cc?' — مركز '+S.cc:''),inner)}
   else if(S.tab==='bs'){const r=await R('fin_balance_sheet',{p_asof:S.asof});
    const inner='<h2>الأصول</h2><table><tr><th>الحساب</th><th>البيان</th><th>المبلغ</th></tr>'+amtRows(r.assets)+'<tr class="tot"><td colspan="2">إجمالي الأصول</td><td class="n">'+M2(r.total_assets)+'</td></tr></table><h2>الخصوم</h2><table><tr><th>الحساب</th><th>البيان</th><th>المبلغ</th></tr>'+amtRows(r.liabilities)+'<tr class="tot"><td colspan="2">إجمالي الخصوم</td><td class="n">'+M2(r.total_liabilities)+'</td></tr></table><h2>حقوق الملكية والفائض</h2><table><tr><th>الحساب</th><th>البيان</th><th>المبلغ</th></tr>'+amtRows(r.equity)+'<tr><td></td><td>فائض/عجز مرحّل حتى التاريخ</td><td class="n">'+M2(r.surplus_to_date)+'</td></tr><tr class="tot"><td colspan="2">إجمالي حقوق الملكية</td><td class="n">'+M2(r.total_equity)+'</td></tr></table><table><tr class="tot"><td>إجمالي الخصوم وحقوق الملكية</td><td class="n">'+M2(num(r.total_liabilities)+num(r.total_equity))+'</td></tr></table><p>'+(r.balanced?'✅ المعادلة متوازنة: الأصول = الخصوم + حقوق الملكية':'⚠ المعادلة غير متوازنة — راجع القيود')+'</p>';
    body.innerHTML=bar(false,true)+inner;$('f53pr').onclick=()=>printDoc('قائمة المركز المالي','كما في '+r.as_of,inner)}
   else if(S.tab==='cf'){const r=await R('fin_cash_flow',{p_from:S.from,p_to:S.to});
    const inner='<table><tr><td>النقدية والبنوك أول الفترة</td><td class="n">'+M2(r.opening)+'</td></tr></table><h2>حركة الفترة</h2><table><tr><th>البند</th><th>متحصلات</th><th>مدفوعات</th><th>الصافي</th></tr>'+(r.rows.length?r.rows.map(x=>'<tr><td>'+E(x.category)+'</td><td class="n">'+M2(x.inflow)+'</td><td class="n">'+M2(x.outflow)+'</td><td class="n">'+M2(x.net)+'</td></tr>').join(''):'<tr><td colspan="4">لا حركة نقدية</td></tr>')+'<tr class="tot"><td colspan="3">صافي التغير في النقدية</td><td class="n">'+M2(r.net_change)+'</td></tr></table><table><tr class="tot"><td>النقدية والبنوك آخر الفترة</td><td class="n">'+M2(r.closing)+'</td></tr></table><h2>للمطابقة: حركة الخزينة التشغيلية (دفتر الخزينة)</h2><table><tr><td>رصيد أول الفترة</td><td class="n">'+M2(r.treasury.opening)+'</td></tr><tr><td>المقبوضات</td><td class="n">'+M2(r.treasury.receipts)+'</td></tr><tr><td>المدفوعات</td><td class="n">'+M2(r.treasury.payments)+'</td></tr><tr class="tot"><td>رصيد آخر الفترة</td><td class="n">'+M2(r.treasury.closing)+'</td></tr></table><p style="font-size:12px">القائمة مبنية على القيود المرحّلة لحسابات النقدية المحدَّدة. دفتر الخزينة يُعرض للمطابقة فقط، وأي فرق بينهما يعني مستندات صرف/قبض لم تُرحَّل بقيد محاسبي.</p>';
    body.innerHTML=bar(false,false)+inner;$('f53pr').onclick=()=>printDoc('قائمة التدفقات النقدية','من '+r.from+' إلى '+r.to,inner)}
   else{const l=await R('fin_cash_accounts_list');
    body.innerHTML='<p>حدّد الحسابات التي تمثل «النقدية والبنوك» ليُبنى عليها قائمة التدفقات النقدية. التحديد يتطلب صلاحية إدارة الحسابات.</p>'+tbl(['الكود','الحساب','نقدية/بنك'],l.map(a=>'<tr><td>'+E(a.code)+'</td><td>'+E(a.name)+'</td><td><input type="checkbox" data-c="'+E(a.code)+'"'+(a.is_cash?' checked':'')+'></td></tr>'));
    body.querySelectorAll('[data-c]').forEach(x=>x.onchange=()=>guard(async()=>{try{await R('fin_account_cash',{p_code:x.dataset.c,p_is_cash:x.checked});say('تم الحفظ')}catch(e){x.checked=!x.checked;throw e}}))}
   if($('f53go'))$('f53go').onclick=()=>{rd();pageRep()};
  }catch(e){body.innerHTML='<p style="color:#b3261e">'+E(msg(e))+'<br>تأكد من تنفيذ fin_v53_core.sql.</p>'}}

 /* ================= الموردون والمشتريات ================= */
 const POST={draft:'مسودة',review:'بانتظار الاعتماد',approved:'معتمد',ordered:'صدر أمر توريد',received:'تم الاستلام',invoiced:'فاتورة مسجّلة',payment_requested:'طُلب السداد',cancelled:'ملغى'};
 const BS={tab:'ord',q:'',s:''};
 async function lookups(){const o={items:[],whs:[],projects:[]};
  try{const l=await R('fin_stock_lists');o.items=l.items.filter(i=>i.active);o.whs=l.warehouses.filter(w=>w.active)}catch(e){}
  try{o.projects=(await R('fin_projects_list',{p_status:'active'}))}catch(e){}
  return o}
 async function pageBuy(){
  const b=wrap('f53Buy','🛒 الموردون والمشتريات','<div class="f51bar">'+[['ord','أوامر الشراء'],['new','أمر شراء جديد'],['sup','الموردون']].map(t=>'<button type="button" data-tab="'+t[0]+'"'+(BS.tab===t[0]?' class="p"':'')+'>'+t[1]+'</button>').join('')+'</div><div id="f53b">جارٍ التحميل…</div>');if(!b)return;
  b.querySelectorAll('[data-tab]').forEach(x=>x.onclick=()=>{BS.tab=x.dataset.tab;BS.edit=null;pageBuy()});
  const body=$('f53b');
  try{
   if(BS.tab==='sup'){const l=await R('fin_suppliers_list');
    body.innerHTML='<div class="f51bar"><button class="p" id="f53ns">＋ مورد</button></div>'+tbl(['الكود','الاسم','الهاتف','العنوان','الحالة'],l.map(s=>'<tr><td>'+E(s.code)+'</td><td>'+E(s.name)+'</td><td>'+E(s.phone||'')+'</td><td>'+E(s.address||'')+'</td><td>'+(s.active?'فعّال':'موقوف')+'</td></tr>'));
    $('f53ns').onclick=()=>{ov('<div style="display:flex;justify-content:space-between"><h3>مورد</h3><button type="button" id="f53x">إغلاق ✕</button></div><form id="f53sf" class="g2">'+fld('code','الكود')+fld('name','الاسم')+fld('phone','الهاتف')+fld('address','العنوان')+'<label>موقوف؟<input type="checkbox" name="off"></label><div class="w"><button class="p" type="submit">حفظ</button></div></form>');$('f53x').onclick=close;
     $('f53sf').onsubmit=e=>{e.preventDefault();guard(async()=>{const f=e.target.elements;await R('fin_supplier_save',{p_code:f.code.value,p_name:f.name.value,p_phone:f.phone.value||null,p_address:f.address.value||null,p_active:!f.off.checked});close();pageBuy()})}}}
   else if(BS.tab==='new'){const L=await lookups(),sups=(await R('fin_suppliers_list')).filter(s=>s.active),ed=BS.edit;
    if(!sups.length){body.innerHTML='<p>أضف مورّدًا أولًا من تبويب «الموردون».</p>';return}
    let rows=ed&&ed.lines?ed.lines.map(l=>({item_code:l.item_code||'',desc:l.desc,qty:l.qty,unit_price:l.unit_price})):[{item_code:'',desc:'',qty:'',unit_price:''}];
    body.innerHTML='<form id="f53pf" class="f51box g2" style="max-width:none;padding:0">'+sel('sup','المورد',sups.map(s=>[s.code,s.name]),ed?ed.supplier_code:'')+fld('date','التاريخ','date',ed?ed.po_date:today())+sel('proj','المشروع (اختياري)',[['','— بدون —']].concat(L.projects.map(p=>[p.code,p.code+' — '+p.name])),ed?ed.project_code||'':'')+area('notes','ملاحظات',ed?ed.notes:'')+'<div class="w"><h4>البنود</h4><div id="f53l"></div><button type="button" id="f53al">＋ بند</button> <b id="f53tot"></b></div><div class="w"><button class="p" type="submit">'+(ed?'حفظ التعديل':'حفظ كمسودة')+'</button></div></form>';
    const itemOpts='<option value="">— خدمة/بند حر —</option>'+L.items.map(i=>'<option value="'+E(i.code)+'">'+E(i.name)+'</option>').join('');
    const draw=()=>{$('f53l').innerHTML='<table><thead><tr><th>صنف مخزني (للاستلام بالمخزن)</th><th>الوصف</th><th>الكمية</th><th>سعر الوحدة</th><th></th></tr></thead><tbody>'+rows.map((r,i)=>'<tr><td><select data-i="'+i+'" data-k="item_code">'+itemOpts.replace('value="'+E(r.item_code)+'"','value="'+E(r.item_code)+'" selected')+'</select></td><td><input data-i="'+i+'" data-k="desc" value="'+E(r.desc)+'"></td><td><input type="number" step="0.001" min="0.001" data-i="'+i+'" data-k="qty" value="'+E(r.qty)+'"></td><td><input type="number" step="0.01" min="0" data-i="'+i+'" data-k="unit_price" value="'+E(r.unit_price)+'"></td><td><button type="button" data-rm="'+i+'">✕</button></td></tr>').join('')+'</tbody></table>';
     $('f53l').querySelectorAll('[data-k]').forEach(el=>el.oninput=el.onchange=()=>{const r=rows[+el.dataset.i];r[el.dataset.k]=el.value;if(el.dataset.k==='item_code'&&el.value&&!r.desc){const it=L.items.find(x=>x.code===el.value);if(it){r.desc=it.name;draw();return}}tot()});
     $('f53l').querySelectorAll('[data-rm]').forEach(x=>x.onclick=()=>{rows.splice(+x.dataset.rm,1);if(!rows.length)rows.push({item_code:'',desc:'',qty:'',unit_price:''});draw()});tot()};
    const tot=()=>{$('f53tot').textContent='الإجمالي: '+M2(rows.reduce((s,r)=>s+Math.round(num(r.qty)*num(r.unit_price)*100)/100,0))};
    draw();$('f53al').onclick=()=>{rows.push({item_code:'',desc:'',qty:'',unit_price:''});draw()};
    const key=ed?null:uid();let busy=false;
    $('f53pf').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;try{const f=e.target.elements;
      await R('fin_purchase_save',{p_id:ed?ed.id:null,p_supplier:f.sup.value,p_date:f.date.value,p_project:f.proj.value||null,p_lines:rows.filter(r=>r.desc||r.qty||r.unit_price).map(r=>({item_code:r.item_code||null,desc:r.desc,qty:String(r.qty),unit_price:String(r.unit_price)})),p_notes:f.notes.value||null,p_client_key:key});
      say('تم الحفظ');BS.tab='ord';BS.edit=null;pageBuy()}catch(er){fail(er)}finally{busy=false}}}
   else{const L=await lookups();const l=await R('fin_purchase_list',{p_q:BS.q||null,p_status:BS.s||null});
    body.innerHTML='<div class="f51bar"><input id="f53q" placeholder="بحث برقم الأمر أو المورد أو الفاتورة" value="'+E(BS.q)+'"><select id="f53s"><option value="">كل الحالات</option>'+Object.entries(POST).map(([k,v])=>'<option value="'+k+'"'+(BS.s===k?' selected':'')+'>'+v+'</option>').join('')+'</select><button id="f53g">بحث</button></div>'+
     tbl(['الرقم','المورد','التاريخ','الإجمالي','المشروع','الحالة','الفاتورة','السداد','إجراء'],l.map(p=>{const a=[];const s=p.status;
      a.push('<button data-v="'+p.id+'">عرض</button>');
      if(s==='draft')a.push('<button data-e="'+p.id+'">تعديل</button><button data-sub="'+p.id+'">إرسال للاعتماد</button>');
      if(s==='review'&&has('fin_purchase_approve'))a.push('<button data-ok="'+p.id+'">اعتماد</button><button data-no="'+p.id+'">رفض</button>');
      if(s==='approved')a.push('<button data-ord="'+p.id+'">إصدار أمر توريد</button>');
      if(s==='ordered'&&has('fin_stock'))a.push('<button data-rec="'+p.id+'">استلام</button>');
      if(s==='received')a.push('<button data-inv="'+p.id+'">تسجيل فاتورة</button>');
      if(s==='invoiced'&&has('settle'))a.push('<button data-pay="'+p.id+'">طلب سداد</button>');
      if(['draft','review','approved','ordered'].includes(s))a.push('<button data-can="'+p.id+'">إلغاء</button>');
      return '<tr><td>'+E(p.po_no)+'</td><td>'+E(p.supplier)+'</td><td>'+E(p.po_date)+'</td><td>'+M2(p.total)+'</td><td>'+E(p.project_code||'')+'</td><td>'+E(POST[s]||s)+'</td><td>'+E(p.invoice_no||'')+(p.invoice_amount?' ('+M2(p.invoice_amount)+')':'')+'</td><td>'+(p.pay_doc_no?E(p.pay_doc_no)+' — '+(p.paid?'مدفوع':E(p.pay_doc_status)):'')+'</td><td>'+a.join(' ')+'</td></tr>'}));
    $('f53g').onclick=()=>{BS.q=$('f53q').value;BS.s=$('f53s').value;pageBuy()};
    const by=id=>l.find(x=>x.id===id),act=(sel_,fn)=>body.querySelectorAll(sel_).forEach(x=>x.onclick=()=>guard(async()=>{await fn(x.dataset[Object.keys(x.dataset)[0]],x);pageBuy()}));
    body.querySelectorAll('[data-v]').forEach(x=>x.onclick=()=>{const p=by(x.dataset.v);ov('<div style="display:flex;justify-content:space-between"><h3>'+E(p.po_no)+' — '+E(p.supplier)+'</h3><button type="button" id="f53x">إغلاق ✕</button></div><p>الحالة: <b>'+E(POST[p.status]||p.status)+'</b> | أنشأه: '+E(p.created_by)+(p.approved_by?' | اعتمده: '+E(p.approved_by):'')+(p.wh_code?' | المخزن: '+E(p.wh_code):'')+'</p>'+tbl(['الصنف المخزني','الوصف','الكمية','سعر الوحدة','المبلغ'],p.lines.map(x=>'<tr><td>'+E(x.item_code||'—')+'</td><td>'+E(x.desc)+'</td><td>'+Q(x.qty)+'</td><td>'+M2(x.unit_price)+'</td><td>'+M2(x.amount)+'</td></tr>'))+'<p><b>الإجمالي: '+M2(p.total)+'</b></p>'+(p.notes?'<pre style="white-space:pre-wrap">'+E(p.notes)+'</pre>':'')+(p.cancel_reason?'<p>سبب الإلغاء: '+E(p.cancel_reason)+'</p>':'')+'<button id="f53pp">🖨 طباعة</button>');$('f53x').onclick=close;
      $('f53pp').onclick=()=>printDoc('أمر شراء '+p.po_no,'المورد: '+p.supplier+' — التاريخ: '+p.po_date,tbl(['الصنف','الوصف','الكمية','سعر الوحدة','المبلغ'],p.lines.map(x=>'<tr><td>'+E(x.item_code||'—')+'</td><td>'+E(x.desc)+'</td><td>'+Q(x.qty)+'</td><td class="n">'+M2(x.unit_price)+'</td><td class="n">'+M2(x.amount)+'</td></tr>'))+'<p><b>الإجمالي: '+M2(p.total)+'</b></p>')});
    body.querySelectorAll('[data-e]').forEach(x=>x.onclick=()=>{BS.edit=by(x.dataset.e);BS.tab='new';pageBuy()});
    act('[data-sub]',id=>R('fin_purchase_submit',{p_id:id}));
    act('[data-ok]',id=>R('fin_purchase_decide',{p_id:id,p_approve:true,p_note:null}));
    act('[data-no]',async id=>{const n=prompt('سبب الرفض:');if(!n)throw new Error('سبب الرفض مطلوب');await R('fin_purchase_decide',{p_id:id,p_approve:false,p_note:n})});
    act('[data-ord]',id=>R('fin_purchase_order',{p_id:id}));
    act('[data-rec]',async id=>{if(!L.whs.length)throw new Error('لا توجد مخازن فعّالة');const w=prompt('كود المخزن المستلِم:\n'+L.whs.map(x=>x.code+' = '+x.name).join('\n'),L.whs[0].code);if(!w)throw new Error('اختر المخزن');
      if(!confirm('سيتم إضافة الأصناف المرتبطة بالمخزن إلى المخزن '+w+' مرة واحدة فقط. متابعة؟'))throw new Error('أُلغي');const r=await R('fin_purchase_receive',{p_id:id,p_wh:w,p_date:today()});say('تم الاستلام — بنود مخزنية: '+r.stock_lines)});
    act('[data-inv]',async id=>{const p=by(id),n=prompt('رقم فاتورة المورد:');if(!n)throw new Error('رقم الفاتورة مطلوب');const a=prompt('مبلغ الفاتورة (أمر الشراء '+M2(p.total)+'):',p.total);if(!a)throw new Error('المبلغ مطلوب');let note=null;if(Number(a)!==Number(p.total)){note=prompt('المبلغ يختلف عن أمر الشراء — اكتب السبب:');if(!note)throw new Error('سبب الفرق مطلوب')}
      await R('fin_purchase_invoice',{p_id:id,p_invoice_no:n,p_invoice_date:today(),p_amount:Number(a),p_note:note})});
    act('[data-pay]',async id=>{if(!confirm('سيُنشأ إذن صرف نقدية «مسودة» يمر بدورة المراجعة والاعتماد والترحيل. متابعة؟'))throw new Error('أُلغي');const r=await R('fin_purchase_pay',{p_id:id});say('تم إنشاء إذن الصرف '+r.doc_no)});
    act('[data-can]',async id=>{const n=prompt('سبب الإلغاء (إلزامي):');if(!n)throw new Error('السبب مطلوب');await R('fin_purchase_cancel',{p_id:id,p_reason:n})})}
  }catch(e){body.innerHTML='<p style="color:#b3261e">'+E(msg(e))+'<br>تأكد من تنفيذ fin_v53_core.sql وأن لديك صلاحية المشتريات.</p>'}}

 /* ================= المشروعات ================= */
 const PST={active:'نشط',closed:'مغلق',archived:'مؤرشف'};
 const PS={s:''};
 async function pageProj(){
  const b=wrap('f53Proj','🧩 ملف المشروع المتكامل','<div class="f51bar"><button class="p" id="f53np">＋ مشروع جديد</button><select id="f53ps"><option value="">كل الحالات</option>'+Object.entries(PST).map(([k,v])=>'<option value="'+k+'"'+(PS.s===k?' selected':'')+'>'+v+'</option>').join('')+'</select></div><div id="f53p">جارٍ التحميل…</div>');if(!b)return;
  $('f53ps').onchange=()=>{PS.s=$('f53ps').value;pageProj()};
  const form=p=>{let acts=p&&p.activities&&p.activities.length?p.activities.map(a=>({...a})):[{name:'',start:'',end:'',pct:0}];
   ov('<div style="display:flex;justify-content:space-between"><h3>'+(p?'تعديل المشروع '+E(p.code):'مشروع جديد')+'</h3><button type="button" id="f53x">إغلاق ✕</button></div><form id="f53pj" class="g2">'+(p?'':fld('code','كود المشروع (يصبح مركز تكلفة)'))+fld('name','اسم المشروع','text',p&&p.name)+fld('ptype','النوع','text',p&&p.ptype)+fld('manager','مدير المشروع','text',p&&p.manager)+fld('start','البداية','date',p&&p.start_date)+fld('end','النهاية','date',p&&p.end_date)+fld('budget','الميزانية','number',p?p.budget:'','','step="0.01" min="0"')+fld('funding','مصدر التمويل','text',p&&p.funding_source)+area('objective','الأهداف',p&&p.objective)+fld('target','الفئة المستهدفة','text',p&&p.target_group,true)+area('notes','ملاحظات',p&&p.notes)+'<div class="w"><h4>الأنشطة</h4><div id="f53ac"></div><button type="button" id="f53aa">＋ نشاط</button></div><div class="w"><button class="p" type="submit">حفظ</button></div></form>');$('f53x').onclick=close;
   const draw=()=>{$('f53ac').innerHTML='<table><thead><tr><th>النشاط</th><th>من</th><th>إلى</th><th>الإنجاز %</th></tr></thead><tbody>'+acts.map((a,i)=>'<tr><td><input data-i="'+i+'" data-k="name" value="'+E(a.name)+'"></td><td><input type="date" data-i="'+i+'" data-k="start" value="'+E(a.start||'')+'"></td><td><input type="date" data-i="'+i+'" data-k="end" value="'+E(a.end||'')+'"></td><td><input type="number" min="0" max="100" data-i="'+i+'" data-k="pct" value="'+E(a.pct||0)+'"></td></tr>').join('')+'</tbody></table>';
    $('f53ac').querySelectorAll('input').forEach(el=>el.oninput=()=>{acts[+el.dataset.i][el.dataset.k]=el.value})};draw();$('f53aa').onclick=()=>{acts.push({name:'',start:'',end:'',pct:0});draw()};
   const key=p?null:uid();let busy=false;$('f53pj').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;try{const f=e.target.elements,v=n=>f[n]&&f[n].value||null;
     await R('fin_project_save',{p_id:p?p.id:null,p_code:p?p.code:f.code.value,p_name:f.name.value,p_ptype:v('ptype'),p_objective:v('objective'),p_target:v('target'),p_start:v('start'),p_end:v('end'),p_budget:Number(f.budget.value||0),p_funding:v('funding'),p_manager:v('manager'),p_activities:acts.filter(a=>a.name).map(a=>({name:a.name,start:a.start||null,end:a.end||null,pct:Number(a.pct||0)})),p_notes:v('notes'),p_client_key:key});
     close();pageProj()}catch(er){fail(er)}finally{busy=false}}};
  $('f53np').onclick=()=>form(null);
  try{const l=await R('fin_projects_list',{p_status:PS.s||null});
   $('f53p').innerHTML=tbl(['الكود','المشروع','النوع','الميزانية','الإنجاز','الحالة','إجراء'],l.map(p=>'<tr><td>'+E(p.code)+'</td><td>'+E(p.name)+'</td><td>'+E(p.ptype||'')+'</td><td>'+M2(p.budget)+'</td><td>'+p.progress+'%</td><td>'+E(PST[p.status]||p.status)+'</td><td><button data-r="'+p.id+'">الملف والتقرير</button>'+(p.status==='active'?' <button data-e="'+p.id+'">تعديل</button> <button data-c="'+p.id+'">إغلاق</button>':' <button data-o="'+p.id+'">إعادة فتح</button>')+'</td></tr>'));
   const setSt=(id,s,t)=>guard(async()=>{const r=prompt(t);if(!r)return;await R('fin_project_set_status',{p_id:id,p_status:s,p_reason:r});pageProj()});
   $('f53p').querySelectorAll('[data-c]').forEach(x=>x.onclick=()=>setSt(x.dataset.c,'closed','سبب إغلاق المشروع (إلزامي):'));
   $('f53p').querySelectorAll('[data-o]').forEach(x=>x.onclick=()=>setSt(x.dataset.o,'active','سبب إعادة الفتح (إلزامي):'));
   $('f53p').querySelectorAll('[data-e]').forEach(x=>x.onclick=()=>form(l.find(p=>p.id===x.dataset.e)));
   $('f53p').querySelectorAll('[data-r]').forEach(x=>x.onclick=()=>projectReport(x.dataset.r));
  }catch(e){$('f53p').innerHTML='<p style="color:#b3261e">'+E(msg(e))+'<br>تأكد من تنفيذ fin_v53_core.sql وأن لديك صلاحية المشروعات.</p>'}}
 async function projectReport(id){guard(async()=>{const r=await R('fin_project_report',{p_id:id}),p=r.project;
  const rowsOf=a=>a.map(x=>'<tr><td>'+E(x.code)+'</td><td>'+E(x.name)+'</td><td class="n">'+M2(x.amount)+'</td></tr>').join('')||'<tr><td colspan="3">—</td></tr>';
  const inner='<table><tr><td>الكود</td><td>'+E(p.code)+'</td><td>الحالة</td><td>'+E(PST[p.status]||p.status)+'</td></tr><tr><td>المدير</td><td>'+E(p.manager||'')+'</td><td>الفترة</td><td>'+E(p.start_date||'')+' → '+E(p.end_date||'')+'</td></tr><tr><td>الأهداف</td><td colspan="3">'+E(p.objective||'')+'</td></tr><tr><td>الفئة المستهدفة</td><td>'+E(p.target_group||'')+'</td><td>مصدر التمويل</td><td>'+E(p.funding_source||'')+'</td></tr></table>'+
   '<h2>الميزانية مقابل الفعلي</h2><table><tr><td>الميزانية</td><td class="n">'+M2(r.budget)+'</td></tr><tr><td>المصروف الفعلي (قيود مرحّلة على مركز تكلفة المشروع)</td><td class="n">'+M2(r.total_expense)+'</td></tr><tr class="tot"><td>المتبقي</td><td class="n">'+M2(r.remaining)+(r.budget_pct!=null?' ('+r.budget_pct+'% مستهلك)':'')+'</td></tr><tr><td>التمويل/التبرعات المقيدة للمشروع</td><td class="n">'+M2(r.total_revenue)+'</td></tr></table>'+
   '<h2>المصروفات بالحساب</h2><table><tr><th>الحساب</th><th>البيان</th><th>المبلغ</th></tr>'+rowsOf(r.expenses)+'</table>'+
   '<h2>المشتريات المرتبطة</h2>'+tbl(['الأمر','المورد','الحالة','الإجمالي'],r.purchases.map(x=>'<tr><td>'+E(x.po_no)+'</td><td>'+E(x.supplier)+'</td><td>'+E(POST[x.status]||x.status)+'</td><td class="n">'+M2(x.total)+'</td></tr>'))+'<p>مستلم: '+M2(r.purchases_received)+' — ملتزم به (معتمد/صدر أمر توريد): '+M2(r.purchases_committed)+'</p>'+
   '<h2>المنصرف من المخازن للمشروع (عيني)</h2>'+tbl(['الصنف','الوحدة','الكمية','القيمة التقديرية'],r.stock_issued.map(x=>'<tr><td>'+E(x.item)+'</td><td>'+E(x.unit||'')+'</td><td class="n">'+Q(x.qty)+'</td><td class="n">'+M2(x.value)+'</td></tr>'))+
   '<h2>الأنشطة (الإنجاز '+r.progress+'%)</h2>'+tbl(['النشاط','من','إلى','الإنجاز %'],(p.activities||[]).map(a=>'<tr><td>'+E(a.name)+'</td><td>'+E(a.start||'')+'</td><td>'+E(a.end||'')+'</td><td>'+a.pct+'%</td></tr>'))+
   '<h2>المستفيدون ('+r.beneficiaries_count+')</h2>'+tbl(['رقم الحالة/الأسرة','ملاحظة','منذ'],r.beneficiaries.map(x=>'<tr><td>'+E(x.case_ref)+'</td><td>'+E(x.note||'')+'</td><td>'+E(String(x.added_at).slice(0,10))+'</td></tr>'));
  ov('<div style="display:flex;justify-content:space-between"><h3>ملف المشروع — '+E(p.name)+'</h3><button type="button" id="f53x">إغلاق ✕</button></div><div class="f51bar"><button id="f53pp">🖨 طباعة</button><input id="f53mc" placeholder="رقم حالة/أسرة"><input id="f53mn" placeholder="ملاحظة"><button id="f53ma">＋ مستفيد</button><button id="f53mr">إنهاء استفادة</button></div>'+inner);$('f53x').onclick=close;
  $('f53pp').onclick=()=>printDoc('ملف مشروع '+p.code,p.name,inner);
  const mem=add=>guard(async()=>{const c=$('f53mc').value.trim();if(!c)throw new Error('اكتب رقم الحالة/الأسرة');await R('fin_project_member',{p_id:id,p_case_ref:c,p_add:add,p_note:$('f53mn').value||null});close();projectReport(id)});
  $('f53ma').onclick=()=>mem(true);$('f53mr').onclick=()=>mem(false)})}

 /* ================= ملف الأسرة الموحّد ================= */
 const caseRef=c=>String(c.no||c.caseNo||c.code||c.id||'');
 const norm=s=>String(s||'').replace(/[ً-ٰٟ]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();
 const casesList=()=>(()=>{try{if(Array.isArray(window.cases)&&window.cases.length)return window.cases}catch(e){}try{return Array.isArray(cases)?cases:[]}catch(e){return[]}})();
 const FS={tab:'f',q:'',ref:''};
 const FST={active:'نشطة',under_review:'قيد المراجعة',suspended:'موقوفة',closed:'مغلقة'};
 function localFile(ref){const c=casesList().find(x=>caseRef(x)===ref||String(x.id)===ref),fam=arr('v50Families').find(f=>String(f.caseNo)===ref||(c&&f.caseId===c.id));
  const aid=arr('v50AidRequests').filter(a=>String(a.caseNo)===ref||(c&&a.caseId&&a.caseId===c.id)),dist=(()=>{try{if(Array.isArray(window.distributions)&&window.distributions.length)return window.distributions}catch(e){}try{return Array.isArray(distributions)?distributions:[]}catch(e){return[]}})().filter(d=>String(d.caseNo)===ref||(c&&d.caseId===c.id));
  return{c,fam,aid,dist}}
 async function pageFam(){
  const b=wrap('f53Fam','👪 ملف الأسرة الموحّد','<div class="f51bar">'+[['f','ملف أسرة'],['d','مراجعة التكرار']].map(t=>'<button type="button" data-tab="'+t[0]+'"'+(FS.tab===t[0]?' class="p"':'')+'>'+t[1]+'</button>').join('')+'</div><div id="f53f">…</div>');if(!b)return;
  b.querySelectorAll('[data-tab]').forEach(x=>x.onclick=()=>{FS.tab=x.dataset.tab;FS.ref='';pageFam()});
  const body=$('f53f');
  if(FS.tab==='d'){
   const cs=casesList(),g={};const add=(k,c)=>{if(!k)return;(g[k]=g[k]||[]).push(c)};
   cs.forEach(c=>{[c.nid,c.husbandNid,c.wifeNid].forEach(v=>{if(v&&String(v).trim())add('الرقم القومي '+String(v).trim(),c)});[c.phone,c.husbandPhone,c.wifePhone].forEach(v=>{if(v&&String(v).replace(/\D/g,''))add('الهاتف '+String(v).replace(/\D/g,''),c)});if(c.name)add('الاسم '+norm(c.name),c)});
   const dup=Object.entries(g).filter(([k,v])=>new Set(v.map(caseRef)).size>1);
   body.innerHTML='<p>تظهر هنا الحالات المشتركة في الرقم القومي أو الهاتف أو الاسم. <b>لا يتم الدمج تلقائيًا</b>؛ راجع كل مجموعة يدويًا وقرّر.</p>'+tbl(['سبب التشابه','الحالات المحتملة التكرار'],dup.map(([k,v])=>'<tr><td>'+E(k)+'</td><td>'+[...new Map(v.map(c=>[caseRef(c),c])).values()].map(c=>'<button data-o="'+E(caseRef(c))+'">'+E(caseRef(c))+' — '+E(c.name||'')+'</button>').join(' ')+'</td></tr>'),'لا توجد حالات متشابهة');
   body.querySelectorAll('[data-o]').forEach(x=>x.onclick=()=>{FS.tab='f';FS.ref=x.dataset.o;pageFam()});return}
  if(!FS.ref){const q=norm(FS.q);const cs=casesList().filter(c=>!q||norm([c.name,c.no,c.caseNo,c.code,c.nid,c.phone,c.husband,c.wife,c.husbandNid,c.wifeNid,c.husbandPhone,c.wifePhone,c.wa,c.area].join(' ')).includes(q)).slice(0,60);
   body.innerHTML='<div class="f51bar"><input id="f53fq" placeholder="ابحث بالاسم أو رقم الحالة أو الرقم القومي أو الهاتف" value="'+E(FS.q)+'"><button class="p" id="f53fg">بحث</button><input id="f53fr" placeholder="أو اكتب رقم الحالة مباشرة"><button id="f53fo">فتح</button></div>'+tbl(['رقم الحالة','الاسم','الهاتف','الأفراد',''],cs.map(c=>'<tr><td>'+E(caseRef(c))+'</td><td>'+E(c.name||'')+'</td><td>'+E(c.phone||'')+'</td><td>'+E(c.members||(c.family&&c.family.length)||'')+'</td><td><button data-o="'+E(caseRef(c))+'">فتح الملف</button></td></tr>'));
   $('f53fg').onclick=()=>{FS.q=$('f53fq').value;pageFam()};$('f53fo').onclick=()=>{const v=$('f53fr').value.trim();if(v){FS.ref=v;pageFam()}};
   body.querySelectorAll('[data-o]').forEach(x=>x.onclick=()=>{FS.ref=x.dataset.o;pageFam()});return}
  const ref=FS.ref,L=localFile(ref);let srv=null,err='';
  try{srv=await R('fin_family_file',{p_case:ref})}catch(e){err=msg(e)}
  const c=L.c||{},fm=L.fam||{};
  const info='<table><tr><td>رقم الحالة</td><td>'+E(ref)+'</td><td>الاسم</td><td>'+E(c.name||fm.head||'')+'</td></tr><tr><td>الهاتف</td><td>'+E(c.phone||'')+'</td><td>الرقم القومي</td><td>'+E(c.nid||'')+'</td></tr><tr><td>العنوان</td><td>'+E(c.address||fm.address||'')+'</td><td>عدد الأفراد</td><td>'+E(c.members||fm.members||(c.family&&c.family.length)||'')+'</td></tr>'+(fm.income?'<tr><td>الدخل</td><td colspan="3">'+E(fm.income)+'</td></tr>':'')+(fm.needs?'<tr><td>الاحتياجات</td><td colspan="3">'+E(fm.needs)+'</td></tr>':'')+'</table>'+(L.c||L.fam?'':'<p>⚠ لا توجد بيانات محلية بهذا الرقم (قد يكون الرقم مكتوبًا بصيغة مختلفة).</p>');
  const aidT=tbl(['التاريخ','نوع المساعدة','الكمية','المرحلة','صرف من المخزن'],L.aid.map(a=>'<tr><td>'+E(a.date||'')+'</td><td>'+E(a.kind)+'</td><td>'+E(a.qty)+'</td><td>'+E(a.stage)+'</td><td>'+(a.serverIssued?'✅ على الخادم':'—')+'</td></tr>'));
  const distT=tbl(['التاريخ','النوع','الكمية','إيصال'],L.dist.map(d=>'<tr><td>'+E(d.date||'')+'</td><td>'+E(d.type||'')+'</td><td>'+E(d.qty||'')+'</td><td>'+E(d.receipt||'')+'</td></tr>'));
  let sv='';
  if(srv){const s=srv.status;
   sv='<h4>حالة الأسرة على الخادم: <span class="bd">'+E(s?FST[s.status]||s.status:'لم تُحدَّد')+'</span>'+(s?' <small>— '+E(s.reason||'')+' ('+E(s.updated_by)+')</small>':'')+'</h4>'+
    '<h4>المشروعات</h4>'+tbl(['المشروع','الحالة','منذ','إلى'],srv.projects.map(p=>'<tr><td>'+E(p.code)+' — '+E(p.name)+'</td><td>'+E(PST[p.status]||p.status)+'</td><td>'+E(String(p.since).slice(0,10))+'</td><td>'+E(p.ended_at?String(p.ended_at).slice(0,10):'مستمر')+'</td></tr>'))+
    '<h4>المساعدات العينية من المخازن</h4>'+tbl(['الرقم','التاريخ','الصنف','الكمية','المخزن','المشروع'],srv.in_kind_aid.map(m=>'<tr><td>'+E(m.move_no)+'</td><td>'+E(m.date)+'</td><td>'+E(m.item)+'</td><td>'+Q(m.qty)+' '+E(m.unit||'')+'</td><td>'+E(m.warehouse)+'</td><td>'+E(m.project||'')+'</td></tr>'))+
    '<h4>المستندات المؤرشفة (مرجعها رقم الحالة)</h4>'+tbl(['الرقم','العنوان','التصنيف','التاريخ'],srv.documents.map(d=>'<tr><td>'+E(d.arch_no)+'</td><td>'+E(d.title)+'</td><td>'+E(d.category||'')+'</td><td>'+E(String(d.uploaded_at).slice(0,10))+'</td></tr>'))+
    '<h4>سجل الملاحظات والزيارات والحالة</h4>'+tbl(['الوقت','المستخدم','النوع','النص'],srv.events.map(e=>'<tr><td>'+E(String(e.at).slice(0,16).replace('T',' '))+'</td><td>'+E(e.username)+'</td><td>'+E(({note:'ملاحظة',visit:'زيارة',status:'حالة',other:'أخرى'})[e.kind]||e.kind)+'</td><td>'+E(e.text)+'</td></tr>'));
  }else sv='<p style="color:#b3261e">'+E(err)+'<br>الجزء الخاص بالخادم غير متاح (تحتاج صلاحية ملف الأسرة وتنفيذ fin_v53_core.sql).</p>';
  const inner='<h2>بيانات الأسرة (المحفوظة محليًا)</h2>'+info+'<h2>طلبات المساعدة</h2>'+aidT+'<h2>التوزيعات المسجلة</h2>'+distT+'<h2>الملف على الخادم</h2>'+sv;
  body.innerHTML='<div class="f51bar"><button id="f53bk">← رجوع</button><button id="f53pp">🖨 طباعة الملف</button></div>'+inner+(srv?'<form id="f53nf" class="f51box g2" style="max-width:none;padding:0">'+sel('kind','نوع الإضافة',[['note','ملاحظة'],['visit','زيارة ميدانية'],['other','أخرى']])+area('text','النص')+'<div class="w"><button class="p" type="submit">＋ إضافة للسجل</button></div></form><form id="f53sf" class="f51box g2" style="max-width:none;padding:0">'+sel('status','تغيير الحالة',Object.entries(FST))+fld('reason','السبب (إلزامي)','text','',true)+'<div class="w"><button type="submit">حفظ الحالة</button></div></form>':'');
  $('f53bk').onclick=()=>{FS.ref='';pageFam()};$('f53pp').onclick=()=>printDoc('ملف أسرة موحّد — '+ref,c.name||fm.head||'',inner.replace(/<button[^>]*>.*?<\/button>/g,''));
  if(srv){let nk=uid();$('f53nf').onsubmit=e=>{e.preventDefault();guard(async()=>{const f=e.target.elements;await R('fin_family_event_add',{p_case:ref,p_kind:f.kind.value,p_text:f.text.value,p_client_key:nk});nk=uid();pageFam()})};
   $('f53sf').onsubmit=e=>{e.preventDefault();guard(async()=>{const f=e.target.elements;await R('fin_family_status_set',{p_case:ref,p_status:f.status.value,p_reason:f.reason.value});pageFam()})}}}

 /* ================= ربط وترحيل الوحدات القديمة ================= */
 const h36=s=>{let x=5381;for(const ch of String(s)){x=((x<<5)+x+ch.charCodeAt(0))>>>0}return x.toString(36).toUpperCase()};
 const itemCode=name=>'L-'+h36(norm(name));
 const IN=['وارد','تحويل وارد','تسوية زيادة'];
 const legMoves=()=>arr('v50StockMoves');
 function legacyStock(){const m=legMoves(),names=[...new Set(m.map(x=>String(x.item||'').trim()).filter(Boolean))];
  return names.map(n=>{const mv=m.filter(x=>String(x.item||'').trim()===n),bal=mv.reduce((s,x)=>s+(IN.includes(x.kind)?num(x.qty):-num(x.qty)),0),rc=mv.filter(x=>['وارد','تحويل وارد'].includes(x.kind)&&num(x.unitCost)>0),q=rc.reduce((s,x)=>s+num(x.qty),0),v=rc.reduce((s,x)=>s+num(x.qty)*num(x.unitCost),0),unit=(mv.filter(x=>x.unit).pop()||{}).unit||'';
   return{name:n,code:itemCode(n),bal:Math.round(bal*1000)/1000,cost:q?Math.round(v/q*100)/100:0,unit,moves:mv.length}})}
 const lk=()=>{const x=X();x.v53Link=x.v53Link||{wh:'',items:{}};return x.v53Link};
 window.JKHBridge=window.JKHBridge||{};
 /* يُستدعى من وحدة v50 عند «تم التوزيع». لا يعطّل العملية المحلية أبدًا: عند الفشل يُحفظ الصرف في طابور لإعادة المحاولة. */
 window.JKHBridge.aidDistributed=function(r){try{const l=X().v53Link;if(!l||!l.wh||!l.items||!l.items[String(r.kind||'').trim()])return;
  if(r.serverIssued)return;const pend=arr('v53Pending');
  const run=()=>R('fin_stock_move',{p_kind:'issue',p_date:today(),p_wh:l.wh,p_item:l.items[String(r.kind).trim()],p_qty:num(r.qty),p_cost:0,p_to_wh:null,p_source:null,p_ref:'طلب مساعدة '+String(r.id).slice(0,8),p_batch:null,p_expiry:null,p_note:'صرف تلقائي — توزيع على الحالة '+(r.caseNo||''),p_client_key:'aid-'+r.id,p_project:r.projectId||null,p_case:String(r.caseNo||'')||null});
  run().then(()=>{r.serverIssued=true;const i=pend.findIndex(p=>p.aidId===r.id);if(i>=0)pend.splice(i,1);saveLocal()},e=>{if(!pend.some(p=>p.aidId===r.id))pend.push({aidId:r.id,kind:r.kind,qty:num(r.qty),caseNo:r.caseNo||'',projectId:r.projectId||'',err:msg(e),at:new Date().toISOString()});saveLocal()})}catch(e){}};
 async function pageLink(){
  const b=wrap('f53Link','🔗 ربط وترحيل الوحدات القديمة','<div id="f53k">جارٍ التحميل…</div>');if(!b)return;
  const body=$('f53k'),l=lk(),leg=legacyStock();let L={warehouses:[],items:[]},err='';
  try{L=await R('fin_stock_lists')}catch(e){err=msg(e)}
  const mig=X().v53Migrated||{};const pend=arr('v53Pending');
  const fams=arr('v50Families').length,cs=casesList().length,aid=arr('v50AidRequests'),unl=aid.filter(a=>a.stage==='تم التوزيع'||a.stage==='تم الاستلام').filter(a=>!a.serverIssued).length;
  body.innerHTML='<p>هذه الصفحة تربط بيانات النسخة القديمة المحفوظة في المتصفح بالنظام الموثّق على الخادم <b>دون حذف أو تعديل أي بيان قديم</b>.</p>'+
   '<h4>1) الأسر والحالات</h4><p>الربط تلقائي بـ«رقم الحالة»: ملف الأسرة الموحّد يقرأ '+cs+' حالة و'+fams+' ملف أسرة v50 و'+aid.length+' طلب مساعدة ويجمعها مع بيانات الخادم لنفس الرقم. لا حاجة لنقل شيء. للتكرار: صفحة «ملف الأسرة الموحّد» ← مراجعة التكرار.</p>'+
   '<h4>2) المخزن القديم (v50) ← مخزن الخادم</h4>'+(err?'<p style="color:#b3261e">'+E(err)+'</p>':'')+
   '<div class="f51bar"><label>المخزن الهدف على الخادم <select id="f53wh">'+L.warehouses.filter(w=>w.active).map(w=>'<option value="'+E(w.code)+'"'+(l.wh===w.code?' selected':'')+'>'+E(w.name)+'</option>').join('')+'</select></label></div>'+
   tbl(['الصنف القديم','الرصيد القديم','متوسط التكلفة','كود الخادم','الحالة'],leg.map(x=>'<tr><td>'+E(x.name)+'</td><td>'+Q(x.bal)+' '+E(x.unit)+'</td><td>'+M2(x.cost)+'</td><td>'+E(x.code)+'</td><td>'+(mig[x.code]?'✅ رُحِّل '+E(String(mig[x.code]).slice(0,10)):x.bal>0?'جاهز للترحيل':'رصيد صفر/سالب — لا يُرحَّل')+'</td></tr>'),'لا توجد حركات في مخزن v50')+
   '<div class="f51bar"><button class="p" id="f53mg">ترحيل الأرصدة كاستلام افتتاحي</button></div><p style="font-size:12px">الترحيل ينشئ صنفًا بنفس الاسم (إن لم يوجد) واستلامًا افتتاحيًا بمقدار الرصيد القديم الحالي ومتوسط تكلفته، مرة واحدة لكل صنف (إعادة الضغط لا تكرّر). الحركات القديمة تبقى كما هي. يلزم صلاحية «المخازن: إدارة» و«المخازن: حركات».</p>'+
   '<h4>3) المساعدات ← صرف تلقائي من الخادم</h4><p>بعد الترحيل، كل طلب مساعدة يُنقل لمرحلة «تم التوزيع» يصرف تلقائيًا من مخزن الخادم (مرة واحدة لكل طلب) للأصناف المرحَّلة فقط. لو فشل الصرف (رصيد/صلاحية) تبقى العملية المحلية سليمة ويُسجَّل في الطابور أدناه.</p>'+
   '<p>طلبات موزَّعة لم تُصرف على الخادم بعد: <b>'+unl+'</b> (الطلبات السابقة للترحيل لا تُصرف تلقائيًا لأن رصيدها محسوب في الافتتاحي).</p>'+
   tbl(['الطلب','الصنف','الكمية','الحالة/رقم الملف','سبب الفشل','إجراء'],pend.map(p=>'<tr><td>'+E(String(p.aidId).slice(0,8))+'</td><td>'+E(p.kind)+'</td><td>'+E(p.qty)+'</td><td>'+E(p.caseNo)+'</td><td>'+E(p.err)+'</td><td><button data-rt="'+E(p.aidId)+'">إعادة المحاولة</button> <button data-sk="'+E(p.aidId)+'">تجاهل</button></td></tr>'),'لا توجد عمليات معلّقة');
  if($('f53wh'))$('f53wh').onchange=()=>{l.wh=$('f53wh').value;saveLocal()};
  $('f53mg').onclick=()=>guard(async()=>{const wh=$('f53wh')&&$('f53wh').value;if(!wh)throw new Error('اختر المخزن الهدف');const todo=leg.filter(x=>x.bal>0&&!mig[x.code]);if(!todo.length)throw new Error('لا توجد أرصدة جديدة للترحيل');
   if(!confirm('سيتم ترحيل '+todo.length+' صنف إلى المخزن '+wh+' كاستلام افتتاحي. متابعة؟'))return;
   const done=X().v53Migrated=X().v53Migrated||{};let n=0;
   for(const x of todo){await R('fin_item_save',{p_code:x.code,p_name:x.name,p_unit:x.unit||null,p_category:'منقول من v50',p_min:0,p_active:true});
    await R('fin_stock_move',{p_kind:'receipt',p_date:today(),p_wh:wh,p_item:x.code,p_qty:x.bal,p_cost:x.cost,p_to_wh:null,p_source:'ترحيل رصيد افتتاحي',p_ref:'مخزن v50',p_batch:null,p_expiry:null,p_note:'رصيد افتتاحي منقول من مخزن المتصفح (v50): '+x.name,p_client_key:'mig-v50-'+x.code+'-'+wh,p_project:null,p_case:null});
    done[x.code]=new Date().toISOString();l.items[x.name]=x.code;l.wh=wh;n++;saveLocal()}
   say('تم ترحيل '+n+' صنف');pageLink()});
  body.querySelectorAll('[data-rt]').forEach(x=>x.onclick=()=>{const r=aid.find(a=>a.id===x.dataset.rt);if(!r)return;const old=pend.findIndex(p=>p.aidId===r.id);if(old>=0)pend.splice(old,1);window.JKHBridge.aidDistributed(r);setTimeout(pageLink,1500)});
  body.querySelectorAll('[data-sk]').forEach(x=>x.onclick=()=>{if(!confirm('تجاهل هذه العملية؟ لن يُصرف شيء على الخادم لهذا الطلب.'))return;const i=pend.findIndex(p=>p.aidId===x.dataset.sk);if(i>=0)pend.splice(i,1);saveLocal();pageLink()})}

 function boot(){const m=document.querySelector('#app main');if(!m)return;['f53Rep','f53Buy','f53Proj','f53Fam','f53Link'].forEach(i=>{if(!$(i))m.insertAdjacentHTML('beforeend','<section id="'+i+'" class="page"></section>')})}
 boot();document.addEventListener('DOMContentLoaded',boot);
 window.renderF53Rep=pageRep;window.renderF53Buy=pageBuy;window.renderF53Proj=pageProj;window.renderF53Fam=pageFam;window.renderF53Link=pageLink;
 window.JKHFin53={_R:R,itemCode,legacyStock,norm};
})();
