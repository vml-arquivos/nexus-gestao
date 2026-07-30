#!/usr/bin/env bash
set -Eeuo pipefail

# Recuperação controlada do proxy e do processo Nexus.
# Não reinicia Docker, não reinicia PostgreSQL, não remove contêineres/volumes,
# não executa prune e não altera firewall.
#
# Uso:
#   sudo nohup bash scripts/vps-recuperacao-segura.sh CONTAINER_NEXUS \
#     >/var/tmp/nexus-recuperacao.log 2>&1 &

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Execute como root: sudo bash $0 CONTAINER_NEXUS" >&2
  exit 1
fi

nexus_container="${1:-}"
if [[ -z "$nexus_container" ]]; then
  echo "Informe exatamente o nome/ID do contêiner Nexus mostrado por docker ps." >&2
  exit 2
fi

if ! docker inspect "$nexus_container" >/dev/null 2>&1; then
  echo "Contêiner Nexus não encontrado: $nexus_container" >&2
  exit 3
fi

nexus_image="$(docker inspect --format '{{.Config.Image}}' "$nexus_container")"
if [[ "$nexus_image" =~ postgres|mysql|mariadb|mongo|redis|clickhouse ]]; then
  echo "Recusado: o alvo parece ser banco/cache, não o Nexus: $nexus_image" >&2
  exit 4
fi

root_usage="$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')"
if [[ -n "$root_usage" && "$root_usage" -ge 98 ]]; then
  echo "Disco raiz em ${root_usage}%. Interrompido para evitar dano; libere espaço sem usar docker system prune." >&2
  exit 5
fi

wait_container() {
  local name="$1"
  local attempts="${2:-45}"
  local state health
  for ((i=1; i<=attempts; i++)); do
    state="$(docker inspect --format '{{.State.Status}}' "$name" 2>/dev/null || true)"
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name" 2>/dev/null || true)"
    if [[ "$state" == "running" && ( "$health" == "healthy" || "$health" == "none" ) ]]; then
      echo "$name: state=$state health=$health"
      return 0
    fi
    sleep 2
  done
  echo "$name não ficou pronto no tempo esperado." >&2
  docker inspect --format 'state={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} oom={{.State.OOMKilled}} exit={{.State.ExitCode}}' "$name" || true
  return 1
}

echo "[$(date -Is)] Reiniciando somente o proxy stateless do Coolify..."
docker restart --time 20 coolify-proxy
wait_container coolify-proxy 45

echo "[$(date -Is)] Testando o painel do Coolify diretamente na VPS..."
coolify_code="$(curl -sS --connect-timeout 3 --max-time 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/ || true)"
echo "Coolify direto na porta 8000: HTTP ${coolify_code:-000}"
if [[ "$coolify_code" == "000" || "$coolify_code" -ge 500 ]]; then
  echo "Painel interno indisponível; reiniciando somente o contêiner de controle coolify."
  docker restart --time 30 coolify
  wait_container coolify 60
fi

echo "[$(date -Is)] Reiniciando somente a aplicação Nexus para fechar pools e transações antigas..."
docker restart --time 30 "$nexus_container"
wait_container "$nexus_container" 90

echo "[$(date -Is)] Validação local pelo Traefik..."
curl -ksS --connect-timeout 3 --max-time 12 \
  --resolve coolify.permupay.com.br:443:127.0.0.1 \
  -o /dev/null -w 'coolify code=%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s\n' \
  https://coolify.permupay.com.br/ || true
curl -ksS --connect-timeout 3 --max-time 12 \
  --resolve nexus.permupay.com.br:443:127.0.0.1 \
  -o /dev/null -w 'nexus_liveness code=%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s\n' \
  https://nexus.permupay.com.br/health/live || true

echo "[$(date -Is)] Recuperação concluída."
echo "Bancos, volumes, dados, redes e firewall não foram alterados."
