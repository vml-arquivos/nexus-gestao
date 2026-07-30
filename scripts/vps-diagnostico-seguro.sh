#!/usr/bin/env bash
set -Eeuo pipefail

# Diagnóstico somente leitura para 522/524 no Coolify/Nexus.
# Não reinicia serviços, não altera firewall, não remove contêineres e não toca
# em bancos ou volumes. Execute pela SSH/console da VPS:
#   sudo bash scripts/vps-diagnostico-seguro.sh [CONTAINER_DB_NEXUS]

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Execute como root: sudo bash $0 [CONTAINER_DB_NEXUS]" >&2
  exit 1
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
report="/var/tmp/nexus-vps-diagnostico-${stamp}.log"
exec > >(tee "$report") 2>&1

section() {
  printf '\n===== %s =====\n' "$1"
}

safe_run() {
  "$@" || true
}

redact() {
  sed -E \
    -e 's/([?&](token|_t|access_token|refresh_token)=)[^&[:space:]]+/\1[REDACTED]/Ig' \
    -e 's/(Bearer )[A-Za-z0-9._~-]+/\1[REDACTED]/Ig' \
    -e 's#(postgres(ql)?://[^: /]+:)[^@ /]+#\1[REDACTED]#Ig' \
    -e 's/((password|passwd|secret)=)[^[:space:]]+/\1[REDACTED]/Ig'
}

section "IDENTIFICAÇÃO"
date -Is
hostnamectl 2>/dev/null || hostname
uptime
uname -a

section "CPU, MEMÓRIA E PRESSÃO"
free -h
safe_run swapon --show
safe_run vmstat 1 5
safe_run sh -c 'for f in /proc/pressure/cpu /proc/pressure/memory /proc/pressure/io; do test -r "$f" && { echo "$f"; cat "$f"; }; done'

section "DISCO E INODES"
df -hT
df -ih
safe_run docker system df

section "DOCKER"
safe_run systemctl is-active docker
safe_run docker info --format 'Containers={{.Containers}} Running={{.ContainersRunning}} Paused={{.ContainersPaused}} Stopped={{.ContainersStopped}} Driver={{.Driver}}'
safe_run docker ps --format 'table {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
safe_run docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}\t{{.PIDs}}'

section "ESTADO, OOM E LIMITES DOS CONTÊINERES"
while IFS= read -r container; do
  [[ -n "$container" ]] || continue
  safe_run docker inspect --format \
    'Name={{.Name}} Image={{.Config.Image}} Status={{.State.Status}} Health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} RestartCount={{.RestartCount}} OOMKilled={{.State.OOMKilled}} ExitCode={{.State.ExitCode}} Memory={{.HostConfig.Memory}} MemorySwap={{.HostConfig.MemorySwap}} PidsLimit={{.HostConfig.PidsLimit}} Networks={{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' \
    "$container"
done < <(docker ps -aq)

section "CONTÊINERES LIGADOS AOS DOMÍNIOS"
docker ps --format '{{.ID}}	{{.Names}}	{{.Image}}	{{.Labels}}' 2>/dev/null \
  | grep -Ei 'nexus\.permupay\.com\.br|coolify\.permupay\.com\.br' \
  | redact || true

section "PORTAS E CONEXÕES"
safe_run ss -s
safe_run ss -lntp
safe_run sh -c 'printf "conntrack_count="; cat /proc/sys/net/netfilter/nf_conntrack_count 2>/dev/null || echo indisponivel'
safe_run sh -c 'printf "conntrack_max="; cat /proc/sys/net/netfilter/nf_conntrack_max 2>/dev/null || echo indisponivel'
safe_run sh -c 'printf "file_nr="; cat /proc/sys/fs/file-nr 2>/dev/null || echo indisponivel'

