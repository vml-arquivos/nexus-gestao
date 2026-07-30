# Nexus Gestão — deploy FIX51 no Coolify

Release: `fix51-sequential-build-20260730`

## Arquitetura

Um contêiner unificado com:

- Nginx na porta interna 80;
- API Node.js na porta interna 3001;
- supervisord gerenciando os dois processos;
- migrations idempotentes antes da inicialização da API;
- uploads persistentes em `/app/uploads`.

O Traefik do Coolify gerencia o domínio e o TLS externamente.

## Configuração do recurso

- Repositório: `https://github.com/vml-arquivos/nexus-gestao`
- Branch: `main`
- Build Pack: `Dockerfile`
- Base Directory: raiz do repositório
- Dockerfile Location: `/Dockerfile`
- Porta interna: `80`
- Health Check Path: `/health/live`
- Health Check Port: `80`

## Variáveis

Use somente placeholders no repositório. Os valores reais devem existir apenas
no cofre de variáveis do Coolify:

```env
DATABASE_URL=<CONFIGURAR_SOMENTE_NO_COOLIFY>
DATABASE_SSL=false
JWT_SECRET=<CONFIGURAR_SOMENTE_NO_COOLIFY>
JWT_REFRESH_SECRET=<CONFIGURAR_SOMENTE_NO_COOLIFY>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=365d
FRONTEND_URL=https://nexus.permupay.com.br
NODE_ENV=production
PORT=3001
UPLOADS_DIR=/app/uploads
VITE_API_URL=/api

DB_POOL_MAX=12
DB_CONNECTION_TIMEOUT_MS=4000
DB_LOCK_TIMEOUT_MS=5000
DB_STATEMENT_TIMEOUT_MS=15000
DB_QUERY_TIMEOUT_MS=18000
DB_IDLE_IN_TRANSACTION_TIMEOUT_MS=15000
BACKGROUND_JOBS_ENABLED=true
AGENDA_AUTO_SYNC_ENABLED=false
```

Marque como build-time somente variáveis públicas necessárias ao frontend,
normalmente as iniciadas por `VITE_`. Senhas, banco, JWT, tokens e chaves devem
ser somente de runtime.

## Volume persistente

Configure:

```text
/app/uploads
```

Preserve o volume existente durante todos os redeploys.

## Redeploy

1. Substitua o conteúdo inteiro do repositório pelo pacote FIX51.
2. Preserve as variáveis e o volume.
3. Limpe somente o cache de build.
4. Execute o deploy pelo Dockerfile da raiz.
5. Não execute `docker system prune`, não remova volumes e não reinicie o
   PostgreSQL.

## Cache do build (obrigatório)

Em 30/07/2026 um build foi interrompido (`exit 255`) e o domínio continuou
servindo, sem aviso, a imagem anterior -- ninguém percebeu porque a checagem
de `/version` abaixo era manual. Para não repetir isso:

- No Coolify, antes de cada deploy desta release, use a opção
  **"Force rebuild without cache"** (ou equivalente na versão instalada).
  Isso garante que nenhuma camada de um build quebrado seja reaproveitada.
- Configure o comando de **pós-deploy** do recurso no Coolify para rodar:

  ```bash
  bash scripts/verify-release.sh https://nexus.permupay.com.br
  ```

  Esse script sai com código de erro se `/version` não bater com a release
  do código-fonte, ou se `/health/live`/`/health` não responderem certo --
  o Coolify deve marcar o deploy como falho nesse caso, em vez de liberar o
  domínio silenciosamente para uma imagem errada.

## Aceite

```bash
curl -fsS https://nexus.permupay.com.br/version
curl -fsS https://nexus.permupay.com.br/health/live
curl -fsS https://nexus.permupay.com.br/health
```

Ou, de forma automatizada (o mesmo que roda no passo de pós-deploy):

```bash
bash scripts/verify-release.sh https://nexus.permupay.com.br
```

O primeiro comando deve conter:

```json
{"release":"fix51-sequential-build-20260730"}
```

`/health/live` deve retornar JSON do `nexus-api`, nunca HTML. `/health` deve
informar `db: connected`.

## Rotação do segredo exposto

O antigo `JWT_REFRESH_SECRET` apareceu em log e em uma versão anterior deste
arquivo. Gere um novo valor fora do repositório:

```bash
openssl rand -base64 64
```

Cadastre-o somente no Coolify. A rotação encerra sessões existentes, mas não
apaga usuários, tarefas, arquivos, pontuações ou dados do banco.
