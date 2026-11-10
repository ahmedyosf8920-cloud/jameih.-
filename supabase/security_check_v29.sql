-- جمعية الخير للجميع | فحص أمني للقراءة فقط (لا يغيّر شيئًا). شغّل كل استعلام وراجع النتيجة.

-- 1) هل ما زال anon يستطيع قراءة/كتابة الجداول الحساسة؟ (المطلوب: لا صفوف)
select table_name, privilege_type, grantee
  from information_schema.role_table_grants
 where table_schema='public' and grantee in ('anon','authenticated')
   and table_name in ('app_state','staff_users','staff_sessions','login_attempts','audit_log','app_state_backups','volunteer_applications','security_config')
 order by 1,2;

-- 2) سياسات app_state (المطلوب: لا شيء أو سياسات مقيّدة، وليس using(true))
select policyname, cmd, qual from pg_policies where schemaname='public' and tablename='app_state';

-- 3) المخازن: public يجب أن تكون false للمستندات الحساسة بعد storage_private_v29.sql
select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id;

-- 4) سياسات التخزين المفتوحة
select policyname, cmd, roles, with_check from pg_policies where schemaname='storage' and tablename='objects';

-- 5) الحسابات: هاش قديم SHA-256 (غير مملّح) أم bcrypt، وهل الحساب الافتراضي موجود؟
select username, role, active,
       case when password_hash like '$2%' then 'bcrypt' else 'sha256 (قديم)' end as hash_type, last_seen
  from staff_users order by role, username;

-- 6) دوال ما زالت تقارن SHA-256 مباشرة أو تذكر password_hash (راجعها يدويًا)
select p.proname
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f'
   and pg_get_functiondef(p.oid) ~* 'password_hash'
   and pg_get_functiondef(p.oid) !~ '_cred_ok|_pw_verify|_pw_hash'
 order by 1;

-- 7) الدوال المتاحة لـ anon (للمراجعة): يجب ألا تظهر دوال تبدأ بـ _ أو دوال إدارة الجداول
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f' and has_function_privilege('anon', p.oid, 'execute')
 order by 1;

-- 8) إعدادات الأمان الحالية
select * from security_config;