section "TESTES LOCAIS SEM CLOUDFLARE"
safe_run curl -ksS --connect-timeout 3 --max-time 8 \
  --resolve coolify.permupay.com.br:443:127.0.0.1 \
  -o /dev/null -w 'coolify_via_traefik code=%{http_code} connect=%{time_connect}s ttfb=%{time_starttransfer}s total=%{time_total}s\n' \
  https://coolify.permupay.com.br/
safe_run curl -ksS --connect-timeout 3 --max-time 8 \
  --resolve nexus.permupay.com.br:443:127.0.0.1 \
  -o /dev/null -w 'nexus_via_traefik code=%{http_code} connect=%{time_connect}s ttfb=%{time_starttransfer}s total=%{time_total}s\n' \
  https://nexus.permupay.com.br/health/live
safe_run curl -sS --connect-timeout 3 --max-time 8 \
  -o /dev/null -w 'coolify_direto_8000 code=%{http_code} connect=%{time_connect}s ttfb=%{time_starttransfer}s total=%{time_total}s\n' \
  http://127.0.0.1:8000/

section "KERNEL: OOM, TRAVAMENTOS E I/O NAS ÚLTIMAS 2 HORAS"
safe_run journalctl -k --since '-2 hours' --no-pager \
  | grep -Ei 'oom|out of memory|killed process|hung task|blocked for more than|i/o error|ext4|xfs|nvme|conntrack.*full' \
  | tail -n 240

section "DOCKER: ERROS NAS ÚLTIMAS 2 HORAS"
safe_run journalctl -u docker --since '-2 hours' --no-pager \
  | grep -Ei 'error|failed|timeout|oom|killed|deadlock|network|too many open files' \
  | tail -n 240 \
  | redact

section "LOGS CRÍTICOS: COOLIFY, PROXY, REALTIME E NEXUS"
while IFS= read -r container; do
  [[ -n "$container" ]] || continue
  image="$(docker inspect --format '{{.Config.Image}}' "$container" 2>/dev/null || true)"
  labels="$(docker inspect --format '{{json .Config.Labels}}' "$container" 2>/dev/null || true)"
  if [[ "$container $image $labels" =~ coolify|nexus\.permupay\.com\.br ]]; then
    printf '\n--- %s ---\n' "$container"
    docker logs --since 30m --tail 500 "$container" 2>&1 \
      | grep -Ei 'oom|out of memory|killed|timeout|timed out|too many clients|connection terminated|connection refused|deadlock|lock timeout|no available server|error|fatal|panic' \
      | tail -n 160 \
      | redact || true
  fi
done < <(docker ps --format '{{.Names}}')

section "POSTGRES NEXUS (OPCIONAL, SOMENTE LEITURA)"
db_container="${1:-}"
if [[ -n "$db_container" ]]; then
  if ! docker inspect "$db_container" >/dev/null 2>&1; then
    echo "Contêiner de banco não encontrado: $db_container"
  else
    docker exec "$db_container" sh -lc '
      psql -X -v ON_ERROR_STOP=1 \
        -U "${POSTGRES_USER:-postgres}" \
        -d "${POSTGRES_DB:-postgres}" \
        -c "SELECT state, wait_event_type, wait_event, count(*) FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1,2,3 ORDER BY 4 DESC;" \
        -c "SELECT pid, usename, application_name, state, wait_event_type, wait_event, now()-xact_start AS xact_age, now()-query_start AS query_age, left(query,160) AS query FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() ORDER BY COALESCE(xact_start,query_start) NULLS LAST LIMIT 30;" \
        -c "SELECT count(*) AS locks_nao_concedidos FROM pg_locks WHERE NOT granted;"
    ' 2>&1 | redact || true
  fi
else
  echo "Informe o nome do Postgres do Nexus como argumento para incluir sessões e locks."
fi

section "FIREWALL LOCAL (SOMENTE LEITURA)"
safe_run ufw status verbose
safe_run iptables -S INPUT

section "RESULTADO"
echo "Relatório salvo em: $report"
echo "Nenhum serviço, banco, contêiner, volume ou regra de firewall foi alterado."
