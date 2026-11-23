#!/usr/bin/env python3
"""Static release checks for جمعية الخير للجميع; no network or live DB access."""
from pathlib import Path
import hashlib, json, shutil, subprocess, sys
ROOT = Path(__file__).resolve().parents[1]
ASSETS = ['index.html','children-registry-v48.js','jkh-programs-v49.js','jkh-integrated-v50.js','jkh-fin51.js','jkh-fin52.js','jkh-fin53.js','jkh-delivery56.js','jkh-papers59.js','jkh-vouchers60.js','jkh-skin54.js','jkh-finance.js','jkh-docs.js','jkh-case-docs.js','jkh-look.js','jkh-v30.js','jkh-vdocs.js','vdoc-assets.js','config.js','sw.js','manifest.webmanifest','logo.jpg','icon-192.png','icon-512.png','version.txt']
PLATFORMS = ['windows/www','2_android/android/www','2_android/android/app/src/main/assets/www']
errors=[]; notes=[]
for rel in PLATFORMS:
    base=ROOT/rel
    if not base.is_dir():
        errors.append(f'مجلد المنصة غير موجود: {rel}')
        continue
    for name in ASSETS:
        src=ROOT/name; dst=base/name
        if not src.is_file(): errors.append(f'أصل مفقود: {name}'); continue
        if not dst.is_file(): errors.append(f'{rel}/{name} غير موجود'); continue
        if hashlib.sha256(src.read_bytes()).digest()!=hashlib.sha256(dst.read_bytes()).digest():
            errors.append(f'اختلاف نسخة الملف: {rel}/{name}')
# Syntax-check first-party JavaScript (skip inline scripts and external libraries).
js_files=[ROOT/n for n in ['jkh-delivery56.js','jkh-papers59.js','jkh-vouchers60.js','children-registry-v48.js','jkh-programs-v49.js','jkh-integrated-v50.js','jkh-fin51.js','jkh-fin52.js','jkh-fin53.js','jkh-skin54.js','jkh-finance.js','jkh-docs.js','jkh-case-docs.js','jkh-look.js','jkh-v30.js','jkh-vdocs.js','vdoc-assets.js','config.js','sw.js','windows/main.js','wa_server/server.js']]
node=shutil.which('node')
if not node: errors.append('Node.js غير مثبت؛ تعذر فحص صياغة JavaScript')
else:
    for f in js_files:
        if not f.is_file(): errors.append(f'ملف JavaScript غير موجود: {f.relative_to(ROOT)}'); continue
        p=subprocess.run([node,'--check',str(f)],capture_output=True,text=True)
        if p.returncode: errors.append(f'خطأ صياغة في {f.relative_to(ROOT)}: {(p.stderr or p.stdout).strip()}')
# Ensure declared release metadata agrees.
ver=(ROOT/'version.txt').read_text(encoding='utf-8').strip()
try:
    pkg=json.loads((ROOT/'windows/package.json').read_text(encoding='utf-8'))
    if pkg.get('version') != ver: errors.append(f"Windows package version={pkg.get('version')} لا يطابق version.txt={ver}")
except Exception as e: errors.append(f'تعذر قراءة windows/package.json: {e}')
try:
    gradle=(ROOT/'2_android/android/app/build.gradle').read_text(encoding='utf-8')
    if f"?: '{ver}'" not in gradle: errors.append('Android versionName الافتراضي لا يطابق version.txt')
    if "?: '60') as Integer" not in gradle: errors.append('Android versionCode الافتراضي غير محدث إلى 60')
except Exception as e: errors.append(f'تعذر قراءة Android build.gradle: {e}')
# Critical SQL dependency guardrails.
v48=(ROOT/'supabase/children_registry_security_v48.sql').read_text(encoding='utf-8')
v31=(ROOT/'supabase/security_v31.sql').read_text(encoding='utf-8')
for token in ['_app_state_put_core','_can_access_children','app_state_get','app_state_put']:
    if token not in v48: errors.append(f'اعتماد SQL مفقود من ملف حماية الأطفال: {token}')
if 'alter function public.app_state_put(text,text,jsonb,timestamptz) rename to _app_state_put_core' not in v31:
    errors.append('لم يتم العثور على خطوة إنشاء _app_state_put_core في security_v31.sql')
print(f'الإصدار: {ver}')
print(f'ملفات JavaScript المفحوصة: {len(js_files)}')
print(f'الأخطاء: {len(errors)}')
for e in errors: print('FAIL:',e)
print('ملاحظة: الفحص ثابت ومحلي؛ لا يتصل بـ Supabase ولا يبني APK/EXE ولا يختبر تسجيل الدخول أو الصلاحيات الحية.')
sys.exit(1 if errors else 0)
