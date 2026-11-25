#!/usr/bin/env bash
# ТОЛЬКО ЧТЕНИЕ. Ничего не меняет и не удаляет.
# Показывает: сколько места занято и чем, что слушает порты, какой сервис стоит за доменом.
#   DOMAIN=dashboard.metateka.ru bash deploy/inspect.sh
set -uo pipefail
DOMAIN="${DOMAIN:-dashboard.metateka.ru}"

section() { printf '\n===== %s =====\n' "$1"; }

section "Система"
uname -a; grep PRETTY_NAME /etc/os-release; uptime

section "Диск (df)"
df -h -x tmpfs -x devtmpfs

section "Крупнейшие каталоги (до 2 уровней, только эта ФС)"
du -xh --max-depth=2 / 2>/dev/null | sort -rh | head -30

section "Файлы крупнее 500 МБ"
find / -xdev -type f -size +500M -printf '%s\t%TY-%Tm-%Td\t%p\n' 2>/dev/null | sort -rn | head -20 | awk -F'\t' '{printf "%8.1f ГБ  %s  %s\n", $1/1073741824, $2, $3}'

section "Похожее на выгрузки/бэкапы старше 30 дней (имена файлов, размер)"
find / -xdev -type f \( -iname '*export*' -o -iname '*выгруз*' -o -iname '*dump*' -o -iname '*backup*' -o -iname '*.csv' -o -iname '*.sql.gz' \) -mtime +30 -size +50M \
  -printf '%s\t%TY-%Tm-%Td\t%p\n' 2>/dev/null | sort -rn | head -30 | awk -F'\t' '{printf "%8.1f МБ  %s  %s\n", $1/1048576, $2, $3}'

section "Логи и кэши (размер)"
du -sh /var/log /var/cache /var/lib/docker /root/.cache /tmp 2>/dev/null
command -v journalctl >/dev/null && journalctl --disk-usage 2>/dev/null

section "Слушающие порты и процессы"
ss -ltnp 2>/dev/null

section "Docker"
if command -v docker >/dev/null; then docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'; docker system df; else echo "docker не установлен"; fi

section "Запущенные systemd-сервисы"
systemctl list-units --type=service --state=running --no-pager 2>/dev/null | head -40

section "pm2"
command -v pm2 >/dev/null && pm2 list || echo "pm2 не найден"

section "nginx: конфигурация для $DOMAIN"
if command -v nginx >/dev/null; then
  grep -rl "$DOMAIN" /etc/nginx 2>/dev/null | while read -r f; do echo "--- $f"; cat "$f"; done
else
  echo "nginx не найден"
fi

section "Node.js"
command -v node >/dev/null && node -v || echo "node не установлен"
