/* جمعية الخير للجميع — إعدادات المظهر (الإصدار 32)
   حجم الخط، نوع الخط، سُمك الخط، تباعد الأسطر، الثيمات، الوضع (فاتح/داكن/تباين عالٍ/مريح للعين)،
   وصور تعبيرية لكل قسم. الإعدادات تُحفظ في هذا الجهاز فقط (localStorage).
   يعمل أيضًا داخل الصفحات الفرعية (iframe) لتطبيق نفس المظهر. */
(function(){
'use strict';
var KEY='jkh_look_v32';
var DEF={size:100,font:'tahoma',weight:'normal',lh:'normal',theme:'green',mode:'light',heroes:true,dense:false};
var FONTS={
 tahoma:['تاهوما (الافتراضي)','Tahoma,Arial,sans-serif'],
 segoe:['سيجو — حديث','"Segoe UI",system-ui,Tahoma,Arial,sans-serif'],
 system:['خط الجهاز','system-ui,-apple-system,"Noto Sans Arabic",Roboto,Tahoma,sans-serif'],
 arial:['أريال — بسيط','Arial,Helvetica,sans-serif'],
 verdana:['فيردانا — واسع وواضح','Verdana,Tahoma,sans-serif'],
 naskh:['نسخ — كتابي','"Traditional Arabic","Simplified Arabic","Noto Naskh Arabic","Times New Roman",serif']
};
var THEMES={
 green:['أخضر','#18864b','#0b6838','#f4f7f5','#dfe9e4','#18352b'],
 blue:['أزرق','#1766b8','#0e4a8a','#f2f6fb','#d9e4f0','#14283d'],
 purple:['بنفسجي','#6a3fb5','#4b2a86','#f6f3fb','#e3dcf0','#2a1c45'],
 teal:['فيروزي','#0d8a8f','#0a6368','#f1f8f8','#d5e8e9','#10373a'],
 gold:['ذهبي','#b07a12','#7d5508','#faf6ec','#ece1c8','#3d2c08'],
 rose:['وردي','#c2185b','#8e1141','#fbf1f5','#f0d9e3','#45101f'],
 slate:['رمادي أزرق','#37506b','#243a52','#f2f4f7','#dbe1e8','#1d2a38']
};
var MODES={light:'فاتح',dark:'داكن',hc:'تباين عالٍ',soft:'مريح للعين'};
var S=load();
function load(){var o={};try{o=JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(e){}
 var r={};for(var k in DEF)r[k]=(o[k]===undefined?DEF[k]:o[k]);
 r.size=Math.max(80,Math.min(170,+r.size||100));if(!FONTS[r.font])r.font='tahoma';if(!THEMES[r.theme])r.theme='green';if(!MODES[r.mode])r.mode='light';return r}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}

/* ---------- تطبيق المظهر ---------- */
function css(){
 var t=THEMES[S.theme],f=FONTS[S.font][1],c='';
 c+=':root{--g:'+t[1]+';--g2:'+t[2]+';--bg:'+t[3]+';--line:'+t[4]+';--text:'+t[5]+'}';
 c+='html,body,button,input,select,textarea,table,th,td,h1,h2,h3,h4,p,label,a,span,div,small,b,strong{font-family:'+f+'!important}';
 if(S.weight==='bold')c+='body{font-weight:600}body small,body .muted{font-weight:500}';
 if(S.lh==='wide')c+='body{line-height:1.95}';else if(S.lh==='extra')c+='body{line-height:2.3}';
 if(S.size!==100)c+='body{zoom:'+(S.size/100)+'}';
 if(S.theme!=='green'){c+='#nav{background:linear-gradient(180deg,var(--g2),color-mix(in srgb,var(--g2) 65%,#000) 80%)!important}#nav button.active{background:linear-gradient(100deg,color-mix(in srgb,var(--g) 55%,#fff),var(--g))!important}'}
 /* ألوان تتبع الثيم بدل الألوان الثابتة */
 c+='.secondary{background:color-mix(in srgb,var(--g) 13%,#fff)!important;color:var(--g2)!important}';
 c+='.primary{background:var(--g)!important}';
 c+='input,select,textarea{border-color:color-mix(in srgb,var(--g) 25%,#cfd8d4)}';
 if(S.dense)c+='button{padding:7px 10px!important}.card{padding:12px!important}td,th{padding:6px 8px!important}';
 if(S.mode==='dark'){
  c+=':root{--bg:#e4e9e6;--line:#c9d0cc}';
  c+='html{filter:invert(1) hue-rotate(180deg)}';
  c+='img,video,canvas,iframe,.jkh-hero,#nav{filter:invert(1) hue-rotate(180deg)}';
  c+='.card,.box,.loginbox,.modal .box{background:#cdd3d0!important}';
 }else if(S.mode==='hc'){
  c+=':root{--bg:#fff;--line:#222;--text:#000;--muted:#222}';
  c+='body{color:#000!important}.muted,small,label{color:#111!important}';
  c+='input,select,textarea{border:2px solid #000!important;background:#fff!important;color:#000!important}';
  c+='.card,.box{border:2px solid #000!important;box-shadow:none!important}th,td{border-color:#000!important}';
  c+='button{border:2px solid #000!important;font-weight:700}.secondary{background:#fff!important;color:#000!important}';
  c+='.primary{background:#000!important;color:#fff!important}';
 }else if(S.mode==='soft'){
  c+=':root{--bg:#f6efe0;--line:#e3d7bd;--text:#33291a}';
  c+='html{filter:sepia(.22) saturate(.9) brightness(.97)}';
 }
 c+='@media print{html{filter:none!important}body{zoom:1!important}.jkh-hero,#jkhLookBtn,#jkhLookPanel{display:none!important}}';
 return c;
}
function styleEl(id){var e=document.getElementById(id);if(!e){e=document.createElement('style');e.id=id;(document.head||document.documentElement).appendChild(e)}return e}
function apply(){styleEl('jkhLookCss').textContent=css();document.documentElement.setAttribute('data-jkh-mode',S.mode);
 document.documentElement.classList.toggle('jkh-noheroes',!S.heroes)}
apply();
window.JKHLook={get:function(){return JSON.parse(JSON.stringify(S))},set:function(o){for(var k in o)S[k]=o[k];save();apply();refreshHeroes();syncPanel()},reset:function(){S=JSON.parse(JSON.stringify(DEF));save();apply();refreshHeroes();syncPanel()}};
window.addEventListener('storage',function(e){if(e.key===KEY){S=load();apply();syncPanel()}});

/* ---------- الصور التعبيرية (SVG أصلية، تتبع ألوان الثيم) ---------- */
var W='#fff',W8='#ffffffd9',W5='#ffffff80',W3='#ffffff40',Y='#ffd35c',M='#bff0d3';
function P(x,y,s,c){ /* شخص: رأس + جسم */ return '<circle cx="'+x+'" cy="'+(y-14*s)+'" r="'+(8*s)+'" fill="'+c+'"/><path d="M'+(x-13*s)+' '+(y+22*s)+'v-'+(8*s)+'a'+(13*s)+' '+(13*s)+' 0 0 1 '+(26*s)+' 0v'+(8*s)+'z" fill="'+c+'"/>'}
var SC={
 people:P(58,60,1.25,W)+P(105,66,1,W8)+P(26,72,.8,W5)+'<rect x="20" y="96" width="120" height="5" rx="2.5" fill="'+W3+'"/>',
 aid:'<rect x="38" y="48" width="84" height="52" rx="6" fill="'+W+'"/><rect x="30" y="38" width="100" height="16" rx="5" fill="'+W8+'"/><rect x="74" y="38" width="12" height="62" fill="'+Y+'"/><path d="M80 38c-14-18-34-6-22 4zM80 38c14-18 34-6 22 4z" fill="'+Y+'"/><circle cx="130" cy="30" r="3" fill="'+W5+'"/><circle cx="26" cy="64" r="4" fill="'+W3+'"/>',
 heart:'<path d="M80 98C40 70 26 52 26 36a22 22 0 0 1 40-12 20 20 0 0 1 14 8 20 20 0 0 1 14-8 22 22 0 0 1 40 12c0 16-14 34-54 62z" fill="'+W+'"/><circle cx="124" cy="70" r="18" fill="'+Y+'"/><circle cx="124" cy="70" r="12" fill="none" stroke="#fff9" stroke-width="3"/><text x="124" y="76" font-size="16" font-weight="700" text-anchor="middle" fill="#fff">£</text>',
 warehouse:'<path d="M18 52 80 20l62 32v50H18z" fill="'+W+'"/><rect x="50" y="62" width="60" height="40" rx="3" fill="'+W5+'"/><path d="M50 72h60M50 82h60M50 92h60" stroke="#fff" stroke-width="2"/><rect x="26" y="84" width="20" height="18" rx="2" fill="'+Y+'"/><rect x="114" y="80" width="22" height="22" rx="2" fill="'+Y+'"/>',
 volunteer:P(50,64,1.1,W)+P(110,64,1.1,W8)+'<path d="M80 58c-8-10-20-4-14 6l14 14 14-14c6-10-6-16-14-6z" fill="'+Y+'"/><circle cx="80" cy="24" r="2.5" fill="'+W5+'"/>',
 accounts:'<rect x="24" y="64" width="20" height="34" rx="3" fill="'+W5+'"/><rect x="54" y="48" width="20" height="50" rx="3" fill="'+W8+'"/><rect x="84" y="30" width="20" height="68" rx="3" fill="'+W+'"/><path d="M26 44l30-18 24 12 40-26" fill="none" stroke="'+Y+'" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="128" cy="68" r="14" fill="'+Y+'"/><text x="128" y="74" font-size="16" font-weight="700" text-anchor="middle" fill="#fff">£</text>',
 flag:'<path d="M20 100q40-30 70-10t52-8v8z" fill="'+W5+'"/><rect x="62" y="20" width="4" height="80" rx="2" fill="'+W+'"/><path d="M66 24h54l-12 16 12 16H66z" fill="'+Y+'"/><circle cx="130" cy="30" r="3" fill="'+W5+'"/>',
 report:'<rect x="30" y="16" width="62" height="86" rx="7" fill="'+W+'"/><path d="M42 36h38M42 48h38M42 60h24" stroke="'+W5+'" stroke-width="4" stroke-linecap="round"/><circle cx="108" cy="62" r="26" fill="'+W8+'"/><path d="M108 62V36a26 26 0 0 1 24 36z" fill="'+Y+'"/><path d="M108 62l-18 20" stroke="#fff6" stroke-width="2"/>',
 chat:'<path d="M20 22h72a8 8 0 0 1 8 8v34a8 8 0 0 1-8 8H50l-16 14V72h-14a8 8 0 0 1-8-8V30a8 8 0 0 1 8-8z" fill="'+W+'"/><path d="M60 52h72a8 8 0 0 1 8 8v28a8 8 0 0 1-8 8h-10v12l-14-12H60a8 8 0 0 1-8-8V60a8 8 0 0 1 8-8z" fill="'+Y+'"/><path d="M34 40h44M34 52h28" stroke="'+W5+'" stroke-width="4" stroke-linecap="round"/>',
 pin:'<path d="M12 90q30-24 52-8t46-16 38 12v28H12z" fill="'+W3+'"/><path d="M80 14a26 26 0 0 0-26 26c0 22 26 52 26 52s26-30 26-52A26 26 0 0 0 80 14z" fill="'+W+'"/><circle cx="80" cy="40" r="10" fill="'+Y+'"/><ellipse cx="80" cy="98" rx="20" ry="5" fill="'+W5+'"/>',
 doc:'<rect x="36" y="14" width="64" height="88" rx="7" fill="'+W+'"/><path d="M48 36h40M48 48h40M48 60h28M48 72h34" stroke="'+W5+'" stroke-width="4" stroke-linecap="round"/><path d="M100 80l22-26 10 8-22 26-14 4z" fill="'+Y+'"/><path d="M100 80l-2 12 12-4z" fill="'+W+'"/>',
 shield:'<path d="M80 12l46 16v30c0 26-20 40-46 50C54 98 34 84 34 58V28z" fill="'+W+'"/><path d="M80 24l34 12v22c0 18-14 30-34 38z" fill="'+W5+'"/><rect x="68" y="52" width="24" height="20" rx="4" fill="'+Y+'"/><path d="M72 52v-6a8 8 0 0 1 16 0v6" fill="none" stroke="'+Y+'" stroke-width="4"/>',
 cloud:'<path d="M46 86a22 22 0 0 1-2-44 30 30 0 0 1 58-4 24 24 0 0 1 8 48z" fill="'+W+'"/><path d="M80 90V56M66 68l14-14 14 14" fill="none" stroke="'+Y+'" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="130" cy="24" r="3" fill="'+W5+'"/>',
 audit:'<rect x="32" y="16" width="64" height="86" rx="7" fill="'+W+'"/><rect x="52" y="10" width="24" height="14" rx="4" fill="'+W5+'"/><path d="M44 42h8M44 58h8M44 74h8" stroke="'+Y+'" stroke-width="5" stroke-linecap="round"/><path d="M60 42h26M60 58h26M60 74h18" stroke="'+W5+'" stroke-width="4" stroke-linecap="round"/><circle cx="108" cy="76" r="16" fill="'+W8+'" stroke="'+Y+'" stroke-width="5"/><path d="M120 88l16 16" stroke="'+Y+'" stroke-width="6" stroke-linecap="round"/>',
 card:'<rect x="20" y="28" width="120" height="70" rx="10" fill="'+W+'"/><circle cx="52" cy="58" r="12" fill="'+Y+'"/><path d="M34 88c2-12 34-12 36 0z" fill="'+Y+'"/><path d="M82 52h44M82 66h32M82 80h38" stroke="'+W5+'" stroke-width="5" stroke-linecap="round"/>',
 truck:'<rect x="14" y="36" width="76" height="50" rx="6" fill="'+W+'"/><path d="M90 52h28l20 20v14H90z" fill="'+W8+'"/><path d="M100 58h16l12 12h-28z" fill="'+W5+'"/><circle cx="42" cy="90" r="11" fill="'+Y+'" stroke="#fff" stroke-width="3"/><circle cx="116" cy="90" r="11" fill="'+Y+'" stroke="#fff" stroke-width="3"/><path d="M30 52h44M30 64h30" stroke="'+W5+'" stroke-width="4" stroke-linecap="round"/>',
 home:'<rect x="22" y="22" width="50" height="34" rx="7" fill="'+W+'"/><rect x="82" y="22" width="56" height="34" rx="7" fill="'+W8+'"/><rect x="22" y="66" width="34" height="34" rx="7" fill="'+W8+'"/><rect x="66" y="66" width="72" height="34" rx="7" fill="'+W+'"/><path d="M74 90l14-12 12 8 20-18" fill="none" stroke="'+Y+'" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="36" cy="38" r="6" fill="'+Y+'"/>',
 receipt:'<path d="M42 12h76v92l-10-7-10 7-10-7-10 7-10-7-10 7-10-7-6 5z" fill="'+W+'"/><path d="M56 34h48M56 48h48M56 62h30" stroke="'+W5+'" stroke-width="4" stroke-linecap="round"/><circle cx="108" cy="78" r="14" fill="'+Y+'"/><path d="M101 78l5 5 9-10" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
 trash:'<path d="M44 40h72l-6 62H50z" fill="'+W+'"/><rect x="38" y="30" width="84" height="10" rx="4" fill="'+W8+'"/><rect x="66" y="20" width="28" height="10" rx="4" fill="'+W5+'"/><path d="M64 54v36M80 54v36M96 54v36" stroke="'+W5+'" stroke-width="4" stroke-linecap="round"/><path d="M122 70a14 14 0 1 1-6-12" fill="none" stroke="'+Y+'" stroke-width="5" stroke-linecap="round"/>',
 gear:'<circle cx="80" cy="58" r="38" fill="'+W3+'"/><path d="M80 24l8 8 11-3 4 11 11 4-3 11 8 8-8 8 3 11-11 4-4 11-11-3-8 8-8-8-11 3-4-11-11-4 3-11-8-8 8-8-3-11 11-4 4-11 11 3z" fill="'+W+'"/><circle cx="80" cy="58" r="14" fill="'+Y+'"/>',
 book:'<path d="M80 30c-14-10-36-10-54-4v66c18-6 40-6 54 4z" fill="'+W+'"/><path d="M80 30c14-10 36-10 54-4v66c-18-6-40-6-54 4z" fill="'+W8+'"/><path d="M38 44c10-2 22-2 32 2M38 58c10-2 22-2 32 2M92 46c10-4 22-4 32-2M92 60c10-4 22-4 32-2" stroke="'+Y+'" stroke-width="4" stroke-linecap="round"/>'
};
var BY_ID={home:'home',cases:'people',pendingSheets:'truck',distributions:'truck',memberships:'card',volunteers:'volunteer',donationReview:'receipt',applicantReview:'people',volunteerReview:'volunteer',donations:'heart',whatsappCampaign:'chat',visitsActivity:'pin',minutes:'doc',reports:'report',auditLog:'audit',backups:'cloud',backup:'cloud',users:'shield'};
var KW=[[/إيصال|ايصال/,'receipt'],[/سلة|محذوف/,'trash'],[/إعداد|اعداد|ضبط/,'gear'],[/واتس/,'chat'],[/زيار/,'pin'],[/محضر|اجتماع|مجلس/,'doc'],[/تقرير|إحصائ|لوحة/,'report'],[/حساب|خزن|مالي|مصروف|إيراد/,'accounts'],[/مخزن|عيني|مخزون/,'warehouse'],[/حملة|مشروع|مبادر/,'flag'],[/مستخدم|صلاح|أمان|امان/,'shield'],[/نسخ|احتياط/,'cloud'],[/سجل|نشاط|تدقيق/,'audit'],[/عضوي|بطاق/,'card'],[/توزيع|كشف|تسليم/,'truck'],[/متطوع|موظف/,'volunteer'],[/تبرع|متبرع|زكاة|صدق/,'heart'],[/مساعد|معونة|دعم/,'aid'],[/حال|مستفيد|أسر|اسر|بحث/,'people'],[/دليل|مكتب|مراجع/,'book']];
var SUB={people:'إدارة ملفات المستفيدين ومتابعتهم',aid:'المساعدات والدعم العيني والنقدي',heart:'تسجيل التبرعات والمتبرعين والإيصالات',warehouse:'المخزون والتبرعات العينية',volunteer:'المتطوعون والفرق والمهام',accounts:'الحسابات والخزنة والحركة المالية',flag:'الحملات والمشروعات وتقدّمها',report:'تقارير ومؤشرات واضحة للقرار',chat:'رسائل وقوالب جاهزة للتواصل',pin:'الزيارات الميدانية والأنشطة',doc:'محاضر الاجتماعات والقرارات',shield:'المستخدمون والصلاحيات والأمان',cloud:'نسخ احتياطية تحمي بياناتك',audit:'كل ما حدث في النظام ومن قام به',card:'العضويات والاشتراكات',truck:'كشوفات التسليم والتوزيع',home:'نظرة عامة على نشاط الجمعية',receipt:'إيصالات رسمية قابلة للتحقق',trash:'استرجاع ما حُذف بالخطأ',gear:'إعدادات النظام',book:'مراجع وملفات'};
function sceneFor(id,title){var k=BY_ID[id];if(!k){for(var i=0;i<KW.length;i++){if(KW[i][0].test(title||'')){k=KW[i][1];break}}}
 if(!k&&/^c_/.test(id))k='flag';if(!k&&/^m_/.test(id))k='aid';return SC[k]?k:'home'}
function svg(k){return '<svg viewBox="0 0 160 110" width="150" height="103" aria-hidden="true" focusable="false">'+SC[k]+'</svg>'}

function heroCss(){return '.jkh-hero{display:flex;align-items:center;justify-content:space-between;gap:14px;border-radius:18px;padding:14px 22px;margin:0 0 14px;color:#fff;position:relative;overflow:hidden;min-height:104px;background:linear-gradient(120deg,var(--g2),var(--g) 70%,color-mix(in srgb,var(--g) 70%,#fff));box-shadow:0 6px 18px color-mix(in srgb,var(--g2) 28%,transparent)}'
 +'.jkh-hero:before,.jkh-hero:after{content:"";position:absolute;border-radius:50%;background:#ffffff14;pointer-events:none}.jkh-hero:before{width:190px;height:190px;left:-50px;top:-90px}.jkh-hero:after{width:120px;height:120px;left:120px;bottom:-70px}'
 +'.jkh-hero .t{position:relative;z-index:1}.jkh-hero h3{margin:0 0 4px;font-size:21px;color:#fff}.jkh-hero p{margin:0;font-size:13px;opacity:.92;color:#fff}.jkh-hero svg{flex:none;position:relative;z-index:1;filter:drop-shadow(0 4px 6px #0003)}'
 +'.jkh-noheroes .jkh-hero{display:none!important}@media(max-width:700px){.jkh-hero{min-height:80px;padding:10px 14px}.jkh-hero h3{font-size:17px}.jkh-hero svg{width:96px;height:66px}.jkh-hero p{font-size:12px}}'
 +'#jkhLookBtn{position:fixed;left:14px;bottom:14px;z-index:25;width:46px;height:46px;border-radius:50%;border:0;background:var(--g);color:#fff;font-size:20px;box-shadow:0 4px 14px #0004;cursor:pointer;display:grid;place-items:center;padding:0}'
 +'#jkhLookPanel{position:fixed;inset:0;z-index:60;background:#0007;display:none;align-items:center;justify-content:center;padding:12px}#jkhLookPanel.on{display:flex}'
 +'#jkhLookPanel .lp{background:#fff;color:#18352b;border-radius:18px;width:min(560px,100%);max-height:92vh;overflow:auto;padding:18px;direction:rtl;box-shadow:0 12px 40px #0006}'
 +'#jkhLookPanel h3{margin:0;font-size:19px}#jkhLookPanel .lr{margin:14px 0}#jkhLookPanel .lr>b{display:block;margin-bottom:7px;font-size:14px}'
 +'#jkhLookPanel .chips{display:flex;flex-wrap:wrap;gap:7px}#jkhLookPanel .chip{border:2px solid #d3dfd9;background:#fff;color:#18352b;border-radius:11px;padding:8px 12px;cursor:pointer;font-size:13px}#jkhLookPanel .chip.on{border-color:var(--g);background:color-mix(in srgb,var(--g) 14%,#fff);font-weight:700}'
 +'#jkhLookPanel .sw{display:inline-block;width:14px;height:14px;border-radius:50%;margin-left:6px;vertical-align:-2px}#jkhLookPanel input[type=range]{width:100%;padding:0;accent-color:var(--g)}'
 +'#jkhLookPanel .prev{border:1px dashed #b9c9c1;border-radius:12px;padding:12px;background:var(--bg)}#jkhLookPanel .top{display:flex;justify-content:space-between;align-items:center}'
 +'#jkhLookPanel .x{background:#eee;color:#222;border:0;border-radius:10px;padding:8px 12px;cursor:pointer}'}

/* ---------- الصور في الأقسام ---------- */
function heroFor(sec){
 var h2=sec.querySelector('h2'),title=(h2&&h2.textContent.trim())||'';
 if(!title){var a=document.querySelector('#nav .active,nav .active');title=a?a.textContent.replace(/[^؀-ۿ\sA-Za-z0-9]/g,'').trim():''}
 var k=sceneFor(sec.id,title);
 var el=sec.querySelector(':scope>.jkh-hero');
 var sig=k+'|'+title;
 if(el&&el.getAttribute('data-sig')===sig)return;
 if(!el){el=document.createElement('div');el.className='jkh-hero jkh-keep0';sec.insertBefore(el,sec.firstChild)}
 el.setAttribute('data-sig',sig);
 el.innerHTML='<div class="t"><h3></h3><p></p></div>'+svg(k);
 el.querySelector('h3').textContent=title||'جمعية الخير للجميع';el.querySelector('p').textContent=SUB[k]||'';
}
function refreshHeroes(){var a=document.querySelectorAll('section.page.active');for(var i=0;i<a.length;i++)heroFor(a[i])}

/* ---------- لوحة الإعدادات ---------- */
function chips(name,obj,cur,label){var h='';for(var k in obj){h+='<button type="button" class="chip'+(k===cur?' on':'')+'" data-k="'+name+'" data-v="'+k+'">'+label(k,obj[k])+'</button>'}return h}
function panelHtml(){
 return '<div class="lp" role="dialog" aria-label="إعدادات المظهر"><div class="top"><h3>🎨 إعدادات المظهر</h3><button class="x" type="button" data-act="close">إغلاق ✕</button></div>'
 +'<div class="lr"><b>حجم الخط: <span id="lkSz"></span>%</b><div style="display:flex;gap:8px;align-items:center"><button class="chip" type="button" data-act="dec">أ−</button><input id="lkRange" type="range" min="80" max="170" step="5"><button class="chip" type="button" data-act="inc">أ+</button></div>'
 +'<div class="chips" style="margin-top:8px"><button class="chip" type="button" data-sz="90">صغير</button><button class="chip" type="button" data-sz="100">عادي</button><button class="chip" type="button" data-sz="120">كبير</button><button class="chip" type="button" data-sz="140">كبير جدًا</button></div></div>'
 +'<div class="lr"><b>نوع الخط</b><div class="chips" id="lkFont"></div></div>'
 +'<div class="lr"><b>سُمك الخط وتباعد الأسطر</b><div class="chips" id="lkW"></div><div class="chips" id="lkLh" style="margin-top:7px"></div></div>'
 +'<div class="lr"><b>الوضع</b><div class="chips" id="lkMode"></div></div>'
 +'<div class="lr"><b>ألوان الثيم</b><div class="chips" id="lkTheme"></div></div>'
 +'<div class="lr"><b>عناصر أخرى</b><div class="chips" id="lkOpt"></div></div>'
 +'<div class="lr prev" id="lkPrev"><b>معاينة</b><div>جمعية الخير للجميع — الحالة رقم 1024: أسرة مكوّنة من 5 أفراد، المبلغ 1,250 جنيهًا.</div><small>هذا نص أصغر للتأكد من وضوح التفاصيل.</small></div>'
 +'<div style="display:flex;gap:8px"><button class="chip" type="button" data-act="reset" style="flex:1">↺ استرجاع الافتراضي</button><button class="chip on" type="button" data-act="close" style="flex:1">تم</button></div>'
 +'<p style="font-size:12px;opacity:.75;margin:10px 0 0">تُحفظ هذه الإعدادات في هذا الجهاز فقط.</p></div>';
}
function syncPanel(){var p=document.getElementById('jkhLookPanel');if(!p)return;
 p.querySelector('#lkSz').textContent=S.size;p.querySelector('#lkRange').value=S.size;
 p.querySelector('#lkFont').innerHTML=chips('font',FONTS,S.font,function(k,v){return '<span style="font-family:'+v[1]+'">'+v[0]+'</span>'});
 p.querySelector('#lkW').innerHTML=chips('weight',{normal:'عادي',bold:'عريض'},S.weight,function(k,v){return v});
 p.querySelector('#lkLh').innerHTML=chips('lh',{normal:'أسطر عادية',wide:'أسطر متباعدة',extra:'أسطر متباعدة جدًا'},S.lh,function(k,v){return v});
 p.querySelector('#lkMode').innerHTML=chips('mode',MODES,S.mode,function(k,v){return v});
 p.querySelector('#lkTheme').innerHTML=chips('theme',THEMES,S.theme,function(k,v){return '<i class="sw" style="background:'+v[1]+'"></i>'+v[0]});
 p.querySelector('#lkOpt').innerHTML='<button type="button" class="chip'+(S.heroes?' on':'')+'" data-tg="heroes">'+(S.heroes?'✓ ':'')+'صور الأقسام</button><button type="button" class="chip'+(S.dense?' on':'')+'" data-tg="dense">'+(S.dense?'✓ ':'')+'عرض مضغوط</button>';
}
function buildPanel(){
 if(document.getElementById('jkhLookPanel'))return;
 var st=styleEl('jkhLookCss2');st.textContent=heroCss();
 var p=document.createElement('div');p.id='jkhLookPanel';p.innerHTML=panelHtml();document.body.appendChild(p);
 p.addEventListener('click',function(e){
  if(e.target===p){p.classList.remove('on');return}
  var t=e.target.closest('[data-k],[data-tg],[data-act],[data-sz]');if(!t)return;
  if(t.dataset.k){var o={};o[t.dataset.k]=t.dataset.v;JKHLook.set(o)}
  else if(t.dataset.tg){var q={};q[t.dataset.tg]=!S[t.dataset.tg];JKHLook.set(q)}
  else if(t.dataset.sz){JKHLook.set({size:+t.dataset.sz})}
  else if(t.dataset.act==='close')p.classList.remove('on');
  else if(t.dataset.act==='reset')JKHLook.reset();
  else if(t.dataset.act==='inc')JKHLook.set({size:Math.min(170,S.size+5)});
  else if(t.dataset.act==='dec')JKHLook.set({size:Math.max(80,S.size-5)});
 });
 p.addEventListener('input',function(e){if(e.target.id==='lkRange'){S.size=+e.target.value;save();apply();p.querySelector('#lkSz').textContent=S.size}});
 var b=document.createElement('button');b.id='jkhLookBtn';b.type='button';b.title='إعدادات المظهر (الخط والثيم)';b.setAttribute('aria-label','إعدادات المظهر');b.textContent='🎨';
 b.addEventListener('click',function(){syncPanel();p.classList.add('on')});document.body.appendChild(b);
 syncPanel();
}
window.JKHLook.open=function(){buildPanel();syncPanel();document.getElementById('jkhLookPanel').classList.add('on')};

function init(){
 if(document.getElementById('app')){ /* التطبيق الرئيسي فقط: زر + صور */
  buildPanel();
  new MutationObserver(function(ms){for(var i=0;i<ms.length;i++){var t=ms[i].target;if(t.nodeType===1&&t.matches&&t.matches('section.page.active'))heroFor(t)}})
   .observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
  setTimeout(refreshHeroes,400);setTimeout(refreshHeroes,1500);
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
