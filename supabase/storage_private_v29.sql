-- جمعية الخير للجميع | الإصدار 29 — جعل مخازن المستندات خاصة
-- لا تشغّله إلا بعد: (1) نشر دالة doc-access (README_الإصدار_29)، (2) رفع واجهة الإصدار 29،
-- (3) تجربة فتح مستند قديم ورفع مستند جديد من البرنامج.
-- بعده تتوقف الروابط العامة القديمة (المخزنة في البيانات) عن العمل خارج البرنامج، وتفتح من داخله عبر روابط مؤقتة.
-- للتراجع: update storage.buckets set public=true where id in ('case-documents','volunteer-docs');

update storage.buckets
   set public = false, file_size_limit = 15728640        -- 15MB
 where id = 'case-documents';

update storage.buckets
   set public = false, file_size_limit = 5242880,        -- 5MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
 where id = 'volunteer-docs';

-- لا رفع مجهول إلى مخزن الحالات: الموظف يرفع عبر رابط رفع موقّع من دالة doc-access بعد التحقق من التوكن.
drop policy if exists "case docs public upload" on storage.objects;
drop policy if exists "case docs public read"   on storage.objects;
drop policy if exists "case docs public delete" on storage.objects;
-- يبقى لتسجيل المتطوعين رفع مجهول إلى volunteer-docs فقط (مقيّد الآن بالحجم والنوع):
--   policy "vol docs upload" من volunteer_schema.sql
