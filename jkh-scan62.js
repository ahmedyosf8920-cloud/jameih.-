/* v62 — قراءة البيانات من صور البطاقة (وجه/ظهر) وشهادة الميلاد وتعبئة النماذج تلقائيًا.
   القراءة (OCR) تتم داخل المتصفح بمكتبة Tesseract.js — الصور لا تُرسل لأي جهة؛ يتم تحميل المكتبة وملفات اللغة مرة واحدة فقط.
   كل نتيجة تُعرض للمراجعة قبل التعبئة، ولا شيء يُحفظ تلقائيًا. */
(function(){
'use strict';
var LIB='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
var GOV={'01':'القاهرة','02':'الإسكندرية','03':'بورسعيد','04':'السويس','11':'دمياط','12':'الدقهلية','13':'الشرقية','14':'القليوبية','15':'كفر الشيخ','16':'الغربية','17':'المنوفية','18':'البحيرة','19':'الإسماعيلية','21':'الجيزة','22':'بني سويف','23':'الفيوم','24':'المنيا','25':'أسيوط','26':'سوهاج','27':'قنا','28':'أسوان','29':'الأقصر','31':'البحر الأحمر','32':'الوادي الجديد','33':'مطروح','34':'شمال سيناء','35':'جنوب سيناء','88':'خارج الجمهورية'};
/* ---------- أدوات النص ---------- */
function norm(s){return String(s==null?'':s).replace(/[٠-٩]/g,function(c){return '٠١٢٣٤٥٦٧٨٩'.indexOf(c)}).replace(/[۰-۹]/g,function(c){return '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)}).replace(/‏|‎|‫|‬/g,'')}
function validNid(n){n=String(n||'');if(!/^[23]\d{13}$/.test(n))return false;var m=+n.slice(3,5),d=+n.slice(5,7);return m>=1&&m<=12&&d>=1&&d<=31&&!!GOV[n.slice(7,9)]}
function nidInfo(n){if(!validNid(n))return null;var y=(n[0]==='2'?1900:2000)+(+n.slice(1,3)),m=n.slice(3,5),d=n.slice(5,7);return {birth:y+'-'+m+'-'+d,birthAr:d+'/'+m+'/'+y,gender:(+n[12])%2?'ذكر':'أنثى',gov:GOV[n.slice(7,9)]}}
function findNids(text){
  var t=norm(text).replace(/(\d)[ \-.]+(?=\d)/g,'$1').replace(/(\d)[ \-.]+(?=\d)/g,'$1');
  var all=t.match(/\d{14}/g)||[],good=[],bad=[];all.forEach(function(x){(validNid(x)?good:bad).push(x)});
  return {valid:good,invalid:bad};
}
var STOP=/جمهورية|مصر|العربية|بطاقة|تحقيق|الشخصية|الرقم|القومي|وزارة|الداخلية|شهادة|ميلاد|مصلحة|الأحوال|المدنية|سجل|رقم|تاريخ|محل|مكان|الجنسية|الديانة|مسلم|مسيحي|المهنة|الحالة|الاجتماعية|صالحة|حتى|تحرير|إصدار|الإصدار|توقيع|مدير|رئيس/;
function arLines(text){
  return norm(text).split(/\r?\n/).map(function(l){return l.replace(/[|_~=\[\]{}<>«»"'`*#]+/g,' ').replace(/\s+/g,' ').trim()}).filter(function(l){
    if(l.length<3)return false;var a=(l.match(/[؀-ۿ]/g)||[]).length,n=(l.match(/\d/g)||[]).length;return a>=3&&a/(l.length-(l.match(/\s/g)||[]).length||1)>=.6&&n<=4;});
}
function clean(s){return String(s||'').replace(/[\d:：\-_.،,]+/g,' ').replace(/\s+/g,' ').trim()}
function parseFront(text){
  var r={kind:'front'},n=findNids(text);
  r.nid=n.valid[0]||n.invalid[0]||'';r.nidOk=!!n.valid[0];
  var lines=arLines(text).filter(function(l){return !STOP.test(l)}).map(clean).filter(function(l){return l.split(' ').length<=4&&l.length>=3});
  if(lines.length){
    var name=lines[0],used=1;
    if(lines.length>1&&name.split(' ').length<=2){name+=' '+lines[1];used=2}
    r.name=name;
    var addr=lines.slice(used);if(addr.length)r.address=addr.join(' - ');
  }
  var inf=nidInfo(r.nid);if(inf){r.birth=inf.birth;r.gender=inf.gender;r.gov=inf.gov}
  return r;
}
function parseBack(text){
  var r={kind:'back'},t=norm(text);
  var m=t.match(/(أعزب|عزباء|متزوج[ةه]?|مطلق[ةه]?|أرمل[ةه]?|ارمل[ةه]?)/);
  if(m){var w=m[1];r.social=/عزب/.test(w)?'أعزب':/متزوج/.test(w)?'متزوج':/مطلق/.test(w)?'مطلق':'أرمل'}
  var g=t.match(/(?:^|\s)(ذكر|أنثى|انثى)(?:\s|$)/m);if(g)r.gender=g[1]==='ذكر'?'ذكر':'أنثى';
  var j=t.match(/(?:المهنة|الوظيفة|المهن[ةه])\s*[:：]?\s*([^\n\d]{2,40})/);if(j){var jj=clean(j[1]);if(jj&&!STOP.test(jj))r.job=jj}
  var d=t.match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(20\d{2})/g);if(d&&d.length)r.expiry=d[d.length-1].replace(/\s+/g,'');
  return r;
}
function parseBirth(text){
  var r={kind:'birth'},t=norm(text),n=findNids(t);
  r.nid=n.valid[0]||n.invalid[0]||'';r.nidOk=!!n.valid[0];
  function lab(re){var m=t.match(re);return m?clean(m[1]):''}
  var nm=lab(/(?:اسم المولود|الاسم|اسم الطفل)\s*[:：]?\s*([^\n]{3,60})/);if(nm&&!/الأب|الأم/.test(nm))r.name=nm;
  var f=lab(/اسم الأب\s*[:：]?\s*([^\n]{3,60})/);if(f)r.father=f;
  var mo=lab(/اسم الأم\s*[:：]?\s*([^\n]{3,60})/);if(mo)r.mother=mo;
  var pl=lab(/(?:محل|مكان) (?:الميلاد|الولادة)\s*[:：]?\s*([^\n]{2,50})/);if(pl)r.place=pl;
  var d=t.match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*((?:19|20)\d{2})/),d2=t.match(/((?:19|20)\d{2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})/);
  function p2(x){return ('0'+x).slice(-2)}
  if(d)r.birth=d[3]+'-'+p2(d[2])+'-'+p2(d[1]);else if(d2)r.birth=d2[1]+'-'+p2(d2[2])+'-'+p2(d2[3]);
  var inf=nidInfo(r.nid);if(inf){if(!r.birth)r.birth=inf.birth;r.gender=inf.gender;r.gov=inf.gov}
  var g=t.match(/(?:^|\s)(ذكر|أنثى|انثى)(?:\s|$)/m);if(g&&!r.gender)r.gender=g[1]==='ذكر'?'ذكر':'أنثى';
  return r;
}
function parse(text,kind){return kind==='back'?parseBack(text):kind==='birth'?parseBirth(text):parseFront(text)}
/* ---------- OCR ---------- */
var libP=null;
function loadLib(){
  if(window.Tesseract)return Promise.resolve();
  return libP||(libP=new Promise(function(res,rej){var s=document.createElement('script');s.src=LIB;s.onload=function(){res()};s.onerror=function(){libP=null;rej(new Error('تعذر تحميل مكتبة القراءة — يلزم إنترنت في أول استخدام'))};document.head.appendChild(s)}));
}
function prep(file){
  return new Promise(function(res,rej){
    var u=URL.createObjectURL(file),i=new Image();
    i.onload=function(){
      var L=Math.max(i.width,i.height),k=L>2200?2200/L:L<1400?1400/L:1,w=Math.round(i.width*k),h=Math.round(i.height*k),c=document.createElement('canvas');c.width=w;c.height=h;
      var x=c.getContext('2d');x.drawImage(i,0,0,w,h);
      try{var d=x.getImageData(0,0,w,h),a=d.data,lo=255,hi=0,g=new Uint8Array(w*h),j;
        for(j=0;j<g.length;j++){var v=.299*a[j*4]+.587*a[j*4+1]+.114*a[j*4+2];g[j]=v;if(v<lo)lo=v;if(v>hi)hi=v}
        var sc=hi>lo+10?255/(hi-lo):1;for(j=0;j<g.length;j++){var q=Math.max(0,Math.min(255,(g[j]-lo)*sc));a[j*4]=a[j*4+1]=a[j*4+2]=q}x.putImageData(d,0,0)}catch(e){}
      URL.revokeObjectURL(u);res(c)};
    i.onerror=function(){URL.revokeObjectURL(u);rej(new Error('تعذر فتح الصورة'))};i.src=u});
}
async function ocr(file,onp){
  await loadLib();var c=await prep(file);
  var w=await Tesseract.createWorker(['ara','eng'],1,{logger:function(m){if(onp&&m&&m.progress!=null)onp(m.status,m.progress)}});
  try{var r=await w.recognize(c);return (r&&r.data&&r.data.text)||''}finally{try{await w.terminate()}catch(e){}}
}
/* ---------- واجهة ---------- */
var CSS='.sc62{grid-column:1/-1;border:1px dashed #1b7a43;border-radius:12px;padding:10px 12px;margin:8px 0 12px;background:#f6fbf8;direction:rtl;font-family:inherit}.sc62 h4{margin:0 0 6px;font-size:14px;color:#0b4a2a}.sc62 .r{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:4px 0}.sc62 select,.sc62 button{font:inherit;padding:8px 10px;border-radius:8px;border:1px solid #b9d3c3;background:#fff;width:auto}.sc62 button{background:#16864b;color:#fff;border:0;font-weight:700;cursor:pointer}.sc62 button.s{background:#e8f4ec;color:#0b4a2a}.sc62 .st{font-size:12px;color:#456;min-height:16px}'
 +'#sc62Ov{position:fixed;inset:0;background:#0008;z-index:100000;display:flex;align-items:center;justify-content:center;padding:10px;direction:rtl;font-family:Tahoma,Arial,sans-serif}#sc62Ov .bx{background:#fff;color:#111;border-radius:14px;max-width:520px;width:100%;max-height:94vh;overflow:auto;padding:14px}#sc62Ov h3{margin:0 0 8px}#sc62Ov label{display:flex;gap:8px;align-items:center;margin:6px 0;font-size:13px}#sc62Ov label span{min-width:92px;flex:none}#sc62Ov input[type=text]{flex:1 1 auto!important;width:auto!important;min-width:0!important;height:auto!important;padding:8px!important;margin:0!important;border:1px solid #bbb!important;border-radius:8px!important;font:inherit!important;background:#fff!important;color:#111!important;display:block!important;box-sizing:border-box!important}#sc62Ov input[type=checkbox]{width:18px!important;height:18px!important;flex:none!important;margin:0!important;padding:0!important}#sc62Ov .w{color:#b45309;font-size:12px}#sc62Ov .ok{color:#15803d;font-size:12px}#sc62Ov .ac{display:flex;gap:8px;margin-top:10px}#sc62Ov button{font:inherit;padding:10px 14px;border:0;border-radius:10px;font-weight:700;cursor:pointer;background:#16864b;color:#fff;flex:1}#sc62Ov button.s{background:#e8eef0;color:#234}';
function css(){if(document.getElementById('sc62css'))return;var s=document.createElement('style');s.id='sc62css';s.textContent=CSS;document.head.appendChild(s)}
function q(sel){return typeof sel==='string'?(document.getElementById(sel)||document.querySelector(sel)):sel}
function setVal(sel,v,append){var e=q(sel);if(!e||v==null||v==='')return false;
  if(e.tagName==='SELECT'){var o=Array.prototype.find.call(e.options,function(x){return x.value===v||x.textContent.trim()===v});if(!o)return false;e.value=o.value}
  else if(append&&e.value)e.value=e.value.replace(/\s+$/,'')+'\n'+v;
  else if(e.type==='date'&&/^\d{4}-\d{2}-\d{2}$/.test(v))e.value=v;
  else e.value=v;
  ['input','change'].forEach(function(t){e.dispatchEvent(new Event(t,{bubbles:true}))});return true}
var FIELDS=[['name','الاسم'],['nid','الرقم القومي'],['address','العنوان'],['birth','تاريخ الميلاد'],['social','الحالة الاجتماعية'],['father','اسم الأب'],['mother','اسم الأم']];
function review(res,target,cfg){
  css();var old=document.getElementById('sc62Ov');if(old)old.remove();
  var map=target.map,o=document.createElement('div');o.id='sc62Ov';
  var h='<div class="bx"><h3>راجع البيانات المقروءة</h3><div class="w" style="margin-bottom:6px">القراءة الآلية قد تخطئ — صحّح أي بيان قبل التعبئة. لن يُحفظ شيء إلا بعد ضغطك على حفظ في النموذج.</div>';
  var rows=[];
  FIELDS.forEach(function(f){var k=f[0];if(res[k]==null||res[k]==='')return;
    var usable=(k==='father'||k==='mother')?!!cfg.notes:!!map[k];
    h+='<label><input type="checkbox" data-c="'+k+'"'+(usable?' checked':' disabled')+'><span>'+f[1]+'</span><input type="text" data-v="'+k+'" value="'+String(res[k]).replace(/"/g,'&quot;')+'"></label>';
    if(k==='nid')h+=res.nidOk?'<div class="ok" style="margin:-2px 0 4px 0">✓ الرقم صحيح'+(res.gov?' — '+res.gov:'')+(res.gender?' — '+res.gender:'')+'</div>':'<div class="w" style="margin:-2px 0 4px 0">⚠ الرقم غير مطابق لشكل الرقم القومي — راجعه من الصورة</div>';
    if(!usable&&k!=='nid')h+='<div class="w" style="margin:-2px 0 4px 0">لا توجد خانة مقابلة في هذا النموذج.</div>';
    rows.push(k)});
  if(res.job)h+='<div class="ok">المهنة المقروءة: '+res.job+'</div>';
  if(res.expiry)h+='<div class="ok">تاريخ آخر صلاحية ظاهر: '+res.expiry+'</div>';
  if(!rows.length)h+='<div class="w">لم أتمكن من قراءة بيانات واضحة. جرّب صورة أوضح (إضاءة جيدة، البطاقة مستقيمة وتملأ الإطار).</div>';
  h+='<div class="ac"><button data-a="go"'+(rows.length?'':' disabled')+'>تعبئة النموذج</button><button class="s" data-a="x">إلغاء</button></div></div>';
  o.innerHTML=h;document.body.appendChild(o);
  o.addEventListener('click',function(e){var a=e.target.dataset&&e.target.dataset.a;if(e.target===o||a==='x'){o.remove();return}
    if(a==='go'){var done=0,notes=[];
      rows.forEach(function(k){var c=o.querySelector('[data-c="'+k+'"]');if(!c||!c.checked||c.disabled)return;var v=o.querySelector('[data-v="'+k+'"]').value.trim();if(!v)return;
        if(k==='father'||k==='mother'){notes.push((k==='father'?'اسم الأب: ':'اسم الأم: ')+v);return}
        if(k==='birth'&&map.birth){var be=q(map.birth);if(be&&be.type!=='date'&&/^\d{4}-\d{2}-\d{2}$/.test(v)){var p=v.split('-');v=p[2]+'/'+p[1]+'/'+p[0]}}
        if(setVal(map[k],v))done++});
      if(notes.length&&cfg.notes){setVal(cfg.notes,'من شهادة الميلاد — '+notes.join('، '),true);done++}
      o.remove();if(cfg.onDone)cfg.onDone(done);if(window.tst)tst('تمت تعبئة '+done+' خانة — راجعها ثم احفظ')}});
}
function mount(host,cfg){
  if(!host||host.querySelector('.sc62'))return;css();
  var d=document.createElement('div');d.className='sc62';
  var tg=cfg.targets.length>1?'<select data-t>'+cfg.targets.map(function(t,i){return '<option value="'+i+'">'+t.label+'</option>'}).join('')+'</select>':'';
  d.innerHTML='<h4>📷 تعبئة تلقائية من صورة المستند</h4><div class="r"><select data-k>'+cfg.kinds.map(function(k){return '<option value="'+k[0]+'">'+k[1]+'</option>'}).join('')+'</select>'+tg+'</div>'
   +'<div class="r"><button type="button" data-cam>📷 تصوير</button><button type="button" class="s" data-pick>🖼 اختيار صورة</button><input type="file" accept="image/*" capture="environment" hidden data-fc><input type="file" accept="image/*" hidden data-fp></div><div class="st"></div>';
  host.insertBefore(d,host.firstChild);
  var st=d.querySelector('.st');
  async function run(f){
    if(!f)return;if(!/^image\//.test(f.type)){st.textContent='اختر صورة (JPG/PNG)، وليس PDF.';return}
    var kind=d.querySelector('[data-k]').value,ti=d.querySelector('[data-t]'),target=cfg.targets[ti?+ti.value:0];
    st.textContent='جارٍ تجهيز القراءة… (أول مرة بتحمّل ملفات اللغة وممكن تاخد دقيقة)';
    try{var text=await ocr(f,function(s,p){st.textContent='جارٍ القراءة… '+Math.round(p*100)+'%'});
      st.textContent='تمت القراءة — راجع البيانات.';review(parse(text,kind),target,cfg)}
    catch(e){st.textContent='تعذرت القراءة: '+(e.message||e)}
  }
  var fc=d.querySelector('[data-fc]'),fp=d.querySelector('[data-fp]');
  d.querySelector('[data-cam]').onclick=function(){fc.value='';fc.click()};d.querySelector('[data-pick]').onclick=function(){fp.value='';fp.click()};
  fc.onchange=function(){run(fc.files[0])};fp.onchange=function(){run(fp.files[0])};
  return d;
}
var ALL=[['front','البطاقة — الوجه'],['back','البطاقة — الظهر'],['birth','شهادة الميلاد']];
function auto(){
  var cf=document.getElementById('caseForm');
  if(cf)mount(cf,{kinds:ALL,notes:'notes',targets:[
    {label:'بيانات الحالة',map:{name:'name',nid:'nid',address:'address',birth:'birth',social:'social'}},
    {label:'الزوج',map:{name:'husband',nid:'husbandNid'}},{label:'الزوجة',map:{name:'wife',nid:'wifeNid'}}]});
  var ah=document.getElementById('apHusband');
  if(ah){var host=ah.closest('.formgrid')||ah.closest('form')||ah.parentNode.parentNode;
    mount(host,{kinds:ALL,notes:'apNotes',targets:[{label:'مقدّم الطلب (الزوج)',map:{name:'apHusband',nid:'apNid',address:'apAddress',social:'apSocial'}},{label:'الزوجة',map:{name:'apWife',nid:'apWifeNid'}}]})}
  var ph=document.getElementById('husband');
  if(ph&&document.getElementById('files')&&!cf){var h2=ph.closest('form')||ph.parentNode.parentNode;
    mount(h2,{kinds:ALL,notes:'notes',targets:[{label:'مقدّم الطلب (الزوج)',map:{name:'husband',nid:'nid',address:'address',social:'social'}},{label:'الزوجة',map:{name:'wife',nid:'wifeNid'}}]})}
  var idf=document.getElementById('id_front');
  if(idf){var vf=idf.closest('form')||idf.parentNode.parentNode;
    mount(vf,{kinds:[['front','البطاقة — الوجه'],['back','البطاقة — الظهر']],targets:[{label:'المتطوع',map:{name:'[name=name]',nid:'[name=national_id]',address:'[name=address]'}}]})}
}
window.JKHScan={parse:parse,parseFront:parseFront,parseBack:parseBack,parseBirth:parseBirth,findNids:findNids,validNid:validNid,nidInfo:nidInfo,ocr:ocr,mount:mount,auto:auto,review:review};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',auto);else setTimeout(auto,0);
})();
