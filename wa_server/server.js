// خادم إرسال واتساب (غير رسمي - Baileys) لحملات الجمعية
// تشغيل فعلي:  node server.js      |  اختبار بلا واتساب:  npm run test:mock
import { mkdirSync } from 'node:fs';

const env = (k, d) => process.env[k] ?? d;
const MOCK        = env('MOCK', '') === '1';
// تنظيف القيم: يزيل علامات الاقتباس و; و. و/ الزائدة و /rest/v1 إن لصقتها بالخطأ
const clean = v => String(v || '').trim().replace(/^["']+|["']+$/g, '').replace(/[;.\s]+$/g, '');
const SB_URL      = clean(env('SUPABASE_URL', '')).replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SB_KEY      = clean(env('SUPABASE_SERVICE_KEY', ''));   // Service Role / Secret: على الخادم فقط!
const DAILY_LIMIT = +env('DAILY_LIMIT', 40);           // أقصى رسائل في اليوم
const MIN_DELAY   = +env('MIN_DELAY', 25);             // ثوانٍ
const MAX_DELAY   = +env('MAX_DELAY', 75);
const BATCH_SIZE  = +env('BATCH_SIZE', 10);            // بعد كل كذا رسالة استراحة أطول
const BATCH_REST  = [180, 360];                        // ثوانٍ (3-6 دقائق)
const WIN_START   = +env('WINDOW_START', 9);           // ساعة البدء (بتوقيت القاهرة)
const WIN_END     = +env('WINDOW_END', 21);
const TZ          = env('TZ_NAME', 'Africa/Cairo');
const MAX_FAILS   = +env('MAX_FAILS', 3);
const COUNTRY     = env('COUNTRY_CODE', '20');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand  = (a, b) => a + Math.random() * (b - a);
const log   = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- أدوات ----------
export function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = COUNTRY + d.slice(1);
  return d.length >= 10 && d.length <= 15 ? d : null;
}
function cairoParts(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now).map(x => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}
function dayStartISO() {            // بداية اليوم بتوقيت القاهرة (UTC ISO)
  const now = new Date(), c = cairoParts(now);
  const offset = Date.UTC(c.y, c.mo - 1, c.d, c.h, c.mi, c.s) - Math.floor(now / 1000) * 1000;
  return new Date(Date.UTC(c.y, c.mo - 1, c.d) - offset).toISOString();
}
const inWindow = () => { const h = cairoParts().h; return h >= WIN_START && h < WIN_END; };

// ---------- التخزين ----------
function supabaseStore() {
  if (!SB_URL || !SB_KEY) throw new Error('ضع SUPABASE_URL و SUPABASE_SERVICE_KEY');
  if (SB_KEY.startsWith('sb_publishable_') || SB_KEY.startsWith('sb_anon_'))
    throw new Error('هذا مفتاح عام (publishable/anon) ولا يصلح للخادم. استخدم المفتاح السري: Secret key (sb_secret_...) أو service_role.');
  // المفاتيح الجديدة sb_secret_ ليست JWT فتُرسل في apikey فقط
  const H = { apikey: SB_KEY, ...(SB_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${SB_KEY}` } : {}), 'Content-Type': 'application/json' };
  const rest = async (path, opt = {}) => {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...opt, headers: { ...H, ...(opt.headers || {}) } });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
    return r;
  };
  return {
    async heartbeat(connected) {
      await rest('wa_server?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ id: 1, last_seen: new Date().toISOString(), connected, daily_limit: DAILY_LIMIT }) });
    },
    async dayCount(sinceISO) {
      const r = await rest(`wa_queue?status=eq.sent&sent_at=gte.${sinceISO}&select=id&limit=1`,
        { headers: { Prefer: 'count=exact' } });
      return +(r.headers.get('content-range') || '0/0').split('/')[1] || 0;
    },
    async nextPending() {
      const r = await rest('wa_queue?status=eq.pending&order=attempts.asc,id.asc&limit=1');
      return (await r.json())[0] || null;
    },
    async update(id, patch) {
      await rest(`wa_queue?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    },
    async optedOut(phone) {
      const r = await rest(`wa_optout?phone=eq.${phone}&select=phone`);
      return (await r.json()).length > 0;
    },
    async addOptOut(phone) {
      await rest('wa_optout', { method: 'POST', body: JSON.stringify({ phone }),
        headers: { Prefer: 'resolution=ignore-duplicates' } });
    },
  };
}
function mockStore() {
  const q = [
    ['01001234567', 'مرحبًا ١'], ['01111111111', 'مرحبًا ٢'], ['01222222222', 'مرحبًا ٣'],
    ['01333333333', 'مرحبًا ٤'], ['123', 'رقم خاطئ'], ['01444444444', 'مرحبًا ٥'],
  ].map(([phone, body], i) => ({ id: i + 1, phone, body, status: 'pending', attempts: 0 }));
  const out = new Set(['201111111111']);
  return {
    q,
    async heartbeat() {},
    async dayCount(since) { return q.filter(m => m.status === 'sent' && m.sent_at >= since).length; },
    async nextPending() {
      return q.filter(m => m.status === 'pending')
        .sort((a, b) => a.attempts - b.attempts || a.id - b.id)[0] || null;
    },
    async update(id, patch) { Object.assign(q.find(m => m.id === id), patch); },
    async optedOut(p) { return out.has(p); },
    async addOptOut(p) { out.add(p); },
  };
}

// ---------- المرسِل ----------
async function mockSender() {
  return { ready: () => true, async send(phone, text) { log(`[MOCK] → ${phone}: ${text}`); } };
}
async function baileysSender(store) {
  const B = await import('@whiskeysockets/baileys');
  const makeWASocket = B.default.default || B.default;
  const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = B;
  const qrcode = (await import('qrcode-terminal')).default;
  const pino = (await import('pino')).default;
  const AUTH = env('AUTH_DIR', './auth_state');
  mkdirSync(AUTH, { recursive: true });

  let sock, ready = false;
  const OPTOUT = /^\s*(stop|unsubscribe|إيقاف|ايقاف|الغاء|إلغاء)\s*$/i;

  async function connect() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH);
    const { version } = await fetchLatestBaileysVersion();
    sock = makeWASocket({ version, auth: state, logger: pino({ level: 'silent' }),
                          markOnlineOnConnect: false });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr) { log('امسح الـ QR بالشريحة المخصصة للحملات:'); qrcode.generate(qr, { small: true }); }
      if (connection === 'open') { ready = true; log('واتساب متصل ✅'); }
      if (connection === 'close') {
        ready = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          log('تم تسجيل الخروج. احذف مجلد auth_state وأعد التشغيل لمسح QR جديد.'); process.exit(1);
        }
        log('انقطع الاتصال، إعادة المحاولة بعد 5 ث...'); setTimeout(connect, 5000);
      }
    });
    // الرد بكلمة "إيقاف" يضيف الرقم لقائمة عدم الإرسال
    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const m of messages) {
        if (m.key.fromMe) continue;
        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
        const jid = [m.key.remoteJidAlt, m.key.remoteJid].find(j => j?.endsWith('@s.whatsapp.net'));
        if (jid && OPTOUT.test(text)) {
          try { await store.addOptOut(jid.split('@')[0].split(':')[0]);
                await sock.sendMessage(m.key.remoteJid, { text: 'تم إيقاف الرسائل. شكرًا لكم.' }); }
          catch (e) { log('optout error', e.message); }
        }
      }
    });
  }
  await connect();

  return {
    ready: () => ready,
    async send(phone, text) {
      while (!ready) await sleep(1000);
      const jid = `${phone}@s.whatsapp.net`;
      const r = await sock.onWhatsApp(jid);
      if (!r?.[0]?.exists) { const e = new Error('NOT_ON_WHATSAPP'); e.skip = true; throw e; }
      await sock.sendPresenceUpdate('composing', jid);
      await sleep(rand(1500, 4000) + text.length * 30);   // محاكاة كتابة
      await sock.sendMessage(jid, { text });
      await sock.sendPresenceUpdate('paused', jid);
    },
  };
}

