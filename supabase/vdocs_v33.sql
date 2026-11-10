-- الإصدار 33: السماح للمتطوع المقبول بتنزيل شهادته واستمارته من صفحة «متابعة طلب سابق»
-- شغّله مرة واحدة في Supabase > SQL Editor (آمن لإعادة التنفيذ). لا يغيّر أي جدول.
-- الجديد: عند الحالة «مقبول» تُرجع الدالة بيانات الطلب (دون روابط صور البطاقة) + تاريخ التقديم.
create or replace function public.volunteer_track(p_nid text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare r volunteer_applications; v text := regexp_replace(coalesce(p_nid,''),'[^0-9]','','g');
begin
  select * into r from volunteer_applications where payload->>'national_id'=v order by created_at desc limit 1;
  if not found then return jsonb_build_object('found',false); end if;
  return jsonb_build_object('found',true,'code',r.code,'status',r.status,'reply',r.reply,
    'created_at',r.created_at,'updated_at',r.updated_at,
    'payload',case when r.status='مطلوب تعديل' then r.payload
                   when r.status='مقبول' then (r.payload - 'id_front' - 'id_back')
                   else null end);
end $$;
grant execute on function public.volunteer_track(text) to anon,authenticated;
