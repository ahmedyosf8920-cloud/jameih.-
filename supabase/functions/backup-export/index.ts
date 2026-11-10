// جمعية الخير للجميع — الإصدار 30
// نسخة احتياطية خارجية مجدولة: تحفظ البيانات + سجل النشاط + الإيصالات في مخزن خاص "backups" (مستقل عن جداول القاعدة)
// وتُرسلها اختياريًا إلى رابط خارجي (BACKUP_WEBHOOK_URL) لتُحفظ خارج Supabase بالكامل (مثال: خدمة تخزين أو سكربت يرفعها لـ Drive).
// النشر:  supabase functions deploy backup-export --no-verify-jwt
// الأسرار (Supabase > Edge Functions > Secrets):  BACKUP_KEY  (مطلوب: كلمة طويلة عشوائية)،  BACKUP_WEBHOOK_URL (اختياري)،  BACKUP_KEEP_DAYS (اختياري، افتراضي 30)
// الاستدعاء المجدول: انظر jkh_cloud/supabase/backup_schedule_v30.sql
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const enc = new TextEncoder();
async function sameKey(a: string, b: string) {   // مقارنة بزمن ثابت تقريبًا
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const A = new Uint8Array(x), B = new Uint8Array(y); let d = 0;
  for (let i = 0; i < A.length; i++) d |= A[i] ^ B[i];
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const key = Deno.env.get("BACKUP_KEY") ?? "";
  const given = req.headers.get("x-backup-key") ?? "";
  if (key.length < 24 || !(await sameKey(given, key))) return new Response("unauthorized", { status: 401 });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const log = async (ok: boolean, bytes: number | null, note: string) =>
    await sb.from("backup_log").insert({ kind: "external", ok, bytes, note: note.slice(0, 300) });

  try {
    const [st, au, rc] = await Promise.all([
      sb.from("app_state").select("payload,updated_at").eq("id", 1).single(),
      sb.from("audit_log").select("id,at,username,action,details").order("id").limit(200000),
      sb.from("receipts").select("*").order("id").limit(200000),
    ]);
    if (st.error) throw new Error("state: " + st.error.message);
    const body = JSON.stringify({ exportedAt: new Date().toISOString(), kind: "external", state: st.data, audit: au.data ?? [], receipts: rc.data ?? [] });
    const bytes = enc.encode(body).length;

    // 1) مخزن خاص مستقل
    await sb.storage.createBucket("backups", { public: false }).catch(() => {});
    const name = `backup-${new Date().toISOString().slice(0, 10)}.json`;
    const up = await sb.storage.from("backups").upload(name, new Blob([body], { type: "application/json" }), { upsert: true });
    if (up.error) throw new Error("upload: " + up.error.message);

    // 2) حذف النسخ الأقدم من المدة المحددة
    const keepDays = Math.max(7, Number(Deno.env.get("BACKUP_KEEP_DAYS") ?? "30") || 30);
    const list = await sb.storage.from("backups").list("", { limit: 1000 });
    const cutoff = Date.now() - keepDays * 86400000;
    const old = (list.data ?? []).filter((f) => /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(f.name) && Date.parse(f.name.slice(7, 17)) < cutoff).map((f) => f.name);
    if (old.length) await sb.storage.from("backups").remove(old);

    // 3) إرسال خارجي اختياري
    let note = "storage";
    const hook = Deno.env.get("BACKUP_WEBHOOK_URL");
    if (hook) {
      const r = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json", "x-backup-name": name }, body });
      if (!r.ok) throw new Error("webhook " + r.status);
      note = "storage+webhook";
    }
    await log(true, bytes, note);
    return new Response(JSON.stringify({ ok: true, name, bytes, note }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    await log(false, null, String((e as Error).message ?? e));
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
