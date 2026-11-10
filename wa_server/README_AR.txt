خادم واتساب للحملات (Baileys - غير رسمي) | مجاني | ملف واحد

1) Supabase: شغّل schema.sql في SQL Editor.
2) على جهاز/سيرفر دائم التشغيل (Node 18+):
     npm i @whiskeysockets/baileys qrcode-terminal pino
3) اختبار المنطق بلا واتساب:   npm run test:mock
4) التشغيل الفعلي:
     SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node server.js
   امسح QR بالشريحة المخصصة للحملات (واتساب > الأجهزة المرتبطة). تُحفظ الجلسة في auth_state/.
5) الإضافة للطابور من البرنامج:  insert into wa_queue(phone, body) values ('01xxxxxxxxx','نص الرسالة');

إعدادات (متغيرات بيئة): DAILY_LIMIT=40 MIN_DELAY=25 MAX_DELAY=75 BATCH_SIZE=10
WINDOW_START=9 WINDOW_END=21 MAX_FAILS=3 COUNTRY_CODE=20
تنبيهات: Service Role Key على الخادم فقط (لا تضعه في config.js). ابدأ بحد 15-20 يوميًا للشريحة الجديدة
وارفعه تدريجيًا. الرد بكلمة "إيقاف" يضيف الرقم لقائمة المنع تلقائيًا.

شاشة المتابعة: الخادم يرسل نبضة كل 30 ثانية لجدول wa_server، فتعرض صفحة «حملة الواتساب» في البرنامج
حالته (🟢 متصل / 🟡 واتساب غير متصل / 🔴 متوقف). أعد تشغيل schema.sql إن كنت شغّلت نسخته القديمة (آمن للتكرار).
