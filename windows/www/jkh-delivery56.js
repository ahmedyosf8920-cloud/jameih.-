/* v56 — محضر تسليم تلقائي + الجهات الدورية الشهرية (إضافة فقط؛ لا يغيّر أي وظيفة قائمة)
   1) عند «حفظ حالة الاستلام» في الكشف: لو فيه مستلمين جدد يسأل «سلّمت إيه؟» ثم يولّد محضرًا بنفس قالب محاضر مجلس الإدارة.
   2) صفحة «الجهات الدورية»: جهات تاخد مساعدة كل شهر، وتوليد كشف الشهر (بضغطة) ثم محضر عند التسليم. */
(function(){
 'use strict';
 const G=id=>document.getElementById(id);
 const E=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const uid=()=>(window.crypto&&crypto.randomUUID)?crypto.randomUUID():'v56'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
 const pad=n=>String(n).padStart(2,'0');
 const todayISO=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
 const nowHM=()=>{const d=new Date();return pad(d.getHours())+':'+pad(d.getMinutes())};
 const monthNow=()=>todayISO().slice(0,7);
 const DAYS=['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
 const MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
 const monthLabel=m=>{const p=String(m||'').split('-');return p.length===2&&MONTHS[+p[1]-1]?MONTHS[+p[1]-1]+' '+p[0]:String(m||'')};
 const numOf=v=>{const m=String(v==null?'':v).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).match(/\d+(\.\d+)?/);return m?parseFloat(m[0]):null};
 const X=()=>{window.EXTRA=window.EXTRA||{};return window.EXTRA};
 const ENT=()=>X().v56Ent=X().v56Ent||[];          // الجهات
 const GEN=()=>X().v56Gen=X().v56Gen||[];          // سجل الكشوف الشهرية المولّدة
 const SH=()=>X().sheets=X().sheets||[];
 const persist=()=>{try{if(typeof window.save==='function')window.save()}catch(e){}};
 const say=m=>{try{if(typeof window.tst==='function')return window.tst(m)}catch(e){}try{if(typeof window.toast==='function')return window.toast(m)}catch(e){}};
 const MINUTES=()=>{try{return Array.isArray(boardMinutes)?boardMinutes:null}catch(e){return null}};

 /* ---------- قالب المحضر: عنوان مخصص + حفظ العنوان عند التعديل ---------- */
 const oTpl=window.minuteTemplateHTML;
 if(typeof oTpl==='function'){
  window.minuteTemplateHTML=function(x){let h=oTpl(x);const t=x&&x.meetingData&&x.meetingData.docTitle;
   if(t){h=h.replace('<div class="title">محضر اجتماع مجلس الإدارة</div>','<div class="title">'+E(t)+'</div>').replace('<title>محضر مجلس الإدارة رقم','<title>'+E(t)+' رقم')}return h};
 }
 let curTitle='';
 const oEdit=window.editBoardMinute,oReset=window.resetBoardMinuteForm,oCollect=window.collectBoardMinute;
 if(typeof oEdit==='function')window.editBoardMinute=function(id){const r=oEdit.apply(this,arguments);try{const m=(MINUTES()||[]).find(v=>v.id===id);curTitle=(m&&m.meetingData&&m.meetingData.docTitle)||''}catch(e){curTitle=''}return r};
 if(typeof oReset==='function')window.resetBoardMinuteForm=function(){curTitle='';return oReset.apply(this,arguments)};
 if(typeof oCollect==='function')window.collectBoardMinute=function(){const d=oCollect.apply(this,arguments);if(curTitle)d.docTitle=curTitle;return d};

 /* ---------- بناء محضر التسليم ---------- */
 const MEMBERS=['اسلام علي سيد','محمد ابو الخير حامد','محمود ابو زيد عبدالصادق','عبيد سليمان سيد'];
 function buildMinuteData(x,rows,f){
  const ent=x.entityId?ENT().find(e=>e.id===x.entityId):null;
  const names=rows.map(r=>(r.caseName||r.name||r.husband||r.wife||'—')+(r.caseNo&&r.caseNo!=='جهة'?' ('+r.caseNo+')':''));
  const total=(x.rows||[]).length,part=rows.length;
  const qtyTxt=(f.qty!==''&&f.qty!=null?f.qty:'—')+(f.unit?' '+f.unit:'');
  const who=ent?('جهة «'+ent.name+'»'+(x.month?' عن شهر '+monthLabel(x.month):'')):(part+' مستفيد/أسرة');
  const dt=new Date((f.date||todayISO())+'T12:00:00');
  const decisions=[
   'تم تسليم «'+f.item+'» بإجمالي كمية '+qtyTxt+' إلى '+who+' وفق كشف «'+x.name+'».',
   'المستلمون ('+part+'): '+(names.length>60?names.slice(0,60).join('، ')+' وآخرون (انظر الكشف)':names.join('، '))+'.'
  ];
  if(part<total)decisions.push('لم يستلم بعد '+(total-part)+' من أصل '+total+' في الكشف.');
  if(f.note)decisions.push('ملاحظات التسليم: '+f.note);
  return {type:'محضر تسليم مساعدات',date:f.date||todayISO(),day:DAYS[dt.getDay()],time:nowHM(),place:'مقر جمعية الخير للجميع',
   chair:'محمود يوسف محمد عبدالحميد',secretary:'إيمان سامي بلوشي قطب',treasurer:'',members:MEMBERS.join('\n'),
   agenda:'1 - تسليم «'+f.item+'» وفق كشف «'+x.name+'»\n2 - مراجعة كشف المستلمين والتأكد من توقيعاتهم\n3 - ما يستجد من أعمال',
   body:'إنه في يوم {اليوم} الموافق {التاريخ} وفي تمام الساعة {الساعة} بمقر الجمعية قامت لجنة التسليم بتسليم «'+f.item+'» بإجمالي كمية '+qtyTxt+' إلى '+who+' وفق كشف «'+x.name+'»، وذلك بحضور كل من الأعضاء / {الأعضاء}. وقد تم التسليم وتوقيع المستلمين بالاستلام.',
   decisions:decisions.join('\n'),endTime:'',status:'مسودة للمراجعة',docTitle:'محضر تسليم مساعدات'};
 }
 async function createDeliveryMinute(x,rows,f){
  const list=MINUTES();if(!list)throw new Error('سجل المحاضر غير متاح');
  const no=typeof window.nextMinuteNo==='function'?window.nextMinuteNo():String(list.length+1).padStart(4,'0');
  const md=buildMinuteData(x,rows,f),now=new Date().toISOString();
  const row={id:uid(),meetingNo:no,title:'محضر تسليم مساعدات',date:md.date,notes:'محضر تلقائي من كشف «'+x.name+'»',meetingData:md,
   updatedAt:now,createdAt:now,recordType:'structured',source:{kind:'delivery',sheetId:x.id}};
  list.unshift(row);
  rows.forEach(r=>{r.minuteId=row.id});
  (x.deliveries=x.deliveries||[]).push({id:uid(),at:now,item:f.item,qty:f.qty,unit:f.unit||'',note:f.note||'',count:rows.length,minuteId:row.id,minuteNo:no});
  if(x.entityId){const g=GEN().find(z=>z.sheetId===x.id);if(g){g.minuteId=row.id;g.minuteNo=no}}
  persist();
  let warn='';try{if(typeof window.saveNow==='function')await window.saveNow()}catch(e){warn=String(e&&e.message||e)}
  try{if(typeof window.renderMinutes==='function')window.renderMinutes()}catch(e){}
  return {id:row.id,no,warn};
 }

 /* ---------- نافذة «سلّمت إيه؟» ---------- */
 function askDelivery(x,rows){
  const old=G('v56Ov');if(old)old.remove();
  const ent=x.entityId?ENT().find(e=>e.id===x.entityId):null;
  const sum=rows.reduce((s,r)=>{const n=numOf(r.qty);return n===null?s:s+n},0),anyQ=rows.some(r=>numOf(r.qty)!==null);
  const o=document.createElement('div');o.id='v56Ov';
  o.style.cssText='position:fixed;inset:0;z-index:10000;background:#0009;display:flex;align-items:center;justify-content:center;padding:10px';
  o.innerHTML='<div style="background:#fff;border-radius:16px;width:100%;max-width:560px;max-height:94vh;overflow:auto;padding:16px" dir="rtl"><h3 style="margin:0 0 6px">📝 تسجيل التسليم وإنشاء المحضر</h3>'+
   '<div class="muted" style="margin-bottom:10px">كشف «'+E(x.name)+'» — تم تسجيل استلام <b>'+rows.length+'</b> '+(ent?'(جهة «'+E(ent.name)+'»)':'مستفيد/أسرة')+'. جاوب على الأسئلة دي وهيتولّد محضر بنفس قالب محاضر مجلس الإدارة.</div>'+
   '<div class="formgrid">'+
   '<div class="field full"><label>سلّمت إيه؟ (الصنف) *</label><input id="v56Item" value="'+E(x.type||'')+'"></div>'+
   '<div class="field"><label>الكمية الإجمالية المسلَّمة</label><input id="v56Qty" value="'+(anyQ?E(sum):'')+'"></div>'+
   '<div class="field"><label>الوحدة (كيس / كرتونة / جنيه…)</label><input id="v56Unit" placeholder="اختياري"></div>'+
   '<div class="field"><label>تاريخ التسليم</label><input id="v56Date" type="date" value="'+todayISO()+'"></div>'+
   '<div class="field full"><label>ملاحظات التسليم</label><textarea id="v56Note" rows="2" placeholder="اختياري"></textarea></div></div>'+
   '<div id="v56Msg" style="min-height:20px;margin:8px 0;color:#b3261e"></div>'+
   '<div class="toolbar"><button class="primary" id="v56Ok" style="flex:2">حفظ وإنشاء المحضر</button><button class="secondary" id="v56Skip" style="flex:1">تخطي (بدون محضر)</button></div></div>';
  document.body.appendChild(o);
  G('v56Skip').onclick=()=>o.remove();
  G('v56Ok').onclick=async()=>{
   const item=G('v56Item').value.trim();if(!item){G('v56Msg').textContent='اكتب الصنف الذي تم تسليمه.';return}
   G('v56Ok').disabled=true;
   try{
    const r=await createDeliveryMinute(x,rows,{item,qty:G('v56Qty').value.trim(),unit:G('v56Unit').value.trim(),date:G('v56Date').value||todayISO(),note:G('v56Note').value.trim()});
    try{if(typeof window.renderSheets==='function')window.renderSheets()}catch(e){}
    o.firstElementChild.innerHTML='<h3 style="margin:0 0 8px">✅ تم إنشاء المحضر رقم '+E(r.no)+'</h3><p>المحضر محفوظ في «محاضر مجلس الإدارة» كمسودة للمراجعة. راجعه قبل التوقيع.</p>'+(r.warn?'<p style="color:#b3261e">تنبيه: لم تتم المزامنة السحابية ('+E(r.warn)+'). المحضر محفوظ على هذا الجهاز.</p>':'')+
     '<div class="toolbar"><button class="primary" id="v56Pr">🖨 طباعة / PDF</button><button class="secondary" id="v56Cl">إغلاق</button></div>';
    G('v56Pr').onclick=()=>{try{window.printSavedBoardMinute(r.id)}catch(e){}};G('v56Cl').onclick=()=>o.remove();
   }catch(e){G('v56Ok').disabled=false;G('v56Msg').textContent='تعذّر إنشاء المحضر: '+(e.message||e)}
  };
 }

 /* ---------- ربط زر «حفظ حالة الاستلام» ---------- */
 function hook(){
  const S=window.Sheets;if(!S||S.__v56)return false;S.__v56=true;
  const oConfirm=S.confirm;
  S.confirm=function(id){
   const x=SH().find(z=>z.id===id);
   if(x&&x.entityId){const s=G('shAdd2');if(s)s.value='0'}           // كشوف الجهات لا تُدرج في كشوف تسليم الحالات
   const before=x?x.rows.map(r=>!!r.received):[];
   const res=oConfirm.apply(this,arguments);
   try{if(x){const nu=x.rows.filter((r,i)=>r.received&&!before[i]&&!r.minuteId);if(nu.length)setTimeout(()=>askDelivery(x,nu),50)}}catch(e){}
   return res};
  const oEdit2=S.edit;
  if(typeof oEdit2==='function')S.edit=function(id){const x=SH().find(z=>z.id===id);
   if(x&&x.entityId){say('كشف جهة: بياناتها تتعدّل من صفحة «الجهات الدورية الشهرية»، والكمية من خانة الكمية داخل الكشف.');return}
   return oEdit2.apply(this,arguments)};
  const oRender=window.renderSheets;
  window.renderSheets=function(){
   const r=oRender.apply(this,arguments);
   try{
    const host=G('sheetsTable');if(!host)return r;
    const old=G('v56Pend');if(old)old.remove();
    const pend=SH().filter(x=>x.rows&&x.rows.some(r=>r.received&&!r.minuteId));
    if(pend.length){
     const d=document.createElement('div');d.id='v56Pend';d.className='notice';d.style.margin='8px 0';
     d.innerHTML='<b>كشوف تم تسليمها ولم يُنشأ لها محضر:</b> '+pend.map(x=>'<button class="secondary" data-v56="'+E(x.id)+'">'+E(x.name)+' — إنشاء محضر</button>').join(' ');
     host.parentNode.insertBefore(d,host);
     d.querySelectorAll('[data-v56]').forEach(b=>b.onclick=()=>{const x=SH().find(z=>z.id===b.dataset.v56);if(x)askDelivery(x,x.rows.filter(r=>r.received&&!r.minuteId))});
    }
   }catch(e){}
   return r};
  return true};

 /* ---------- صفحة الجهات الدورية ---------- */
 const KINDS=['مدرسة','مستشفى / وحدة صحية','دار أيتام / رعاية','مسجد / كنيسة','جمعية / مؤسسة','أسرة / حالة خاصة','أخرى'];
 const AIDS=['مواد غذائية','مبلغ نقدي','ملابس','بطاطين','أجهزة وأدوات','مستلزمات مدرسية','أدوية وعلاج','كراتين رمضان','لحوم','أخرى'];
 const ES={month:monthNow(),editId:''};
 function genOf(e,m){return GEN().find(g=>g.entityId===e.id&&g.month===m&&SH().some(s=>s.id===g.sheetId))}
 function sheetOf(g){return g&&SH().find(s=>s.id===g.sheetId)}
 function makeSheet(e,m){
  const ex=genOf(e,m);if(ex)return {sheet:sheetOf(ex),existing:true};
  const q=e.unit?(e.qty+' '+e.unit):String(e.qty);
  const row={caseId:'ent:'+e.id,caseNo:'جهة',caseName:e.name,name:e.name,husband:e.contact||'',wife:'',husbandNid:'',wifeNid:'',nid:'',phones:e.phone?[e.phone]:[],phone:e.phone||'',address:e.address||'',members:'',social:'',fileStatus:'',qty:q,received:false,inserted:false,entityId:e.id};
  const cur=m===monthNow();
  const sheet={id:uid(),name:e.name+' — '+monthLabel(m),date:cur?todayISO():m+'-01',type:e.aid||'مساعدة',qty:q,note:'كشف شهري دوري — '+monthLabel(m)+(e.note?' — '+e.note:''),kind:'gen',kidFrom:null,kidTo:null,status:'تحت التسليم',rows:[row],addToDist:false,entityId:e.id,month:m};
  SH().unshift(sheet);GEN().push({id:uid(),entityId:e.id,month:m,sheetId:sheet.id,at:new Date().toISOString()});
  return {sheet,existing:false}}
 function stateOf(e,m){const g=genOf(e,m);if(!g)return '<span class="badge o">لم يُنشأ</span>';const s=sheetOf(g);return '<span class="badge '+(s.status==='تم التسليم'?'':'o')+'">'+E(s.status)+'</span>'}
 function boot(){const m=document.querySelector('#app main');if(m&&!G('v56Ent'))m.insertAdjacentHTML('beforeend','<section id="v56Ent" class="page"></section>')}
 function pageEnt(){
  boot();const b=G('v56Ent');if(!b)return;
  const list=ENT(),ed=list.find(e=>e.id===ES.editId)||{};
  const opts=(arr,v)=>arr.map(a=>'<option'+(a===v?' selected':'')+'>'+E(a)+'</option>').join('');
  b.innerHTML='<div class="card"><div class="top"><div><h2>🏢 الجهات الدورية الشهرية</h2><div class="muted">جهات تستلم مساعدة ثابتة كل شهر — يتولّد لها كشف الشهر وبعد التسليم يتولّد محضر تلقائي بقالب محاضر مجلس الإدارة</div></div></div>'+
   '<form id="v56F" class="formgrid" style="margin-top:10px"><div class="field"><label>اسم الجهة *</label><input name="name" required value="'+E(ed.name||'')+'"></div>'+
   '<div class="field"><label>نوع الجهة</label><select name="kind">'+opts(KINDS,ed.kind)+'</select></div>'+
   '<div class="field"><label>نوع المساعدة الشهرية *</label><select name="aid">'+opts(AIDS,ed.aid)+'</select></div>'+
   '<div class="field"><label>الكمية الشهرية *</label><input name="qty" required value="'+E(ed.qty||'')+'"></div>'+
   '<div class="field"><label>الوحدة</label><input name="unit" placeholder="كيس / كرتونة / جنيه" value="'+E(ed.unit||'')+'"></div>'+
   '<div class="field"><label>المسؤول</label><input name="contact" value="'+E(ed.contact||'')+'"></div>'+
   '<div class="field"><label>الهاتف</label><input name="phone" value="'+E(ed.phone||'')+'"></div>'+
   '<div class="field"><label>العنوان</label><input name="address" value="'+E(ed.address||'')+'"></div>'+
   '<div class="field full"><label>ملاحظات</label><input name="note" value="'+E(ed.note||'')+'"></div>'+
   '<div class="field full"><button class="primary" type="submit">'+(ed.id?'حفظ التعديل':'＋ إضافة جهة')+'</button> '+(ed.id?'<button class="secondary" type="button" id="v56Cx">إلغاء التعديل</button>':'')+'</div></form></div>'+
   '<div class="card"><div class="toolbar"><label>الشهر: <input type="month" id="v56M" value="'+E(ES.month)+'"></label><button class="primary" id="v56All">إنشاء كشوف الشهر لكل الجهات النشطة</button></div>'+
   '<div style="overflow:auto">'+(list.length?'<table><thead><tr><th>الجهة</th><th>النوع</th><th>المساعدة الشهرية</th><th>كشف '+E(monthLabel(ES.month))+'</th><th>المحضر</th><th>الإجراءات</th></tr></thead><tbody>'+
    list.map(e=>{const g=genOf(e,ES.month);const s=sheetOf(g);return '<tr'+(e.active===false?' style="opacity:.55"':'')+'><td><b>'+E(e.name)+'</b>'+(e.active===false?' <span class="badge o">موقوفة</span>':'')+'<br><small>'+E(e.contact||'')+' '+E(e.phone||'')+'</small></td><td>'+E(e.kind||'')+'</td><td>'+E(e.aid)+' — '+E(e.qty)+' '+E(e.unit||'')+'</td><td>'+stateOf(e,ES.month)+'</td><td>'+(g&&g.minuteNo?'<button class="secondary" data-pm="'+E(g.minuteId)+'">محضر '+E(g.minuteNo)+'</button>':'—')+'</td><td>'+
     (e.active===false?'':'<button class="primary" data-mk="'+e.id+'">'+(g?'فتح الكشف':'إنشاء كشف الشهر')+'</button> ')+'<button class="secondary" data-hs="'+e.id+'">السجل</button> <button class="secondary" data-ed="'+e.id+'">تعديل</button> <button class="secondary" data-tg="'+e.id+'">'+(e.active===false?'تفعيل':'إيقاف')+'</button></td></tr>'}).join('')+'</tbody></table>':'<div class="empty">لا توجد جهات. أضف أول جهة من النموذج بالأعلى.</div>')+'</div></div>';
  G('v56F').onsubmit=ev=>{ev.preventDefault();const f=ev.target.elements,v=n=>f[n].value.trim();
   if(!v('name')||!v('qty'))return;const rec={id:ed.id||uid(),name:v('name'),kind:v('kind'),aid:v('aid'),qty:v('qty'),unit:v('unit'),contact:v('contact'),phone:v('phone'),address:v('address'),note:v('note'),active:ed.active!==false,createdAt:ed.createdAt||new Date().toISOString()};
   if(ed.id)ENT()[ENT().findIndex(e=>e.id===ed.id)]=rec;else ENT().push(rec);ES.editId='';persist();pageEnt();say(ed.id?'تم حفظ التعديل':'تمت إضافة الجهة')};
  if(G('v56Cx'))G('v56Cx').onclick=()=>{ES.editId='';pageEnt()};
  G('v56M').onchange=e=>{ES.month=e.target.value||monthNow();pageEnt()};
  G('v56All').onclick=()=>{let n=0;ENT().filter(e=>e.active!==false).forEach(e=>{if(!genOf(e,ES.month)){makeSheet(e,ES.month);n++}});persist();pageEnt();say(n?'تم إنشاء '+n+' كشف':'كل الكشوف موجودة بالفعل لهذا الشهر')};
  b.querySelectorAll('[data-mk]').forEach(x=>x.onclick=()=>{const e=ENT().find(z=>z.id===x.dataset.mk);if(!e)return;const r=makeSheet(e,ES.month);persist();try{window.renderSheets&&window.renderSheets()}catch(_){}pageEnt();try{window.Sheets.open(r.sheet.id)}catch(_){}});
  b.querySelectorAll('[data-ed]').forEach(x=>x.onclick=()=>{ES.editId=x.dataset.ed;pageEnt();window.scrollTo(0,0)});
  b.querySelectorAll('[data-tg]').forEach(x=>x.onclick=()=>{const e=ENT().find(z=>z.id===x.dataset.tg);if(e){e.active=e.active===false;persist();pageEnt()}});
  b.querySelectorAll('[data-pm]').forEach(x=>x.onclick=()=>{try{window.printSavedBoardMinute(x.dataset.pm)}catch(_){}});
  b.querySelectorAll('[data-hs]').forEach(x=>x.onclick=()=>history(ENT().find(z=>z.id===x.dataset.hs)));
 }
 function history(e){
  if(!e)return;const gs=GEN().filter(g=>g.entityId===e.id).sort((a,c)=>String(c.month).localeCompare(String(a.month)));
  const old=G('v56Ov');if(old)old.remove();const o=document.createElement('div');o.id='v56Ov';o.style.cssText='position:fixed;inset:0;z-index:10000;background:#0009;display:flex;align-items:center;justify-content:center;padding:10px';
  o.innerHTML='<div dir="rtl" style="background:#fff;border-radius:16px;width:100%;max-width:720px;max-height:94vh;overflow:auto;padding:16px"><h3 style="margin:0 0 8px">سجل «'+E(e.name)+'»</h3>'+
   (gs.length?'<table><thead><tr><th>الشهر</th><th>الحالة</th><th>المسلَّم</th><th>المحضر</th><th></th></tr></thead><tbody>'+gs.map(g=>{const s=sheetOf(g),d=s&&(s.deliveries||[]).slice(-1)[0];return '<tr><td>'+E(monthLabel(g.month))+'</td><td>'+(s?E(s.status):'الكشف محذوف')+'</td><td>'+(d?E(d.item)+' — '+E(d.qty)+' '+E(d.unit):'—')+'</td><td>'+(g.minuteNo?E(g.minuteNo):'—')+'</td><td>'+(s?'<button class="secondary" data-os="'+E(s.id)+'">الكشف</button> ':'')+(g.minuteId?'<button class="secondary" data-pm="'+E(g.minuteId)+'">المحضر</button>':'')+'</td></tr>'}).join('')+'</tbody></table>':'<div class="empty">لا توجد كشوف مولّدة لهذه الجهة بعد.</div>')+
   '<div class="toolbar" style="margin-top:10px"><button class="secondary" id="v56Hx">إغلاق</button></div></div>';
  document.body.appendChild(o);G('v56Hx').onclick=()=>o.remove();
  o.querySelectorAll('[data-os]').forEach(b=>b.onclick=()=>{o.remove();try{window.Sheets.open(b.dataset.os)}catch(_){}});
  o.querySelectorAll('[data-pm]').forEach(b=>b.onclick=()=>{try{window.printSavedBoardMinute(b.dataset.pm)}catch(_){}});
 }

 /* تحكّم أسهل في النوافذ فوق الصفحة: زر إغلاق ثابت + Esc + ضغط على الخلفية المعتمة */
 const closeAll=()=>{['shOv','v56Ov'].forEach(i=>{const o=G(i);if(o)o.remove()})};
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAll()});
 try{new MutationObserver(()=>{['shOv','v56Ov'].forEach(i=>{const o=G(i);if(!o||o.__v56x)return;o.__v56x=true;
   o.addEventListener('mousedown',e=>{if(e.target===o)o.remove()});
   const inner=o.firstElementChild;if(inner&&!inner.querySelector('.v56x')){const b=document.createElement('button');b.type='button';b.className='secondary v56x';b.textContent='✕ إغلاق';
    b.style.cssText='position:sticky;top:0;z-index:5;float:left;margin:0 0 6px 0;box-shadow:0 2px 6px #0003';b.onclick=()=>o.remove();inner.insertBefore(b,inner.firstChild);
    /* تصغير/تكبير محتوى النافذة (يتذكّر آخر مقاس) */
    let z=1;try{z=parseFloat(localStorage.getItem('jkh_v56_zoom'))||1}catch(e){}
    const ap=()=>{z=Math.min(1.3,Math.max(.5,Math.round(z*100)/100));inner.style.zoom=z;try{localStorage.setItem('jkh_v56_zoom',z)}catch(e){}l.textContent=Math.round(z*100)+'%'};
    const mk=(t,d)=>{const x=document.createElement('button');x.type='button';x.className='secondary v56x';x.textContent=t;x.style.cssText='position:sticky;top:0;z-index:5;float:left;margin:0 6px 6px 0;box-shadow:0 2px 6px #0003';x.onclick=()=>{z+=d;ap()};return x};
    const l=document.createElement('span');l.className='v56x';l.style.cssText='position:sticky;top:0;z-index:5;float:left;margin:8px 6px 0 0;font-size:13px;background:#fff;padding:0 4px;border-radius:6px';
    inner.insertBefore(l,inner.firstChild);inner.insertBefore(mk('➕ تكبير',.1),inner.firstChild);inner.insertBefore(mk('➖ تصغير',-.1),inner.firstChild);ap()}})}).observe(document.body,{childList:true})}catch(e){}
 window.renderV56Ent=pageEnt;
 window.JKHDelivery56={createDeliveryMinute,buildMinuteData,makeSheet,askDelivery,ENT,GEN};
 if(!hook()){let n=0;const t=setInterval(()=>{if(hook()||++n>40)clearInterval(t)},250)}
 document.addEventListener('DOMContentLoaded',boot);if(document.readyState!=='loading')boot();
})();
