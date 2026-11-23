-- جمعية الخير للجميع | تغيير كلمة مرور المدير (بديل ملف تحديث_بيانات_الدخول.sql القديم)
-- 1) استبدل القيمتين بين علامتي الاقتباس بما تريد. لا ترفع هذا الملف بعد تعديله إلى أي مكان.
-- 2) شغّله في Supabase > SQL Editor ثم احذف النص من المحرر.
-- كلمة المرور: 12 حرفًا فأكثر، فيها حروف وأرقام ورموز، ولا تشبه أي كلمة استخدمتها من قبل.
do $$
declare v_old text := 'اسم_المستخدم_الحالي';
        v_new text := 'ضع_كلمتك';
begin
  if length(v_new) < 12 then raise exception 'اختر كلمة مرور من 12 حرفًا فأكثر'; end if;
  update public.staff_users set password_hash = public._pw_hash(v_new) where username = v_old;   -- يُنهي جلساته القديمة تلقائيًا
  if not found then raise exception 'المستخدم % غير موجود', v_old; end if;
end $$;
select name, username, role, active from public.staff_users order by role, username;
