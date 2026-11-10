/* جمعية الخير للجميع — الإصدار 30
   إضافات: سلة المحذوفات، تنبيهات الرئيسية، لوحة الأرقام، الزيارات الميدانية (صور + توقيع)،
   الإيصالات الرسمية المرقمة، التحقق بخطوتين، حالة النسخ الاحتياطي الخارجي.
   يُحمَّل بعد سكربتات index.html ويعتمد على متغيراتها العامة (cases, donations, session, sb, save ...). */
(function () {
  'use strict';
  var g = function (id) { return document.getElementById(id); };
  var e = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); };
  var num = function (v) { return (+v || 0).toLocaleString('ar-EG'); };
  var today = function () { return new Date().toISOString().slice(0, 10); };
  var ex = function () { return (window.EXTRA = window.EXTRA || {}); };
  var DAY = 86400000;
  var isAdmin = function () { return !!(session && session.role === 'مدير النظام'); };
  var ACC = { 'باحث اجتماعي': ['cases', 'aid', 'reports'], 'محاسب': ['donations', 'accounts', 'projects', 'reports'], 'مسؤول مخازن': ['stock', 'aid'], 'متطوع': ['cases', 'people'] };
  function can(sec) {
    if (!session) return false;
    if (session.role === 'مدير النظام') return true;
    if (Array.isArray(session.permissions)) return session.permissions.indexOf(sec) >= 0;
    var a = ACC[session.role]; return !a || a.indexOf(sec) >= 0;
  }
  function cred() { var c = window.__inboxCred; if (!c) throw new Error('انتهت الجلسة، سجّل الدخول من جديد.'); return { p_u: c.u, p_p: c.p }; }
  async function rpc(fn, a) { var r = await sb.rpc(fn, Object.assign({}, cred(), a || {})); if (r.error) throw r.error; return r.data; }
  function errTxt(x) { return (x && (x.message || x.error_description)) || String(x); }
  function toast(msg, ms) {
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#11663a;color:#fff;padding:10px 18px;border-radius:12px;z-index:100001;font:600 14px Tahoma,Arial;max-width:90vw;text-align:center';
    t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, ms || 3500);
  }
  function download(name, mime, text) {
    var a = document.createElement('a'); var u = URL.createObjectURL(new Blob([text], { type: mime }));
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 1500);
  }
  var ST = 'background:#fff;border:1px solid #e4eee7;border-radius:14px;padding:14px;margin-bottom:12px';

  /* ---------- نافذة منبثقة بسيطة ---------- */
  function modal(html, wide) {
    close();
    var o = document.createElement('div'); o.id = 'v30ov';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100000;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:16px';
    o.innerHTML = '<div style="background:#fff;border-radius:16px;padding:16px;width:min(' + (wide || 760) + 'px,100%);margin:auto;direction:rtl;max-height:none">' + html + '</div>';
    o.addEventListener('mousedown', function (ev) { if (ev.target === o && !o.dataset.lock) close(); });
    document.body.appendChild(o); return o;
  }
  function close() { var o = g('v30ov'); if (o) o.remove(); }

  /* ---------- تسجيل الأقسام في التنقل ---------- */
  function addNav(secId, item, renderName) {
    var s = (window.SEC || []).find(function (x) { return x.id === secId; });
    if (s && !s.b.some(function (b) { return b[0] === item[0]; })) s.b.push(item);
    if (window.RN) window.RN[item[0]] = renderName;
  }
  function addPage(id, html) {
    if (g(id)) return; var s = document.createElement('section'); s.id = id; s.className = 'page'; s.innerHTML = html;
    document.querySelector('main').appendChild(s);
  }

  /* ==========================================================
     1) سلة المحذوفات (30 يومًا)
     ========================================================== */
  var TRASH_DAYS = 30;
  var TYPES = { cases: 'حالة', distributions: 'سجل توزيع', memberships: 'عضوية', volunteers: 'متطوع', donations: 'تبرع' };
  function arr(type) { return { cases: cases, distributions: distributions, memberships: memberships, volunteers: volunteers, donations: donations }[type]; }
  function trash() { var x = ex(); if (!Array.isArray(x.trash)) x.trash = []; return x.trash; }
  function toTrash(type, rec) {
    trash().unshift({ tid: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()), type: type, at: new Date().toISOString(), by: (session && (session.name || session.username)) || '', data: JSON.parse(JSON.stringify(rec)) });
  }
  function purgeOld() {
    var t = trash(), keep = t.filter(function (x) { return Date.now() - Date.parse(x.at) < TRASH_DAYS * DAY; });
    if (keep.length !== t.length) { ex().trash = keep; save(); }
  }
  // حذف الحالة → السلة
  window.deleteCase = async function (id) {
    var c = cases.find(function (x) { return x.id === id; }); if (!c) return;
    if (!confirm('حذف الحالة ' + c.name + ' رقم ' + c.no + '؟ ستنتقل إلى «سلة المحذوفات» ويمكن استرجاعها خلال ' + TRASH_DAYS + ' يومًا.')) return;
    toTrash('cases', c);
    cases = cases.filter(function (x) { return x.id !== id; });
    if (current && current.id === id) { current = null; closeM('detailModal'); }
    try { await saveNow(); renderAll(); toast('نُقلت الحالة إلى سلة المحذوفات'); }
    catch (er) { alert('تعذر حفظ الحذف سحابيًا: ' + errTxt(er)); }
  };
  // حذف باقي السجلات → السلة
  var _delRec = window.deleteRecord;
  if (typeof _delRec === 'function') window.deleteRecord = function (group, id) {
    var list = arr(group), rec = list && list.find(function (x) { return x.id === id; });
    var r = _delRec.apply(this, arguments);
    if (rec && list && !list.some(function (x) { return x.id === id; })) { toTrash(group, rec); save(); }
    return r;
  };
  function nameOf(d) { return d.name || d.donor || d.title || d.id || ''; }
  window.renderTrash30 = function () {
    if (isAdmin()) purgeOld();
    var t = trash();
    g('trash30').innerHTML = '<div style="' + ST + '"><h2 style="margin-top:0">🗑️ سلة المحذوفات</h2>' +
      '<div class="notice">أي حالة أو سجل يُحذف يبقى هنا ' + TRASH_DAYS + ' يومًا ثم يُحذف نهائيًا (يتم التنظيف عند فتح هذه الصفحة بواسطة المدير). الحذف الجماعي ودمج المكررات لا يمر بالسلة، لكن لهما نسخة احتياطية.</div>' +
      (t.length ? '<div class="tablewrap"><table><thead><tr><th>النوع</th><th>الاسم</th><th>الرقم</th><th>حُذف بواسطة</th><th>التاريخ</th><th>ينتهي بعد</th><th></th></tr></thead><tbody>' +
        t.map(function (x) {
          var left = Math.max(0, Math.ceil(TRASH_DAYS - (Date.now() - Date.parse(x.at)) / DAY));
          return '<tr><td>' + e(TYPES[x.type] || x.type) + '</td><td><b>' + e(nameOf(x.data)) + '</b></td><td>' + e(x.data.no || x.data.caseNo || '') + '</td><td>' + e(x.by) + '</td><td>' + e(new Date(x.at).toLocaleString('ar-EG')) + '</td><td>' + left + ' يوم</td>' +
            '<td><button class="primary" onclick="V30.restore(\'' + e(x.tid) + '\')">↩ استرجاع</button>' + (isAdmin() ? ' <button class="danger" onclick="V30.purge(\'' + e(x.tid) + '\')">حذف نهائي</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">السلة فارغة.</div>') + '</div>';
  };
  function restore(tid) {
    var t = trash(), i = t.findIndex(function (x) { return x.tid === tid; }); if (i < 0) return;
    var it = t[i], list = arr(it.type);
    if (!list) return alert('نوع غير معروف');
    if (list.some(function (x) { return x.id === it.data.id; })) { t.splice(i, 1); save(); return renderTrash30(); }
    var d = it.data; if (it.type === 'cases') d = Object.assign({ family: [], aid: [], docs: [], visits: [], needs: [] }, d);
    list.unshift(d); t.splice(i, 1); save(); renderAll(); renderTrash30(); toast('تم الاسترجاع');
  }
  function purge(tid) {
    if (!isAdmin()) return;
    if (!confirm('حذف نهائي لا رجعة فيه. متأكد؟')) return;
    ex().trash = trash().filter(function (x) { return x.tid !== tid; }); save(); renderTrash30();
  }

  /* ==========================================================
     2) تنبيهات الرئيسية
     ========================================================== */
  var bkStatus = null, bkAt = 0;
  function lastAct(c) {
    var t = Date.parse(c.created) || 0;
    (c.aid || []).forEach(function (a) { var x = Date.parse(a.date); if (x > t) t = x; });
    (c.visits || []).forEach(function (v) { var x = Date.parse(v.date); if (x > t) t = x; });
    return t;
  }
  function computeAlerts() {
    var out = [], now = Date.now(), td = today();
    var closed = function (c) { return c.fileStatus === 'مرفوض' || c.fileStatus === 'موقوف'; };
    var stale = [], pend = [], over = [];
    (cases || []).forEach(function (c) {
      if (closed(c)) return;
      var la = lastAct(c);
      if (la && now - la > 365 * DAY) stale.push({ c: c, days: Math.floor((now - la) / DAY) });
      if (c.fileStatus === 'تحت المراجعة') { var cr = Date.parse(c.created); if (cr && now - cr > 3 * DAY) pend.push({ c: c, days: Math.floor((now - cr) / DAY) }); }
      var vs = (c.visits || []).slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      if (vs[0] && vs[0].next && vs[0].next < td) over.push({ c: c, days: Math.floor((now - Date.parse(vs[0].next)) / DAY) });
    });
    if (over.length) out.push({ k: 'over', ic: '🏠', t: 'زيارات متابعة فات موعدها', items: over.sort(function (a, b) { return b.days - a.days; }), note: function (x) { return 'متأخرة ' + x.days + ' يوم'; } });
    if (pend.length) out.push({ k: 'pend', ic: '📨', t: 'طلبات تحت المراجعة أكثر من 3 أيام', items: pend.sort(function (a, b) { return b.days - a.days; }), note: function (x) { return 'منذ ' + x.days + ' يوم'; } });
    if (stale.length) out.push({ k: 'stale', ic: '🕰️', t: 'حالات بلا أي نشاط منذ أكثر من سنة', items: stale.sort(function (a, b) { return b.days - a.days; }), note: function (x) { return 'آخر نشاط منذ ' + x.days + ' يوم'; } });
    if (can('donations')) {
      var nr = (donations || []).filter(function (d) { return +d.amount > 0 && !d.officialNo && String(d.date) >= new Date(now - 30 * DAY).toISOString().slice(0, 10); }).length;
      if (nr) out.push({ k: 'rcp', ic: '🧾', t: 'تبرعات نقدية آخر 30 يومًا بدون إيصال رسمي', count: nr, go: 'donations' });
    }
    if (isAdmin() && bkStatus) {
      var la2 = Math.max(Date.parse(bkStatus.last_external) || 0, Date.parse(bkStatus.last_manual) || 0);
      if (!la2 || now - la2 > 7 * DAY) out.push({ k: 'bk', ic: '☁️', t: la2 ? 'آخر نسخة احتياطية خارجية/يدوية منذ ' + Math.floor((now - la2) / DAY) + ' يوم' : 'لم تُؤخذ نسخة احتياطية خارجية بعد', count: 1, go: 'backups' });
    }
    return out;
  }
  function renderAlerts() {
    var host = document.querySelector('#sumAside .sum-body'); if (!host || !session) return;
    var box = g('alerts30');
    if (!box) { box = document.createElement('div'); box.id = 'alerts30'; box.className = 'card side-card'; var sp = host.querySelector('.summary-panel'); if (sp) sp.insertAdjacentElement('afterend', box); else host.prepend(box); }
    var al = computeAlerts();
    box.innerHTML = '<h2>⏰ تنبيهات تحتاج متابعة</h2>' + (al.length ? al.map(function (a) {
      var n = a.items ? a.items.length : a.count;
      return '<div style="padding:8px 0;border-bottom:1px solid #eef4ef"><button type="button" class="text-button" style="width:100%;text-align:right" onclick="V30.alert(\'' + a.k + '\')">' + a.ic + ' ' + e(a.t) + ' <b style="background:#fde8e8;color:#9b2c20;border-radius:20px;padding:1px 8px">' + num(n) + '</b></button></div>';
    }).join('') : '<div class="empty" style="padding:10px">لا توجد تنبيهات 👍</div>');
    window.__alerts30 = al;
  }
  function showAlert(k) {
    var a = (window.__alerts30 || []).find(function (x) { return x.k === k; }); if (!a) return;
    if (a.go) { V16.go(a.go); return; }
    modal('<div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">' + a.ic + ' ' + e(a.t) + ' (' + a.items.length + ')</h3><button class="secondary" onclick="V30.close()">إغلاق ✕</button></div>' +
      '<div style="margin-top:10px;max-height:65vh;overflow:auto">' + a.items.slice(0, 200).map(function (x) {
        return '<button type="button" class="secondary" style="display:block;width:100%;text-align:right;margin-bottom:6px" onclick="V30.close();openDetail(\'' + e(x.c.id) + '\')"><b>' + e(x.c.name) + '</b> <small>(' + e(x.c.no) + ')</small> — <small>' + e(a.note(x)) + '</small></button>';
      }).join('') + '</div>');
  }
  async function loadBackupStatus() {
    if (!isAdmin() || Date.now() - bkAt < 600000) return; bkAt = Date.now();
    try { bkStatus = await rpc('backup_external_status'); renderAlerts(); } catch (x) { /* SQL الإصدار 30 غير مثبت بعد */ }
  }

  /* ==========================================================
     3) لوحة الأرقام
     ========================================================== */
  function hbars(rows, color, fmt) {
    if (!rows.length) return '<div class="empty">لا توجد بيانات.</div>';
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; })) || 1;
    return rows.map(function (r) {
      return '<div style="display:grid;grid-template-columns:minmax(80px,32%) 1fr auto;gap:8px;align-items:center;margin:5px 0;font-size:13px"><span>' + e(r[0]) + '</span><div style="background:#eef4ef;border-radius:8px;height:16px"><div style="width:' + Math.max(2, r[1] / max * 100) + '%;background:' + color + ';height:16px;border-radius:8px"></div></div><b>' + (fmt ? fmt(r[1]) : num(r[1])) + '</b></div>';
    }).join('');
  }
  function vbars(rows, color, fmt) {
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; })) || 1;
    return '<div style="display:flex;gap:6px;align-items:flex-end;height:170px;direction:ltr">' + rows.map(function (r) {
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;min-width:0"><small style="font-size:10px;color:#587">' + (r[1] ? (fmt ? fmt(r[1]) : num(r[1])) : '') + '</small><div title="' + e(r[0]) + '" style="width:100%;max-width:34px;background:' + color + ';border-radius:6px 6px 0 0;height:' + Math.max(r[1] ? 3 : 0, r[1] / max * 130) + 'px"></div><small style="font-size:10px;color:#587;margin-top:3px">' + e(r[0].slice(5)) + '</small></div>';
    }).join('') + '</div>';
  }
  function months(n) { var o = [], d = new Date(); d.setDate(1); for (var i = n - 1; i >= 0; i--) { var x = new Date(d.getFullYear(), d.getMonth() - i, 1); o.push(x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0')); } return o; }
  function dashData() {
    var ms = months(12), don = {}, dis = {}, area = {}, need = {}, prio = {}, aidT = {}, donors = {};
    ms.forEach(function (m) { don[m] = 0; dis[m] = 0; });
    (donations || []).forEach(function (d) { var m = String(d.date).slice(0, 7); if (m in don) don[m] += +d.amount || 0; if (+d.amount > 0) donors[d.donor] = (donors[d.donor] || 0) + (+d.amount); });
    (distributions || []).forEach(function (d) { var m = String(d.date).slice(0, 7); if (m in dis) dis[m] += 1; aidT[d.type || '—'] = (aidT[d.type || '—'] || 0) + 1; });
    (cases || []).forEach(function (c) { var a = (c.area || 'غير محدد').trim() || 'غير محدد'; area[a] = (area[a] || 0) + 1; (c.needs || []).forEach(function (n) { need[n] = (need[n] || 0) + 1; }); prio[c.priority || '—'] = (prio[c.priority || '—'] || 0) + 1; });
    var top = function (o, n) { return Object.keys(o).map(function (k) { return [k, o[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, n); };
    return { ms: ms, don: ms.map(function (m) { return [m, don[m]]; }), dis: ms.map(function (m) { return [m, dis[m]]; }), area: top(area, 10), need: top(need, 10), prio: top(prio, 6), aid: top(aidT, 8), donors: top(donors, 8) };
  }
  window.renderDash30 = function () {
    var D = dashData(), tot = (donations || []).reduce(function (s, d) { return s + (+d.amount || 0); }, 0);
    var members = (cases || []).reduce(function (s, c) { return s + (+c.members || 0); }, 0);
    var kp = function (l, v) { return '<div class="stat"><span>' + l + '</span><b>' + v + '</b></div>'; };
    g('dash30').innerHTML =
      '<div style="' + ST + '"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center"><h2 style="margin:0">📊 لوحة الأرقام</h2><div><button class="secondary" onclick="V30.dashXls()">⬇ تنزيل Excel</button> <button class="secondary" onclick="V30.dashPrint()">🖨 طباعة / PDF</button></div></div>' +
      '<div class="grid" style="margin-top:10px">' + kp('عدد الحالات', num(cases.length)) + kp('أفراد الأسر المستفيدة', num(members)) + kp('إجمالي التبرعات', num(tot) + ' ج.م') + kp('عمليات التوزيع المسجلة', num(distributions.length)) + '</div></div>' +
      '<div id="dash30body"><div style="' + ST + '"><h3 style="margin-top:0">التبرعات النقدية — آخر 12 شهرًا (ج.م)</h3>' + vbars(D.don, '#16864b') + '</div>' +
      '<div style="' + ST + '"><h3 style="margin-top:0">عمليات التوزيع — آخر 12 شهرًا (عدد)</h3>' + vbars(D.dis, '#f2a516') + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px"><div style="' + ST + '"><h3 style="margin-top:0">الحالات حسب المنطقة (أعلى 10)</h3>' + hbars(D.area, '#1d7fd1') + '</div>' +
      '<div style="' + ST + '"><h3 style="margin-top:0">الحالات حسب الاحتياج</h3>' + hbars(D.need, '#7a52c7') + '</div>' +
      '<div style="' + ST + '"><h3 style="margin-top:0">الحالات حسب الأولوية</h3>' + hbars(D.prio, '#d9365a') + '</div>' +
      '<div style="' + ST + '"><h3 style="margin-top:0">التوزيع حسب النوع</h3>' + hbars(D.aid, '#e0762a') + '</div>' +
      '<div style="' + ST + '"><h3 style="margin-top:0">أكبر المتبرعين</h3>' + hbars(D.donors, '#16864b', function (v) { return num(v) + ' ج.م'; }) + '</div></div></div>';
  };
  function dashXls() {
    if (typeof XLSX === 'undefined') return alert('مكتبة Excel غير محمّلة. تأكد من الاتصال بالإنترنت.');
    var D = dashData(), wb = XLSX.utils.book_new(), add = function (n, rows) { XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), n); };
    add('ملخص', [['البند', 'القيمة'], ['عدد الحالات', cases.length], ['إجمالي التبرعات', (donations || []).reduce(function (s, d) { return s + (+d.amount || 0); }, 0)], ['عمليات التوزيع', distributions.length]]);
    add('تبرعات شهرية', [['الشهر', 'المبلغ']].concat(D.don)); add('توزيع شهري', [['الشهر', 'العدد']].concat(D.dis));
    add('حسب المنطقة', [['المنطقة', 'العدد']].concat(D.area)); add('حسب الاحتياج', [['الاحتياج', 'العدد']].concat(D.need));
    add('أكبر المتبرعين', [['المتبرع', 'المبلغ']].concat(D.donors));
    XLSX.writeFile(wb, 'لوحة_الأرقام_' + today() + '.xlsx');
  }
  function dashPrint() {
    var w = window.open('', '_blank'); if (!w) return alert('اسمح بفتح نافذة الطباعة');
    w.document.write('<html dir="rtl"><meta charset="utf-8"><title>لوحة الأرقام</title><body style="font-family:Tahoma;padding:20px"><h2>جمعية الخير للجميع — لوحة الأرقام ' + e(today()) + '</h2>' + g('dash30body').innerHTML + '<script>onload=()=>print()<\/script></body></html>'); w.document.close();
  }

  /* ==========================================================
     4) الزيارات الميدانية
     ========================================================== */
  var HOUSING = ['جيد', 'متوسط', 'سيئ', 'سيئ جدًا / غير آدمي'];
  var INCOME = ['لا يوجد دخل', 'دخل غير ثابت', 'دخل ثابت محدود', 'دخل كافٍ'];
  var RECO = ['استمرار المساعدة', 'زيادة المساعدة', 'تخفيض / إيقاف المساعدة', 'تحويل لجهة أخرى', 'متابعة فقط'];
  function fvList() { var x = ex(); if (!Array.isArray(x.fieldVisits)) x.fieldVisits = []; return x.fieldVisits; }
  window.renderVisits30 = function () {
    var q = ((g('fv30q') || {}).value || '').toLowerCase(), l = fvList().filter(function (v) { return !q || (v.caseName + ' ' + v.caseNo + ' ' + v.by + ' ' + v.recommend).toLowerCase().indexOf(q) >= 0; });
    g('visits30').innerHTML = '<div style="' + ST + '"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center"><h2 style="margin:0">🏠 الزيارات الميدانية</h2><button class="primary" onclick="V30.fvNew()">+ زيارة جديدة</button></div>' +
      '<div class="toolbar" style="margin-top:10px"><input id="fv30q" placeholder="بحث باسم الحالة أو الباحث أو التوصية" value="' + e(q) + '" oninput="V30.fvRender()"></div>' +
      (l.length ? '<div class="tablewrap"><table><thead><tr><th>التاريخ</th><th>الحالة</th><th>الباحث</th><th>السكن</th><th>الدخل</th><th>التوصية</th><th>الزيارة القادمة</th><th>صور</th><th></th></tr></thead><tbody>' +
        l.map(function (v) { return '<tr><td>' + e(v.date) + '</td><td><b>' + e(v.caseName) + '</b> <small>(' + e(v.caseNo) + ')</small></td><td>' + e(v.by) + '</td><td>' + e(v.housing) + '</td><td>' + e(v.income) + '</td><td>' + e(v.recommend) + '</td><td>' + e(v.next || '-') + '</td><td>' + (v.photos || []).length + '</td><td><button class="secondary" onclick="V30.fvView(\'' + e(v.id) + '\')">عرض</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="empty">لا توجد زيارات مسجلة بعد.</div>') + '</div>';
    var inp = g('fv30q'); if (inp && q) { inp.focus(); inp.setSelectionRange(q.length, q.length); }
  };
  function sel(id, opts, val) { return '<select id="' + id + '">' + opts.map(function (o) { return '<option' + (o === val ? ' selected' : '') + '>' + e(o) + '</option>'; }).join('') + '</select>'; }
  function fvNew(caseId) {
    var c0 = caseId && cases.find(function (c) { return c.id === caseId; });
    var o = modal('<div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">زيارة ميدانية جديدة</h3><button class="secondary" onclick="V30.close()">إغلاق ✕</button></div>' +
      '<div class="formgrid" style="margin-top:10px">' +
      '<div class="field full"><label>الحالة *</label><input id="fvQ" placeholder="ابحث بالاسم أو الرقم أو الهاتف" oninput="V30.fvPick()" value="' + e(c0 ? c0.name : '') + '"><select id="fvCase" size="4" style="margin-top:6px;width:100%"></select></div>' +
      '<div class="field"><label>تاريخ الزيارة</label><input id="fvDate" type="date" value="' + today() + '"></div>' +
      '<div class="field"><label>الباحث / الزائر</label><input id="fvBy" value="' + e((session && (session.name || session.username)) || '') + '"></div>' +
      '<div class="field"><label>حالة السكن</label>' + sel('fvHousing', HOUSING) + '</div>' +
      '<div class="field"><label>حالة الدخل</label>' + sel('fvIncome', INCOME) + '</div>' +
      '<div class="field full"><label>الاحتياجات التي تأكدت منها في الزيارة</label><textarea id="fvVer" rows="2"></textarea></div>' +
      '<div class="field"><label>التوصية</label>' + sel('fvReco', RECO) + '</div>' +
      '<div class="field"><label>موعد الزيارة القادمة (اختياري)</label><input id="fvNext" type="date"></div>' +
      '<div class="field full"><label>ملاحظات</label><textarea id="fvNotes" rows="2"></textarea></div>' +
      '<div class="field full"><label>صور (حتى 6 صور — تُصغَّر تلقائيًا)</label><input id="fvPh" type="file" accept="image/*" multiple capture="environment"><div id="fvPhInfo" style="font-size:12px;color:#587"></div></div>' +
      '<div class="field full"><label>توقيع / بصمة صاحب الحالة (اختياري) — ارسم بإصبعك أو الماوس</label><canvas id="fvSig" width="420" height="150" style="border:1px dashed #9bb;border-radius:10px;touch-action:none;background:#fcfffd;max-width:100%"></canvas><div><button type="button" class="secondary" onclick="V30.sigClear()">مسح التوقيع</button></div></div>' +
      '</div><div style="display:flex;gap:8px;margin-top:10px"><button id="fvSave" class="primary" style="flex:2" onclick="V30.fvSave()">حفظ الزيارة</button><button class="secondary" style="flex:1" onclick="V30.close()">إلغاء</button></div>', 760);
    o.dataset.lock = '1'; fvPick(c0 && c0.id); sigInit();
    g('fvPh').addEventListener('change', function () { var n = this.files.length; g('fvPhInfo').textContent = n ? n + ' صورة محددة' + (n > 6 ? ' (سيُؤخذ أول 6 فقط)' : '') : ''; });
  }
  function fvPick(selId) {
    var q = ((g('fvQ') || {}).value || '').trim().toLowerCase(), s = g('fvCase'); if (!s) return;
    var l = (cases || []).filter(function (c) { return !q || (typeof caseMatch === 'function' ? caseMatch(c, q) : (c.name + c.no).toLowerCase().indexOf(q) >= 0); }).slice(0, 60);
    s.innerHTML = l.map(function (c) { return '<option value="' + e(c.id) + '"' + (c.id === selId ? ' selected' : '') + '>' + e(c.name) + ' — ' + e(c.no) + (c.phone ? ' — ' + e(c.phone) : '') + '</option>'; }).join('');
    if (!selId && l.length === 1) s.value = l[0].id;
  }
  var drawing = false;
  function sigInit() {
    var cv = g('fvSig'), x = cv.getContext('2d'); x.lineWidth = 2.5; x.lineCap = 'round'; x.strokeStyle = '#111'; cv.dataset.dirty = '';
    var pos = function (ev) { var r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) * cv.width / r.width, (ev.clientY - r.top) * cv.height / r.height]; };
    cv.addEventListener('pointerdown', function (ev) { drawing = true; cv.setPointerCapture(ev.pointerId); var p = pos(ev); x.beginPath(); x.moveTo(p[0], p[1]); });
    cv.addEventListener('pointermove', function (ev) { if (!drawing) return; var p = pos(ev); x.lineTo(p[0], p[1]); x.stroke(); cv.dataset.dirty = '1'; });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { cv.addEventListener(n, function () { drawing = false; }); });
  }
  function sigClear() { var cv = g('fvSig'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); cv.dataset.dirty = ''; }
  function shrink(file) {
    return new Promise(function (res) {
      if (!/^image\//.test(file.type)) return res(file);
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () {
        var m = 1600, s = Math.min(1, m / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        c.toBlob(function (b) { res(b || file); }, 'image/jpeg', 0.8);
      };
      img.onerror = function () { URL.revokeObjectURL(u); res(file); }; img.src = u;
    });
  }
  async function fvSave() {
    var cid = (g('fvCase') || {}).value, c = cases.find(function (x) { return x.id === cid; });
    if (!c) return alert('اختر الحالة أولًا.');
    var btn = g('fvSave'); btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
    try {
      var id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), photos = [], files = Array.prototype.slice.call(g('fvPh').files, 0, 6);
      var base = String(window.JKH_SUPABASE_URL || '').replace(/\/$/, '');
      for (var i = 0; i < files.length; i++) {
        btn.textContent = 'رفع الصورة ' + (i + 1) + ' من ' + files.length + '…';
        var b = await shrink(files[i]), path = 'visits/' + c.id + '/' + Date.now() + '_' + i + '.jpg';
        var r = await JKHDocs.upload(sb, 'case-documents', path, b, { contentType: 'image/jpeg', upsert: false });
        if (r.error) throw r.error;
        photos.push({ name: files[i].name, path: path, url: base + '/storage/v1/object/public/case-documents/' + encodeURI(path) });
      }
      var cv = g('fvSig'), rec = {
        id: id, caseId: c.id, caseNo: c.no, caseName: c.name, date: g('fvDate').value || today(), by: g('fvBy').value.trim(),
        housing: g('fvHousing').value, income: g('fvIncome').value, verified: g('fvVer').value.trim(), recommend: g('fvReco').value,
        next: g('fvNext').value, notes: g('fvNotes').value.trim(), photos: photos, sig: cv.dataset.dirty ? cv.toDataURL('image/png') : ''
      };
      fvList().unshift(rec);
      c.visits = c.visits || [];
      c.visits.unshift({ kind: 'زيارة ميدانية', date: rec.date, by: rec.by, note: 'سكن: ' + rec.housing + ' — دخل: ' + rec.income + (rec.verified ? ' — ' + rec.verified : ''), result: rec.recommend, next: rec.next, fv: id });
      await saveNow(); renderAll(); close(); renderVisits30(); toast('تم حفظ الزيارة');
    } catch (er) { alert('تعذر حفظ الزيارة: ' + errTxt(er)); btn.disabled = false; btn.textContent = 'حفظ الزيارة'; }
  }
  function fvView(id) {
    var v = fvList().find(function (x) { return x.id === id; }); if (!v) return;
    var row = function (l, t) { return t ? '<p style="margin:6px 0"><b>' + l + ':</b> ' + e(t) + '</p>' : ''; };
    modal('<div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">زيارة ' + e(v.caseName) + ' — ' + e(v.date) + '</h3><button class="secondary" onclick="V30.close()">إغلاق ✕</button></div>' +
      row('رقم الحالة', v.caseNo) + row('الباحث', v.by) + row('حالة السكن', v.housing) + row('حالة الدخل', v.income) + row('الاحتياجات المؤكدة', v.verified) + row('التوصية', v.recommend) + row('الزيارة القادمة', v.next) + row('ملاحظات', v.notes) +
      ((v.photos || []).length ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' + v.photos.map(function (p) { return '<a href="' + e(p.url) + '" target="_blank" rel="noopener"><img src="' + e(p.url) + '" alt="' + e(p.name) + '" style="width:130px;height:100px;object-fit:cover;border-radius:10px;border:1px solid #ddd"></a>'; }).join('') + '</div>' : '') +
      (v.sig ? '<div style="margin-top:10px"><b>توقيع صاحب الحالة:</b><br><img src="' + e(v.sig) + '" alt="توقيع" style="max-width:260px;border:1px dashed #9bb;border-radius:8px"></div>' : '') +
      '<div style="display:flex;gap:8px;margin-top:12px"><button class="secondary" onclick="V30.openCase(\'' + e(v.caseId) + '\')">فتح ملف الحالة</button>' + (isAdmin() ? '<button class="danger" onclick="V30.fvDel(\'' + e(v.id) + '\')">حذف الزيارة</button>' : '') + '</div>', 720);
  }
  function fvDel(id) {
    if (!isAdmin() || !confirm('حذف الزيارة وسجلها من ملف الحالة؟')) return;
    var v = fvList().find(function (x) { return x.id === id; });
    ex().fieldVisits = fvList().filter(function (x) { return x.id !== id; });
    var c = v && cases.find(function (x) { return x.id === v.caseId; }); if (c) c.visits = (c.visits || []).filter(function (x) { return x.fv !== id; });
    save(); renderAll(); close(); renderVisits30();
  }

  /* ==========================================================
     5) الإيصالات الرسمية المرقمة
     ========================================================== */
  window.JKH_verifyUrl = function (d) {
    var b = window.JKH_PUBLIC_URL || (/^https?:/.test(location.protocol) ? location.href : '');
    if (!b) return '';
    var u = new URL('verify.html', b); u.searchParams.set('no', d.officialNo); u.searchParams.set('c', d.officialCode); return u.href;
  };
  window.JKH_receiptExtra = function (d) {
    if (!d || !d.officialNo) return [];
    var u = window.JKH_verifyUrl(d);
    return ['🔖 إيصال رسمي رقم: ' + d.officialNo + ' (رمز التحقق: ' + d.officialCode + ')'].concat(u ? ['🔗 للتحقق من صحة الإيصال: ' + u] : []);
  };
  async function ensureOfficial(d) {
    if (!d || d.officialNo || !(+d.amount > 0)) return;
    try {
      var r = await rpc('receipt_issue', { p_donation_id: d.id, p_amount: +d.amount, p_donor: d.donor || '', p_date: /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : today() });
      d.officialNo = r.no; d.officialCode = r.code; save();
    } catch (er) { toast('تعذر إصدار رقم رسمي: ' + errTxt(er), 5000); }
  }
  if (window.V27 && V27.waReceipt) { var _wr = V27.waReceipt; V27.waReceipt = async function (id) { var d = donations.find(function (x) { return x.id === id; }); await ensureOfficial(d); return _wr.apply(this, arguments); }; }
  if (window.V16 && V16.rc) { var _rc = V16.rc; V16.rc = async function (id) { var d = donations.find(function (x) { return x.id === id; }); await ensureOfficial(d); return _rc.apply(this, arguments); }; }

  window.renderReceipts30 = async function () {
    var box = g('receipts30'); box.innerHTML = '<div style="' + ST + '">جارٍ التحميل…</div>';
    try {
      var l = await rpc('receipt_list', { p_limit: 300 });
      box.innerHTML = '<div style="' + ST + '"><h2 style="margin-top:0">🧾 الإيصالات الرسمية</h2><div class="notice">يُصدر الرقم الرسمي تلقائيًا عند الضغط على «📲 إيصال» في سجل التبرعات (مرة واحدة لكل تبرع، بترقيم تسلسلي سنوي لا يتكرر). يستطيع المتبرع التحقق من صحة الإيصال من صفحة verify.html بالرقم والرمز. الإلغاء لمدير النظام فقط ويبقى الرقم محفوظًا بحالة «ملغي».</div>' +
        (l.length ? '<div class="tablewrap"><table><thead><tr><th>الرقم</th><th>رمز التحقق</th><th>المبلغ</th><th>التاريخ</th><th>المتبرع</th><th>أصدره</th><th>الحالة</th><th></th></tr></thead><tbody>' +
          l.map(function (r) { return '<tr' + (r.cancelled ? ' style="opacity:.55"' : '') + '><td dir="ltr">' + e(r.no) + '</td><td dir="ltr">' + e(r.code) + '</td><td>' + num(r.amount) + ' ج.م</td><td>' + e(r.rdate) + '</td><td>' + e(r.donor_masked) + '</td><td>' + e(r.issued_by) + '</td><td>' + (r.cancelled ? '<span class="badge r">ملغي</span>' : '<span class="badge">ساري</span>') + '</td><td>' + (!r.cancelled && isAdmin() ? '<button class="danger" onclick="V30.rcCancel(\'' + e(r.no) + '\')">إلغاء</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="empty">لم يصدر أي إيصال رسمي بعد.</div>') + '</div>';
    } catch (er) { box.innerHTML = '<div style="' + ST + '">تعذر تحميل الإيصالات: ' + e(errTxt(er)) + '<br><small>تأكد من تنفيذ security_v30.sql.</small></div>'; }
  };
  async function rcCancel(no) {
    var why = prompt('سبب إلغاء الإيصال ' + no + '؟'); if (!why) return;
    try { await rpc('receipt_cancel', { p_no: no, p_reason: why }); var d = donations.find(function (x) { return x.officialNo === no; }); if (d) { delete d.officialNo; delete d.officialCode; save(); } renderReceipts30(); }
    catch (er) { alert('تعذر الإلغاء: ' + errTxt(er)); }
  }

  /* ==========================================================
     6) التحقق بخطوتين + حالة النسخ الاحتياطي (حقن في صفحات موجودة)
     ========================================================== */
  function renderTotpCard() {
    var host = g('users'); if (!host || !session) return;
    var c = g('totp30'); if (!c) { c = document.createElement('div'); c.id = 'totp30'; c.className = 'card'; host.appendChild(c); }
    var on = !!session.totp;
    c.innerHTML = '<h2>🔐 التحقق بخطوتين (2FA)</h2><div class="notice">يضيف رمزًا من تطبيق Google Authenticator أو Microsoft Authenticator عند الدخول. يُنصح به لحساب المدير وكل من يرى بيانات الحالات.</div>' +
      (on ? '<p>الحالة: <b style="color:#11663a">مفعّل ✔</b></p><div style="display:grid;gap:8px;max-width:420px"><input id="tp30pw" type="password" placeholder="كلمة المرور الحالية" autocomplete="current-password"><input id="tp30c" inputmode="numeric" maxlength="6" placeholder="رمز التطبيق الحالي"><button class="danger" onclick="V30.totpOff()">إيقاف التحقق بخطوتين</button></div>'
        : '<p>الحالة: <b>غير مفعّل</b></p><div id="tp30box"><button class="primary" onclick="V30.totpStart()">تفعيل التحقق بخطوتين</button></div>') +
      (isAdmin() ? '<hr style="margin:14px 0"><h3 style="margin:0 0 6px">إعادة ضبط التحقق بخطوتين لموظف (فقد هاتفه)</h3><div style="display:flex;gap:8px;flex-wrap:wrap;max-width:520px"><input id="tp30u" placeholder="اسم المستخدم" style="flex:1"><button class="secondary" onclick="V30.totpReset()">إعادة ضبط</button></div>' : '');
  }
  async function totpStart() {
    try {
      var r = await rpc('totp_setup_start'), s = r.secret.match(/.{1,4}/g).join(' ');
      g('tp30box').innerHTML = '<ol style="line-height:1.9"><li>افتح تطبيق المصادقة واختر «إضافة حساب» ثم «إدخال مفتاح الإعداد يدويًا».</li><li>اسم الحساب: أي اسم، والمفتاح (حروف كبيرة وأرقام):<div dir="ltr" style="font:700 18px monospace;background:#f1f7f3;padding:10px;border-radius:10px;user-select:all;text-align:center;margin:6px 0">' + e(s) + '</div></li><li>النوع: «مبني على الوقت». ثم اكتب الرمز المكوّن من 6 أرقام:</li></ol><div style="display:flex;gap:8px;max-width:360px"><input id="tp30c" inputmode="numeric" maxlength="6" placeholder="000000" style="flex:1"><button class="primary" onclick="V30.totpOn()">تفعيل</button></div><small>احتفظ بالمفتاح في مكان آمن؛ من يعرفه يستطيع توليد الرموز.</small>';
    } catch (er) { alert('تعذر البدء: ' + errTxt(er)); }
  }
  async function totpOn() { try { await rpc('totp_enable', { p_code: g('tp30c').value }); session.totp = true; toast('تم تفعيل التحقق بخطوتين'); renderTotpCard(); } catch (er) { alert(errTxt(er)); } }
  async function totpOff() {
    try { var r = await sb.rpc('totp_disable', { p_u: session.username, p_password: g('tp30pw').value, p_code: g('tp30c').value }); if (r.error) throw r.error; if (!r.data.ok) throw new Error(r.data.message); session.totp = false; toast('تم إيقاف التحقق بخطوتين'); renderTotpCard(); }
    catch (er) { alert(errTxt(er)); }
  }
  async function totpReset() { var u = (g('tp30u').value || '').trim(); if (!u) return; if (!confirm('إعادة ضبط التحقق بخطوتين للمستخدم ' + u + '؟')) return; try { var r = await rpc('totp_admin_reset', { p_target: u }); alert(r.reset ? 'تمت إعادة الضبط.' : 'المستخدم غير موجود.'); } catch (er) { alert(errTxt(er)); } }

  async function renderBackupCard() {
    var host = g('backups'); if (!host || !session) return;
    var c = g('bk30'); if (!c) { c = document.createElement('div'); c.id = 'bk30'; c.className = 'card'; c.style.marginTop = '12px'; host.appendChild(c); }
    var st = null; try { st = await rpc('backup_external_status'); bkStatus = st; bkAt = Date.now(); } catch (x) { }
    var f = function (t) { return t ? new Date(t).toLocaleString('ar-EG') : '—'; };
    c.innerHTML = '<h2>☁️ النسخ الاحتياطي الخارجي</h2><div class="notice">النسخ التلقائية أعلاه داخل نفس قاعدة البيانات. للحماية من فقدان المشروع كله: فعّل الجدولة اليومية (دالة backup-export — انظر README_الإصدار_30) أو نزّل نسخة كاملة بانتظام واحفظها خارج الجهاز.</div>' +
      (st ? '<p>آخر نسخة خارجية مجدولة: <b>' + e(f(st.last_external)) + '</b><br>آخر نسخة كاملة يدوية: <b>' + e(f(st.last_manual)) + '</b></p>' : '<p>تعذر قراءة الحالة (نفّذ security_v30.sql).</p>') +
      (isAdmin() ? '<button class="primary" onclick="V30.bkFull()">⬇ تنزيل نسخة كاملة (بيانات + سجل نشاط + إيصالات)</button> <small>الملف يحتوي بيانات شخصية حساسة — احفظه في مكان آمن.</small>' : '');
  }
  async function bkFull() {
    try { var d = await rpc('backup_full'); download('نسخة_كاملة_' + today() + '.json', 'application/json', JSON.stringify(d)); bkAt = 0; renderBackupCard(); }
    catch (er) { alert('تعذر التنزيل: ' + errTxt(er)); }
  }

  /* ==========================================================
     ربط كل شيء
     ========================================================== */
  function init() {
    if (!document.querySelector('main')) return;
    addPage('trash30', ''); addPage('dash30', ''); addPage('visits30', ''); addPage('receipts30', '');
    addNav('cases', ['visits30', 'الزيارات الميدانية', '🏠', 'نموذج زيارة بصور وتوقيع'], 'renderVisits30');
    addNav('cases', ['trash30', 'سلة المحذوفات', '🗑️', 'استرجاع ما حُذف خلال 30 يومًا'], 'renderTrash30');
    addNav('donations', ['receipts30', 'الإيصالات الرسمية', '🧾', 'مرقمة وقابلة للتحقق'], 'renderReceipts30');
    addNav('reports', ['dash30', 'لوحة الأرقام', '📊', 'رسوم ومقارنات وتصدير'], 'renderDash30');
    var _ra = window.renderAll;
    window.renderAll = function () { var r = _ra.apply(this, arguments); try { renderAlerts(); loadBackupStatus(); renderTotpCard(); } catch (x) { console.warn(x); } return r; };
    var _ru = window.renderUsers; if (typeof _ru === 'function') window.renderUsers = function () { var r = _ru.apply(this, arguments); try { renderTotpCard(); } catch (x) { } return r; };
    var _rb = window.renderBackups; if (typeof _rb === 'function') window.renderBackups = function () { var r = _rb.apply(this, arguments); try { renderBackupCard(); } catch (x) { } return r; };
    else window.renderBackups = renderBackupCard;
  }
  window.V30 = {
    close: close, restore: restore, purge: purge, alert: showAlert, dashXls: dashXls, dashPrint: dashPrint,
    fvNew: fvNew, fvPick: function () { fvPick(); }, fvSave: fvSave, fvView: fvView, fvDel: fvDel, fvRender: function () { renderVisits30(); }, sigClear: sigClear,
    openCase: function (id) { close(); V16.go('cases'); openDetail(id); },
    rcCancel: rcCancel, totpStart: totpStart, totpOn: totpOn, totpOff: totpOff, totpReset: totpReset, bkFull: bkFull,
    _test: { computeAlerts: computeAlerts, dashData: dashData, toTrash: toTrash }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
