/* v60 — طباعة البونات: 10 بونات في كل صفحة A4 (رقم البون + اسم الحالة + ختم الجمعية) */
(function(){
'use strict';
var E=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
function sheets(){return (window.EXTRA&&window.EXTRA.sheets)||[]}
function caseOf(r){try{return r.caseId?cases.find(function(c){return c.id===r.caseId}):null}catch(e){return null}}
function pad(n,w){n=String(n);while(n.length<w)n='0'+n;return n}
function phoneOf(c,r){
  var p=(c&&(c.phone||c.husbandPhone||c.wifePhone||c.wa))||r.phone||'';
  if(!p&&r.phones)p=Array.isArray(r.phones)?r.phones.filter(Boolean).join(' - '):r.phones;
  return String(p||'').trim()}
function build(x,opt){
  opt=opt||{};
  var stub=!!opt.stub,PER=stub?8:10;
  var logo=window.JKH_LOGO||new URL('logo.jpg',location.href).href;
  var seal=(opt.seal!==false&&window.CaseDocs&&CaseDocs._stamp)?CaseDocs._stamp():'';
  var total=x.rows.length,w=Math.max(2,String(total).length);
  var list=[];
  x.rows.forEach(function(r,i){if(opt.onlyPending&&r.received)return;
    var c=caseOf(r);
    list.push({n:i+1,name:(c&&c.name)||r.caseName||r.name||'',no:(c&&c.no)||r.caseNo||'',qty:r.qty,
      husband:(c&&c.husband)||r.husband||'',wife:(c&&c.wife)||r.wife||'',phone:phoneOf(c,r)})});
  var pages=Math.max(1,Math.ceil(list.length/PER)),out=[];
  for(var p=0;p<pages;p++){
    var part=list.slice(p*PER,p*PER+PER),h='';
    part.forEach(function(v){
      var ex='';
      if(opt.husband&&v.husband)ex+='<div class="rw"><span>الزوج:</span> '+E(v.husband)+'</div>';
      if(opt.wife&&v.wife)ex+='<div class="rw"><span>الزوجة:</span> '+E(v.wife)+'</div>';
      if(opt.phone&&v.phone)ex+='<div class="rw"><span>التليفون:</span> '+E(v.phone)+'</div>';
      var sealBox='<div class="st">'+seal+'</div>';
      h+='<div class="v'+(stub?' s':'')+'"><div class="main"><div class="hd"><img src="'+E(logo)+'"><div class="org"><b>جمعية الخير للجميع</b><small>بني سويف — المشهرة برقم 2069 لسنة 2018</small></div><span class="pill">بون استلام</span></div>'
       +'<div class="mid"><div class="num"><small>رقم البون</small><b>'+pad(v.n,w)+'</b><small>من '+total+'</small></div>'
       +'<div class="info"><div class="nm">'+E(v.name)+'</div>'
       +'<div class="rw"><span>رقم الحالة:</span> '+E(v.no||'—')+'</div>'+ex
       +'<div class="rw"><span>الكشف:</span> '+E(x.name)+'</div>'
       +'<div class="rw"><span>المساعدة:</span> '+E(x.type||'—')+(v.qty?' — الكمية: '+E(v.qty):'')+'</div></div>'+(stub?'':'')+'</div>'
       +(stub?'<div class="bt2"><div class="dt">التاريخ: '+E(x.date||'')+'</div>'+sealBox+'</div>'
             :'<div class="bt"><div class="sg"><i></i><span>توقيع / بصمة المستلم</span></div><div class="dt">التاريخ: '+E(x.date||'')+'</div>'+sealBox+'</div>')
       +'</div>'
       +(stub?'<div class="cut"><span>✂</span></div><div class="stub"><div class="sh">قصاصة الجمعية</div><div class="sn">بون <b>'+pad(v.n,w)+'</b> / '+total+'</div><div class="ss">'+E(v.name)+'</div><div class="ss2">حالة '+E(v.no||'—')+' — '+E(x.date||'')+'</div><div class="sig"><i></i><span>توقيع / بصمة المستلم</span></div></div>':'')
       +'</div>'});
    for(var k=part.length;k<PER;k++)h+='<div class="v e"></div>';
    var a=part.length?pad(part[0].n,w):'—',b=part.length?pad(part[part.length-1].n,w):'—';
    out.push('<div class="pg">'+h+'<div class="ft">كشف «'+E(x.name)+'» — البونات '+a+' إلى '+b+' من '+total+' — صفحة '+(p+1)+' / '+pages+' — قص على الخطوط المنقطة</div></div>')}
  var rows=stub?4:5;
  var css='@page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Cairo,Tahoma,Arial,sans-serif;color:#111}'
   +'.pg{width:210mm;height:297mm;padding:8mm 8mm 12mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat('+rows+',1fr);gap:0;page-break-after:always;position:relative;direction:rtl}.pg:last-child{page-break-after:auto}'
   +'.v{border:1px dashed #666;display:flex;overflow:hidden}.main{flex:1;min-width:0;padding:2.5mm 3mm;display:flex;flex-direction:column;justify-content:space-between}'
   +'.hd{display:flex;align-items:center;gap:2mm}.hd img{width:9mm;height:9mm;object-fit:contain}.org{flex:1;display:flex;flex-direction:column;line-height:1.2}.org b{font-size:11px}.org small{font-size:7px;color:#555}'
   +'.pill{background:#1b7a43;color:#fff;font-size:9px;padding:1mm 2.5mm;border-radius:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact;white-space:nowrap}'
   +'.mid{display:flex;gap:3mm;align-items:center}.num{border:1.5px solid #1b7a43;border-radius:2mm;padding:1mm 2.5mm;text-align:center;min-width:17mm;line-height:1.1}.num small{display:block;font-size:7px;color:#555}.num b{font-size:20px;color:#1b7a43}'
   +'.info{flex:1;min-width:0}.nm{font-size:13px;font-weight:700;margin-bottom:1mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rw{font-size:9px;line-height:1.4}.rw span{color:#555}'
   +'.bt{display:flex;align-items:flex-end;gap:3mm}.sg{flex:1;text-align:center;font-size:8px;color:#555}.sg i{display:block;border-bottom:1px solid #333;height:9mm;margin-bottom:.5mm}.dt{font-size:8px}.st{width:16mm;height:16mm}.st svg{width:100%;height:100%}'
   +'.bt2{display:flex;align-items:flex-end;justify-content:space-between}'
   +'.v.s .main{padding:2mm 2.5mm}.v.s .num{min-width:14mm;padding:1mm 1.5mm}.v.s .num b{font-size:17px}.v.s .nm{font-size:11px}.v.s .rw{font-size:8px}.v.s .org b{font-size:10px}.v.s .pill{font-size:8px;padding:.8mm 2mm}'
   +'.cut{width:0;border-right:1.5px dashed #333;position:relative}.cut span{position:absolute;top:50%;right:-7px;background:#fff;font-size:12px;transform:translateY(-50%)}'
   +'.stub{width:32mm;padding:2mm;display:flex;flex-direction:column;justify-content:space-between;background:#f6faf7;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
   +'.sh{font-size:8px;background:#1b7a43;color:#fff;text-align:center;border-radius:6px;padding:.4mm}.sn{font-size:9px;text-align:center}.sn b{font-size:14px;color:#1b7a43}.ss{font-size:9px;font-weight:700;text-align:center;line-height:1.2;max-height:8mm;overflow:hidden}.ss2{font-size:7px;text-align:center;color:#555}'
   +'.sig i{display:block;border:1px solid #333;height:22mm;margin-bottom:.5mm}.sig span{font-size:7px;display:block;text-align:center;color:#555}'
   +'.ft{position:absolute;bottom:4mm;left:0;right:0;text-align:center;font-size:8px;color:#777}';
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>بونات '+E(x.name)+'</title><style>'+css+'</style></head><body>'+out.join('')+'</body></html>'}
function printHtml(html,title){
  if(window.JKHNative&&typeof JKHNative.printHtml==='function'){try{JKHNative.printHtml(html,title);return}catch(e){}}
  var f=document.createElement('iframe');f.style.cssText='position:fixed;left:-9999px;width:0;height:0;border:0';document.body.appendChild(f);
  f.contentDocument.open();f.contentDocument.write(html);f.contentDocument.close();
  setTimeout(function(){try{f.contentWindow.focus();f.contentWindow.print()}catch(e){var w=window.open('');w.document.write(html);w.document.close()}setTimeout(function(){f.remove()},4000)},600)}
function ask(x){
  var old=document.getElementById('v60Ov');if(old)old.remove();
  var pend=x.rows.filter(function(r){return !r.received}).length;
  var o=document.createElement('div');o.id='v60Ov';
  o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10002;display:flex;align-items:center;justify-content:center;padding:12px';
  o.innerHTML='<div style="background:#fff;color:#111;border-radius:12px;padding:16px;max-width:380px;width:100%;direction:rtl"><h3 style="margin:0 0 8px">🧾 طباعة البونات</h3>'
   +'<div style="font-size:13px;margin-bottom:8px">كشف «'+E(x.name)+'» — '+x.rows.length+' حالة، 10 بونات في كل ورقة A4 (8 مع القصاصة)</div>'
   +'<label style="display:block;margin:6px 0"><input type="checkbox" id="v60Seal" checked> طباعة ختم الجمعية على كل بون</label>'
   +'<label style="display:block;margin:6px 0"><input type="checkbox" id="v60Stub"> قصاصة أرشيف (تفضل مع الجمعية — 8 بونات في الورقة)</label>'
   +'<div style="margin:8px 0 2px;font-size:12px"><b>بيانات تظهر على البون:</b></div>'
   +'<label style="margin-left:10px"><input type="checkbox" id="v60H"> اسم الزوج</label> <label style="margin-left:10px"><input type="checkbox" id="v60W"> اسم الزوجة</label> <label><input type="checkbox" id="v60P"> رقم التليفون</label>'
   +'<label style="display:block;margin:6px 0"><input type="radio" name="v60M" value="all" checked> كل الحالات ('+x.rows.length+')</label>'
   +'<label style="display:block;margin:6px 0"><input type="radio" name="v60M" value="pend"> اللي لسه ماستلمتش فقط ('+pend+')</label>'
   +'<div style="display:flex;gap:8px;margin-top:12px"><button id="v60Go" class="primary">🖨 طباعة</button><button id="v60No" class="secondary">إلغاء</button></div></div>';
  document.body.appendChild(o);
  o.querySelector('#v60No').onclick=function(){o.remove()};
  o.addEventListener('click',function(e){if(e.target===o)o.remove()});
  o.querySelector('#v60Go').onclick=function(){
    var seal=o.querySelector('#v60Seal').checked,only=o.querySelector('input[name=v60M]:checked').value==='pend';
    var rows=only?pend:x.rows.length;if(!rows){if(window.tst)tst('مفيش حالات للطباعة');return}
    var q=function(i){return o.querySelector(i).checked};var html=build(x,{seal:seal,onlyPending:only,stub:q('#v60Stub'),husband:q('#v60H'),wife:q('#v60W'),phone:q('#v60P')});o.remove();printHtml(html,'بونات '+x.name)}}
function open(id){var x=sheets().find(function(z){return z.id===id});if(x)ask(x)}
function decorate(){
  var t=document.getElementById('sheetsTable');
  if(t)t.querySelectorAll('button[onclick^="Sheets.print("]').forEach(function(b){
    if(b.parentNode.querySelector('[data-v60]'))return;
    var id=(b.getAttribute('onclick').match(/'([^']+)'/)||[])[1];if(!id)return;
    var n=document.createElement('button');n.className='secondary';n.setAttribute('data-v60',id);n.textContent='🧾 بونات';n.onclick=function(){open(id)};
    b.parentNode.insertBefore(document.createTextNode(' '),b.nextSibling);b.parentNode.insertBefore(n,b.nextSibling.nextSibling)});
  var ov=document.getElementById('shOv');
  if(ov)ov.querySelectorAll('button[onclick^="Sheets.print("]').forEach(function(b){
    if(b.parentNode.querySelector('[data-v60]'))return;
    var id=(b.getAttribute('onclick').match(/'([^']+)'/)||[])[1];if(!id)return;
    var n=document.createElement('button');n.className='secondary';n.setAttribute('data-v60',id);n.textContent='🧾 طباعة البونات';n.onclick=function(){open(id)};
    b.parentNode.insertBefore(n,b.nextSibling)})}
function init(){
  var rs=window.renderSheets;
  if(typeof rs==='function'&&!rs.__v60){var w=function(){var r=rs.apply(this,arguments);try{decorate()}catch(e){}return r};w.__v60=1;window.renderSheets=w}
  new MutationObserver(function(){try{decorate()}catch(e){}}).observe(document.body,{childList:true,subtree:true});
  decorate()}
window.JKHVouchers60={build:build,open:open,ask:ask};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else setTimeout(init,0);
})();
