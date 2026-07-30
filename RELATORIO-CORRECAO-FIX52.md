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

## Incidente no primeiro deploy desta release (corrigido)

Na primeira tentativa de publicar o FIX52, o deploy falhou no Coolify: a
migração tentou criar `uq_notif_ativa_por_referencia` (índice único) numa
tabela que **já tinha duplicatas reais** de notificação não lida — o
próprio dado que este FIX52 existe para corrigir. `CREATE UNIQUE INDEX`
não se cria sobre dados que já violam a unicidade, a migração falhou 12/12
tentativas, o backend nunca chegou a subir (`/health/live` recusando
conexão), e o Coolify fez rollback automático para o container anterior.
**Produção não ficou no ar com o build quebrado** — o rollback do Coolify
funcionou como deveria.

Correção: antes de criar o índice, a migração agora consolida os grupos
duplicados numa tabela temporária — mantém a notificação mais recente de
cada grupo como não lida (somando `ocorrencias`) e arquiva as demais como
já lidas, sem apagar nada. Só depois cria o índice.

Esta correção foi validada com um PostgreSQL 16 real (não simulado):
reproduzi o exato conflito do log de produção (mesmos `org_id`/`user_id`/
`referencia_id`/`tipo`, 5 linhas duplicadas), rodei o `migrate.js`
compilado de verdade (mesmo caminho que roda dentro do container) contra
esse banco, e confirmei:
- migração termina com sucesso (`Schema aplicado com sucesso!`);
- nenhuma linha é perdida (total de linhas antes = depois);
- exatamente 1 notificação ativa por grupo duplicado, com `ocorrencias`
  somado corretamente;
- rodar a migração de novo (redeploy seguinte) é idempotente, não
  reprocessa o que já foi consolidado.

## Segundo incidente: OOM no primeiro job de arquivamento (corrigido)

Depois do redeploy bem-sucedido, o job de arquivamento (`jobArquivarNotificacoesAntigas`)
encontrou o backlog histórico real (18.072 notificações represadas) e tentou
arquivar tudo num único `UPDATE` sem lote. Isso segurou lock/conexão,
competiu com o tráfego normal — causando os `Query read timeout` simultâneos
em `/tarefas`, `/agenda`, `/notificacoes` e `/ranking` — e contribuiu para o
processo estourar os 512MB de heap (`FATAL ERROR: Reached heap limit`). O
`supervisord` reiniciou o processo sozinho e a migração (idempotente) rodou
de novo sem problema, mas foi um risco evitável.

Correção: `jobArquivarNotificacoesAntigas` agora processa em lotes de 500
(`FOR UPDATE SKIP LOCKED` + `LIMIT`), com uma pequena pausa entre lotes, até
esgotar o backlog ou atingir um teto de segurança por execução. A rota
manual `DELETE /antigas` ganhou o mesmo tipo de limite (2000 por chamada),
já que ela roda dentro de uma requisição HTTP síncrona.

Validado com um backlog de 25.000 notificações (maior que o de produção)
num PostgreSQL 16 real: todas as 25.000 arquivadas corretamente, 0
perdidas, em 51 lotes de ~70-100ms cada — nenhum lote chega perto do
`statement_timeout` de 15s configurado em produção.

## Terceiro achado: 1,18 milhão de linhas sintéticas em `agenda`

Durante a migração de servidor, o volume de dados revelou algo que nenhum
log anterior tinha mostrado: a tabela `agenda` tinha **1.186.326 linhas**
para apenas **65 tarefas** reais. Causa: em
`backend/src/services/agendaSyncService.ts`, a sincronização de subtarefas
de checklist usava `item?.id || item?.texto` como identidade -- para itens
sem `id` persistido, a "chave de sincronização" mudava a cada execução do
job (rodando a cada poucos minutos, por meses antes de
`AGENDA_AUTO_SYNC_ENABLED` ser desligado), e cada rodada tratava tudo como
inédito. Confirmado por diagnóstico: as 1.186.325 chaves com `sync_key` são
**todas distintas entre si** -- não é duplicata por colisão, é geração
descontrolada de chaves novas.

Correção:
- `agendaSyncService.ts`: item de checklist sem `id` estável agora é
  pulado (não sincroniza) em vez de usar um substituto instável.
- Nova migração: `ux_agenda_org_sync_key`, índice **único** de verdade em
  `agenda(org_id, sync_key)` -- antes só existia um índice de busca, que
  acelerava a consulta mas não impedia duplicata nenhuma. Agora nenhum
  bug futuro consegue repetir esse estrago silenciosamente.
- Validado com 200.000 linhas sintéticas (todas com `sync_key` únicas,
  reproduzindo a forma exata do dado real): migração aplica em ~10s, sem
  erro, índice único criado corretamente.

As linhas antigas em si (100% `auto_sync = TRUE`, dado derivado e
regenerável, não fonte de verdade) devem ser limpas manualmente uma vez
durante a migração de servidor -- ver instruções à parte.

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

### Painel do gestor travando (membro carregava normalmente)
Reportado depois do teste em produção: os painéis de quem é `membro`
carregavam, só o de `gestor`/`sub_gestor` travava. Causa encontrada em
`GET /api/equipe/membros` (`backend/src/routes/equipe.ts`) — só chamada
pelo dashboard quando o papel é gestor-like:
- **Antes**: 4 subconsultas correlacionadas por membro da equipe
  (`SELECT COUNT(*) FROM tarefas WHERE responsavel_id = p.id AND ...`,
  uma para cada status), sem índice composto que as sustentasse. Com M
  membros isso virava 4×M varreduras na tabela `tarefas` a cada
  carregamento — o papel `membro` usa uma consulta simples, sem essas
  contagens, por isso nunca travava.
- **Agora**: uma única subconsulta agregada (`GROUP BY responsavel_id`
  com `COUNT(*) FILTER (...)`) faz uma passada só na tabela e é unida ao
  `profiles`, em vez de 4×M consultas separadas. Adicionei também o índice
  `idx_tarefas_criado_por_responsavel_status` para sustentar essa
  agregação.

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
