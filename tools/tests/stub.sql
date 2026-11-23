drop schema if exists public cascade; create schema public;
do $$ begin
 if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public to anon, authenticated;
create table public.staff_users(username text primary key, pw text, role text, permissions jsonb);
create function public._staff_role(p_u text,p_p text) returns text language sql security definer as $$ select role from public.staff_users where username=p_u and pw=p_p $$;
insert into public.staff_users values
 ('admin','a','مدير النظام',null),
 ('acc1','a','محاسب',null),
 ('maker','a','مخصص','["settle"]'),
 ('rev','a','مخصص','["settle","settle_review"]'),
 ('apr','a','مخصص','["settle","settle_approve"]'),
 ('pst','a','مخصص','["settle","settle_post"]'),
 ('res','a','باحث اجتماعي','[]');
