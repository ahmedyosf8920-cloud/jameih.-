const {chromium}=require('playwright');const NEW=process.argv[2]||'/home/claude/jkh55',OLD=process.argv[3]||'/tmp/oldsite';
const res=[];const ok=(n,c,i)=>{res.push(!!c);console.log(c?'PASS':'FAIL',n,c?'':(i||''))};
async function items(b,dir,sess){const pg=await b.newPage({viewport:{width:1300,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('dialog',d=>d.accept());
 await pg.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
 await pg.goto('file://'+dir+'/index.html');await pg.waitForTimeout(700);
 const out=await pg.evaluate((sess)=>{session=sess;document.getElementById('login').style.display='none';document.getElementById('app').classList.add('show');renderAll();
  const m={};document.querySelectorAll('#nav .nav-group').forEach(g=>{m[g.dataset.s]=[...g.querySelectorAll('.nav-sub button')].map(b=>b.dataset.id)});
  const home=[...document.querySelectorAll('#homeSecs .hcard')].length;return m},sess);
 // can each listed item be opened without the permission alert?
 let blocked=0;await pg.evaluate(()=>{window.__al=[];window.alert=m=>window.__al.push(m)});
 const all=[].concat(...Object.values(out));
 for(const id of all.filter(i=>!i.startsWith('@'))){await pg.evaluate(id=>goPage(id),id)}
 blocked=await pg.evaluate(()=>window.__al.length);
 await pg.close();return {map:out,blocked,errs}}
(async()=>{const b=await chromium.launch();
 const roles={admin:{role:'مدير النظام',name:'a',permissions:null},acct:{role:'محاسب',name:'a',permissions:null},res:{role:'باحث اجتماعي',name:'a',permissions:null},stock:{role:'مسؤول مخازن',name:'a',permissions:null},vol:{role:'متطوع',name:'a',permissions:null},
  custom_fin52:{role:'محاسب',name:'a',permissions:['fin52']},custom_settle:{role:'محاسب',name:'a',permissions:['settle']},custom_reports:{role:'باحث اجتماعي',name:'a',permissions:['reports']}};
 for(const [k,s] of Object.entries(roles)){
  const o=await items(b,OLD,s),n=await items(b,NEW,s);
  const oldIds=new Set([].concat(...Object.values(o.map))),newIds=new Set([].concat(...Object.values(n.map)));
  const lost=[...oldIds].filter(x=>!newIds.has(x));
  ok(k+': nobody loses a page ('+oldIds.size+' old → '+newIds.size+' new)',lost.length===0,'lost: '+lost.join(','));
  ok(k+': every listed page opens without permission alert',n.blocked===0,'blocked '+n.blocked);
  ok(k+': no JS errors',n.errs.length===0,n.errs.join('|'));
  if(k==='admin'){const M=n.map;
   const has=(sec,id)=>(M[sec]||[]).includes(id);
   ok('الأسرة الموحّد in المستفيدون',has('cases','f53Fam'));ok('المخازن الجديدة in المخازن',has('stock','f52Stock'));
   ok('البنكية/القوائم/الموردون in الحسابات',['f52Bank','f53Rep','f53Buy','f51Docs','f51Acc'].every(i=>has('accounts',i)));
   ok('ملف المشروع in الحملات',has('projects','f53Proj'));ok('الربط in الإعدادات',has('settings','f53Link'));
   ok('المحاضر ولوحة المعلومات in الإدارة، والأوراق والأرشيف in الأوراق والكشوف',['f52Min','minutes','f52Dash'].every(i=>has('fin52',i))&&['f52Arch','archive'].every(i=>has('papers',i)));
   ok('settle section gone, reports no duplicate',!M.settle&&!has('reports','minutes')&&!has('reports','c:finalAccount'));
   const flat=[].concat(...Object.values(M));ok('no page id listed twice',new Set(flat).size===flat.length,flat.filter((x,i)=>flat.indexOf(x)!==i).join(','))}
 }
 console.log(res.filter(Boolean).length+'/'+res.length);await b.close();process.exit(res.every(Boolean)?0:1)})()
