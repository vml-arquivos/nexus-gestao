# Nexus Gestao — Deploy via Coolify (Dockerfile)

## Arquitetura do Container

Um unico container com:
- **Nginx** (porta 80): serve o frontend React/PWA
- **Node.js** (porta 3001, interno): API backend Express + JWT
- **supervisord**: gerencia os dois processos simultaneamente
- **Migration automatica**: tabelas criadas no startup

O Traefik do Coolify gerencia SSL e dominio externamente.

---

## Passo a Passo no Coolify

### 1. Criar novo servico
- No Coolify: **New Resource → Application**
- Repositorio: `https://github.com/vml-arquivos/nexus-gestao`
- Branch: `main`
- Build Pack: **Dockerfile**
- Dockerfile Location: `/Dockerfile` (raiz do repositorio)

### 2. Configurar variaveis de ambiente
Cole as variaveis abaixo no painel **Environment Variables** do Coolify:

```
DATABASE_URL=postgres://USUARIO:SENHA@HOST_INTERNO_DO_POSTGRES:5432/postgres
DATABASE_SSL=false
DB_CONNECT_TIMEOUT_MS=10000
DB_QUERY_TIMEOUT_MS=60000
DB_STATEMENT_TIMEOUT_MS=60000
DB_MIGRATION_LOCK_TIMEOUT_MS=15000
DB_MIGRATION_TIMEOUT_MS=180000
DB_MIGRATION_MODE=safe
DB_MIGRATION_STRICT=false
MIGRATION_MAX_ATTEMPTS=12
MIGRATION_RETRY_DELAY_SECONDS=5
JWT_SECRET=GERE_UMA_NOVA_CHAVE_COM_OPENSSL
JWT_REFRESH_SECRET=GERE_OUTRA_NOVA_CHAVE_COM_OPENSSL
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
FRONTEND_URL=https://nexus.permupay.com.br
NODE_ENV=production
PORT=3001
UPLOADS_DIR=/app/uploads
VITE_API_URL=/api
```

Marque `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET` e as chaves de
integração somente como variáveis de runtime. Não exponha segredos como build
arguments nem os registre em arquivos versionados.

> Segurança: se um log ou arquivo antigo já mostrou esses valores, troque a
> senha do PostgreSQL e as duas chaves JWT antes do próximo deploy.

### 3. Configurar dominio
- Em **Domains**: adicione `nexus.permupay.com.br`
- Ative **SSL automatico (Let's Encrypt)**
- Porta: **80** (o container expoe a porta 80)

### 4. Configurar volume persistente (uploads)
- Em **Persistent Storage**: adicione `/app/uploads`
- Isso garante que os arquivos enviados nao sejam perdidos em redeploys

### 5. Deploy
- Clique em **Deploy**
- Em **Health Check Path**, use `/health` (ou `/api/health`)
- A porta de destino do serviço deve ser `80`

### 6. Verificar logs esperados
```
[STARTUP] Configuração validada. Iniciando Supervisor...
[BACKEND] Migration: tentativa 1/12...
[MIGRATE] Conectando ao PostgreSQL...
[MIGRATE] Executando schema...
[MIGRATE] Schema aplicado com sucesso!
[BACKEND] Migration concluída.
[BACKEND] Iniciando Nexus API na porta 3001...
[SERVER] Nexus API rodando na porta 3001
```

Se aparecer `DATABASE_URL não foi configurada`, confira a variável no serviço
da aplicação. Se aparecer `ENOTFOUND`, `ECONNREFUSED` ou timeout, confirme o
hostname interno do PostgreSQL e se aplicação e banco estão na mesma rede do
Coolify.

O endpoint `/health` é encaminhado pelo Nginx à API. Ele só responde `200`
quando o backend consegue executar `SELECT 1` no PostgreSQL; durante migration
ou indisponibilidade real do banco responde `503`.

Em banco já existente, a migration primeiro verifica tabelas, colunas e índices
atuais. Se tudo já estiver instalado, nenhuma operação `ALTER TABLE` é
executada. Se o PostgreSQL estiver bloqueado pelo contêiner anterior durante o
rolling deploy (`55P03`), o modo `safe` registra o adiamento e inicia a API sem
entrar em ciclo de reinicialização. Use `DB_MIGRATION_MODE=full` e
`DB_MIGRATION_STRICT=true` somente em uma janela de manutenção exclusiva.

### Opção Docker Compose

O `docker-compose.yml` também usa um único serviço `nexus`, porque o
`Dockerfile` raiz já contém frontend, backend e Nginx. Não recrie serviços
separados de frontend/backend usando esse mesmo Dockerfile.

---

## Portas na VPS (sem conflito)

| Servico | Porta no host | Observacao |
|---|---|---|
| Chatwoot (existente) | 3000 | nao conflita |
| Nexus (este projeto) | 80 (via Traefik) | sem porta exposta diretamente |

O Traefik roteia pelo dominio — nao e necessario expor porta no host.

---

## Primeiro Acesso

1. Acesse `https://nexus.permupay.com.br`
2. Clique em **Criar conta**
3. Preencha nome, e-mail, senha e selecione **Gestor**
4. Sua organizacao e criada automaticamente
5. Para adicionar membros: **Equipe → Convidar Membro**

---

## PWA — Instalacao no Celular

**Android (Chrome):** menu tres pontos → Adicionar a tela inicial

**iOS (Safari):** botao Compartilhar → Adicionar a Tela de Inicio

---

## Apos o Deploy — Trocar os Tokens JWT

```bash
openssl rand -base64 64  # novo JWT_SECRET
openssl rand -base64 64  # novo JWT_REFRESH_SECRET
```
Atualize no Coolify e faca Redeploy.
