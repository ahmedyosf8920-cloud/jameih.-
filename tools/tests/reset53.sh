P="psql -h /tmp/pgt -p 5499 -U postgres"
$P -d postgres -q -c "drop database if exists u" -c "create database u"
for f in stub fin v52 v53; do $P -d u -q -f /tmp/pgt/$f.sql >/dev/null 2>&1; done
