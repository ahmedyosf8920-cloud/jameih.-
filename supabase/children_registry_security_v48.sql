-- جمعية الخير للجميع | الإصدار 48
-- عزل سجل الأطفال على مستوى Supabase RPC، وليس الواجهة فقط.
-- المتطلبات: security_v31.sql مطبق، وapp_state_put core concurrency موجود.
-- خذ نسخة احتياطية قبل التنفيذ. نفّذ الملف كاملًا من Supabase SQL Editor.

create or replace function public._can_access_children(p_u text, p_p text)
returns boolean
language plpgsql stable security definer set search_path=public, extensions as $$
declare r text; pm jsonb;
begin
  r := public._staff_role(p_u,p_p);
  if r is null then return false; end if;
  if r in ('مدير النظام','باحث اجتماعي') then return true; end if;
  select permissions into pm from public.staff_users where username=trim(p_u) and active=true;
  return coalesce(pm ? 'children',false);
end $$;
revoke all on function public._can_access_children(text,text) from public, anon, authenticated;

create or replace function public.app_state_get(p_u text, p_p text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare r record; pl jsonb;
begin
  if public._staff_role(p_u,p_p) is null then raise exception 'غير مصرح. سجّل الدخول من جديد.'; end if;
  select payload, updated_at into r from public.app_state where id=1;
  pl := coalesce(r.payload,'{}'::jsonb);
  if not public._can_access_children(p_u,p_p) then
    pl := jsonb_set(pl,'{extra}',(coalesce(pl->'extra','{}'::jsonb) - 'children'),true);
  end if;
  if public._cfg('pii_mask')='on' and not public._has_pii(p_u,p_p) then pl := public._pii_mask(pl); end if;
  return jsonb_build_object('payload',pl,'updated_at',r.updated_at);
end $$;
grant execute on function public.app_state_get(text,text) to anon, authenticated;

-- غير المخولين لا يستطيعون إضافة/تعديل/حذف بيانات الأطفال عبر إرسال payload معدل.
-- يحتفظ الخادم بنسخة سجل الأطفال الموجودة قبل حفظ بقية بيانات النظام.
create or replace function public.app_state_put(
  p_u text, p_p text, p_payload jsonb, p_base timestamptz default null
)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare masked boolean := false; can_children boolean; pl jsonb; old jsonb; res jsonb;
begin
  if public._staff_role(p_u,p_p) is null then raise exception 'غير مصرح. سجّل الدخول من جديد.'; end if;
  can_children := public._can_access_children(p_u,p_p);
  select payload into old from public.app_state where id=1;
  pl := coalesce(p_payload,'{}'::jsonb);
  if not can_children then
    pl := jsonb_set(pl,'{extra,children}',coalesce(old#>'{extra,children}','[]'::jsonb),true);
  end if;
  if public._cfg('pii_mask')='on' and not public._has_pii(p_u,p_p) then
    masked := true;
    pl := public._pii_restore(pl,old);
  end if;
  res := public._app_state_put_core(p_u,p_p,pl,p_base);
  if res ? 'conflict' then
    if not can_children then
      res := jsonb_set(res,'{payload}',(coalesce(res->'payload','{}'::jsonb) #- '{extra,children}'),true);
    end if;
    if masked then res := jsonb_set(res,'{payload}',public._pii_mask(res->'payload'),true); end if;
  elsif public._cfg('records_mirror')='on' then
    perform public._records_sync(pl);
  end if;
  return res;
end $$;
grant execute on function public.app_state_put(text,text,jsonb,timestamptz) to anon, authenticated;

-- تحقق بعد التنفيذ: مدير النظام والباحث الاجتماعي يريان السجل؛ بقية الأدوار لا تستلمه ولا يمكنها تغييره.
