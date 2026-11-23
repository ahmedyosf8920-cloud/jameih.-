-- جمعية الخير للجميع | قفل الجدول القديم (الجزء ب) — الإصدار 25
-- لا تشغّله إلا بعد: (1) رفع الإصدار 25 (version.txt = 25)، (2) تسجيل الدخول والتأكد من ظهور الحالات
-- (3) تعديل أي حالة والتأكد من نجاح الحفظ. بعد تشغيله لن يعمل أي إصدار أقدم من 25.
-- لا يؤثر على: بوابة الحالات، متجر التبرعات، تسجيل المتطوعين (تعمل عبر دوال/Edge Functions).

drop policy if exists "cloud state read"  on public.app_state;
drop policy if exists "cloud state write" on public.app_state;
revoke all on public.app_state             from public, anon, authenticated;
revoke all on public.staff_users           from public, anon, authenticated;
revoke all on public.volunteer_applications from public, anon, authenticated;
-- متجر التبرعات يحتاج قراءة وإضافة الأقسام فقط
revoke truncate, delete, update, references, trigger on public.donation_departments from anon, authenticated;