// ---------- الحلقة الرئيسية ----------
async function main() {
  const store = MOCK ? mockStore() : supabaseStore();
  const sender = MOCK ? await mockSender() : await baileysSender(store);
  log(`بدأ الخادم | حد يومي=${DAILY_LIMIT} | فاصل ${MIN_DELAY}-${MAX_DELAY}ث | نافذة ${WIN_START}-${WIN_END} ${TZ}${MOCK ? ' | MOCK' : ''}`);
  let sinceRest = 0;
  if (!MOCK) {                       // نبضة كل 30 ثانية تظهر في شاشة الطابور داخل البرنامج
    const hb = () => store.heartbeat(sender.ready()).catch(e => log('heartbeat:', e.message));
    hb(); setInterval(hb, 30_000);
  }

  while (true) {
    if (!MOCK && !inWindow()) { await sleep(60_000); continue; }
    if (await store.dayCount(dayStartISO()) >= DAILY_LIMIT) {
      if (MOCK) { log('وصلنا للحد اليومي ✔'); break; }
      log('وصلنا للحد اليومي، ننتظر...'); await sleep(10 * 60_000); continue;
    }
    const m = await store.nextPending();
    if (!m) {
      if (MOCK) { log('الطابور فارغ ✔'); break; }
      await sleep(15_000); continue;
    }
    const phone = normalizePhone(m.phone);
    if (!phone)                      { await store.update(m.id, { status: 'skipped', error: 'INVALID_PHONE' }); continue; }
    if (await store.optedOut(phone)) { await store.update(m.id, { status: 'skipped', error: 'OPTED_OUT' });    continue; }

    try {
      await sender.send(phone, m.body);
      await store.update(m.id, { status: 'sent', sent_at: new Date().toISOString(), error: null });
      log(`تم #${m.id}`);
      sinceRest++;
    } catch (e) {
      if (e.skip) { await store.update(m.id, { status: 'skipped', error: e.message }); continue; }
      const attempts = (m.attempts || 0) + 1;
      await store.update(m.id, { attempts, error: String(e.message).slice(0, 200),
                                 status: attempts >= MAX_FAILS ? 'failed' : 'pending' });
      log(`فشل #${m.id} (${attempts}/${MAX_FAILS}):`, e.message);
    }

    // فاصل عشوائي + استراحة أطول بعد كل دفعة
    let wait = rand(MIN_DELAY, MAX_DELAY);
    if (sinceRest >= BATCH_SIZE) { wait = rand(...BATCH_REST); sinceRest = 0; log(`استراحة ${Math.round(wait)}ث`); }
    await sleep(wait * 1000);
  }
  if (MOCK) console.log('\nالحالة النهائية:', store.q.map(m => `#${m.id}:${m.status}${m.error ? '(' + m.error + ')' : ''}`).join('  '));
}
main().catch(e => { console.error(e); process.exit(1); });
