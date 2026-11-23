-- جمعية الخير للجميع | الإصدار 29 — مفاتيح التشغيل (شغّل كل سطر منفصلًا وفي الوقت المناسب فقط)
-- الحالة الحالية: select * from security_config;

-- (1) بعد رفع واجهة الإصدار 29 وتأكدك أن الدخول يعمل من جهازين: امنع استخدام كلمة المرور في دوال البيانات (التوكن فقط).
--     تنبيه: صفحتا applicant-admin و donation-admin تستدعيان Edge Functions (applicant-portal / donation-store) لم تكن مصادرها في الحزمة.
--     جرّبهما أولًا؛ إن كانتا تتحققان من كلمة المرور بنفسهما فأرسل لي كود الدالتين لتعديلهما قبل تفعيل هذا السطر.
-- update security_config set value='off' where key='password_rpc';

-- (2) bcrypt: فعّله فقط بعد التأكد أن أي Edge Function لا تقارن SHA-256 من جدول staff_users مباشرة.
--     بعد التفعيل يُرقّى هاش كل مستخدم إلى bcrypt عند أول دخول ناجح له (ولا يمكن الرجوع تلقائيًا).
-- update security_config set value='on' where key='bcrypt';

-- للتراجع الكامل عن (1):
-- update security_config set value='on' where key='password_rpc';

-- ===== إضافة الإصدار 30 =====
-- (3) totp_strict: عند التفعيل تُرفض كلمة المرور وحدها في login_staff لمن فعّل التحقق بخطوتين (لإغلاق ثغرة الدوال القديمة التي تستعمل كلمة المرور مباشرة).
--     فعّله فقط بعد أن يعمل كل شيء بالتوكن (صفحتا applicant-admin و donation-admin) وبعد أن يفعّل المديرون التحقق بخطوتين.
-- update security_config set value='on' where key='totp_strict';
