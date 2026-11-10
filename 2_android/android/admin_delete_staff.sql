-- شغّل هذا الملف في Supabase SQL Editor مرة واحدة.
-- يحذف حساب staff_users بعد التحقق من اسم وكلمة مرور مدير النظام.
create or replace function public.admin_delete_staff(
  p_staff_username text,
  p_admin_username text,
  p_admin_password text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin public.staff_users%rowtype;
  v_deleted integer;
begin
  if nullif(trim(p_staff_username), '') is null
     or nullif(trim(p_admin_username), '') is null
     or nullif(p_admin_password, '') is null then
    return jsonb_build_object('success', false, 'message', 'بيانات التأكيد غير مكتملة.');
  end if;

  select * into v_admin
  from public.staff_users
  where username = trim(p_admin_username)
    and active = true
    and role = 'مدير النظام'
    and password_hash = encode(digest(p_admin_password, 'sha256'), 'hex');

  if not found then
    return jsonb_build_object('success', false, 'message', 'كلمة مرور المدير غير صحيحة أو الحساب غير مخوّل.');
  end if;

  if lower(trim(p_staff_username)) = 'admin' then
    return jsonb_build_object('success', false, 'message', 'لا يمكن حذف حساب المدير الافتراضي.');
  end if;

  delete from public.staff_users
  where username = trim(p_staff_username);
  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'success', true,
    'deleted', (v_deleted > 0),
    'username', trim(p_staff_username)
  );
end;
$$;

revoke all on function public.admin_delete_staff(text, text, text) from public;
grant execute on function public.admin_delete_staff(text, text, text) to anon, authenticated;
