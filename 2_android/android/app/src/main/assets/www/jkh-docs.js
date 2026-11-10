/* جمعية الخير للجميع — الإصدار 29
   وصول آمن لمستندات المخازن الخاصة (case-documents / volunteer-docs):
   - أي رابط عام قديم (…/storage/v1/object/public/<bucket>/<path>) يُحوَّل عند الفتح إلى رابط مؤقت من دالة doc-access.
   - رفع مستندات الموظفين يتم برابط رفع موقّع بدل الرفع المجهول.
   إن لم تكن دالة doc-access منشورة بعد (أو المخزن ما زال عامًا) يعمل كل شيء كما في الإصدار 28. */
(function () {
  'use strict';
  var PUB = /\/storage\/v1\/object\/public\/(case-documents|volunteer-docs)\/([^?#]+)/;
  var cache = {};            // key -> {url, exp}
  var failed = {};           // key -> time of failure (لا نعيد المحاولة كل لحظة)

  function base() { return String(window.JKH_SUPABASE_URL || '').replace(/\/$/, ''); }
  function cred() {
    try {
      if (window.__inboxCred) return window.__inboxCred;
      if (window.parent && window.parent !== window && window.parent.__inboxCred) return window.parent.__inboxCred;
    } catch (e) {}
    return null;
  }
  function parse(url) {
    var m = PUB.exec(String(url || ''));
    if (!m) return null;
    var p = m[2];
    try { p = decodeURIComponent(p); } catch (e) {}
    return { bucket: m[1], path: p };
  }
  async function call(body) {
    var c = cred();
    if (!c || !c.tok) throw new Error('NOAUTH');
    var r = await fetch(base() + '/functions/v1/doc-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: window.JKH_SUPABASE_ANON_KEY },
      body: JSON.stringify(Object.assign({ u: c.u, p: c.p }, body))
    });
    var d = null; try { d = await r.json(); } catch (e) {}
    if (!r.ok) { var er = new Error((d && d.error) || 'تعذر الوصول للمستند'); er.status = r.status; throw er; }
    return d;
  }

  // يرجع رابطًا صالحًا للفتح: موقّعًا إن أمكن وإلا الرابط الأصلي
  async function resolve(url) {
    var x = parse(url);
    if (!x) return url;
    var key = x.bucket + '/' + x.path, now = Date.now();
    if (cache[key] && cache[key].exp > now) return cache[key].url;
    if (failed[key] && now - failed[key] < 60000) return url;
    try {
      var d = await call({ action: 'sign', items: [{ bucket: x.bucket, path: x.path }] });
      var it = (d.urls || [])[0];
      if (it && it.url) { cache[key] = { url: it.url, exp: now + 50 * 60 * 1000 }; return it.url; }
    } catch (e) { /* قد يكون المخزن عامًا بعد أو الدالة غير منشورة */ }
    failed[key] = now;
    return url;
  }

  // رفع: يرجع نفس شكل supabase-js {data:{path}, error}
  async function upload(sb, bucket, path, file, opts) {
    opts = opts || {};
    var c = cred();
    if (c && c.tok) {
      try {
        var d = await call({ action: 'upload', bucket: bucket, path: path });
        var up = await sb.storage.from(bucket).uploadToSignedUrl(d.path, d.token, file,
          opts.contentType ? { contentType: opts.contentType } : undefined);
        if (up.error) return { data: null, error: up.error };
        return { data: { path: d.path }, error: null };
      } catch (e) {
        // دالة الرفع غير منشورة بعد → الرفع المباشر القديم (يعمل ما دامت سياسة الرفع موجودة)
        if (!(e && (e.status === undefined || e.status >= 500 || e.status === 404))) return { data: null, error: e };
      }
    }
    return sb.storage.from(bucket).upload(path, file, opts);
  }

  // ===== تحويل الصور والروابط في الصفحة تلقائيًا =====
  async function fixImg(img) {
    var s = img.getAttribute('src');
    if (!s || img.dataset.jkhSigned || !parse(s)) return;
    img.dataset.jkhSigned = '1';
    var u = await resolve(s);
    if (u !== s) img.src = u;
  }
  function scan(root) {
    try {
      (root.querySelectorAll ? root.querySelectorAll('img[src*="/storage/v1/object/public/"]') : []).forEach(fixImg);
      if (root.tagName === 'IMG') fixImg(root);
    } catch (e) {}
  }
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a || !parse(a.getAttribute('href'))) return;
    var c = cred(); if (!c || !c.tok) return;           // بدون جلسة توكن نترك السلوك الأصلي
    ev.preventDefault();
    var w = window.open('', '_blank');                   // نفتح النافذة فورًا حتى لا يمنعها المتصفح
    resolve(a.href).then(function (u) {
      if (w) { try { w.opener = null; } catch (e) {} w.location.href = u; } else { location.href = u; }
    });
  }, true);
  function start() {
    scan(document);
    try {
      new MutationObserver(function (ms) {
        ms.forEach(function (m) {
          m.addedNodes && m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); });
          if (m.type === 'attributes') fixImg(m.target);
        });
      }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.JKHDocs = { resolve: resolve, upload: upload, parse: parse };
})();
