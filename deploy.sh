# Nexus Gestão — Deploy via Coolify (Dockerfile)

## Arquitetura do Container

Um único container com:
- **Nginx** (porta 80): serve o frontend React/PWA e faz proxy para a API
- **Node.js** (porta 3001, interno): API backend Express + JWT + PostgreSQL
- **supervisord**: gerencia os dois processos simultaneamente
- **Migração automática**: tabelas criadas no startup (com retry automático no DB)

O Traefik do Coolify gerencia SSL e domínio externamente.

---

## Passo a Passo no Coolify

### 1. Criar novo serviço
- No Coolify: **New Resource → Application**
- Repositório: `https://github.com/vml-arquivos/nexus-gestao`
- Branch: `main`
- Build Pack: **Dockerfile**
- Dockerfile Location: `/Dockerfile` (raiz do repositório)

### 2. Configurar variáveis de ambiente

Cole as variáveis abaixo no painel **Environment Variables** do Coolify:

```
DATABASE_URL=postgres://usuario:senha@host:5432/banco
JWT_SECRET=<gere com: openssl rand -base64 64>
JWT_REFRESH_SECRET=<gere com: openssl rand -base64 64>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
FRONTEND_URL=https://nexus.permupay.com.br
NODE_ENV=production
PORT=3001
UPLOADS_DIR=/app/uploads
VITE_API_URL=/api
```

> ⚠️ **NUNCA coloque credenciais reais neste arquivo.** Use o painel do Coolify.
> Gere novos secrets com: `openssl rand -base64 64`

### 3. Configurar domínio
- Em **Domains**: adicione `nexus.permupay.com.br`
- Ative **SSL automático (Let's Encrypt)**
- Porta: **80** (o container expõe a porta 80)

### 4. Configurar volume persistente (uploads)
- Em **Persistent Storage**: adicione `/app/uploads`
- Isso garante que os arquivos enviados não sejam perdidos em redeploys

### 5. Deploy
- Clique em **Deploy**
- O startup demora ~30–60s (aguarda DB + migração + inicialização do Node)

### 6. Logs esperados no startup
```
[STARTUP] Aguardando PostgreSQL...
[STARTUP] ✅ PostgreSQL disponível.
[STARTUP] Executando migrations...
[MIGRATE] ✅ Schema aplicado com sucesso!
[STARTUP] ✅ Migrations OK.
[STARTUP] Iniciando nginx + node (supervisord)...
[SERVER] ✅ Nexus API rodando na porta 3001
```

---

## Primeiro Acesso

1. Acesse `https://nexus.permupay.com.br`
2. Faça login com o e-mail e senha definidos
3. Para adicionar membros: **Equipe → Convidar Membro**

---

## PWA — Instalação no Celular

**Android (Chrome):** menu três pontos → Adicionar à tela inicial

**iOS (Safari):** botão Compartilhar → Adicionar à Tela de Início

---

## Gerar novos JWT Secrets (recomendado antes do primeiro deploy)

```bash
openssl rand -base64 64  # JWT_SECRET
openssl rand -base64 64  # JWT_REFRESH_SECRET
```

Atualize no Coolify e faça Redeploy.
