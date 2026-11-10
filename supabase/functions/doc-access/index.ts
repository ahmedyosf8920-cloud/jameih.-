// جمعية الخير للجميع — الإصدار 29
// دالة Edge Function: تعطي الموظف المسجَّل روابط مؤقتة لقراءة المستندات الخاصة، وروابط رفع موقّعة.
// النشر:  supabase functions deploy doc-access --no-verify-jwt
//   (--no-verify-jwt ضروري لأن المفتاح العام الجديد sb_publishable_... ليس JWT؛ التحقق يتم هنا بتوكن جلسة الموظف.)
// المتغيرات SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY تُحقن تلقائيًا من Supabase ولا تضعها في الواجهة أبدًا.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const BUCKETS = new Set(["case-documents", "volunteer-docs"]);
const UPLOAD_BUCKET = "case-documents";
const UPLOAD_PREFIXES = ["cases/", "applications/", "board-minutes/", "organization-documents/", "visits/"];
const UPLOAD_EXT = /\.(pdf|png|jpe?g|gif|webp|heic|heif|xlsx?|csv)$/i;
const SIGN_SECONDS = 3600;
const MAX_ITEMS = 60;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const goodPath = (p: unknown): p is string =>
  typeof p === "string" && p.length > 0 && p.length < 400 && !p.startsWith("/") &&
  !p.split("/").some((s) => s === ".." || s === "." || s === "") && !/[\u0000-\u001f]/.test(p);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let b: any;
  try { b = await req.json(); } catch { return json({ error: "طلب غير صالح" }, 400); }

  const u = String(b?.u ?? "").trim();
  const p = String(b?.p ?? "");
  if (!u || !/^jkh_[0-9a-f]{48}$/.test(p)) return json({ error: "سجّل الدخول من جديد." }, 401);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // أي موظف نشط بجلسة سارية يُسمح له؛ _staff_role تُرجع الدور أو null
  const { data: role, error: authErr } = await sb.rpc("_staff_role", { p_u: u, p_p: p });
  if (authErr) return json({ error: "تعذر التحقق من الجلسة" }, 500);
  if (!role) return json({ error: "انتهت الجلسة، سجّل الدخول من جديد." }, 401);

  const action = String(b?.action ?? "");

  if (action === "sign") {
    const items = Array.isArray(b?.items) ? b.items.slice(0, MAX_ITEMS) : [];
    const byBucket = new Map<string, string[]>();
    for (const it of items) {
      if (!BUCKETS.has(it?.bucket) || !goodPath(it?.path)) continue;
      const l = byBucket.get(it.bucket) ?? [];
      l.push(it.path);
      byBucket.set(it.bucket, l);
    }
    const out: { bucket: string; path: string; url: string | null }[] = [];
    for (const [bucket, paths] of byBucket) {
      const { data, error } = await sb.storage.from(bucket).createSignedUrls(paths, SIGN_SECONDS);
      if (error) return json({ error: "تعذر إنشاء الروابط" }, 500);
      for (const r of data ?? []) out.push({ bucket, path: r.path ?? "", url: r.error ? null : r.signedUrl });
    }
    return json({ urls: out, expires_in: SIGN_SECONDS });
  }

  if (action === "upload") {
    const bucket = String(b?.bucket ?? "");
    const path = b?.path;
    if (bucket !== UPLOAD_BUCKET || !goodPath(path)) return json({ error: "مسار غير مسموح" }, 400);
    if (!UPLOAD_PREFIXES.some((x) => path.startsWith(x))) return json({ error: "مسار غير مسموح" }, 400);
    if (!UPLOAD_EXT.test(path)) return json({ error: "نوع الملف غير مسموح (PDF أو صور أو Excel أو CSV فقط)" }, 400);
    const { data, error } = await sb.storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data) return json({ error: "تعذر إنشاء رابط الرفع (قد يكون الملف موجودًا بنفس الاسم)" }, 400);
    return json({ path: data.path, token: data.token });
  }

  return json({ error: "إجراء غير معروف" }, 400);
});
