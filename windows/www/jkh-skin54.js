/* جمعية الخير للجميع — الأنماط البصرية والأيقونات ثلاثية الأبعاد (الإصدار 54)
   6 أنماط تصميم احترافية + 3 أساليب لأيقونات 3D (لامعة / طينية ناعمة / مجسّمة صلبة) + ميل تفاعلي عند التمرير.
   تعمل فوق إعدادات المظهر القديمة (jkh-look.js) دون تعديل أي منها: تضيف قسمًا إلى لوحة 🎨 وتحفظ اختيارها في هذا الجهاز فقط.
   لا تلمس البيانات ولا الصلاحيات ولا الخادم. أي خطأ فيها يترك المظهر السابق كما هو. */
(function(){'use strict';
 var KEY='jkh_skin_v54';
 var DEF={skin:'default',ic:'glossy',tilt:true};
 /* المتغيرات: bg خلفية الصفحة | card البطاقات | line الحدود | tx النص | mu النص الخافت | head الشريط العلوي | ht نص الشريط | nav القائمة الجانبية |
    act العنصر النشط | acT نصه | btn الأزرار الرئيسية | th رأس الجدول | tht نصه | inp الحقول | sh ظل | hero الصورة العلوية | dark نمط داكن */
 var SK={
  royal:{n:'زمرد ملكي',sw:['#0a4a3a','#d9b24c'],v:{bg:'#f4f1e6',card:'#fffdf7',line:'#e6dbb2',tx:'#12302a',mu:'#6a6f5c',head:'linear-gradient(110deg,#06382c,#0d6650 70%,#128a6a)',ht:'#fff',nav:'linear-gradient(180deg,#06382c,#04271f 80%,#031c17)',act:'linear-gradient(100deg,#f0d27a,#c9a227)',acT:'#2a2005',btn:'linear-gradient(135deg,#0d6650,#0a4a3a)',th:'#f0e8c8',tht:'#3d3410',inp:'#fffef9',sh:'0 6px 22px #4a3d0f1c',hero:'linear-gradient(120deg,#06382c,#0f7a5d)',acc:'#c9a227'}},
  ocean:{n:'محيط زجاجي',sw:['#0b3b66','#2aa1f0'],v:{bg:'linear-gradient(160deg,#0a3258 0%,#1565a8 45%,#4aa9e6 100%) fixed',card:'rgba(255,255,255,.80)',line:'rgba(255,255,255,.65)',tx:'#0b2540',mu:'#44627f',head:'linear-gradient(110deg,rgba(7,36,70,.88),rgba(21,101,168,.78))',ht:'#fff',nav:'linear-gradient(180deg,rgba(6,30,60,.94),rgba(9,48,92,.94))',act:'linear-gradient(100deg,#52c0ff,#1e88e5)',acT:'#041c33',btn:'linear-gradient(135deg,#2aa1f0,#1565a8)',th:'rgba(21,101,168,.14)',tht:'#0b2540',inp:'rgba(255,255,255,.92)',sh:'0 10px 30px #02183a40',hero:'linear-gradient(120deg,#0a3258,#2a8fd8)',acc:'#2aa1f0',glass:1}},
  sunset:{n:'غروب دافئ',sw:['#ff7a45','#e0306b'],v:{bg:'#fff4ec',card:'#ffffff',line:'#ffd8c4',tx:'#3a1a22',mu:'#8a5a5e',head:'linear-gradient(110deg,#ff8a3d,#e0306b)',ht:'#fff',nav:'linear-gradient(180deg,#3b1131,#220a24 85%)',act:'linear-gradient(100deg,#ffb35c,#ff6a3d)',acT:'#3a1100',btn:'linear-gradient(135deg,#ff8a3d,#e0306b)',th:'#ffe7da',tht:'#5a1f12',inp:'#fffaf6',sh:'0 8px 24px #e0306b1f',hero:'linear-gradient(120deg,#ff8a3d,#d92d6a)',acc:'#ff6a3d'}},
  neon:{n:'ليل نيون',sw:['#0b0e1a','#22d3ee'],dark:1,v:{bg:'#0a0d19',card:'#131a2f',line:'#27325a',tx:'#e8edff',mu:'#9aa8d6',head:'linear-gradient(110deg,#0c1128,#141c3d)',ht:'#e8edff',nav:'linear-gradient(180deg,#070a15,#0b1024)',act:'linear-gradient(100deg,#22d3ee,#7c3aed)',acT:'#fff',btn:'linear-gradient(135deg,#22d3ee,#7c3aed)',th:'#1b2547',tht:'#bfe9ff',inp:'#0d1326',sh:'0 0 0 1px #27325a,0 10px 30px #000a',hero:'linear-gradient(120deg,#16204a,#4c2a9a)',acc:'#22d3ee'}},
  ivory:{n:'عاج ناعم',sw:['#e9edf2','#4f7cff'],v:{bg:'#e8ecf2',card:'#e8ecf2',line:'transparent',tx:'#28384a',mu:'#6b7b8d',head:'#e8ecf2',ht:'#28384a',nav:'linear-gradient(180deg,#2b3a4d,#1f2b3a)',act:'linear-gradient(100deg,#7a9bff,#4f7cff)',acT:'#fff',btn:'linear-gradient(135deg,#6f93ff,#4f7cff)',th:'#dfe5ee',tht:'#28384a',inp:'#e8ecf2',sh:'9px 9px 18px #c3cad6,-9px -9px 18px #ffffff',hero:'linear-gradient(120deg,#3a4d68,#4f7cff)',acc:'#4f7cff',neu:1}},
  graphite:{n:'جرافيت وعنبر',sw:['#1f2933','#f59e0b'],v:{bg:'#f1f2f4',card:'#ffffff',line:'#dfe2e7',tx:'#1b2430',mu:'#667085',head:'linear-gradient(110deg,#1b2430,#2c3948)',ht:'#fff',nav:'linear-gradient(180deg,#141b25,#0e131b)',act:'linear-gradient(100deg,#fbbf24,#f59e0b)',acT:'#2b1c00',btn:'linear-gradient(135deg,#2c3948,#1b2430)',th:'#eceff3',tht:'#1b2430',inp:'#fbfbfc',sh:'0 6px 20px #1b24301a',hero:'linear-gradient(120deg,#1b2430,#3b4a5c)',acc:'#f59e0b'}}
 };
 var ICS={off:'بدون',glossy:'لامعة (زجاج)',clay:'طينية ناعمة',block:'مجسّمة صلبة'};
 var S=load();
 function load(){var o={};try{o=JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(e){}var r={};for(var k in DEF)r[k]=o[k]===undefined?DEF[k]:o[k];if(r.skin!=='default'&&!SK[r.skin])r.skin='default';if(!ICS[r.ic])r.ic='glossy';r.tilt=!!r.tilt;return r}
 function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
 function el(id){var e=document.getElementById(id);if(!e){e=document.createElement('style');e.id=id;(document.head||document.documentElement).appendChild(e)}return e}

 /* ---------- CSS ---------- */
 function skinCss(){
  var s=SK[S.skin];if(!s)return '';var v=s.v,c='';
  c+='html[data-skin]{--sk-acc:'+v.acc+'}';
  c+='html[data-skin] body{background:'+v.bg+'!important;color:'+v.tx+'}';
  c+='html[data-skin] #app header{background:'+v.head+'!important;color:'+v.ht+'!important;border-bottom:1px solid '+(v.line==='transparent'?'#0001':v.line)+'!important;box-shadow:'+(s.neu?'0 6px 14px #c3cad6aa':'0 6px 24px #0003')+'!important}';
  c+='html[data-skin] #app header h1,html[data-skin] #app header small,html[data-skin] #app header .brand *{color:'+v.ht+'!important}';
  c+='html[data-skin] #nav{background:'+v.nav+'!important;box-shadow:-6px 0 26px #0004!important}';
  c+='html[data-skin] #nav button{color:#e9f1ee!important}html[data-skin] #nav button.active,html[data-skin] #nav .nav-sub button.active{background:'+v.act+'!important;color:'+v.acT+'!important;box-shadow:0 4px 12px #0004}';
  c+='html[data-skin] .card,html[data-skin] .stat,html[data-skin] .box,html[data-skin] .hcard,html[data-skin] .lp,html[data-skin] .loginbox{background:'+v.card+'!important;border-color:'+v.line+'!important;color:'+v.tx+'!important;box-shadow:'+v.sh+'!important}';
  c+='html[data-skin] .stat:after{opacity:.18!important;background:var(--sk-acc)!important}';
  c+='html[data-skin] .card h2,html[data-skin] .card h3,html[data-skin] .hcard b,html[data-skin] .stat b,html[data-skin] main h2,html[data-skin] main h3{color:'+v.tx+'!important}';
  c+='html[data-skin] .hcard small,html[data-skin] .stat span,html[data-skin] .muted,html[data-skin] main small{color:'+v.mu+'!important}';
  c+='html[data-skin] .hcard{border-width:1px!important}html[data-skin] .hcard:hover,html[data-skin] .hcard:focus{border-color:var(--sk-acc)!important}';
  c+='html[data-skin] th{background:'+v.th+'!important;color:'+v.tht+'!important}html[data-skin] td{color:'+v.tx+';border-color:'+(s.dark?'#27325a':'#0001')+'!important}';
  c+='html[data-skin] tbody tr:hover td{background:'+(s.dark?'#1a2447':'color-mix(in srgb,var(--sk-acc) 8%,transparent)')+'!important}';
  c+='html[data-skin] input,html[data-skin] select,html[data-skin] textarea{background:'+v.inp+'!important;color:'+v.tx+'!important;border:1px solid '+(s.dark?'#33407a':s.neu?'transparent':'color-mix(in srgb,var(--sk-acc) 35%,#cfd8d4)')+'!important;'+(s.neu?'box-shadow:inset 4px 4px 8px #c3cad6,inset -4px -4px 8px #fff!important;':'')+'}';
  c+='html[data-skin] input::placeholder{color:'+v.mu+'!important}';
  c+='html[data-skin] button.primary,html[data-skin] .primary{background:'+v.btn+'!important;color:#fff!important;border:0!important;box-shadow:0 5px 14px '+(s.dark?'#22d3ee40':'#0003')+'}';
  c+='html[data-skin] .secondary{background:'+(s.dark?'#1b2547':'color-mix(in srgb,var(--sk-acc) 14%,#fff)')+'!important;color:'+(s.dark?'#bfe9ff':v.tx)+'!important}';
  c+='html[data-skin] .jkh-hero{background:'+v.hero+'!important;box-shadow:'+(s.dark?'0 0 0 1px #27325a,0 12px 30px #000a':'0 10px 26px #0003')+'}';
  if(s.glass)c+='html[data-skin] .card,html[data-skin] .stat,html[data-skin] .hcard,html[data-skin] #app header{backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4)}html[data-skin] main>section>.card{border:1px solid rgba(255,255,255,.6)!important}html[data-skin] main h2,html[data-skin] main>section>h2{color:#fff!important}html[data-skin] .card h2{color:#0b2540!important}html[data-skin] #crumbs,html[data-skin] #crumbs *,html[data-skin] footer{color:#eaf4ff!important}';
  if(s.dark){
   c+='html[data-skin]{filter:none!important}html[data-skin] img,html[data-skin] video,html[data-skin] canvas,html[data-skin] iframe,html[data-skin] .jkh-hero,html[data-skin] #nav{filter:none!important}';
   c+='html[data-skin] main :is(p,span,label,li,td,div,h4,strong,b,a):not(button):not([class*=bd]):not(.hi):not(.i3){color:'+v.tx+'}';
   c+='html[data-skin] .secondary,html[data-skin] .chip{color:#bfe9ff!important}html[data-skin] .hcard:hover{box-shadow:0 0 0 1px #22d3ee,0 0 22px #22d3ee55!important}';
   c+='html[data-skin] .modal{background:#000b!important}html[data-skin] #crumbs,html[data-skin] #crumbs *,html[data-skin] footer{color:#9aa8d6!important}';
  }
  if(s.neu)c+='html[data-skin] .hcard:hover{transform:translateY(-2px)}html[data-skin] button.primary:active{box-shadow:inset 3px 3px 7px #0004!important}html[data-skin] #app header{box-shadow:0 8px 16px #c3cad6!important}html[data-skin] #app header h1,html[data-skin] #app header small{color:#28384a!important}html[data-skin] #app header .brand *{color:#28384a!important}';
  c+='html[data-skin] .jkh-hero h3,html[data-skin] .jkh-hero p,html[data-skin] main .jkh-hero *{color:#fff!important}';
  c+='@media print{html[data-skin] body{background:#fff!important}html[data-skin] .card,html[data-skin] .box{box-shadow:none!important;background:#fff!important;color:#000!important}}';
  return c;
 }
 /* أيقونات 3D: تتبع --ac (لون القسم) وتعمل على بطاقات الأقسام والقائمة الجانبية */
 function iconCss(){
  if(S.ic==='off')return '';
  var base='html[data-ic3d] .hcard .hi,html[data-ic3d] #nav .i3{position:relative;isolation:isolate;transform-style:preserve-3d}';
  var A='var(--ac,var(--sk-acc,#2fa04f))';
  var hi=function(sel,sz){return sel};
  var c=base;
  c+='html[data-ic3d] .hcard{perspective:700px}html[data-ic3d] .hcard .hi{transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s;transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));will-change:transform}';
  c+='html[data-ic3d] .hcard .hi>*,html[data-ic3d] .hcard .hi{font-size:31px}html[data-ic3d] .hcard .hi{filter:none}';
  if(S.ic==='glossy'){
   c+='html[data-ic3d=glossy] .hcard .hi,html[data-ic3d=glossy] #nav .i3{background:linear-gradient(150deg,color-mix(in srgb,'+A+' 55%,#fff) 0%,'+A+' 48%,color-mix(in srgb,'+A+' 62%,#000) 100%)!important;border-radius:18px;box-shadow:inset 0 2px 1px #ffffffb0,inset 0 -5px 9px #0000004d,0 5px 0 color-mix(in srgb,'+A+' 50%,#000),0 12px 20px color-mix(in srgb,'+A+' 55%,transparent)}';
   c+='html[data-ic3d=glossy] .hcard .hi:before,html[data-ic3d=glossy] #nav .i3:before{content:"";position:absolute;inset:3px 5px 52% 5px;border-radius:14px 14px 40px 40px;background:linear-gradient(180deg,#ffffffa6,#ffffff10);z-index:-1;pointer-events:none}';
  }else if(S.ic==='clay'){
   c+='html[data-ic3d=clay] .hcard .hi,html[data-ic3d=clay] #nav .i3{background:radial-gradient(circle at 30% 22%,#fff 0%,color-mix(in srgb,'+A+' 30%,#fff) 38%,color-mix(in srgb,'+A+' 78%,#fff) 100%)!important;border-radius:50%;box-shadow:inset -7px -9px 14px color-mix(in srgb,'+A+' 65%,transparent),inset 6px 7px 12px #ffffffcc,0 12px 18px color-mix(in srgb,'+A+' 45%,transparent),0 2px 3px #0002}';
  }else if(S.ic==='block'){
   var ex='';for(var i=1;i<=7;i++)ex+=(i>1?',':'')+(-i)+'px '+i+'px 0 color-mix(in srgb,'+A+' '+(78-i*3)+'%,#000)';
   c+='html[data-ic3d=block] .hcard .hi,html[data-ic3d=block] #nav .i3{background:linear-gradient(135deg,color-mix(in srgb,'+A+' 70%,#fff),'+A+')!important;border-radius:13px;margin:0 6px 6px 0;box-shadow:inset 1px 1px 0 #ffffffa0,inset -1px -1px 0 #0003,'+ex+',-9px 16px 20px #0004}';
  }
  /* الإيموجي نفسه: ظل وعمق */
  c+='html[data-ic3d] .hcard .hi{text-shadow:0 3px 3px #0005,0 1px 0 #fff6}html[data-ic3d] #nav .i3{display:inline-grid;place-items:center;width:28px;height:28px;font-size:15px;margin-inline-end:8px;vertical-align:middle;text-shadow:0 2px 2px #0006;border-radius:9px}';
  c+='html[data-ic3d=clay] #nav .i3{border-radius:50%}html[data-ic3d=block] #nav .i3{width:25px;height:25px;margin:0 4px 4px 8px;box-shadow:inset 1px 1px 0 #ffffffa0,-1px 1px 0 color-mix(in srgb,'+A+' 60%,#000),-2px 2px 0 color-mix(in srgb,'+A+' 55%,#000),-3px 3px 0 color-mix(in srgb,'+A+' 50%,#000),-5px 7px 8px #0005}';
  c+='html[data-ic3d] #nav .nav-head>span{display:flex;align-items:center}';
  /* صور الأقسام العلوية (hero) */
  c+='html[data-ic3d] .jkh-hero svg{transform:perspective(520px) rotateY(-16deg) rotateX(7deg);filter:drop-shadow(-8px 10px 8px #0005) drop-shadow(0 2px 0 #fff4)!important;transition:transform .3s}html[data-ic3d] .jkh-hero:hover svg{transform:perspective(520px) rotateY(-4deg) rotateX(2deg) scale(1.04)}';
  c+='@media(max-width:760px){html[data-ic3d] .hcard .hi,html[data-ic3d] .hcard .hi>*{font-size:26px}}@media(prefers-reduced-motion:reduce){html[data-ic3d] .hcard .hi,html[data-ic3d] .jkh-hero svg{transition:none;transform:none!important}}';
  return c;
 }
 function apply(){
  try{
   var h=document.documentElement;
   if(S.skin==='default')h.removeAttribute('data-skin');else h.setAttribute('data-skin',S.skin);
   if(S.ic==='off')h.removeAttribute('data-ic3d');else h.setAttribute('data-ic3d',S.ic);
   el('jkhSkinCss').textContent=skinCss()+iconCss();
   var m=document.querySelector('meta[name=theme-color]');if(m&&SK[S.skin])m.setAttribute('content',SK[S.skin].sw[0]);
   wrapNav();
  }catch(e){}
 }
 /* لفّ إيموجي القائمة الجانبية ليصير «أيقونة 3D» (النص نفسه لا يتغير) */
 var EMO=/^(\s*)((?:\p{Extended_Pictographic}|️|‍)+)(\s*)/u;
 function wrapNav(){
  if(S.ic==='off')return;var heads=document.querySelectorAll('#nav .nav-head>span');
  for(var i=0;i<heads.length;i++){var sp=heads[i];if(sp.querySelector('.i3'))continue;var t=sp.firstChild;if(!t||t.nodeType!==3)continue;var m=EMO.exec(t.nodeValue);if(!m)continue;
   var ic=document.createElement('i');ic.className='i3';ic.textContent=m[2];t.nodeValue=t.nodeValue.slice(m[0].length);sp.insertBefore(ic,t);
   try{var g=sp.closest('.nav-group'),sid=g&&g.getAttribute('data-s');if(sid&&typeof SEC!=='undefined'){var s=SEC.find(function(x){return x.id===sid});if(s&&s.c)ic.style.setProperty('--ac',s.c)}}catch(e){}}
 }
 /* ميل تفاعلي للأيقونات عند تمرير الماوس/اللمس */
 function tiltInit(){
  document.addEventListener('pointermove',function(e){
   if(!S.tilt||S.ic==='off'||(e.pointerType&&e.pointerType==='touch'))return;
   var c=e.target.closest&&e.target.closest('.hcard');if(!c)return;var i=c.querySelector('.hi');if(!i)return;
   var r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
   i.style.setProperty('--ry',(x*-26).toFixed(1)+'deg');i.style.setProperty('--rx',(y*22).toFixed(1)+'deg')},{passive:true});
  document.addEventListener('pointerout',function(e){var c=e.target.closest&&e.target.closest('.hcard');if(!c||c.contains(e.relatedTarget))return;var i=c.querySelector('.hi');if(i){i.style.setProperty('--rx','0deg');i.style.setProperty('--ry','0deg')}},{passive:true});
 }
 /* ---------- قسم داخل لوحة 🎨 ---------- */
 function rowHtml(){
  var sk='<button type="button" class="chip'+(S.skin==='default'?' on':'')+'" data-sk="default"><i class="sw" style="background:linear-gradient(135deg,#18864b,#0b6838)"></i>الافتراضي</button>';
  for(var k in SK)sk+='<button type="button" class="chip'+(S.skin===k?' on':'')+'" data-sk="'+k+'"><i class="sw" style="background:linear-gradient(135deg,'+SK[k].sw[0]+','+SK[k].sw[1]+')"></i>'+SK[k].n+'</button>';
  var ic='';for(var j in ICS)ic+='<button type="button" class="chip'+(S.ic===j?' on':'')+'" data-ic="'+j+'">'+ICS[j]+'</button>';
  return '<b>✨ نمط التصميم (يُغيّر شكل التطبيق كله)</b><div class="chips" id="skSkins">'+sk+'</div><b style="margin-top:12px">🧊 الأيقونات ثلاثية الأبعاد</b><div class="chips" id="skIc">'+ic+'<button type="button" class="chip'+(S.tilt?' on':'')+'" data-tilt="1">'+(S.tilt?'✓ ':'')+'ميل تفاعلي</button></div><small style="opacity:.75">يُحفظ في هذا الجهاز فقط. «الافتراضي» يرجّعك للشكل الأصلي.</small>';
 }
 function injectRow(){
  var p=document.getElementById('jkhLookPanel');if(!p)return;var lp=p.querySelector('.lp');if(!lp)return;
  var row=document.getElementById('skRow');
  if(!row){row=document.createElement('div');row.id='skRow';row.className='lr';var ref=lp.querySelector('#lkMode');ref=ref&&ref.parentNode;if(ref)lp.insertBefore(row,ref);else lp.appendChild(row);
   row.addEventListener('click',function(e){var t=e.target.closest('[data-sk],[data-ic],[data-tilt]');if(!t)return;
    if(t.dataset.sk)S.skin=t.dataset.sk;else if(t.dataset.ic)S.ic=t.dataset.ic;else if(t.dataset.tilt)S.tilt=!S.tilt;save();apply();row.innerHTML=rowHtml()})}
  row.innerHTML=rowHtml();
 }
 function watchPanel(){
  injectRow();
  var mo=new MutationObserver(function(){var p=document.getElementById('jkhLookPanel');if(p&&!document.getElementById('skRow'))injectRow()});
  mo.observe(document.body,{childList:true,subtree:false});
  var b=document.getElementById('jkhLookBtn');if(b)b.addEventListener('click',function(){setTimeout(injectRow,0)});
 }
 var nv=null;
 function init(){
  apply();tiltInit();
  var n=document.getElementById('nav');if(n){nv=new MutationObserver(function(){wrapNav()});nv.observe(n,{childList:true,subtree:true})}
  if(document.getElementById('app'))watchPanel();
  window.addEventListener('storage',function(e){if(e.key===KEY){S=load();apply()}});
 }
 apply();
 window.JKHSkin={get:function(){return JSON.parse(JSON.stringify(S))},set:function(o){for(var k in o)S[k]=o[k];S=(function(){var r=S;if(r.skin!=='default'&&!SK[r.skin])r.skin='default';if(!ICS[r.ic])r.ic='glossy';return r})();save();apply();var r=document.getElementById('skRow');if(r)r.innerHTML=rowHtml()},skins:Object.keys(SK)};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
