/* جمعية الخير للجميع — الإصدار 34
   مستندات الحالة: كشف حساب، بحث اجتماعي (تعبئة تلقائية)، ملف مختصر CV، ترتيب أبجدي، بطاقة ID.
   يُحمَّل بعد jkh-v30.js ويعتمد على المتغيرات العامة: cases, current, distributions, session, save, renderAll. */
(function () {
  'use strict';
  var g = function (id) { return document.getElementById(id); };
  var e = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); };
  var ORG = { name: 'جمعية الخير للجميع', city: 'بني سويف', reg: 'المشهرة برقم 2069 لسنة 2018' };
  var money = function (v) { return (+v || 0).toLocaleString('ar-EG'); };
  var digits = function (s) { return String(s == null ? '' : s).replace(/[٠-٩]/g, function (c) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(c); }).replace(/[^0-9]/g, ''); };

  function parseDate(v) { if (!v) return null; var d = new Date(v); return isNaN(d) ? null : d; }
  function fmt(v) {
    var d = v instanceof Date ? v : parseDate(v); if (!d) return '';
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d); }
    catch (x) { return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear(); }
  }
  function dayName(v) { var d = parseDate(v); if (!d) return ''; try { return d.toLocaleDateString('ar-EG', { weekday: 'long', timeZone: 'Africa/Cairo' }); } catch (x) { return ''; } }
  function nidInfo(n) {
    n = digits(n); if (n.length !== 14) return null;
    var c = n[0] === '2' ? 1900 : n[0] === '3' ? 2000 : 0; if (!c) return null;
    var d = new Date(c + (+n.slice(1, 3)), (+n.slice(3, 5)) - 1, +n.slice(5, 7)); if (isNaN(d)) return null;
    return { birth: d, age: Math.floor((Date.now() - d.getTime()) / 31557600000), female: (+n[12]) % 2 === 0 };
  }
  function ageOf(m) { if (m && m.age !== '' && m.age != null) return m.age; var i = nidInfo(m && m.nid); return i ? i.age : ''; }
  function find(id) { return (typeof cases !== 'undefined' ? cases : []).find(function (c) { return c.id === id; }); }
  function phonesOf(c) {
    var out = []; [c.phone, c.husbandPhone, c.wifePhone, c.wa].forEach(function (p) { p = String(p || '').trim(); if (p && out.indexOf(p) < 0) out.push(p); });
    return out.slice(0, 2).map(maskP);
  }


  /* ---------- الصلاحيات والخصوصية وسجل النشاط ---------- */
  var LEG = { 'باحث اجتماعي': ['cases', 'aid', 'reports', 'pii'], 'محاسب': ['donations', 'accounts', 'projects', 'reports', 'pii'], 'مسؤول مخازن': ['stock', 'aid'], 'متطوع': ['cases', 'people'] };
  function perm(id) {
    try {
      if (typeof session === 'undefined' || !session) return false;
      if (session.role === 'مدير النظام') return true;
      if (Array.isArray(session.permissions)) return session.permissions.indexOf(id) >= 0;
      var a = LEG[session.role]; return !a || a.indexOf(id) >= 0;
    } catch (x) { return false; }
  }
  function deny() { alert('ليست لديك صلاحية لهذه العملية. اطلب من مدير النظام إضافتها من «المستخدمون والصلاحيات».'); return false; }
  function needCases() { return perm('cases') || deny(); }
  function needPeople() { return perm('people') || deny(); }
  function maskN(v) { v = String(v == null ? '' : v); if (!v || perm('pii')) return v; return v.length > 4 ? '••••••••••' + v.slice(-4) : '••••'; }
  function maskP(v) { v = String(v == null ? '' : v); if (!v || perm('pii')) return v; return v.length > 3 ? '•••••••' + v.slice(-3) : '•••'; }
  function audit(action, details) { try { if (window.auditAdd) window.auditAdd(action, details || ''); } catch (x) { } }

  /* ---------- الصور: رفع إلى Storage بدل حفظها داخل بيانات النظام ---------- */
  var PH = {};   // رابط الصورة المخزنة -> رابط مؤقت صالح للعرض
  function phSrc(rec) { if (!rec) return ''; if (rec.photoUrl) return PH[rec.photoUrl] || ''; return rec.photo || ''; }
  function toBlob(dataUrl) { var a = dataUrl.split(','), m = /:(.*?);/.exec(a[0])[1], b = atob(a[1]), n = b.length, u = new Uint8Array(n); while (n--) u[n] = b.charCodeAt(n); return new Blob([u], { type: m }); }
  async function uploadPhoto(rec, folder, blob) {
    var path = 'cases/' + folder + '/' + String(rec.id).replace(/[^\w-]/g, '') + '_' + Date.now() + '.jpg';
    var r = await JKHDocs.upload(sb, 'case-documents', path, blob, { contentType: 'image/jpeg', upsert: false });
    if (r && r.error) throw r.error;
    return String(window.JKH_SUPABASE_URL || '').replace(/\/$/, '') + '/storage/v1/object/public/case-documents/' + encodeURI(path);
  }
  async function storePhoto(rec, folder, blob, dataUrl) {
    try { rec.photoUrl = await uploadPhoto(rec, folder, blob); delete rec.photo; }
    catch (err) { rec.photo = dataUrl; delete rec.photoUrl; alert('تعذر رفع الصورة للتخزين، حُفظت مؤقتًا داخل البيانات: ' + ((err && err.message) || err)); }
    save();
  }
  // يجهّز روابط الصور للعرض، ويرحّل الصور القديمة المحفوظة داخل البيانات إلى التخزين
  async function warm(list, folder) {
    await Promise.all(list.map(async function (rec) {
      try {
        if (rec.photo && !rec.photoUrl && /^data:image/.test(rec.photo)) { try { rec.photoUrl = await uploadPhoto(rec, folder, toBlob(rec.photo)); delete rec.photo; save(); } catch (x) { } }
        if (rec.photoUrl && !PH[rec.photoUrl]) PH[rec.photoUrl] = (window.JKHDocs ? await JKHDocs.resolve(rec.photoUrl) : rec.photoUrl);
      } catch (x) { }
    }));
  }

  /* ---------- 1) كشف الحساب: كل ما استلمته الحالة ---------- */
  function receipts(c) {
    var rows = [], sheetSeen = {};
    (c.aid || []).forEach(function (a) { rows.push({ date: a.date, type: a.type || 'مساعدة', amount: +a.amount || 0, qty: '', src: 'سجل المساعدات', note: a.note || '' }); });
    (typeof distributions !== 'undefined' ? distributions : []).forEach(function (x) {
      if (x.caseId === c.id || (x.caseNo && String(x.caseNo) === String(c.no)) || (!x.caseNo && !x.caseId && x.name && x.name === c.name)) {
        if (x.sheetId) sheetSeen[x.sheetId] = 1;
        rows.push({ date: x.date, type: x.type || 'توزيع', amount: 0, qty: x.qty || '', src: 'كشف التوزيع', note: x.receipt || '' });
      }
    });
    ((window.EXTRA && window.EXTRA.sheets) || []).forEach(function (sh) {
      if (sheetSeen[sh.id]) return;
      (sh.rows || []).forEach(function (r) { if (r.caseId === c.id && r.received) rows.push({ date: sh.date, type: sh.type || sh.name || 'كشف', amount: 0, qty: r.qty || '', src: 'كشف: ' + (sh.name || ''), note: '' }); });
    });
    rows.sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
    return rows;
  }
  function statementHTML(c) {
    var r = receipts(c), total = r.reduce(function (s, x) { return s + x.amount; }, 0);
    var lines = r.map(function (x) {
      var what = e(x.type) + (x.amount ? ' بمبلغ <b>' + money(x.amount) + ' ج.م</b>' : '') + (x.qty ? ' — الكمية/العدد: <b>' + e(x.qty) + '</b>' : '');
      return '<li>استلمت الحالة يوم <b>' + e(dayName(x.date)) + ' ' + e(fmt(x.date) || 'غير مسجل') + '</b>: ' + what + (x.note ? ' <small>(' + e(x.note) + ')</small>' : '') + '</li>';
    }).join('');
    var body = '<div class="kv">' + kv('اسم الحالة', c.name) + kv('رقم الحالة', c.no) + kv('الرقم القومي', maskN(c.nid)) + kv('العنوان', [c.address, c.area].filter(Boolean).join(' — ')) + '</div>' +
      (r.length ? '<h3>ما استلمته الحالة</h3><ol class="rl">' + lines + '</ol>' +
        '<table><thead><tr><th>م</th><th>التاريخ</th><th>اليوم</th><th>النوع</th><th>المبلغ (ج.م)</th><th>الكمية</th><th>المصدر</th></tr></thead><tbody>' +
        r.map(function (x, i) { return '<tr><td>' + (i + 1) + '</td><td>' + e(fmt(x.date)) + '</td><td>' + e(dayName(x.date)) + '</td><td>' + e(x.type) + '</td><td>' + (x.amount ? money(x.amount) : '—') + '</td><td>' + e(x.qty || '—') + '</td><td>' + e(x.src) + '</td></tr>'; }).join('') +
        '<tr class="tot"><td colspan="4">الإجمالي — عدد مرات الاستلام: ' + r.length + '</td><td>' + money(total) + '</td><td colspan="2"></td></tr></tbody></table>'
        : '<p class="empty">لم تستلم الحالة أي مساعدة مسجلة حتى تاريخه.</p>');
    return page('كشف حساب الحالة', body, [{ t: 'أمين الصندوق' }, { t: 'يعتمد — مدير الجمعية' }]);
  }

  /* ---------- 2) البحث الاجتماعي ---------- */
  function familyRows(c) {
    var rows = [], hi = nidInfo(c.husbandNid || c.nid);
    var head = c.husband || c.name;
    rows.push({ name: head, nid: c.husbandNid || c.nid || c.wifeNid, rel: 'رب الأسرة', age: c.birth ? Math.floor((Date.now() - new Date(c.birth)) / 31557600000) : (hi ? hi.age : ''), social: c.social || '', job: c.income || '', edu: '' });
    if (c.wife && key(c.wife) !== key(head)) rows.push({ name: c.wife, nid: c.wifeNid, rel: 'الزوجة', age: ageOf({ nid: c.wifeNid }), social: c.social === 'متزوج' ? 'متزوجة' : (c.social || ''), job: '', edu: '' });
    (c.family || []).forEach(function (m) { rows.push({ name: m.name, nid: m.nid, rel: m.relation, age: ageOf(m), social: m.social || m.status || '', job: m.job || '', edu: m.edu || '' }); });
    return rows;
  }
  function autoInfo(c) {
    var t = [], r = receipts(c), tot = r.reduce(function (s, x) { return s + x.amount; }, 0);
    t.push('الحالة ' + (c.social ? 'اجتماعيًا: ' + c.social : '') + '، وعدد أفراد الأسرة ' + (c.members || (c.family || []).length + 1) + ' فردًا' + '.');
    var addr = [c.address, c.area].filter(Boolean).join(' — '); if (addr) t.push('تقيم الأسرة في ' + addr + '.');
    if (c.income) t.push('مصدر الدخل: ' + c.income + '.');
    if ((c.needs || []).length) t.push('الاحتياجات: ' + c.needs.join('، ') + '.');
    if (c.priority) t.push('درجة الاحتياج: ' + c.priority + '.');
    if (r.length) t.push('سبق للأسرة استلام مساعدات (' + r.length + ' مرة' + (tot ? '، بإجمالي ' + money(tot) + ' ج.م' : '') + ').');
    if (c.notes) t.push(c.notes);
    return t.join(' ');
  }
  function researchHTML(c) {
    var R = c.research || {}, info = R.info != null && R.info !== '' ? R.info : autoInfo(c), ph = phonesOf(c);
    var rows = familyRows(c);
    var body = '<div class="kv">' + kv('الاسم', c.name) + kv('رقم الحالة', c.no) + kv('اسم الزوج', c.husband) + kv('اسم الزوجة', c.wife) + kv('الحالة الاجتماعية', c.social) + kv('عدد الأفراد', c.members || rows.length) + kv('الهاتف', ph.join('  —  ')) + kv('العنوان', [c.address, c.area].filter(Boolean).join(' — ')) + '</div>' +
      '<h3>بيانات أفراد الأسرة</h3><table><thead><tr><th>م</th><th>الاسم</th><th>الرقم القومي</th><th>الصلة</th><th>السن</th><th>الحالة الاجتماعية</th><th>المهنة</th><th>التعليم</th></tr></thead><tbody>' +
      rows.map(function (m, i) { return '<tr><td>' + (i + 1) + '</td><td>' + e(m.name) + '</td><td class="num">' + e(maskN(m.nid || '')) + '</td><td>' + e(m.rel || '') + '</td><td>' + e(m.age) + '</td><td>' + e(m.social) + '</td><td>' + e(m.job) + '</td><td>' + e(m.edu) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<h3>معلومات عن الحالة</h3><div class="box">' + (e(info).replace(/\n/g, '<br>')) + '</div>' +
      '<h3>رأي الباحث الاجتماعي</h3><div class="box ruled">' + (R.opinion ? e(R.opinion).replace(/\n/g, '<br>') : '') + '</div>' +
      '<div class="kv">' + kv('اسم الباحث', R.researcher || '') + kv('تاريخ البحث', fmt(R.date) || '') + '</div>';
    return page('استمارة البحث الاجتماعي', body, [{ t: 'الباحث الاجتماعي' }, { t: 'يعتمد — مدير الجمعية' }]);
  }

  /* ---------- 3) ملف مختصر (CV) ---------- */
  function cvHTML(c) {
    var r = receipts(c), tot = r.reduce(function (s, x) { return s + x.amount; }, 0), last = r.length ? r[r.length - 1] : null;
    var vs = (c.visits || []).slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var rows = familyRows(c), ph = phonesOf(c);
    var body = '<div class="cvhead"><div class="cvno">رقم الملف<b>' + e(c.no) + '</b></div><div class="cvname">' + e(c.name) + '<small>' + e(c.social || '') + (c.status ? ' — ' + e(c.status) : '') + '</small></div></div>' +
      '<div class="kv">' + kv('الرقم القومي', maskN(c.nid)) + kv('الهاتف', ph.join('  —  ')) + kv('تاريخ الميلاد', fmt(c.birth) || (nidInfo(c.nid) ? fmt(nidInfo(c.nid).birth) : '')) + kv('العنوان', [c.address, c.area].filter(Boolean).join(' — ')) + kv('اسم الزوج', c.husband) + kv('اسم الزوجة', c.wife) + kv('عدد الأفراد', c.members || rows.length) + kv('مصدر الدخل', c.income) + '</div>' +
      '<div class="tiles"><div><b>' + e(c.priority || '—') + '</b><span>درجة الاحتياج</span></div><div><b>' + r.length + '</b><span>مرات الاستلام</span></div><div><b>' + money(tot) + '</b><span>إجمالي المبالغ (ج.م)</span></div><div><b>' + (c.visits || []).length + '</b><span>الزيارات والمتابعات</span></div></div>' +
      '<h3>الاحتياجات</h3><p>' + ((c.needs || []).map(function (n) { return '<span class="chip">' + e(n) + '</span>'; }).join(' ') || '—') + '</p>' +
      '<h3>أفراد الأسرة</h3><p>' + (rows.map(function (m) { return e(m.name) + (m.rel ? ' (' + e(m.rel) + (m.age !== '' ? '، ' + e(m.age) + ' سنة' : '') + ')' : ''); }).join(' — ') || '—') + '</p>' +
      '<h3>آخر استلام</h3><p>' + (last ? 'يوم ' + e(dayName(last.date)) + ' ' + e(fmt(last.date)) + ' — ' + e(last.type) + (last.amount ? ' (' + money(last.amount) + ' ج.م)' : '') : 'لا يوجد') + '</p>' +
      '<h3>آخر متابعة</h3><p>' + (vs[0] ? e(fmt(vs[0].date)) + ' — ' + e(vs[0].kind || 'زيارة') + ': ' + e(vs[0].note || '') : 'لا يوجد') + '</p>' +
      '<h3>ملخص الحالة</h3><div class="box">' + e((c.research && c.research.info) || autoInfo(c)).replace(/\n/g, '<br>') + '</div>' +
      (c.research && c.research.opinion ? '<h3>رأي الباحث</h3><div class="box">' + e(c.research.opinion).replace(/\n/g, '<br>') + '</div>' : '');
    return page('ملف مختصر عن الحالة', body, [{ t: 'يعتمد — مدير الجمعية' }]);
  }

  /* ---------- هيكل الصفحة والختم ---------- */
  function kv(k, v) { return '<div class="k"><span>' + e(k) + '</span><b>' + (e(v) || '—') + '</b></div>'; }
  function stampSVG() {
    return '<svg class="stamp" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#1b3f9a" stroke-width="3.5"><circle cx="100" cy="100" r="94"/><circle cx="100" cy="100" r="86" stroke-width="1.5"/><circle cx="100" cy="100" r="54" stroke-width="2"/></g>' +
      '<defs><path id="arcT" d="M 24 100 A 76 76 0 0 1 176 100"/><path id="arcB" d="M 20 100 A 80 80 0 0 0 180 100"/></defs>' +
      '<g fill="#1b3f9a" font-family="Tahoma,Arial,sans-serif" text-anchor="middle" font-weight="bold">' +
      '<text font-size="21"><textPath href="#arcT" startOffset="50%">★ ' + ORG.name + ' ★</textPath></text>' +
      '<text font-size="17"><textPath href="#arcB" startOffset="50%" side="right">' + ORG.city + ' — ' + ORG.reg.replace('المشهرة ', '') + '</textPath></text>' +
      '<text x="100" y="92" font-size="19">الخير</text><text x="100" y="116" font-size="19">للجميع</text></g></svg>';
  }
  function page(title, body, sigs) {
    return '<section class="pg"><header><img src="' + (window.JKH_LOGO || 'logo.jpg') + '"><div class="org"><b>' + ORG.name + '</b><span>' + ORG.city + '</span><span>' + ORG.reg + '</span></div><div class="dt">تاريخ الإصدار<br><b>' + fmt(new Date()) + '</b></div></header>' +
      '<h2>' + e(title) + '</h2>' + body +
      '<footer>' + sigs.map(function (s) { return '<div class="sig">' + s.t + '<i></i></div>'; }).join('') + stampSVG() + '</footer></section>';
  }
  var CSS = '@import url(https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap);@page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:Cairo,Tahoma,Arial,sans-serif;color:#1a1a1a;font-size:12px;direction:rtl}' +
    '.pg{position:relative;min-height:276mm;padding:2mm 2mm 40mm;page-break-after:always}.pg:last-child{page-break-after:auto}' +
    'header{display:flex;align-items:center;gap:12px;border-bottom:3px solid #18864b;padding-bottom:8px}header img{width:22mm;height:22mm;object-fit:contain}.org{flex:1;line-height:1.7}.org b{display:block;font-size:20px;color:#0b4a2a}.org span{display:block;font-size:12px;color:#444}.dt{text-align:center;font-size:11px;color:#555;border:1px solid #ccc;border-radius:8px;padding:5px 9px}' +
    'h2{text-align:center;font-size:19px;margin:12px 0 10px;color:#0b4a2a;background:#e9f6ed;padding:7px;border-radius:8px}h3{font-size:13.5px;margin:13px 0 5px;color:#0b4a2a;border-right:4px solid #18864b;padding-right:7px}' +
    '.kv{display:grid;grid-template-columns:1fr 1fr;gap:5px 10px}.k{display:flex;gap:6px;border-bottom:1px dotted #aaa;padding:3px 0;font-size:12px}.k span{color:#555;white-space:nowrap}.k b{font-weight:600}' +
    'table{width:100%;border-collapse:collapse;margin-top:6px;font-size:11.5px}th,td{border:1px solid #888;padding:5px 6px;text-align:right;vertical-align:top}th{background:#eef1ee}thead{display:table-header-group}tr{page-break-inside:avoid}.num{direction:ltr;text-align:center;font-family:Consolas,monospace}tr.tot td{background:#f3f8f4;font-weight:bold}' +
    '.rl{margin:4px 22px;line-height:1.9;font-size:12.5px}.rl li{border-bottom:1px dotted #ccc}.empty{padding:18px;text-align:center;color:#777;border:1px dashed #aaa;border-radius:8px}' +
    '.box{border:1px solid #888;border-radius:6px;padding:9px;min-height:22mm;line-height:1.9;font-size:12.5px}.box.ruled{min-height:38mm;background-image:repeating-linear-gradient(transparent,transparent 25px,#bbb 26px)}' +
    '.cvhead{display:flex;gap:12px;align-items:center;margin-bottom:8px}.cvno{background:#0b4a2a;color:#fff;border-radius:10px;padding:8px 16px;text-align:center;font-size:11px}.cvno b{display:block;font-size:24px}.cvname{font-size:23px;font-weight:bold;color:#0b4a2a}.cvname small{display:block;font-size:12px;color:#555;font-weight:normal}' +
    '.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}.tiles div{background:#e9f6ed;border-radius:9px;padding:8px;text-align:center}.tiles b{display:block;font-size:18px;color:#0b4a2a}.tiles span{font-size:10.5px;color:#555}.chip{display:inline-block;background:#e9f6ed;border:1px solid #b9dcc6;border-radius:12px;padding:1px 9px;margin:1px}' +
    'footer{position:absolute;bottom:4mm;left:2mm;right:2mm;height:38mm;display:flex;justify-content:space-around;align-items:flex-end}.sig{width:50mm;text-align:center;font-size:12px;font-weight:bold}.sig i{display:block;border-bottom:1px solid #444;height:16mm}.stamp{width:34mm;height:34mm;opacity:.9;transform:rotate(-9deg);mix-blend-mode:multiply}';

  /* ---------- معاينة وطباعة ---------- */
  function preview(html, opt) {
    opt = opt || {};
    var old = g('cdOv'); if (old) old.remove();
    var o = document.createElement('div'); o.id = 'cdOv';
    o.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#222d;display:flex;flex-direction:column;align-items:center;padding:8px;gap:8px';
    var bar = '<div style="display:flex;gap:8px;flex-wrap:wrap;background:#fff;border-radius:12px;padding:8px 12px;width:min(900px,100%);align-items:center">' +
      '<button class="primary" id="cdPrint">🖨️ طباعة / حفظ PDF</button><button class="danger" id="cdClose">إغلاق</button>' + (opt.title ? '<b style="margin-inline-start:8px">' + e(opt.title) + '</b>' : '') + '</div>';
    o.innerHTML = bar + (opt.editor || '') + '<iframe id="cdFrame" style="flex:1;width:min(900px,100%);background:#fff;border:0;border-radius:10px"></iframe>';
    document.body.appendChild(o);
    var fr = g('cdFrame'); fr.srcdoc = '<!doctype html><html dir="rtl"><meta charset="utf-8"><title>' + e(opt.title || 'مستند') + '</title><style>' + CSS + (opt.css || '') + '</style><body>' + html + '</body></html>';
    g('cdClose').onclick = function () { o.remove(); };
    g('cdPrint').onclick = function () { audit('طباعة مستند', opt.title || ''); if (window.JKHNative && typeof JKHNative.printHtml === 'function') { try { JKHNative.printHtml(fr.srcdoc, opt.title || 'مستند'); return; } catch (x) { } } try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (x) { alert('تعذرت الطباعة من هذه الشاشة. افتح النظام من المتصفح أو من برنامج Windows.'); } };
    return o;
  }
  function reload(html, css) { var fr = g('cdFrame'); if (fr) fr.srcdoc = '<!doctype html><html dir="rtl"><meta charset="utf-8"><style>' + CSS + (css || '') + '</style><body>' + html + '</body></html>'; }

  function openStatement(id) { var c = find(id); if (c && needCases()) preview(statementHTML(c), { title: 'كشف حساب — ' + c.name }); }
  function openCV(id) { var c = find(id); if (c && needCases()) preview(cvHTML(c), { title: 'ملف مختصر — ' + c.name }); }
  function openFull(id) { var c = find(id); if (c && needCases()) preview(statementHTML(c) + researchHTML(c) + cvHTML(c), { title: 'الملف الكامل — ' + c.name }); }
  function openResearch(id) {
    var c = find(id); if (!c || !needCases()) return; var R = c.research || {};
    var editor = '<div style="background:#fff;border-radius:12px;padding:10px 12px;width:min(900px,100%);display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:34vh;overflow:auto">' +
      '<label style="grid-column:1/3">معلومات عن الحالة (تُملأ تلقائيًا من البيانات ويمكن تعديلها)<textarea id="rsInfo" rows="3" style="width:100%"></textarea></label>' +
      '<label style="grid-column:1/3">رأي الباحث الاجتماعي<textarea id="rsOp" rows="3" style="width:100%"></textarea></label>' +
      '<label>اسم الباحث<input id="rsBy" style="width:100%"></label><div style="display:flex;gap:8px;align-items:flex-end"><button class="primary" id="rsSave">💾 حفظ وتحديث المعاينة</button><button class="secondary" id="rsAuto">↻ إعادة التعبئة التلقائية</button></div></div>';
    preview(researchHTML(c), { title: 'بحث اجتماعي — ' + c.name, editor: editor });
    g('rsInfo').value = R.info != null && R.info !== '' ? R.info : autoInfo(c); g('rsOp').value = R.opinion || ''; g('rsBy').value = R.researcher || (typeof session !== 'undefined' && session && session.name) || '';
    g('rsSave').onclick = function () { c.research = { info: g('rsInfo').value.trim(), opinion: g('rsOp').value.trim(), researcher: g('rsBy').value.trim(), date: new Date().toISOString() }; save(); reload(researchHTML(c)); };
    g('rsAuto').onclick = function () { g('rsInfo').value = autoInfo(c); };
  }

  /* ---------- 5) بطاقة ID (85.6 × 54 مم) ---------- */
  var C39 = { '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', '*': 'nwnnwnwnn' };
  function barcode(txt) {
    var s = '*' + digits(txt) + '*', x = 0, bars = '';
    for (var i = 0; i < s.length; i++) {
      var p = C39[s[i]]; if (!p) continue;
      for (var j = 0; j < 9; j++) { var w = p[j] === 'w' ? 3 : 1; if (j % 2 === 0) bars += '<rect x="' + x + '" y="0" width="' + w + '" height="10"/>'; x += w; }
      x += 1;
    }
    return '<svg viewBox="0 0 ' + x + ' 10" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" fill="#111">' + bars + '</svg>';
  }
  var ICSS = '@import url(https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap);@page{size:85.6mm 54mm;margin:0}.card{width:85.6mm;height:54mm;position:relative;overflow:hidden;page-break-after:always;font-family:Tahoma,Arial,sans-serif;direction:rtl;border-radius:3mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.f{background:linear-gradient(135deg,#0a3d23 0%,#157a45 58%,#1fa35e 100%);color:#fff}.f:before{content:"";position:absolute;width:62mm;height:62mm;border-radius:50%;background:#ffffff14;left:-22mm;top:-26mm}.f:after{content:"";position:absolute;width:44mm;height:44mm;border-radius:50%;background:#f2c14e33;left:-10mm;bottom:-28mm}' +
    '.f .top{position:absolute;top:3.2mm;right:4mm;left:4mm;display:flex;align-items:center;gap:2.6mm}.f .lg{width:11mm;height:11mm;border-radius:50%;background:#fff;object-fit:contain;padding:.6mm}.f .on{font-size:3.7mm;font-weight:bold;line-height:1.25}.f .on small{display:block;font-size:2.3mm;font-weight:normal;opacity:.85}.f .tag{margin-right:auto;background:#f2c14e;color:#3a2a00;font-size:2.4mm;font-weight:bold;padding:.7mm 2.4mm;border-radius:5mm}' +
    '.f .av img{width:100%;height:100%;object-fit:cover}.f .av{overflow:hidden;position:absolute;right:4mm;top:17mm;width:17mm;height:20mm;border-radius:2.4mm;background:#ffffff26;border:.35mm solid #ffffff66;display:flex;align-items:center;justify-content:center;font-size:9mm;font-weight:bold}' +
    '.f .nm{position:absolute;right:24mm;left:4mm;top:17.5mm;font-size:5mm;font-weight:bold;line-height:1.25;max-height:12.5mm;overflow:hidden}.f .fl{position:absolute;right:24mm;left:4mm;top:29.2mm;font-size:2.7mm;line-height:1.7;opacity:.95}.f .fl b{color:#f2c14e}' +
    '.f .bc{position:absolute;left:4mm;right:4mm;bottom:2.4mm;height:7.4mm;background:#fff;border-radius:1.2mm;padding:.8mm 2mm;display:flex;align-items:center;gap:2mm;color:#111}.bc svg{flex:1;height:5.8mm}.bc span{font-size:2.5mm;font-weight:bold;letter-spacing:.3mm;direction:ltr}' +
    '.b{background:#fff;color:#222;border:.3mm solid #cfe3d6}.b .band{position:absolute;top:0;right:0;left:0;height:9mm;background:linear-gradient(90deg,#0a3d23,#1fa35e)}.b .bt{position:absolute;top:2.2mm;right:4mm;color:#fff;font-size:3.4mm;font-weight:bold}.b .tx{position:absolute;top:12mm;right:5mm;left:5mm;font-size:2.55mm;line-height:1.75;color:#333}.b .tx b{color:#0a3d23}' +
    '.b .st{position:absolute;left:5mm;bottom:3mm;width:15mm;height:15mm;opacity:.9;transform:rotate(-9deg);mix-blend-mode:multiply}.b .ft{position:absolute;right:5mm;bottom:3.4mm;font-size:2.3mm;color:#666;line-height:1.6}';
  function cardFront(c) {
    var ini = (c.name || '؟').trim().charAt(0);
    return '<div class="card f"><div class="top"><img class="lg" src="' + (window.JKH_LOGO || 'logo.jpg') + '"><div class="on">' + ORG.name + '<small>' + ORG.city + '</small></div><div class="tag">بطاقة حالة</div></div>' +
      '<div class="av">' + (phSrc(c) ? '<img src="' + e(phSrc(c)) + '">' : e(ini)) + '</div><div class="nm">' + e(c.name) + '</div>' +
      '<div class="fl"><b>رقم الحالة:</b> ' + e(c.no) + '<br><b>المنطقة:</b> ' + e(c.area || c.address || '—') + '<br><b>تاريخ الإصدار:</b> ' + fmt(new Date()) + '</div>' +
      '<div class="bc">' + barcode(c.no) + '<span>' + e(c.no) + '</span></div></div>';
  }
  function cardBack() {
    return '<div class="card b"><div class="band"></div><div class="bt">' + ORG.name + ' — ' + ORG.city + '</div>' +
      '<div class="tx"><b>' + ORG.reg + '</b><br>هذه البطاقة خاصة بصاحبها، وتُبرز عند استلام المساعدات أو المتابعة.<br>في حال العثور عليها يُرجى تسليمها لأقرب مقر للجمعية.<br>لا تُغني البطاقة عن إثبات الشخصية.</div>' +
      stampSVG().replace('class="stamp"', 'class="st"') + '<div class="ft">تُعتمد بختم الجمعية</div></div>';
  }
  async function openCard(id) {
    var c = find(id); if (!c || !needCases()) return; await warm([c], 'photos');
    var css = ICSS + 'body{background:#fff}.card{margin:0 auto 4mm;box-shadow:0 0 0 .2mm #ccc}';
    var editor = '<div style="background:#fff;border-radius:12px;padding:10px 12px;width:min(900px,100%);display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
      '<label>📷 صورة الحالة <input type="file" id="cpPh" accept="image/*"></label><button class="danger" id="cpPhDel">حذف الصورة</button><small style="color:#555">تُقص الصورة تلقائيًا بمقاس البطاقة وتُحفظ مع الحالة.</small></div>';
    preview(cardFront(c) + cardBack(), { title: 'بطاقة — ' + c.name, editor: editor, css: css });
    var draw = function () { reload(cardFront(c) + cardBack(), css); };
    g('cpPh').onchange = function () { var f = this.files[0]; if (!f) return; resizePhoto(f, function (b, d) { storePhoto(c, 'photos', b, d).then(function () { return warm([c], 'photos'); }).then(function () { audit('تغيير صورة بطاقة حالة', c.no + ' — ' + c.name); draw(); }); }); };
    g('cpPhDel').onclick = function () { delete c.photo; delete c.photoUrl; save(); draw(); };
  }
  async function openAllCards() {
    if (!needCases()) return; await warm(cases.slice(), 'photos');
    var list = sorted(cases.slice()), per = 10, h = '';
    for (var i = 0; i < list.length; i += per) h += '<div class="sheet">' + list.slice(i, i + per).map(cardFront).join('') + '</div>';
    h += '<div class="sheet">' + cardBack() + '</div>';
    preview(h, { title: 'بطاقات كل الحالات (' + list.length + ') — الصفحة الأخيرة ظهر البطاقة', css: '@page{size:A4;margin:4mm}.sheet{display:grid;grid-template-columns:repeat(2,85.6mm);gap:3mm;justify-content:center;page-break-after:always}.card{page-break-after:auto;border:.2mm solid #bbb;border-radius:0}' });
  }

  /* ---------- 4) الترتيب الأبجدي ---------- */
  function key(s) { return String(s || '').replace(/[ً-ْـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim(); }
  function sorted(a) { return a.sort(function (x, y) { return key(x.name).localeCompare(key(y.name), 'ar') || String(x.no).localeCompare(String(y.no)); }); }
  function socRank(c) { var t = String(c.social || ''); return /أرمل/.test(t) ? 0 : /مطلق/.test(t) ? 1 : /متزوج/.test(t) ? 2 : /عزب|أعزب/.test(t) ? 3 : 4; }
  function socFilter() { try { return localStorage.getItem('jkh_case_soc') || ''; } catch (x) { return ''; } }
  function sortMode() { try { return localStorage.getItem('jkh_case_sort') || 'alpha'; } catch (x) { return 'alpha'; } }
  function patchSort() {
    if (!window.V27 || window.V27.__alpha) return false;
    var orig = window.V27.sortDup; window.V27.__alpha = true;
    window.V27.sortDup = function (a) {
      var f = g('df') ? g('df').value : '';
      if (f) return orig(a);
      var m = sortMode(), r = a.slice(), sf = socFilter();
      if (sf) r = r.filter(function (c) { return socRank(c) === +sf; });
      if (m === 'social') return r.sort(function (x, y) { return socRank(x) - socRank(y) || key(x.name).localeCompare(key(y.name), 'ar'); });
      if (m === 'new') return r.sort(function (x, y) { return String(y.created || '').localeCompare(String(x.created || '')); });
      if (m === 'no') return r.sort(function (x, y) { return String(x.no).localeCompare(String(y.no)); });
      return sorted(r);
    };
    return true;
  }

  /* ---------- أفراد الأسرة: نموذج كامل ---------- */
  var REL = ['ابن', 'ابنة', 'أب', 'أم', 'أخ', 'أخت', 'جد', 'جدة', 'حفيد', 'أخرى'];
  var SOC = ['أعزب', 'متزوج', 'أرمل', 'مطلق', 'طفل'];
  function famForm(i) {
    var c = current; if (!c) return; var m = i != null ? c.family[i] : {};
    var o = document.createElement('div'); o.style.cssText = 'position:fixed;inset:0;z-index:99998;background:#0009;display:flex;align-items:center;justify-content:center;padding:10px';
    var opt = function (a, v) { return a.map(function (x) { return '<option' + (x === v ? ' selected' : '') + '>' + x + '</option>'; }).join(''); };
    o.innerHTML = '<div style="background:#fff;border-radius:16px;padding:16px;width:min(560px,100%);max-height:94vh;overflow:auto"><h3 style="margin:0 0 10px">' + (i != null ? 'تعديل فرد' : 'إضافة فرد') + '</h3><div class="formgrid">' +
      '<div class="field full"><label>الاسم *</label><input id="fmN" value="' + e(m.name || '') + '"></div>' +
      '<div class="field"><label>صلة القرابة</label><select id="fmR">' + opt(REL, m.relation || 'ابن') + '</select></div><div class="field"><label>الرقم القومي</label><input id="fmI" maxlength="14" value="' + e(m.nid || '') + '"></div>' +
      '<div class="field"><label>السن (يُحسب من الرقم القومي إن تُرك فارغًا)</label><input id="fmA" type="number" value="' + e(m.age || '') + '"></div><div class="field"><label>الحالة الاجتماعية</label><select id="fmS">' + opt(SOC, m.social || 'أعزب') + '</select></div>' +
      '<div class="field"><label>المهنة</label><input id="fmJ" value="' + e(m.job || '') + '"></div><div class="field"><label>التعليم</label><input id="fmE" value="' + e(m.edu || '') + '" placeholder="مثال: الصف الثالث الابتدائي"></div>' +
      '<div class="full" style="display:flex;gap:8px"><button class="primary" id="fmOk">حفظ</button><button class="danger" id="fmNo">إلغاء</button></div></div></div>';
    document.body.appendChild(o);
    g('fmNo').onclick = function () { o.remove(); };
    g('fmOk').onclick = function () {
      var name = g('fmN').value.trim(); if (!name) return alert('اكتب اسم الفرد');
      var nid = digits(g('fmI').value), nf = nidInfo(nid), age = g('fmA').value;
      var rec = { name: name, relation: g('fmR').value, nid: nid, age: age !== '' ? age : (nf ? String(nf.age) : ''), social: g('fmS').value, status: g('fmS').value, job: g('fmJ').value.trim(), edu: g('fmE').value.trim() };
      if (i != null) c.family[i] = Object.assign({}, c.family[i], rec); else c.family.push(rec);
      save(); o.remove(); renderDetail();
    };
  }
  function renderFamily() {
    var c = current, el = g('family'); if (!c || !el) return;
    el.innerHTML = '<div class="card"><h2>أفراد الأسرة (' + c.family.length + ')</h2>' + (c.family.map(function (m, i) {
      return '<div class="row"><div><b>' + e(m.name) + '</b><br><small>' + e(m.relation || '') + (ageOf(m) !== '' ? ' — ' + e(ageOf(m)) + ' سنة' : '') + (m.social || m.status ? ' — ' + e(m.social || m.status) : '') + (m.job ? ' — مهنة: ' + e(m.job) : '') + (m.edu ? ' — تعليم: ' + e(m.edu) : '') + (m.nid ? '<br>الرقم القومي: ' + e(maskN(m.nid)) : '') + '</small></div><div><button class="secondary" onclick="CaseDocs.famEdit(' + i + ')">تعديل</button> <button class="danger" onclick="removeFamily(' + i + ')">حذف</button></div></div>';
    }).join('') || '<div class="empty">لم تتم إضافة أفراد.</div>') + '<button class="primary" onclick="CaseDocs.famEdit()">+ إضافة فرد</button></div>';
  }

  /* ---------- الأزرار في القائمة وفي ملف الحالة ---------- */
  function btns(id, small) {
    if (!perm('cases')) return '';
    var s = small ? ' style="padding:5px 8px;font-size:11.5px;margin:2px"' : '';
    return '<button class="secondary cdb"' + s + ' onclick="CaseDocs.statement(\'' + id + '\')">كشف حساب</button><button class="secondary cdb"' + s + ' onclick="CaseDocs.research(\'' + id + '\')">بحث اجتماعي</button><button class="secondary cdb"' + s + ' onclick="CaseDocs.cv(\'' + id + '\')">CV</button><button class="secondary cdb"' + s + ' onclick="CaseDocs.card(\'' + id + '\')">ID</button>';
  }
  function injectDiag() {
    var q = g('cdSort'); if (!q || g('cdDiagBtn') || typeof session === 'undefined' || !session || session.role !== 'مدير النظام') return;
    var d2 = document.createElement('button'); d2.id = 'cdDiagBtn'; d2.className = 'secondary'; d2.textContent = '🩺 فحص النظام'; d2.onclick = runDiag;
    (g('cdAllCards') || q).insertAdjacentElement('afterend', d2);
  }
  function injectList() {
    var t = g('caseTable'); if (!t) return;
    t.querySelectorAll('button[onclick^="openDetail("]').forEach(function (b) {
      var m = /openDetail\('([^']+)'\)/.exec(b.getAttribute('onclick')); if (!m) return;
      var d = document.createElement('div'); d.className = 'cdrow'; d.innerHTML = btns(m[1], true); b.parentNode.appendChild(d);
      var c = find(m[1]), tr = b.closest('tr'), nm = tr && tr.children[1];
      if (c && c.social && nm && !nm.querySelector('.cdsoc')) nm.insertAdjacentHTML('beforeend', ' <span class="badge cdsoc">' + e(c.social) + '</span>');
    });
  }
  function injectSortBar() {
    if (g('cdSort')) return; var q = g('q'); if (!q) return;
    var s = document.createElement('select'); s.id = 'cdSort'; s.title = 'ترتيب الحالات';
    s.innerHTML = '<option value="alpha">ترتيب: أبجدي (أ ← ي)</option><option value="new">ترتيب: الأحدث إدخالًا</option><option value="no">ترتيب: رقم الحالة</option><option value="social">ترتيب: الحالة الاجتماعية (أرمل ← مطلق ← متزوج ← أعزب)</option>';
    s.value = sortMode(); s.onchange = function () { try { localStorage.setItem('jkh_case_sort', s.value); } catch (x) { } renderCases(); };
    q.insertAdjacentElement('afterend', s);
    var f = document.createElement('select'); f.id = 'cdSoc'; f.title = 'تصفية بالحالة الاجتماعية';
    f.innerHTML = '<option value="">الحالة الاجتماعية: الكل</option><option value="0">أرمل / أرملة</option><option value="1">مطلق / مطلقة</option><option value="2">متزوج / متزوجة</option><option value="3">أعزب / عزباء</option>';
    f.value = socFilter(); f.onchange = function () { try { localStorage.setItem('jkh_case_soc', f.value); } catch (x) { } renderCases(); };
    s.insertAdjacentElement('afterend', f);
    var b = document.createElement('button'); b.className = 'secondary'; b.id = 'cdAllCards'; b.textContent = '🪪 طباعة بطاقات كل الحالات'; b.onclick = openAllCards; if (!perm('cases')) b.style.display = 'none'; f.insertAdjacentElement('afterend', b);
  }


  /* ---------- إصلاح الزوج/الزوجة ---------- */
  function fixSpouses() {
    var n = 0;
    (typeof cases !== 'undefined' ? cases : []).forEach(function (c) {
      if (c.husband && !c.wife) {
        var i = nidInfo(c.husbandNid || c.nid);
        if (i && i.female) {
          c.wife = c.husband; c.wifeNid = c.husbandNid || c.nid; c.husband = ''; c.husbandNid = '';
          if (c.husbandPhone && !c.wifePhone) { c.wifePhone = c.husbandPhone; c.husbandPhone = ''; }
          n++;
        }
      }
    });
    return n;
  }
  function swapSpouses(id) {
    var c = find(id); if (!c) return;
    var t = c.husband; c.husband = c.wife || ''; c.wife = t || '';
    t = c.husbandNid; c.husbandNid = c.wifeNid || ''; c.wifeNid = t || '';
    t = c.husbandPhone; c.husbandPhone = c.wifePhone || ''; c.wifePhone = t || '';
    save(); renderDetail(); try { renderAll(); } catch (x) { }
  }

  /* ---------- المتطوعون: بطاقة ID وكشف المشاركات ---------- */
  function last10(v) { v = digits(v); return v.length >= 9 ? v.slice(-10) : ''; }
  function vfind(id) { return (typeof volunteers !== 'undefined' ? volunteers : []).find(function (v) { return v.id === id; }); }
  function sameP(v, name, phone) {
    var a = key(name).replace(/ /g, ''); if (a && a === key(v.name).replace(/ /g, '')) return true;
    var p = last10(phone); return !!p && (p === last10(v.phone) || p === last10(v.whatsapp));
  }
  function participations(v) {
    var rows = [], X = window.EXTRA || {};
    (v.parts || []).forEach(function (r) { rows.push({ date: r.date, activity: r.activity || 'مشاركة', src: 'تسجيل يدوي', note: r.note || '', sub: 0, don: 0 }); });
    (X.attendance || []).forEach(function (r) { if (sameP(v, r.name, r.phone) && (r.status === 'حاضر' || r.status === 'مهمة خارجية')) rows.push({ date: r.date, activity: r.activity || 'حضور', src: 'الحضور والمتابعة', note: r.notes || '', sub: 0, don: 0 }); });
    (X.tasks || []).forEach(function (r) { if (r.who && key(r.who).replace(/ /g, '') === key(v.name).replace(/ /g, '') && r.status === 'منفذة') rows.push({ date: r.due, activity: r.task, src: 'المهام والحملات', note: '', sub: 0, don: 0 }); });
    (typeof visitActivityPeople !== 'undefined' ? visitActivityPeople : []).forEach(function (x) { if (sameP(v, x.name, x.phone)) rows.push({ date: String(x.updatedAt || '').slice(0, 10), activity: x.kind || 'زيارة', src: 'نشاط الزيارات', note: x.notes || '', sub: +x.subscription || 0, don: +x.donation || 0 }); });
    rows.sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
    return rows;
  }
  function volStatementHTML(v) {
    var r = participations(v), subs = r.reduce(function (s, x) { return s + x.sub; }, 0), dons = r.reduce(function (s, x) { return s + x.don; }, 0), last = r.length ? r[r.length - 1] : null;
    var body = '<div class="kv">' + kv('اسم المتطوع', v.name) + kv('رقم المتطوع', v.no) + kv('الهاتف', [v.phone, v.whatsapp].filter(function (x, i, a) { return x && a.indexOf(x) === i; }).map(maskP).join('  —  ')) + kv('الرقم القومي', maskN(v.nid)) + kv('مجال التطوع', v.skill) + kv('تاريخ الانضمام', fmt(v.date)) + '</div>' +
      '<div class="tiles"><div><b>' + r.length + '</b><span>عدد مرات المشاركة</span></div><div><b>' + (last ? e(fmt(last.date) || '—') : '—') + '</b><span>آخر مشاركة</span></div><div><b>' + money(subs) + '</b><span>إجمالي الاشتراكات (ج.م)</span></div><div><b>' + money(dons) + '</b><span>إجمالي التبرعات (ج.م)</span></div></div>' +
      (r.length ? '<h3>سجل المشاركات</h3><ol class="rl">' + r.map(function (x) { return '<li>شارك المتطوع يوم <b>' + e(dayName(x.date)) + ' ' + e(fmt(x.date) || 'غير مسجل') + '</b> في: ' + e(x.activity) + '</li>'; }).join('') + '</ol>' +
        '<table><thead><tr><th>م</th><th>التاريخ</th><th>النشاط</th><th>المصدر</th><th>اشتراك</th><th>تبرع</th><th>ملاحظات</th></tr></thead><tbody>' +
        r.map(function (x, i) { return '<tr><td>' + (i + 1) + '</td><td>' + e(fmt(x.date)) + '</td><td>' + e(x.activity) + '</td><td>' + e(x.src) + '</td><td>' + (x.sub ? money(x.sub) : '—') + '</td><td>' + (x.don ? money(x.don) : '—') + '</td><td>' + e(x.note) + '</td></tr>'; }).join('') +
        '<tr class="tot"><td colspan="4">الإجمالي — عدد المشاركات: ' + r.length + '</td><td>' + money(subs) + '</td><td>' + money(dons) + '</td><td></td></tr></tbody></table>'
        : '<p class="empty">لا توجد مشاركات مسجلة بعد. سجّل المشاركة من الأعلى أو من الحضور ونشاط الزيارات.</p>');
    return page('كشف حساب المتطوع', body, [{ t: 'مسؤول المتطوعين' }, { t: 'يعتمد — مدير الجمعية' }]);
  }
  function openVolStatement(id) {
    var v = vfind(id); if (!v || !needPeople()) return;
    var editor = '<div style="background:#fff;border-radius:12px;padding:10px 12px;width:min(900px,100%);display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">' +
      '<label>تاريخ المشاركة<input type="date" id="vpD"></label><label style="flex:1;min-width:160px">النشاط<input id="vpA" style="width:100%" placeholder="مثال: قافلة طبية / توزيع كراتين"></label><label style="flex:1;min-width:120px">ملاحظة<input id="vpN" style="width:100%"></label>' +
      '<button class="primary" id="vpAdd">+ تسجيل مشاركة</button><button class="danger" id="vpDel">حذف آخر مشاركة يدوية</button></div>';
    preview(volStatementHTML(v), { title: 'كشف المتطوع — ' + v.name, editor: editor });
    g('vpD').value = new Date().toISOString().slice(0, 10);
    g('vpAdd').onclick = function () { if (!g('vpA').value.trim()) return alert('اكتب اسم النشاط'); (v.parts = v.parts || []).push({ id: String(Date.now()), date: g('vpD').value, activity: g('vpA').value.trim(), note: g('vpN').value.trim() }); save(); g('vpA').value = ''; g('vpN').value = ''; reload(volStatementHTML(v)); };
    g('vpDel').onclick = function () { if (!(v.parts || []).length) return alert('لا توجد مشاركات يدوية'); v.parts.pop(); save(); reload(volStatementHTML(v)); };
  }
  var VCSS = '.v.f{background:linear-gradient(135deg,#082f4a 0%,#12698f 56%,#1fb0c4 100%)}.v .av{overflow:hidden;font-size:9mm}.v .av img{width:100%;height:100%;object-fit:cover}.v .nm{font-size:4.4mm;max-height:10mm}.v .fl{top:27mm;left:4mm;font-size:2.6mm;line-height:1.5}.v .fl i{font-style:normal;direction:ltr;unicode-bidi:embed}.vb .band{background:linear-gradient(90deg,#082f4a,#1fb0c4)!important}';
  function volFront(v) {
    var ini = (v.name || '؟').trim().charAt(0);
    return '<div class="card f v"><div class="top"><img class="lg" src="' + (window.JKH_LOGO || 'logo.jpg') + '"><div class="on">' + ORG.name + '<small>' + ORG.city + '</small></div><div class="tag">بطاقة متطوع</div></div>' +
      '<div class="av">' + (phSrc(v) ? '<img src="' + e(phSrc(v)) + '">' : e(ini)) + '</div><div class="nm">' + e(v.name) + '</div>' +
      '<div class="fl"><b>الرقم القومي:</b> <i>' + e(maskN(v.nid) || '—') + '</i><br><b>الصفة:</b> ' + e(v.role || 'متطوع') + '<br><b>رقم التطوع:</b> <i>' + e(v.no) + '</i><br><b>تاريخ الإصدار:</b> ' + e(fmt(v.issueDate || new Date())) + '</div>' +
      '<div class="bc">' + barcode(v.no) + '<span>' + e(v.no) + '</span></div></div>';
  }
  function volBack() {
    return cardBack().replace('class="card b"', 'class="card b vb"').replace('هذه البطاقة خاصة بصاحبها، وتُبرز عند استلام المساعدات أو المتابعة.', 'هذه البطاقة تثبت أن حاملها متطوع بالجمعية، وتُبرز عند المشاركة في الأنشطة والقوافل.');
  }
  function resizePhoto(file, cb) {
    var fr = new FileReader();
    fr.onload = function () {
      var im = new Image();
      im.onload = function () {
        var W = 300, H = 400, cv = document.createElement('canvas'); cv.width = W; cv.height = H; var cx = cv.getContext('2d');
        var r = Math.max(W / im.width, H / im.height), w = im.width * r, h = im.height * r; cx.fillStyle = '#fff'; cx.fillRect(0, 0, W, H); cx.drawImage(im, (W - w) / 2, (H - h) / 2.6, w, h);
        var du = cv.toDataURL('image/jpeg', 0.82); if (cv.toBlob) cv.toBlob(function (b) { cb(b || toBlob(du), du); }, 'image/jpeg', 0.82); else cb(toBlob(du), du);
      };
      im.onerror = function () { alert('تعذرت قراءة الصورة'); }; im.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  async function openVolCard(id) {
    var v = vfind(id); if (!v || !needPeople()) return; await warm([v], 'volunteer-photos');
    var css = ICSS + VCSS + 'body{background:#fff}.card{margin:0 auto 4mm;box-shadow:0 0 0 .2mm #ccc}';
    var iv = function (l, i, t) { return '<label style="flex:1;min-width:150px">' + l + '<input id="' + i + '" ' + (t || '') + ' style="width:100%"></label>'; };
    var editor = '<div style="background:#fff;border-radius:12px;padding:10px 12px;width:min(900px,100%);display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;max-height:36vh;overflow:auto">' +
      iv('الاسم', 'vcN') + iv('الرقم القومي', 'vcI', 'maxlength="14" inputmode="numeric"') + iv('الصفة', 'vcR', 'list="vcRL"') + '<datalist id="vcRL"><option>متطوع</option><option>متطوع فعّال</option><option>عضو لجنة</option><option>مسؤول فريق</option><option>باحث اجتماعي</option><option>طبيب متطوع</option></datalist>' +
      iv('رقم التطوع', 'vcNo') + '<label>تاريخ الإصدار<input type="date" id="vcD"></label>' +
      '<label>📷 الصورة <input type="file" id="vpPh" accept="image/*"></label><button class="danger" id="vpPhDel">حذف الصورة</button>' +
      '<button class="primary" id="vcSave">💾 حفظ التعديل وتحديث البطاقة</button></div>';
    preview(volFront(v) + volBack(), { title: 'بطاقة متطوع — ' + v.name, editor: editor, css: css });
    g('vcN').value = v.name || ''; g('vcI').value = v.nid || ''; g('vcR').value = v.role || 'متطوع'; g('vcNo').value = v.no || '';
    g('vcD').value = (v.issueDate || new Date().toISOString()).slice(0, 10);
    var draw = function () { reload(volFront(v) + volBack(), css); };
    var take = function () {
      v.name = g('vcN').value.trim() || v.name; v.nid = digits(g('vcI').value); v.role = g('vcR').value.trim() || 'متطوع'; v.no = g('vcNo').value.trim() || v.no; v.issueDate = g('vcD').value || new Date().toISOString().slice(0, 10);
    };
    g('vcSave').onclick = function () { take(); save(); audit('تعديل بطاقة متطوع', v.no + ' — ' + v.name); try { renderVolunteers(); } catch (x) { } draw(); };
    g('vpPh').onchange = function () { var f = this.files[0]; if (!f) return; take(); resizePhoto(f, function (b, d) { storePhoto(v, 'volunteer-photos', b, d).then(function () { return warm([v], 'volunteer-photos'); }).then(function () { audit('تغيير صورة متطوع', v.no + ' — ' + v.name); draw(); }); }); };
    g('vpPhDel').onclick = function () { delete v.photo; delete v.photoUrl; save(); draw(); };
  }
  async function openAllVolCards() {
    if (!needPeople()) return; await warm(volunteers.slice(), 'volunteer-photos');
    var list = volunteers.slice().sort(function (a, b) { return key(a.name).localeCompare(key(b.name), 'ar'); }), h = '';
    for (var i = 0; i < list.length; i += 10) h += '<div class="sheet">' + list.slice(i, i + 10).map(volFront).join('') + '</div>';
    h += '<div class="sheet">' + volBack() + '</div>';
    preview(h, { title: 'بطاقات المتطوعين (' + list.length + ')', css: ICSS + VCSS + '@page{size:A4;margin:4mm}.sheet{display:grid;grid-template-columns:repeat(2,85.6mm);gap:3mm;justify-content:center;page-break-after:always}.card{page-break-after:auto;border:.2mm solid #bbb;border-radius:0}' });
  }
  function injectVolunteers() {
    var t = g('volunteerTable'); if (t) t.querySelectorAll('button[onclick^="deleteRecord(\'volunteers\'"]').forEach(function (b) {
      var m = /'volunteers','([^']+)'/.exec(b.getAttribute('onclick')); if (!m) return;
      if (!perm('people')) return;
      var d = document.createElement('div'); d.className = 'cdrow';
      d.innerHTML = '<button class="secondary cdb" style="padding:5px 8px;font-size:11.5px;margin:2px" onclick="CaseDocs.volCard(\'' + m[1] + '\')">ID</button><button class="secondary cdb" style="padding:5px 8px;font-size:11.5px;margin:2px" onclick="CaseDocs.volStatement(\'' + m[1] + '\')">كشف حساب</button>';
      b.parentNode.appendChild(d);
    });
    var s = g('volSearch'); if (s && perm('people') && !g('cdVolAll')) { var b2 = document.createElement('button'); b2.id = 'cdVolAll'; b2.className = 'secondary'; b2.textContent = '🪪 طباعة بطاقات كل المتطوعين'; b2.onclick = openAllVolCards; s.insertAdjacentElement('afterend', b2); }
  }


  /* ---------- تنبيه النسخ الاحتياطي للمدير ---------- */
  var BK_DAYS = 3, bkShown = false;
  async function bkCheck() {
    try {
      var c = window.__inboxCred; if (!c || typeof session === 'undefined' || !session || session.role !== 'مدير النظام' || bkShown) return;
      var r = await sb.rpc('backup_list', { p_u: c.u, p_p: c.p }); if (r.error || !Array.isArray(r.data)) return;
      var last = r.data.reduce(function (m, b) { var t = new Date(b.taken_at).getTime(); return t > m ? t : m; }, 0);
      var days = last ? Math.floor((Date.now() - last) / 86400000) : null;
      if (days !== null && days < BK_DAYS) { bkShown = true; return; }
      bkShown = true;
      var d = document.createElement('div'); d.id = 'cdBk';
      d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99990;background:#fff3cd;color:#664d03;border-bottom:2px solid #e0b100;padding:9px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-weight:600';
      d.innerHTML = '<span>⚠️ ' + (days === null ? 'لا توجد نسخة احتياطية سحابية للبيانات.' : 'آخر نسخة احتياطية قبل ' + days + ' يومًا.') + '</span><button class="primary" id="cdBkNow">أخذ نسخة الآن</button><button class="secondary" id="cdBkX">لاحقًا</button>';
      document.body.appendChild(d);
      document.getElementById('cdBkX').onclick = function () { d.remove(); };
      document.getElementById('cdBkNow').onclick = async function () {
        this.disabled = true; this.textContent = 'جارٍ النسخ…';
        var x = await sb.rpc('backup_create', { p_u: c.u, p_p: c.p, p_reason: 'تنبيه تلقائي' });
        if (x.error) { alert('تعذر أخذ النسخة: ' + (x.error.message || x.error)); this.disabled = false; this.textContent = 'أخذ نسخة الآن'; return; }
        d.innerHTML = '<span>✅ تم أخذ نسخة احتياطية.</span>'; setTimeout(function () { d.remove(); }, 3000);
      };
    } catch (x) { /* بدون جلسة أو بدون صلاحية: لا شيء */ }
  }


  /* ---------- فحص سلامة النظام وجودة البيانات (لمدير النظام) ---------- */
  function dupNids(list, f) { var m = {}, out = []; list.forEach(function (x) { var n = digits(f(x)); if (n.length === 14) { (m[n] = m[n] || []).push(x); } }); Object.keys(m).forEach(function (k) { if (m[k].length > 1) out.push(m[k]); }); return out; }
  async function runDiag() {
    if (typeof session === 'undefined' || !session || session.role !== 'مدير النظام') return alert('فحص النظام متاح لمدير النظام فقط.');
    var old = g('cdDiag'); if (old) old.remove();
    var o = document.createElement('div'); o.id = 'cdDiag';
    o.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#222d;display:flex;justify-content:center;padding:10px;overflow:auto';
    o.innerHTML = '<div style="background:#fff;border-radius:14px;padding:14px 16px;width:min(860px,100%);height:fit-content"><div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><h2 style="margin:0;flex:1">🩺 فحص النظام وجودة البيانات</h2><button class="danger" id="dgX">إغلاق</button></div><div id="dgBody">جارٍ الفحص…</div></div>';
    document.body.appendChild(o); g('dgX').onclick = function () { o.remove(); };
    var ok = function (t, good, extra) { return '<div class="row" style="gap:8px"><span>' + (good === null ? 'ℹ️' : good ? '✅' : '⚠️') + ' ' + e(t) + '</span><small style="color:#555">' + (extra || '') + '</small></div>'; };
    var h = '<h3>الملفات والخدمات</h3>';
    h += ok('ملف jkh-docs.js محمّل', !(window.JKHDocs && window.JKHDocs.__fallback) && !!window.JKHDocs, window.JKHDocs && window.JKHDocs.__fallback ? 'غير مرفوع بجوار index.html — ارفعه' : '');
    h += ok('ملف مستندات الحالة jkh-case-docs.js', true);
    var c = window.__inboxCred, base = String(window.JKH_SUPABASE_URL || '').replace(/\/$/, '');
    try {
      var r = await fetch(base + '/functions/v1/doc-access', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: window.JKH_SUPABASE_ANON_KEY }, body: JSON.stringify({ u: c && c.u, p: c && c.p, action: 'sign', items: [] }) });
      h += ok('دالة doc-access (المستندات والصور)', r.ok, r.ok ? '' : 'رمز ' + r.status + ' — تأكد من نشر الدالة');
    } catch (x) { h += ok('دالة doc-access (المستندات والصور)', false, 'لا يمكن الوصول'); }
    try {
      var bl = await sb.rpc('backup_list', { p_u: c.u, p_p: c.p }), last = (bl.data || []).reduce(function (m, b) { var t = new Date(b.taken_at).getTime(); return t > m ? t : m; }, 0), d = last ? Math.floor((Date.now() - last) / 86400000) : null;
      h += ok('النسخ الاحتياطي السحابي', d !== null && d < BK_DAYS, d === null ? 'لا توجد نسخ' : 'آخر نسخة قبل ' + d + ' يوم');
    } catch (x) { h += ok('النسخ الاحتياطي السحابي', false, 'تعذر قراءة النسخ'); }
    h += '<div style="margin:6px 0"><button class="secondary" id="dgUp">اختبار رفع صورة صغيرة للتخزين</button> <span id="dgUpR"></span></div>';

    var C = cases, V = typeof volunteers !== 'undefined' ? volunteers : [];
    var noNid = C.filter(function (x) { return digits(x.nid).length !== 14 && digits(x.husbandNid).length !== 14; });
    var noPhone = C.filter(function (x) { return !phonesOf(x).length; });
    var dupC = dupNids(C, function (x) { return x.nid || x.husbandNid; });
    var spouse = C.filter(function (x) { return x.husband && !x.wife && key(x.husband) === key(x.name); });
    var kids = 0; C.forEach(function (x) { (x.family || []).forEach(function (m) { if (!m.nid && (m.age === '' || m.age == null)) kids++; }); });
    var vNo = V.filter(function (x) { return digits(x.nid).length !== 14; }), vPh = V.filter(function (x) { return !x.phone && !x.whatsapp; });
    var legacyPh = C.concat(V).filter(function (x) { return x.photo; }).length;
    h += '<h3>جودة البيانات</h3>' + ok('عدد الحالات: ' + C.length + ' — المتطوعون: ' + V.length, null) +
      ok('حالات بلا رقم قومي صحيح (14 رقمًا)', !noNid.length, noNid.length + '') +
      ok('حالات بلا هاتف', !noPhone.length, noPhone.length + '') +
      ok('أرقام قومية مكررة بين الحالات', !dupC.length, dupC.length + ' رقم') +
      ok('أفراد أسرة بلا رقم قومي ولا سن', !kids, kids + '') +
      ok('متطوعون بلا رقم قومي صحيح', !vNo.length, vNo.length + '') + ok('متطوعون بلا هاتف', !vPh.length, vPh.length + '') +
      ok('صور محفوظة داخل البيانات (تنتقل للتخزين عند فتح البطاقة)', !legacyPh, legacyPh + '');
    h += '<h3>حالات يحتمل أن الزوج/الزوجة فيها مقلوبة (' + spouse.length + ')</h3>' + (spouse.length ? '<small>اسم الحالة نفسه مسجل كزوج بلا زوجة. إن كانت الحالة امرأة اضغط «تبديل».</small>' + spouse.slice(0, 40).map(function (x) { return '<div class="row"><span>' + e(x.no) + ' — ' + e(x.name) + ' <small>(' + e(x.social || '') + ')</small></span><button class="secondary" onclick="CaseDocs.swap(\'' + x.id + '\');this.parentNode.remove()">🔁 تبديل</button></div>'; }).join('') + (spouse.length > 40 ? '<small>… و' + (spouse.length - 40) + ' أخرى</small>' : '') : '<div class="empty">لا توجد.</div>');
    if (noNid.length) h += '<h3>أول 15 حالة بلا رقم قومي</h3><small>' + noNid.slice(0, 15).map(function (x) { return e(x.no + ' ' + x.name); }).join(' — ') + '</small>';
    g('dgBody').innerHTML = h;
    g('dgUp').onclick = async function () {
      var r = g('dgUpR'); r.textContent = 'جارٍ الرفع…';
      try {
        var px = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
        var path = 'cases/diagnostics/test_' + Date.now() + '.jpg', up = await JKHDocs.upload(sb, 'case-documents', path, toBlob(px), { contentType: 'image/jpeg', upsert: false });
        r.textContent = up && up.error ? '❌ فشل: ' + (up.error.message || up.error) : '✅ نجح الرفع';
      } catch (x) { r.textContent = '❌ ' + ((x && x.message) || x); }
    };
  }

  function init() {
    patchSort(); injectSortBar();
    var rc = window.renderCases;
    window.renderCases = function () { try { fixSpouses(); } catch (x) { } patchSort(); injectSortBar(); var r = rc.apply(this, arguments); try { injectList(); injectDiag(); } catch (x) { console.warn(x); } return r; };
    var rv = window.renderVolunteers;
    if (rv) window.renderVolunteers = function () { var r = rv.apply(this, arguments); try { injectVolunteers(); } catch (x) { console.warn(x); } return r; };
    try { if (rv) renderVolunteers(); } catch (x) { }
    var rd = window.renderDetail;
    window.renderDetail = function () {
      var r = rd.apply(this, arguments);
      try {
        renderFamily();
        var d = g('data'); if (d && current) d.insertAdjacentHTML('beforeend', '<div class="card" style="margin-top:10px"><b>مستندات الحالة:</b><div class="toolbar">' + btns(current.id, false) + '<button class="primary" onclick="CaseDocs.full(\'' + current.id + '\')">الملف الكامل</button><button class="warn" onclick="if(confirm(\'تبديل بيانات الزوج مع الزوجة؟\'))CaseDocs.swap(\'' + current.id + '\')">🔁 تبديل الزوج/الزوجة</button></div></div>');
      } catch (x) { console.warn(x); }
      return r;
    };
    window.addFamily = function () { famForm(); };
    // داخل تطبيق Android لا تعمل window.print في WebView؛ نحوّلها لنافذة الطباعة/حفظ PDF الأصلية
    if (window.JKHNative && typeof JKHNative.printHtml === 'function') window.print = function () { JKHNative.printHtml('<!doctype html>' + document.documentElement.outerHTML, document.title || 'مستند'); };
    setInterval(bkCheck, 20000); setTimeout(bkCheck, 4000);
    var st = document.createElement('style'); st.textContent = '.cdrow{margin-top:4px;display:flex;flex-wrap:wrap}#cdSort{max-width:300px}#cdSoc{max-width:220px}';
    document.head.appendChild(st);
    try { renderCases(); } catch (x) { }
  }
  window.CaseDocs = { _stamp: stampSVG, diag: runDiag, swap: swapSpouses, fixSpouses: fixSpouses, volCard: openVolCard, volStatement: openVolStatement, volCards: openAllVolCards, statement: openStatement, research: openResearch, cv: openCV, card: openCard, full: openFull, cards: openAllCards, famEdit: famForm, _html: { statement: statementHTML, research: researchHTML, cv: cvHTML, card: function (c) { return cardFront(c) + cardBack(); }, css: CSS, icss: ICSS }, _sorted: sorted, _nid: nidInfo };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
