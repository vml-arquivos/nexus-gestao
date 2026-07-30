# Nexus/Coolify — recuperação segura de 522 e 524

Release do aplicativo: `fix51-sequential-build-20260730`

## O que foi comprovado

- `522` em `coolify.permupay.com.br`: a Cloudflare não concluiu a conexão com
  a origem. Como o próprio painel do Coolify falhou, este erro não nasce no
  React nem na rota de tarefas.
- `524` em `nexus.permupay.com.br`: a origem aceitou a conexão, mas não enviou
  resposta no prazo. Isso é compatível com saturação da VPS/proxy e com o pool
  PostgreSQL bloqueado.
- O ZIP 48 preservava o conserto do deadlock do FIX49, porém havia regredido no
  restante para o fluxo pesado anterior: DDL em requisição, polling de 25 s,
  jobs concorrentes, sincronização de agenda ligada por padrão, SSE frágil e
  healthcheck que aceitava o HTML da SPA.
- A produção consultada em 30/07/2026 ainda não expunha o marcador esperado:
  `/health/live` entregava HTML e `/api/health/live` retornava 404.

## Garantia de preservação

Os scripts desta entrega não executam `docker system prune`, `docker compose
down`, remoção de contêiner/volume, reinício do Docker, reinício do PostgreSQL,
alteração de firewall ou encerramento forçado de sessão no banco.

## Ordem segura

1. Acesse a VPS por SSH externo ou console serial do provedor, não pelo terminal
   web do Coolify.
2. Descubra os nomes exatos:

   ```bash
   sudo docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
   ```

3. Execute primeiro o diagnóstico somente leitura:

   ```bash
   sudo bash scripts/vps-diagnostico-seguro.sh NOME_DO_POSTGRES_NEXUS
   ```

4. Execute a recuperação controlada em segundo plano, para que ela continue se
   a sessão SSH cair:

   ```bash
   sudo nohup bash scripts/vps-recuperacao-segura.sh NOME_DO_CONTAINER_NEXUS \
     >/var/tmp/nexus-recuperacao.log 2>&1 &
   ```

5. Acompanhe:

   ```bash
   sudo tail -f /var/tmp/nexus-recuperacao.log
   ```

6. Suba esta release pelo Dockerfile da raiz, com limpeza do cache de build.
   Preserve as variáveis e volumes existentes.

## Variáveis do Nexus

```env
DB_POOL_MAX=12
DB_CONNECTION_TIMEOUT_MS=4000
DB_LOCK_TIMEOUT_MS=5000
DB_STATEMENT_TIMEOUT_MS=15000
DB_QUERY_TIMEOUT_MS=18000
DB_IDLE_IN_TRANSACTION_TIMEOUT_MS=15000
BACKGROUND_JOBS_ENABLED=true
AGENDA_AUTO_SYNC_ENABLED=false
```

`DB_CONNECT_TIMEOUT_MS` continua aceito como alias para não quebrar ambientes
que usavam o nome anterior.

## Configuração do recurso no Coolify

- Build Pack: `Dockerfile`
- Base Directory: raiz do repositório
- Dockerfile: `/Dockerfile`
- Porta interna: `80`
- Health Check Path: `/health/live`
- Health Check Port: `80`

Não use `/`, `/api/health` ou uma página da SPA como liveness.

## Aceite obrigatório

```bash
curl -fsS https://nexus.permupay.com.br/version
curl -fsS https://nexus.permupay.com.br/health/live
curl -fsS https://nexus.permupay.com.br/health
```

O primeiro resultado precisa conter:

```json
{"release":"fix51-sequential-build-20260730"}
```

Se `/version` ou `/health/live` retornar HTML, a imagem antiga ainda está em
execução e o teste funcional não é válido.

## Se o 522 continuar

O diagnóstico deve ser resolvido na infraestrutura antes de novo deploy:

1. confirmar que o IP de origem dos registros `coolify` e `nexus` na Cloudflare
   é o IP externo atual da VPS;
2. remover registro `AAAA` somente se ele apontar para IPv6 inexistente;
3. confirmar no firewall do provedor e no firewall local que TCP 80/443 chega à
   VPS e que endereços da Cloudflare não estão bloqueados/rate-limited;
4. verificar no relatório OOM, disco/inodes, pressão de I/O, conntrack, portas,
   latência local do Traefik e duplicidade de contêineres Nexus;
5. não aumentar timeout da Cloudflare para esconder consultas ou locks lentos.

## Regras preservadas

Foram mantidos os fluxos de criação, atribuição, edição, checklist, tarefa
pessoal/equipe/livre, assumir/devolver, conclusão, aprovação, deduplicação,
ranking e pontuação, além do FIX49 do Automation Engine.
