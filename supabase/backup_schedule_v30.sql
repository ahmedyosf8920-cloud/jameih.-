-- جمعية الخير للجميع | جدولة النسخ الاحتياطي الخارجي (يوميًا 3 فجرًا بتوقيت القاهرة تقريبًا = 01:00 UTC)
-- 1) انشر الدالة backup-export وضع السر BACKUP_KEY (سلسلة عشوائية 32 حرفًا فأكثر).
-- 2) فعّل الإضافتين من Supabase > Database > Extensions: pg_cron و pg_net.
-- 3) استبدل <PROJECT_REF> و <BACKUP_KEY> أدناه ثم شغّل الملف مرة واحدة (لا ترفع الملف بعد التعديل).
-- لإيقاف الجدولة:  select cron.unschedule('jkh-backup-daily');
select cron.schedule('jkh-backup-daily', '0 1 * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/backup-export',
    headers := jsonb_build_object('Content-Type','application/json','x-backup-key','<BACKUP_KEY>'),
    body := '{}'::jsonb
  );
$$);
