-- جمعية الخير للجميع | الإصدار السحابي
-- Supabase / PostgreSQL
-- نفّذ الملف كاملًا داخل SQL Editor في مشروع Supabase جديد.

create extension if not exists pgcrypto;

create table if not exists public.staff_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text unique not null,
  password_hash text not null,
  role text not null default 'متطوع',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_state (
  id integer primary key check (id = 1),
  payload jsonb not null default '{"version":5,"cases":[],"users":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_state(id,payload)
values (1,'{"version":5,"cases":[],"users":[]}'::jsonb)
on conflict (id) do nothing;

-- تخزين المستندات
insert into storage.buckets (id,name,public)
values ('case-documents','case-documents',true)
on conflict (id) do update set public=true;

-- كلمة المرور التجريبية: 1234
-- SHA-256 للـ 1234
insert into public.staff_users(name,username,password_hash,role,active)
values
('مدير الجمعية','admin','03ac674216f3e15c761ee1b4a5c9c6f2d9f3b8c8f6c8d6e4c5a4d8c9b3a2f1e0','مدير النظام',true)
on conflict (username) do nothing;

-- الدالة تستخدم مقارنة SHA-256.
create or replace function public.login_staff(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare u staff_users;
begin
  select * into u from staff_users
  where username = trim(p_username)
    and active = true
    and password_hash = encode(digest(p_password,'sha256'),'hex');
  if not found then
    return jsonb_build_object('user',null);
  end if;
  return jsonb_build_object('user',jsonb_build_object(
    'id',u.id,'name',u.name,'username',u.username,'role',u.role,'active',u.active
  ));
end;
$$;

grant execute on function public.login_staff(text,text) to anon, authenticated;

-- سياسات أولية عملية للنسخة التجريبية.
-- في النشر النهائي يمكن تشديدها وربطها بـ Supabase Auth.
alter table public.app_state enable row level security;
drop policy if exists "cloud state read" on public.app_state;
drop policy if exists "cloud state write" on public.app_state;
create policy "cloud state read" on public.app_state for select using (true);
create policy "cloud state write" on public.app_state for all using (true) with check (true);

-- سياسات التخزين للنسخة التجريبية.
drop policy if exists "case docs public read" on storage.objects;
drop policy if exists "case docs public upload" on storage.objects;
drop policy if exists "case docs public delete" on storage.objects;
create policy "case docs public read" on storage.objects for select using (bucket_id='case-documents');
create policy "case docs public upload" on storage.objects for insert with check (bucket_id='case-documents');
create policy "case docs public delete" on storage.objects for delete using (bucket_id='case-documents');

-- بعد تجربة النظام، يُفضّل نقل الدخول إلى Supabase Auth وتشديد RLS.
