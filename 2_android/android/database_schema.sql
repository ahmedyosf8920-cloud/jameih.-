-- قاعدة بيانات مقترحة للنظام المركزي (Supabase/PostgreSQL)
create table if not exists app_users (
 id uuid primary key default gen_random_uuid(),
 full_name text not null,
 username text unique not null,
 role text not null check (role in ('مدير النظام','باحث اجتماعي','محاسب','متطوع')),
 active boolean default true,
 created_at timestamptz default now()
);
create table if not exists cases (
 id uuid primary key default gen_random_uuid(),
 case_number bigint generated always as identity,
 full_name text not null,
 national_id text not null,
 birth_date date,
 social_status text,
 phone text,
 whatsapp text,
 village text,
 address text,
 family_members int default 1,
 income_source text,
 priority text default 'عادي',
 status text default 'نشطة',
 follow_up boolean default false,
 notes text,
 created_at timestamptz default now(),
 updated_at timestamptz default now()
);
create table if not exists case_needs (
 case_id uuid references cases(id) on delete cascade,
 need_type text not null,
 primary key(case_id,need_type)
);
create table if not exists family_members (
 id uuid primary key default gen_random_uuid(),
 case_id uuid references cases(id) on delete cascade,
 full_name text not null,
 relation text,
 age int,
 status text
);
create table if not exists assistance (
 id uuid primary key default gen_random_uuid(),
 case_id uuid references cases(id) on delete cascade,
 assistance_type text not null,
 amount numeric(12,2) default 0,
 assistance_date date default current_date,
 responsible_user uuid,
 notes text,
 created_at timestamptz default now()
);
create table if not exists case_documents (
 id uuid primary key default gen_random_uuid(),
 case_id uuid references cases(id) on delete cascade,
 document_type text,
 file_name text not null,
 storage_path text not null,
 uploaded_by uuid,
 uploaded_at timestamptz default now()
);
create table if not exists visits (
 id uuid primary key default gen_random_uuid(),
 case_id uuid references cases(id) on delete cascade,
 visit_date date default current_date,
 researcher uuid,
 summary text,
 recommendation text
);
