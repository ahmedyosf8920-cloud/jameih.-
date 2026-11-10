نسخة Windows — جمعية الخير للجميع (الإصدار 33)

تطبيق Electron يفتح نفس واجهة www المضمنة (مطابقة لـ jkh_cloud/web ولتطبيق Android)، وتتصل بنفس قاعدة Supabase حسب www/config.js.

التشغيل للتجربة (يلزم Node.js 18+):
  npm install
  npm start

بناء ملفات Windows (يفضّل على جهاز Windows):
  npm install
  npm run dist
النتيجة في مجلد dist: ملف تثبيت NSIS وملف Portable يعمل دون تثبيت.

عند تحديث الواجهة: انسخ محتوى jkh_cloud/web إلى www (دون _headers) ثم أعد البناء.
لم يُجرَّب على Windows حقيقي؛ فُحصت الصياغة والتشغيل في بيئة Linux.
ملاحظة: استيراد جهات الاتصال (زر الهاتف) خاص بـ Android ولا يعمل على Windows.
