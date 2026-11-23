-- جمعية الخير للجميع | تسجيل المتطوعين (الإصدار 18) — المتابعة بالرقم القومي
-- نفّذ هذا الملف كاملًا مرة واحدة في Supabase > SQL Editor (آمن لإعادة التنفيذ)
create extension if not exists pgcrypto;

create table if not exists public.volunteer_applications (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  payload jsonb not null,
  status text not null default 'تحت المراجعة',   -- تحت المراجعة / مقبول / مرفوض / مطلوب تعديل
  reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.volunteer_applications drop column if exists token;
alter table public.volunteer_applications enable row level security;

drop function if exists public.volunteer_track(text,text);
drop function if exists public.volunteer_resubmit(text,text,jsonb);

-- مخزن صور البطاقات (مسارات عشوائية غير قابلة للتخمين)
insert into storage.buckets (id,name,public) values ('volunteer-docs','volunteer-docs',true)
on conflict (id) do update set public=true;
drop policy if exists "vol docs upload" on storage.objects;
create policy "vol docs upload" on storage.objects for insert to anon, authenticated with check (bucket_id='volunteer-docs');

create or replace function public.volunteer_submit(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare v_code text; v_nid text;
begin
  v_nid := regexp_replace(coalesce(p_payload->>'national_id',''),'[^0-9]','','g');
  if length(v_nid)<>14 then raise exception 'الرقم القومي يجب أن يتكون من 14 رقمًا'; end if;
  if coalesce(trim(p_payload->>'name'),'')='' or coalesce(trim(p_payload->>'phone'),'')='' then
    raise exception 'الاسم ورقم المحمول مطلوبان';
  end if;
  if length(p_payload::text) > 20000 then raise exception 'حجم البيانات كبير'; end if;
  if exists(select 1 from volunteer_applications where payload->>'national_id'=v_nid and status<>'مرفوض') then
    raise exception 'يوجد طلب مسجل بنفس الرقم القومي. تابع حالته من تبويب «متابعة طلب سابق».';
  end if;
  v_code := 'VOL-' || to_char(now(),'YY') || '-' || lpad((floor(random()*1000000))::int::text,6,'0');
  insert into volunteer_applications(code,payload) values (v_code, jsonb_set(p_payload,'{national_id}',to_jsonb(v_nid)));
  return jsonb_build_object('code',v_code);
end $$;

create or replace function public.volunteer_track(p_nid text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare r volunteer_applications; v text := regexp_replace(coalesce(p_nid,''),'[^0-9]','','g');
begin
  select * into r from volunteer_applications where payload->>'national_id'=v order by created_at desc limit 1;
  if not found then return jsonb_build_object('found',false); end if;
  return jsonb_build_object('found',true,'code',r.code,'status',r.status,'reply',r.reply,'updated_at',r.updated_at,
    'payload',case when r.status='مطلوب تعديل' then r.payload else null end);
end $$;

create or replace function public.volunteer_resubmit(p_nid text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare r volunteer_applications; v text := regexp_replace(coalesce(p_nid,''),'[^0-9]','','g');
begin
  select * into r from volunteer_applications where payload->>'national_id'=v order by created_at desc limit 1;
  if not found then raise exception 'لا يوجد طلب بهذا الرقم القومي'; end if;
  if r.status<>'مطلوب تعديل' then raise exception 'لا يمكن تعديل الطلب إلا إذا طلبت الجمعية تعديله'; end if;
  update volunteer_applications set payload=jsonb_set(p_payload,'{national_id}',to_jsonb(v)),status='تحت المراجعة',updated_at=now() where id=r.id;
  return jsonb_build_object('ok',true,'code',r.code);
end $$;

create or replace function public._vol_staff_ok(p_u text, p_p text)
returns boolean language sql security definer set search_path=public, extensions as $$
  select exists(select 1 from staff_users where username=trim(p_u) and active
    and password_hash=encode(digest(p_p,'sha256'),'hex')
    and role in ('مدير النظام','باحث اجتماعي'));
$$;

create or replace function public.volunteer_staff_list(p_u text, p_p text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
begin
  if not _vol_staff_ok(p_u,p_p) then raise exception 'بيانات الدخول غير صحيحة أو لا توجد صلاحية'; end if;
  return coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at desc) from volunteer_applications v),'[]'::jsonb);
end $$;

create or replace function public.volunteer_staff_decide(p_u text, p_p text, p_id uuid, p_status text, p_reply text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
begin
  if not _vol_staff_ok(p_u,p_p) then raise exception 'بيانات الدخول غير صحيحة أو لا توجد صلاحية'; end if;
  if p_status not in ('مقبول','مرفوض','مطلوب تعديل','تحت المراجعة') then raise exception 'قرار غير صالح'; end if;
  update volunteer_applications set status=p_status,reply=p_reply,updated_at=now() where id=p_id;
  return jsonb_build_object('ok',true);
end $$;

grant execute on function public.volunteer_submit(jsonb) to anon,authenticated;
grant execute on function public.volunteer_track(text) to anon,authenticated;
grant execute on function public.volunteer_resubmit(text,jsonb) to anon,authenticated;
grant execute on function public.volunteer_staff_list(text,text) to anon,authenticated;
grant execute on function public.volunteer_staff_decide(text,text,uuid,text,text) to anon,authenticated;
revoke execute on function public._vol_staff_ok(text,text) from public, anon, authenticated;
