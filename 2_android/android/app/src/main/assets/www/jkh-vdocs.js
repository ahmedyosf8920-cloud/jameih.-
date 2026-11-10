/* جمعية الخير للجميع — استمارة التطوع وشهادة القبول (تعبئة تلقائية + PDF + صورة)
   تُولَّد الوثيقتان دائمًا من بيانات الطلب المحفوظة، فهي متطابقة في كل مرة ولا تحتاج حفظًا منفصلًا.
   الاستخدام:  VDocs.open(rec, 'form' | 'cert', {phone})   حيث rec = {code, status, payload, created_at, updated_at} */
(function(){
'use strict';
var S=2;                                   // دقة مضاعفة لنص أوضح عند الطباعة
// ضع ملف خط التصميم باسم fonts/vdoc-font.ttf ليُستخدم تلقائيًا (انظر fonts/README.txt)، وإلا تُستخدم خطوط الجهاز
var FONT='"VDoc","Cairo","Tajawal","Noto Sans Arabic","Noto Naskh Arabic",Tahoma,Arial,sans-serif';
var fontP=null;
function loadFont(){
  if(fontP)return fontP;
  fontP=(async function(){try{if(!window.FontFace)return;var f=new FontFace('VDoc','url(fonts/vdoc-font.ttf)',{weight:'100 900'});await f.load();document.fonts.add(f)}catch(e){try{if(!document.getElementById('vdFontCss')){var l=document.createElement('link');l.id='vdFontCss';l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap';document.head.appendChild(l)}await Promise.race([document.fonts.load('700 20px Cairo'),new Promise(function(r){setTimeout(r,4000)})])}catch(e2){}}})();
  return fontP;
}
var INK='#12263a', GREEN='#0b4a2a', TICK='#0b7a3b';
var BG={form:'vdoc-form.jpg',cert:'vdoc-cert.jpg'};
var SIZE={form:[1024,1536],cert:[1536,1024]};
var cache={};

/* ---------- أدوات ---------- */
function ar(s){return String(s==null?'':s).replace(/[0-9]/g,function(d){return '٠١٢٣٤٥٦٧٨٩'[d]})}
function digits(s){return String(s==null?'':s).replace(/[٠-٩]/g,function(c){return '٠١٢٣٤٥٦٧٨٩'.indexOf(c)}).replace(/[۰-۹]/g,function(c){return '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)}).replace(/[^0-9]/g,'')}
function cairoDate(v){
  var d=v?new Date(v):new Date(); if(isNaN(d))d=new Date();
  try{var p={};new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(d).forEach(function(x){p[x.type]=x.value});return {d:p.day,m:p.month,y:p.year}}
  catch(e){return {d:('0'+d.getDate()).slice(-2),m:('0'+(d.getMonth()+1)).slice(-2),y:String(d.getFullYear())}}
}
function birthFromNid(n){
  n=digits(n); if(n.length!==14)return null;
  var c=n[0]==='2'?1900:n[0]==='3'?2000:0; if(!c)return null;
  var y=c+Number(n.slice(1,3)),m=Number(n.slice(3,5)),d=Number(n.slice(5,7));
  if(m<1||m>12||d<1||d>31)return null; return {d:('0'+d).slice(-2),m:('0'+m).slice(-2),y:String(y)};
}
function loadImg(src){return new Promise(function(res,rej){var i=new Image();i.onload=function(){res(i)};i.onerror=function(){rej(new Error('تعذر تحميل تصميم الوثيقة'))};i.src=src})}
function bg(kind){return cache[kind]||(cache[kind]=loadImg((window.VDOC_BG&&window.VDOC_BG[kind])||BG[kind]))}

/* ---------- رسم ---------- */
function newCanvas(kind,img){
  var w=SIZE[kind][0]*S,h=SIZE[kind][1]*S,c=document.createElement('canvas');c.width=w;c.height=h;
  var x=c.getContext('2d');x.drawImage(img,0,0,w,h);x.scale(S,S);return {c:c,x:x};
}
function put(x,text,px,py,o){        // يكتب نصًا ويضغطه ليناسب العرض المتاح
  text=String(text==null?'':text).replace(/\s+/g,' ').trim(); if(!text||text.indexOf('••')>-1)return;
  o=o||{}; var size=o.size||24,min=o.min||13,max=o.max||9999;
  x.direction=o.ltr?'ltr':'rtl'; x.textAlign=o.align||'right'; x.textBaseline='alphabetic'; x.fillStyle=o.color||INK;
  var wt=o.weight||'bold';
  x.font=wt+' '+size+'px '+FONT;
  while(x.measureText(text).width>max&&size>min){size-=1;x.font=wt+' '+size+'px '+FONT}
  if(x.measureText(text).width>max){while(text.length>2&&x.measureText(text+'…').width>max)text=text.slice(0,-1);text=text.trim()+'…'}
  x.fillText(text,px,py);
}
function tick(x,cx,cy){
  x.save();x.strokeStyle=TICK;x.lineWidth=4.2;x.lineCap='round';x.lineJoin='round';
  x.beginPath();x.moveTo(cx-8,cy+1);x.lineTo(cx-2,cy+8);x.lineTo(cx+10,cy-9);x.stroke();x.restore();
}
function patch(x,rx,ry,rw,rh,col){x.fillStyle=col;x.fillRect(rx,ry,rw,rh)}
function dateParts(x,dt,cx,y,size,gap){   // يوم / شهر / سنة موزعة على خانات التصميم
  put(x,ar(dt.d),cx[0],y,{size:size,align:'center'});
  put(x,ar(dt.m),cx[1],y,{size:size,align:'center'});
  put(x,ar(dt.y),cx[2],y,{size:size,align:'center'});
}

/* ---------- مطابقة الأنشطة والأوقات ---------- */
function skillsOf(p){
  var a=(p.activities||[]).slice(),hit={},other=[];
  a.forEach(function(v){
    if(v==='التعليم')hit.edu=1;
    else if(v==='التنمية الاجتماعية'||v==='المساعدات')hit.soc=1;
    else if(v==='الصحة')hit.hlt=1;
    else if(v==='توعية'||v.indexOf('حملات ترفيهية')===0)hit.org=1;
    else if(v==='أخرى'){if(p.activities_other)other.push(p.activities_other)}
    else other.push(v);
  });
  return {hit:hit,other:other.join('، ')};
}
function timesOf(p){
  var t=p.times,r={};
  if(Array.isArray(t)&&t.length){t.forEach(function(v){
    if(/صباح/.test(v))r.am=1; else if(/مساء/.test(v))r.pm=1; else if(/عطل/.test(v))r.we=1; else if(/أيام|ايام/.test(v))r.wd=1});return r}
  var d=String(p.days||'');
  if(/جمع|سبت|عطل|إجاز|اجاز|نهاي/.test(d))r.we=1;
  if(/أحد|احد|اثنين|إثنين|ثلاثاء|ثلاثا|أربعاء|اربعاء|خميس|أسبوع|اسبوع|يومي|كل/.test(d))r.wd=1;
  return r;
}

/* ---------- الاستمارة ---------- */
async function drawForm(rec){
  await loadFont();
  var p=rec.payload||{},img=await bg('form'),k=newCanvas('form',img),x=k.x;
  patch(x,771,566,208,38,'rgb(253,252,249)');                     // يستبدل «رقم الهوية الوطنية» بـ «الرقم القومي»
  put(x,'الرقم القومي :',972,589,{size:25,color:'#202020',weight:'bold'});
  put(x,p.name,815,540,{size:26,max:285});
  put(x,ar(digits(p.national_id)),765,584,{size:25,max:240});
  put(x,ar(digits(p.whatsapp||p.phone)),878,627,{size:25,max:350});
  if(p.email)put(x,p.email,298,540,{size:20,max:245,ltr:true});
  put(x,p.address,388,584,{size:22,max:330,min:12});
  var b=birthFromNid(p.national_id);
  patch(x,106,608,44,38,'rgb(253,251,251)');                    // يستبدل «هـ» بـ «م» (تاريخ ميلادي)
  put(x,'م',128,630,{size:21,align:'center'});
  if(b)dateParts(x,b,[315,240,169],628,20);
  var s=skillsOf(p);
  // في التصميم خانة «تعليمي» غير مرسومة، فنرسم خانة مطابقة لها على يمين الكلمة
  x.save();x.fillStyle='#fdfcf9';x.strokeStyle='#1b4d2e';x.lineWidth=2;x.beginPath();
  if(x.roundRect)x.roundRect(951,725,25,25,6);else x.rect(951,725,25,25);x.fill();x.stroke();x.restore();
  if(s.hit.edu)tick(x,963,737); if(s.hit.soc)tick(x,833,737); if(s.hit.hlt)tick(x,681,737); if(s.hit.org)tick(x,547,737); if(s.other)tick(x,397,737);
  if(s.other)put(x,s.other,228,741,{size:19,max:175,min:11});
  var t=timesOf(p);
  if(t.am)tick(x,952,852); if(t.pm)tick(x,794,852); if(t.wd)tick(x,659,852); if(t.we)tick(x,435,852);
  put(x,p.emergency_name,818,968,{size:23,max:290});
  put(x,ar(digits(p.emergency_phone)),332,968,{size:23,max:270});
  put(x,p.name,820,1216,{size:25,max:275});
  patch(x,55,1198,42,32,'rgb(253,250,245)');
  put(x,'م',74,1220,{size:19,align:'center'});
  dateParts(x,cairoDate(rec.created_at),[250,175,113],1219,18);
  return k.c;
}

/* ---------- الشهادة ---------- */
async function drawCert(rec){
  await loadFont();
  var p=rec.payload||{},img=await bg('cert'),k=newCanvas('cert',img),x=k.x;
  put(x,p.name,660,523,{size:48,max:520,min:24,align:'center',color:GREEN});
  patch(x,950,846,193,34,'rgb(252,248,240)');                    // يمسح التاريخ المطبوع (٢٠٢٥) ليُكتب تاريخ الإصدار الفعلي
  var d=cairoDate(rec.status==='مقبول'?(rec.updated_at||rec.created_at):null);
  put(x,ar(d.d),1121,872,{size:25,align:'center',color:GREEN});
  put(x,'/',1096,872,{size:25,align:'center',color:GREEN});
  put(x,ar(d.m),1073,872,{size:25,align:'center',color:GREEN});
  put(x,'/',1049,872,{size:25,align:'center',color:GREEN});
  put(x,ar(d.y),1006,872,{size:25,align:'center',color:GREEN});
  put(x,'م',960,872,{size:25,align:'center',color:GREEN});
  return k.c;
}

function render(rec,kind){return kind==='cert'?drawCert(rec):drawForm(rec)}
function toBlob(c,type,q){return new Promise(function(res,rej){c.toBlob(function(b){b?res(b):rej(new Error('تعذر إنشاء الصورة'))},type,q)})}

/* ---------- PDF (JPEG داخل صفحة واحدة، بدون مكتبات خارجية) ---------- */
async function pdfFromCanvas(c,kind){
  var jpg=new Uint8Array(await (await toBlob(c,'image/jpeg',0.93)).arrayBuffer());
  var W=kind==='cert'?842:595,H=kind==='cert'?561:892,enc=new TextEncoder(),parts=[],off=[],len=0;
  function add(u){parts.push(u);len+=u.length}
  function s(t){add(enc.encode(t))}
  function obj(n,body){off[n]=len;s(n+' 0 obj\n'+body+'\nendobj\n')}
  s('%PDF-1.4\n');
  obj(1,'<</Type/Catalog/Pages 2 0 R>>');
  obj(2,'<</Type/Pages/Kids[3 0 R]/Count 1>>');
  obj(3,'<</Type/Page/Parent 2 0 R/MediaBox[0 0 '+W+' '+H+']/Resources<</XObject<</Im0 4 0 R>>>>/Contents 5 0 R>>');
  off[4]=len;s('4 0 obj\n<</Type/XObject/Subtype/Image/Width '+c.width+'/Height '+c.height+'/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length '+jpg.length+'>>\nstream\n');add(jpg);s('\nendstream\nendobj\n');
  var cs='q '+W+' 0 0 '+H+' 0 0 cm /Im0 Do Q';
  obj(5,'<</Length '+cs.length+'>>\nstream\n'+cs+'\nendstream');
  var xr=len;s('xref\n0 6\n0000000000 65535 f \n');
  for(var i=1;i<=5;i++)s(('0000000000'+off[i]).slice(-10)+' 00000 n \n');
  s('trailer\n<</Size 6/Root 1 0 R/Info<</Title(Volunteer)>>>>\nstartxref\n'+xr+'\n%%EOF');
  return new Blob(parts,{type:'application/pdf'});
}

/* ---------- حفظ / مشاركة ---------- */
function saveBlob(b,name){var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},4000)}
function waNum(v){var d=digits(v);if(!d)return '';if(d.indexOf('00')===0)return d.slice(2);if(d[0]==='0')return '20'+d.slice(1);if(d.indexOf('20')===0)return d;return '20'+d}
function safeName(rec,kind){return (kind==='cert'?'شهادة-':'استمارة-')+String((rec.payload||{}).name||rec.code||'متطوع').replace(/[\\/:*?"<>|\s]+/g,'-').slice(0,40)}

/* ---------- النافذة ---------- */
function css(){
  if(document.getElementById('vdocs-css'))return;
  var s=document.createElement('style');s.id='vdocs-css';
  s.textContent='#vdocs{position:fixed;inset:0;z-index:99999;background:#0009;display:flex;align-items:center;justify-content:center;padding:10px;direction:rtl;font-family:Tahoma,Arial,sans-serif}'+
  '#vdocs .bx{background:#fff;border-radius:16px;width:100%;max-width:560px;max-height:96vh;display:flex;flex-direction:column;overflow:hidden}'+
  '#vdocs .hd{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #e3eee7;font-weight:700;color:#075b3a}#vdocs .hd span{flex:1}'+
  '#vdocs .pv{flex:1;overflow:auto;padding:10px;background:#eef5f0;text-align:center;min-height:200px}#vdocs .pv img{max-width:100%;height:auto;border-radius:8px;box-shadow:0 3px 14px #0003;background:#fff}'+
  '#vdocs .ac{display:flex;flex-wrap:wrap;gap:8px;padding:12px 14px}#vdocs button{font:inherit;font-weight:700;border:0;border-radius:10px;padding:11px 14px;cursor:pointer;background:#16864b;color:#fff;flex:1;min-width:120px}'+
  '#vdocs button.s{background:#e8f4ec;color:#075b3a}#vdocs button:disabled{opacity:.55}#vdocs .st{padding:0 14px 12px;font-size:12.5px;color:#587;min-height:16px}';
  document.head.appendChild(s);
}
async function open(rec,kind,opt){
  opt=opt||{};css();kind=kind==='cert'?'cert':'form';
  var old=document.getElementById('vdocs');if(old)old.remove();
  var p=rec.payload||{},o=document.createElement('div');o.id='vdocs';
  var title=kind==='cert'?'شهادة قبول عضوية متطوع':'استمارة تسجيل متطوع';
  o.innerHTML='<div class="bx"><div class="hd"><span></span><button class="s" style="flex:none;min-width:0;padding:6px 12px" data-a="x">إغلاق ✕</button></div><div class="pv">جارٍ تجهيز الوثيقة…</div><div class="ac"></div><div class="st"></div></div>';
  o.querySelector('.hd span').textContent=title+' — '+(p.name||'');
  document.body.appendChild(o);
  var pv=o.querySelector('.pv'),ac=o.querySelector('.ac'),st=o.querySelector('.st');
  o.addEventListener('click',function(e){if(e.target===o||(e.target.dataset&&e.target.dataset.a==='x'))o.remove()});
  try{
    var c=await render(rec,kind),name=safeName(rec,kind);
    var jpg=await toBlob(c,'image/jpeg',0.92),pdf=await pdfFromCanvas(c,kind);
    var url=URL.createObjectURL(jpg);pv.innerHTML='';var im=new Image();im.src=url;im.alt=title;pv.appendChild(im);
    var file=null;try{file=new File([jpg],name+'.jpg',{type:'image/jpeg'})}catch(e){}
    function btn(t,cls,fn){var b=document.createElement('button');b.type='button';b.textContent=t;if(cls)b.className=cls;b.onclick=fn;ac.appendChild(b);return b}
    var phone=waNum(opt.phone||p.whatsapp||p.phone);
    var text=opt.text||((kind==='cert'?'شهادة قبول عضوية متطوع':'استمارة تسجيل متطوع')+' — جمعية الخير للجميع'+(p.name?'\nالسيد/ة '+p.name:''));
    btn(kind==='cert'&&opt.send!==false?'📲 إرسال الشهادة للمتطوع (صورة)':'📲 إرسال كصورة','',function(){
      if(file&&navigator.canShare&&navigator.canShare({files:[file]})){
        st.textContent='اختر واتساب ثم المتطوع من قائمة المشاركة.';
        navigator.share({files:[file],text:text,title:title}).catch(function(e){if(e&&e.name!=='AbortError')st.textContent='تعذرت المشاركة: '+(e.message||e)});return}
      saveBlob(jpg,name+'.jpg');
      if(phone){st.textContent='تم حفظ الصورة في جهازك. ستفتح محادثة المتطوع على واتساب — أرفق الصورة المحفوظة وأرسلها.';window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(text),'_blank','noopener')}
      else st.textContent='تم حفظ الصورة في جهازك (لا يوجد رقم واتساب لفتح المحادثة).';
    });
    btn('⬇️ تحميل PDF','s',function(){saveBlob(pdf,name+'.pdf');st.textContent='تم تحميل ملف PDF.'});
    btn('🖼️ حفظ كصورة','s',function(){saveBlob(jpg,name+'.jpg');st.textContent='تم حفظ الصورة.'});
    btn('🖨️ طباعة','s',function(){var w=window.open(url,'_blank');if(w)w.addEventListener('load',function(){try{w.print()}catch(e){}})});
  }catch(e){pv.textContent='تعذر تجهيز الوثيقة: '+(e.message||e)}
}

window.VDocs={open:open,render:render,pdf:pdfFromCanvas,waNum:waNum,_birthFromNid:birthFromNid,_timesOf:timesOf,_skillsOf:skillsOf};
})();
