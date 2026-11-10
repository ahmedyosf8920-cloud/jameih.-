-- شغّله مرة واحدة في Supabase > SQL Editor
create table if not exists wa_queue (
  id         bigint generated always as identity primary key,
  phone      text not null,
  body       text not null,
  status     text not null default 'pending'
             check (status in ('pending','sent','failed','skipped')),
  attempts   int  not null default 0,
  error      text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index if not exists wa_queue_status_idx on wa_queue (status, attempts, id);

create table if not exists wa_optout (
  phone      text primary key,
  created_at timestamptz not null default now()
);

alter table wa_queue  enable row level security;
alter table wa_optout enable row level security;

-- المتصفح لا يصل للجدولين مباشرة (مثل بقية جداول النظام). الخادم يستخدم Service Role فيتجاوز RLS.
revoke all on public.wa_queue, public.wa_optout from public, anon, authenticated;
revoke all on sequence public.wa_queue_id_seq from public, anon, authenticated;

-- إضافة رسائل للطابور من البرنامج (بنفس نمط تحقق الموظف في بقية الدوال)
create or replace function public.wa_enqueue_many(p_u text, p_p text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare it jsonb; ph text; bd text; n int := 0; pend int;
begin
  if _staff_role(p_u,p_p) is null then raise exception 'غير مصرح'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'عدد الرسائل غير صالح (الحد الأقصى 500 في المرة)';
  end if;
  for it in select value from jsonb_array_elements(p_items) loop
    ph := regexp_replace(coalesce(it->>'phone',''), '\D', '', 'g');
    bd := left(coalesce(it->>'body',''), 1000);
    continue when length(ph) < 10 or length(ph) > 15 or length(trim(bd)) = 0;
    continue when exists(select 1 from wa_queue where phone=ph and body=bd and status='pending');
    insert into wa_queue(phone, body) values (ph, bd);
    n := n + 1;
  end loop;
  select count(*) into pend from wa_queue where status = 'pending';
  perform _audit(p_u, 'طابور واتساب', jsonb_build_object('queued', n));
  return jsonb_build_object('queued', n, 'pending', pend);
end $$;
grant execute on function public.wa_enqueue_many(text,text,jsonb) to anon, authenticated;

-- ===== نبضة الخادم + شاشة الطابور =====
create table if not exists wa_server (
  id          int primary key default 1 check (id = 1),
  last_seen   timestamptz,
  connected   boolean not null default false,
  daily_limit int
);
alter table wa_server enable row level security;
revoke all on public.wa_server from public, anon, authenticated;

create or replace function public.wa_queue_overview(p_u text, p_p text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare d0 timestamptz := date_trunc('day', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo';
        res jsonb;
begin
  if _staff_role(p_u,p_p) is null then raise exception 'غير مصرح'; end if;
  select jsonb_build_object(
    'pending',   (select count(*) from wa_queue where status='pending'),
    'sent_today',(select count(*) from wa_queue where status='sent' and sent_at >= d0),
    'failed',    (select count(*) from wa_queue where status='failed'),
    'server',    (select to_jsonb(s) from wa_server s where id=1),
    'recent',    coalesce((select jsonb_agg(r) from (
                   select id, phone, left(body,120) as body, status, attempts, error, created_at, sent_at
                   from wa_queue order by id desc limit 40) r), '[]'::jsonb)
  ) into res;
  return res;
end $$;
grant execute on function public.wa_queue_overview(text,text) to anon, authenticated;

create or replace function public.wa_queue_action(p_u text, p_p text, p_action text, p_id bigint default null)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare n int := 0;
begin
  if _staff_role(p_u,p_p) is null then raise exception 'غير مصرح'; end if;
  if p_action = 'retry_failed' then
    update wa_queue set status='pending', attempts=0, error=null where status='failed';
    get diagnostics n = row_count;
  elsif p_action = 'cancel_one' then
    update wa_queue set status='skipped', error='CANCELLED' where id=p_id and status='pending';
    get diagnostics n = row_count;
  elsif p_action = 'cancel_all' then
    if not _staff_is_admin(p_u,p_p) then raise exception 'إلغاء الكل متاح لمدير النظام فقط'; end if;
    update wa_queue set status='skipped', error='CANCELLED' where status='pending';
    get diagnostics n = row_count;
  else
    raise exception 'إجراء غير معروف';
  end if;
  perform _audit(p_u, 'طابور واتساب: '||p_action, jsonb_build_object('count', n));
  return jsonb_build_object('count', n);
end $$;
grant execute on function public.wa_queue_action(text,text,text,bigint) to anon, authenticated;
