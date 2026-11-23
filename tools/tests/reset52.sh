P="psql -h /tmp/pgt -p 5499 -U postgres"
$P -d postgres -q -c "drop database if exists u" -c "create database u"
for f in stub fin v52; do $P -d u -q -f /tmp/pgt/$f.sql >/dev/null 2>&1; done
$P -d u -q -c "insert into staff_users values('keeper','a','مسؤول مخازن',null),('min1','a','مخصص','[\"fin_minutes\"]'),('min2','a','مخصص','[\"fin_minutes_approve\"]'),('arch1','a','مخصص','[\"fin_archive\"]'),('arch2','a','مخصص','[\"fin_archive\"]'),('bank1','a','مخصص','[\"fin_bank\"]'),('stk2','a','مخصص','[\"fin_stock\",\"fin_stock_approve\"]') on conflict do nothing"
