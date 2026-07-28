# Nexus Gestão — correção definitiva de Docker e healthcheck (fix40)

## Falhas encontradas

1. O `docker-compose.yml` antigo executava o Dockerfile unificado como um
   segundo contêiner chamado frontend. Esse Dockerfile também inicia o backend,
   mas o serviço não recebia `DATABASE_URL`; portanto encerrava antes de ficar
   saudável.
2. A URL `/health` do Nginx não possuía uma rota exclusiva e podia cair no
   fallback da SPA, retornando o `index.html` em vez do estado real da API.
3. Nginx e API só eram iniciados depois da migration. Enquanto o banco
   inicializava, não existia processo HTTP para o Docker/Coolify consultar.
4. O argumento `VITE_API_URL` informado pelo Compose não era declarado no
   estágio de build do frontend.
5. O novo log confirmou o erro PostgreSQL `55P03`: o contêiner antigo mantinha
   lock em uma tabela enquanto o novo contêiner reaplicava todo o schema. A
   falha encerrava o processo e o Docker repetia a migration continuamente.

## Correções

- O Compose agora possui um único serviço unificado, com todas as variáveis
  obrigatórias e o mesmo healthcheck do Dockerfile.
- O Nginx inicia imediatamente pelo Supervisor.
- O backend executa a migration em processo próprio, com tentativas limitadas,
  e só depois inicia a API.
- `/health` e `/api/health` consultam a rota real do backend, que também testa
  o PostgreSQL com `SELECT 1`.
- Enquanto backend ou banco não estiverem prontos, a resposta é `503`; quando
  ambos estão prontos, a resposta é `200`.
- O healthcheck possui janela de inicialização de 60 segundos, timeout curto e
  dez tentativas.
- O build do frontend passou a receber `VITE_API_URL` corretamente.
- O encerramento do Nginx e do Node foi configurado por grupo de processos para
  redeploys limpos.
- Antes de qualquer DDL, a migration agora verifica se o schema atual já está
  completo. Banco atualizado não executa novamente `DROP/ADD CONSTRAINT`.
- Em rolling deploy com banco existente, `55P03` não derruba mais o contêiner:
  a DDL é adiada com aviso seguro e a API inicia normalmente.
- As garantias de schema executadas nas rotas de tarefas, ranking e Destrava
  também usam verificação somente leitura antes de qualquer `ALTER TABLE`.
- O healthcheck agora registra a resposta HTTP ou o erro de conexão; não haverá
  mais apenas “Return code: 1” sem diagnóstico.

## Sem regressão

Nenhuma regra de tarefas, ranking, pontuação, aprovação, visibilidade, finanças
ou integração Destrava foi removida ou reescrita nesta correção. As alterações
ficam restritas à infraestrutura Docker, inicialização e readiness.

## Configuração no Coolify

- Build Pack: `Dockerfile`
- Dockerfile: `/Dockerfile`
- Porta: `80`
- Health Check Path: `/health`
- Variáveis obrigatórias: `DATABASE_URL`, `JWT_SECRET`,
  `JWT_REFRESH_SECRET` e `FRONTEND_URL`

Se o healthcheck responder `503`, os logs do bloco `[MIGRATE]` indicarão se o
problema restante é hostname, senha, rede, SSL ou lock do PostgreSQL.
