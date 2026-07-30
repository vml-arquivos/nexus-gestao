# Nexus Gestão — correção FIX52

Release: `fix52-loading-notificacoes-20260730`

## Contexto

O diagnóstico de 30/07/2026 (chat externo) identificou dois problemas
independentes:

1. O domínio estava servindo uma imagem antiga (hash `index-CAy9CpLc.js` /
   `Dashboard-DMNbsz-6.js`), não o FIX51 validado
   (`index-DZ8yGjzC.js` / `Dashboard-DjsOXbtJ.js`). Isso é um problema de
   **deploy**, não de código: o FIX51 nunca chegou a ficar no ar.
2. Mesmo quando o FIX51 estiver no ar, ele ainda tinha pontos reais de
   travamento: `Promise.all` acoplando seções do dashboard/relatórios,
   notificações se acumulando sem limite (18.212 não lidas em produção),
   token de acesso completo exposto na URL do SSE, e a tela de login
   bloqueada por ~17s esperando `/me`.

Este FIX52 resolve o item 2. O item 1 depende do redeploy em si: publicar
esta release (com cache limpo) e confirmar via `/version`.

## Correções

### Carregamento acoplado (dashboard/relatórios)
- `src/pages/Dashboard.tsx` e `src/pages/Relatorios.tsx`: `Promise.all` →
  `Promise.allSettled`. Uma seção que falha (ex.: agenda) não derruba mais
  tarefas, financeiro e equipe. A UI mostra um aviso específico de quais
  seções falharam, com botão "Tentar novamente" — em vez de uma tela
  silenciosamente zerada.
- `src/pages/Tarefas.tsx`: falha ao carregar a lista principal agora fica
  registrada em estado (`erroCarregamento`) e exibe um banner com retry,
  em vez de indistinguível de "não há tarefas".

### Notificações (18.212 não lidas)
- Nova migração idempotente em `backend/src/db/migrate.ts`: colunas
  `ocorrencias`, `atualizada_em`, `arquivada`, `arquivada_em` na tabela
  `notificacoes`, mais um índice único parcial (uma notificação "ativa" por
  org/usuário/referência/tipo).
- `backend/src/lib/notifHelper.ts`: os jobs recorrentes (vencimento de
  tarefa, financeiro) agora usam `criarOuAtualizarNotificacaoRecorrente`
  (UPSERT) em vez de `criarNotificacao` (INSERT). A mesma pendência
  atualiza uma única linha (incrementando `ocorrencias`) em vez de criar
  uma nova a cada execução do job. Som/push só disparam na ocorrência
  realmente nova, não em toda atualização de contador.
- Novo job `jobArquivarNotificacoesAntigas`, rodando 1x/dia via
  `runClusterSingletonJob` (o lock entre réplicas via
  `pg_try_advisory_lock` já existia desde o FIX51 — não precisou de nada
  novo aí): arquiva (não apaga) notificações lidas com mais de 30 dias.
- `backend/src/routes/notificacoes.ts`: listagem exclui arquivadas por
  padrão; `DELETE /antigas` agora arquiva em vez de apagar (preserva
  dados, mesma rota por compatibilidade).

### Token JWT exposto na URL do SSE
- `backend/src/middleware/auth.ts`: novo `generateSseTicket` /
  `sseTicketMiddleware` — ticket assinado com o mesmo `JWT_SECRET`, escopo
  próprio (`scope: 'sse'`), validade de 60s. Verificação sem estado, então
  funciona igual em qualquer réplica, sem precisar de Redis ou storage
  compartilhado.
- `backend/src/routes/notificacoes.ts`: nova rota
  `POST /notificacoes/stream/ticket` (autenticada via Bearer normal, nunca
  aparece em URL/log). `GET /stream` passa a exigir o ticket, não mais o
  access token completo.
- `src/hooks/useNotificacoes.ts`: busca o ticket antes de abrir o
  `EventSource`. A URL do SSE agora carrega só um ticket de 60s de escopo
  único, não mais um token de 15 minutos válido em qualquer rota.

### Bloqueio de ~17s na abertura direta
- `src/lib/api.ts`: novo `decodeOptimisticUser`, decodifica o access token
  localmente (sem chamada de rede).
- `src/lib/AuthContext.tsx`: preenche o usuário com esse valor otimista e
  libera a tela imediatamente; `/api/auth/me` continua rodando por baixo
  para confirmar o perfil completo e corrigir/expulsar a sessão se o token
  não for mais válido no servidor.

### Deploy sem cache + gate de `/version`
- `deploy.sh` (caminho VPS/docker compose): build agora força
  `--no-cache`; sucesso do deploy passa a depender de
  `scripts/verify-release.sh`, não só do container estar "Up".
- Novo `scripts/verify-release.sh`: lê a release esperada direto de
  `backend/src/release.ts`, faz polling de `/version`, `/health/live` e
  `/health`, e sai com erro se a release publicada não bater — pensado
  para ser o comando de pós-deploy no Coolify (produção real, que builda
  direto do `Dockerfile` da raiz).
- `DEPLOY.md`: documenta o uso do "Force rebuild without cache" do
  Coolify e do `verify-release.sh` como pós-deploy obrigatório.

## O que NÃO mudou (já estava certo desde o FIX51)

- Lock entre réplicas dos jobs de notificação (`pg_try_advisory_lock` em
  `clusterJob.ts`) — já impedia duplicação entre réplicas.
- DDL fora do caminho HTTP de tarefas/ranking.
- Carregamento de tarefas já não bloqueava a lista principal por
  ranking/ajuda/membros (usava `Promise.allSettled` nesse ponto
  específico desde o FIX51).
- Nenhuma tabela, seed, volume ou credencial foi tocada.

## Validação

```text
Frontend:  tsc -b .................. aprovado
Frontend:  vite build ............... aprovado
Backend:   tsc ....................... aprovado
Backend:   vitest .................... 22/22 aprovados
Backend:   test/tarefas.logic.test.js  14/14 aprovados
Total: 36/36
```

## Critério de aceite (após redeploy)

```bash
bash scripts/verify-release.sh https://nexus.permupay.com.br
```

Deve terminar com:

```text
/version     -> fix52-loading-notificacoes-20260730
/health/live -> JSON do nexus-api
/health      -> db: connected
```

Depois disso, confirme visualmente: `/tarefas` deve carregar a lista real
(não mais "Serviço temporariamente indisponível"), e o sino de notificações
não deve mais mostrar "99+" para sempre — o número deve refletir pendências
reais, e cair conforme forem lidas/arquivadas.
