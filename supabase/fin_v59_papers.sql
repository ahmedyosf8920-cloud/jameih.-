-- v59 (اختياري): السماح برفع ملفات Word (doc/docx) في «الأوراق والكشوف».
-- شغّله مرة واحدة في Supabase → SQL Editor بعد ملفات v51 و v52 و v53. آمن للتكرار ولا يغيّر أي بيانات.
-- بدونه كل شيء يعمل عدا رفع ملفات Word (سيظهر «نوع الملف غير مسموح»).
create or replace function public.fin_arch_register(p_u text, p_p text, p_title text, p_category text, p_file_name text, p_mime text, p_size bigint, p_path text,
  p_ref_type text default null, p_ref_id text default null, p_access jsonb default null, p_notes text default null, p_replaces uuid default null, p_client_key text default null) returns jsonb
language plpgsql security definer set search_path=public, extensions as $$
declare r text; a fin_archive; v_yr int := extract(year from current_date)::int; n int; ver int := 1;
begin
  r := _fin_need(p_u,p_p,'fin_archive');
  if p_client_key is not null then select * into a from fin_archive where client_key=p_client_key; if found then return to_jsonb(a); end if; end if;
  if btrim(coalesce(p_title,''))='' then raise exception 'عنوان المستند مطلوب'; end if;
  if p_file_name !~* '\.(pdf|png|jpe?g|webp|xlsx?|csv|docx?)$' then raise exception 'نوع الملف غير مسموح (PDF أو صور أو Excel أو CSV أو Word فقط)'; end if;
  if p_mime !~ '^(application/pdf|image/(png|jpeg|webp)|text/csv|application/msword|application/vnd\.(ms-excel|openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document)))$' then raise exception 'نوع MIME غير مسموح'; end if;
  if p_size is null or p_size <= 0 or p_size > 15728640 then raise exception 'حجم الملف يجب ألا يتجاوز 15 ميجابايت'; end if;
  if p_path !~ '^archive/[0-9]{4}/[0-9a-f-]{36}-[^/]+$' or p_path like '%..%' then raise exception 'مسار التخزين غير صالح'; end if;
  if p_replaces is not null then select version+1 into ver from fin_archive where id=p_replaces; if ver is null then raise exception 'النسخة المراد استبدالها غير موجودة'; end if; end if;
  n := _fin_next('archive', v_yr);
  insert into fin_archive(arch_no,title,category,ref_type,ref_id,file_path,file_name,mime,size_bytes,access,notes,version,replaces,client_key,uploaded_by)
  values ('أرشيف-'||v_yr||'-'||lpad(n::text,4,'0'),btrim(p_title),p_category,p_ref_type,p_ref_id,p_path,left(p_file_name,200),p_mime,p_size,
     coalesce(p_access,'{"view":[],"download":[],"edit":[]}'::jsonb),p_notes,ver,p_replaces,p_client_key,trim(p_u)) returning * into a;
  insert into fin_archive_events(arch_id,username,action,details) values (a.id,trim(p_u),'upload',jsonb_build_object('version',ver));
  perform _fin_audit(trim(p_u),'تسجيل مستند أرشيف','archive',a.arch_no,null);
  return to_jsonb(a) - 'file_path';
end $$;

notify pgrst, 'reload schema';
