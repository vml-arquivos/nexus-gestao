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
DATABASE_URL=postgres://postgres:WVsAhbLWNxhc0lLyjuNykCnAbYn4eO6bmJtAhycEdrfmPmQVsjb5IFHRXx7Tp5I8@q9s0fac7m9bnjnacuwymxlit:5432/postgres
JWT_SECRET=hltgydBOrqes47fIHGNGlBNHVezdufJzt69tT3Y+dyBJfrkWZIETzuMJ/3sT8FXb86wTq1WthCTv9Beqzc/Ahw==
JWT_REFRESH_SECRET=HSEuz4cnK9GucbFoWoskGpP6N5EIbLFrTrQx6AHTZFKAMtPSuuVXAmvkh2QSRQvU1ECU0ik7o+z/OEXTod6rGg==
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
FRONTEND_URL=https://nexus.permupay.com.br
NODE_ENV=production
PORT=3001
UPLOADS_DIR=/app/uploads
VITE_API_URL=/api
```

### 3. Configurar dominio
- Em **Domains**: adicione `nexus.permupay.com.br`
- Ative **SSL automatico (Let's Encrypt)**
- Porta: **80** (o container expoe a porta 80)

### 4. Configurar volume persistente (uploads)
- Em **Persistent Storage**: adicione `/app/uploads`
- Isso garante que os arquivos enviados nao sejam perdidos em redeploys

### 5. Deploy
- Clique em **Deploy**

### 6. Verificar logs esperados
```
[STARTUP] Executando migrations no PostgreSQL...
[MIGRATE] Conectando ao PostgreSQL...
[MIGRATE] Executando schema...
[MIGRATE] Schema aplicado com sucesso!
[STARTUP] Migrations OK. Iniciando nginx + node...
[SERVER] Nexus API rodando na porta 3001
```

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
