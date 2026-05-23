# Nexus Gestão — Deploy via Coolify

## Pré-requisitos
- Coolify instalado na VPS
- PostgreSQL 17 rodando na VPS (já configurado)
- Domínio `nexus.permupay.com.br` apontando para o IP da VPS

---

## Passo a Passo no Coolify

### 1. Criar novo serviço
- No Coolify: **New Resource → Docker Compose**
- Repositório: `https://github.com/vml-arquivos/nexus-gestao`
- Branch: `main`
- Arquivo: `docker-compose.yml` (raiz do repositório)

### 2. Configurar variáveis de ambiente
Cole as variáveis abaixo no painel **Environment Variables** do Coolify:

```
DATABASE_URL=postgres://postgres:WVsAhbLWNxhc0lLyjuNykCnAbYn4eO6bmJtAhycEdrfmPmQVsjb5IFHRXx7Tp5I8@q9s0fac7m9bnjnacuwymxlit:5432/postgres
JWT_SECRET=hltgydBOrqes47fIHGNGlBNHVezdufJzt69tT3Y+dyBJfrkWZIETzuMJ/3sT8FXb86wTq1WthCTv9Beqzc/Ahw==
JWT_REFRESH_SECRET=HSEuz4cnK9GucbFoWoskGpP6N5EIbLFrTrQx6AHTZFKAMtPSuuVXAmvkh2QSRQvU1ECU0ik7o+z/OEXTod6rGg==
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
FRONTEND_URL=https://nexus.permupay.com.br
DOMAIN=nexus.permupay.com.br
PORT=3001
NODE_ENV=production
FRONTEND_PORT=3000
MAX_FILE_SIZE=52428800
UPLOADS_DIR=/app/uploads
VITE_API_URL=/api
```

### 3. Configurar domínio
- No Coolify, em **Domains**, adicione: `nexus.permupay.com.br`
- Ative **SSL automático (Let's Encrypt)**
- Aponte para o serviço `nexus-frontend` na porta `3000`

### 4. Deploy
- Clique em **Deploy**
- O Coolify irá:
  1. Clonar o repositório
  2. Build do backend (Node.js + TypeScript)
  3. Build do frontend (React + Vite + PWA)
  4. Subir os containers
  5. **Migrations executadas automaticamente** no startup do backend

### 5. Verificar logs
Após o deploy, verifique os logs do container `nexus-backend`:
```
[ENTRYPOINT] Aplicando migrations no PostgreSQL...
[MIGRATE] Conectando ao PostgreSQL…
[MIGRATE] Executando schema…
[MIGRATE] ✅ Schema aplicado com sucesso!
[ENTRYPOINT] Iniciando servidor Nexus...
[DB] ✅ PostgreSQL conectado
[SERVER] ✅ Nexus API rodando na porta 3001
```

---

## Arquitetura dos Containers

| Container | Porta | Função |
|---|---|---|
| `nexus-frontend` | 3000 → 80 | React SPA + Nginx (proxy para API) |
| `nexus-backend` | 3001 | Node.js + Express + JWT |

O Nginx do frontend faz proxy automático:
- `/api/*` → `nexus-backend:3001/api/*`
- `/uploads/*` → `nexus-backend:3001/uploads/*`
- Todas as outras rotas → `index.html` (SPA)

---

## Primeiro Acesso

1. Acesse `https://nexus.permupay.com.br`
2. Clique em **Criar conta**
3. Preencha nome, e-mail, senha e selecione **Gestor**
4. Sua organização é criada automaticamente
5. Para adicionar membros da equipe: **Equipe → Convidar Membro**

---

## PWA — Instalação no Celular

**Android (Chrome):**
- Acesse o site → menu ⋮ → **Adicionar à tela inicial**

**iOS (Safari):**
- Acesse o site → botão Compartilhar → **Adicionar à Tela de Início**

---

## Após o Deploy — Trocar os Tokens JWT

Para maior segurança, gere novos tokens e atualize no Coolify:
```bash
openssl rand -base64 64  # JWT_SECRET
openssl rand -base64 64  # JWT_REFRESH_SECRET
```
Após atualizar, faça **Redeploy** — os usuários precisarão fazer login novamente.
