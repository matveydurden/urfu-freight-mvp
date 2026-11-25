#!/usr/bin/env bash
# Ставит РейсКонтроль как systemd-сервис за nginx. Идемпотентен, запускать от root.
#
#   TARBALL=/root/reiskontrol.tar.gz \
#   DOMAIN=dashboard.metateka.ru \
#   OLD_UNIT=<имя systemd-юнита старого сервиса, если нужно его остановить> \
#   OLD_UPSTREAM=http://127.0.0.1:<порт старого сервиса> \
#   bash deploy/install.sh
#
# Что делает:
#  1. проверяет Node.js >= 20 (ставит из NodeSource, если нет);
#  2. раскладывает приложение в /opt/reiskontrol, данные кладёт в /var/lib/reiskontrol;
#  3. создаёт и запускает сервис reiskontrol на 127.0.0.1:$PORT;
#  4. если задан OLD_UNIT — ОСТАНАВЛИВАЕТ его (не удаляет и не отключает автозапуск);
#  5. если заданы OLD_UPSTREAM — переключает nginx-конфиг домена на новый порт
#     (бэкап в /root/nginx-backup-*, при неудаче nginx -t откатывает);
#  6. добавляет тестовые рейсы (scripts/seed-demo.mjs).
set -euo pipefail

DOMAIN="${DOMAIN:-dashboard.metateka.ru}"
PORT="${PORT:-4173}"
APP_DIR="${APP_DIR:-/opt/reiskontrol}"
DATA_DIR="${DATA_DIR:-/var/lib/reiskontrol}"
TARBALL="${TARBALL:?Укажите TARBALL=путь к архиву приложения}"
OLD_UNIT="${OLD_UNIT:-}"
OLD_UPSTREAM="${OLD_UPSTREAM:-}"
SEED="${SEED:-1}"

[ "$(id -u)" -eq 0 ] || { echo "Запустите от root"; exit 1; }

echo "[1/6] Node.js"
need_node=1
if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; then need_node=0; fi
if [ "$need_node" -eq 1 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "[2/6] Приложение -> $APP_DIR"
id reiskontrol >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin reiskontrol
mkdir -p "$APP_DIR" "$DATA_DIR"
tar -xzf "$TARBALL" -C "$APP_DIR"
chown -R reiskontrol:reiskontrol "$APP_DIR" "$DATA_DIR"

echo "[3/6] systemd-сервис"
cat > /etc/systemd/system/reiskontrol.service <<UNIT
[Unit]
Description=RejsKontrol MVP
After=network.target

[Service]
User=reiskontrol
WorkingDirectory=$APP_DIR
Environment=HOST=127.0.0.1
Environment=PORT=$PORT
Environment=DATA_FILE=$DATA_DIR/state.json
ExecStart=$(command -v node) $APP_DIR/server.mjs
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$DATA_DIR
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload

if [ -n "$OLD_UNIT" ]; then
  echo "[4/6] Останавливаю старый сервис $OLD_UNIT (без удаления и без отключения автозапуска)"
  systemctl stop "$OLD_UNIT"
else
  echo "[4/6] OLD_UNIT не задан: старый сервис не трогаю"
fi

systemctl enable --now reiskontrol
sleep 1.5
curl -fsS "http://127.0.0.1:$PORT/api/health" && echo

if [ -n "$OLD_UPSTREAM" ]; then
  echo "[5/6] nginx: $OLD_UPSTREAM -> http://127.0.0.1:$PORT для $DOMAIN"
  BK="/root/nginx-backup-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$BK"
  FILES=$(grep -rl "$DOMAIN" /etc/nginx 2>/dev/null || true)
  [ -n "$FILES" ] || { echo "Конфиг для $DOMAIN не найден"; exit 1; }
  for f in $FILES; do cp -a "$f" "$BK/$(echo "$f" | tr / _)"; sed -i "s|proxy_pass[[:space:]]\+$OLD_UPSTREAM|proxy_pass http://127.0.0.1:$PORT|g" "$f"; done
  if nginx -t; then systemctl reload nginx; echo "nginx перезагружен, бэкап: $BK";
  else
    echo "nginx -t не прошёл, откатываю"
    for f in $FILES; do cp -a "$BK/$(echo "$f" | tr / _)" "$f"; done
    exit 1
  fi
else
  echo "[5/6] OLD_UPSTREAM не задан: nginx не трогаю"
fi

if [ "$SEED" = "1" ]; then
  echo "[6/6] Тестовые рейсы"
  BASE_URL="http://127.0.0.1:$PORT" node "$APP_DIR/scripts/seed-demo.mjs"
else
  echo "[6/6] SEED=0: тестовые данные пропущены"
fi
echo "Готово: https://$DOMAIN"
