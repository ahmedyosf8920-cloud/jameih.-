const {chromium}=require('playwright');const dir=process.argv[2];
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1300,height:900}});
 const errs=[];pg.on('pageerror',e=>errs.push('PAGE: '+e.message.slice(0,200)));
 pg.on('dialog',d=>d.accept());
 await pg.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file:'))r.continue();else r.abort()});
 await pg.goto('file://'+dir+'/index.html',{waitUntil:'load'}).catch(()=>{});await pg.waitForTimeout(1200);
 const ids=await pg.evaluate(()=>SEC.flatMap(s=>s.b.map(x=>x[0])).filter(x=>!x.startsWith('@')));
 console.log('pages',ids.length);
 const bad=[];
 for(const id of ids){const e0=errs.length;
  const r=await pg.evaluate(async id=>{try{session={role:'مدير النظام',name:'أدمن',permissions:null};window.__inboxCred={u:'admin',p:'x'};window.goPage(id);await new Promise(r=>setTimeout(r,150));
    const act=document.querySelector('.page.active');return {act:act?act.id:null,len:act?act.innerText.length:0}}catch(e){return {err:e.message}}},id);
  if(r.err||!r.act||errs.length>e0)bad.push([id,JSON.stringify(r),errs.slice(e0).join(' | ')]);}
 console.log('BAD',bad.length);bad.forEach(x=>console.log(' ',x.join(' ')));
 // permission semantics via go() alert
 let al=[];pg.removeAllListeners('dialog');pg.on('dialog',d=>{al.push(d.message());d.accept()});
 const test={};
 for(const [k,role,perm] of [['unknown','',null],['weird','زائر',null],['acc','محاسب',null],['admin','مدير النظام',null],['custom','مخصص',['cases','settle']],['customEmpty','مخصص',[]]]){
  const r=[];for(const h of ['hub:cases','hub:settle','hub:settings','hub:accounts']){al=[];await pg.evaluate(([role,perm,h])=>{session={role,permissions:perm};window.goPage(h)},[role,perm,h]);await pg.waitForTimeout(80);r.push(h.slice(4)+':'+(al.length?'DENY':'ok'))}
  test[k]=r.join(' ')}
 console.log(JSON.stringify(test,null,1));
 console.log('ERRS',errs.length);errs.slice(0,10).forEach(e=>console.log(' ',e));await b.close()})();
