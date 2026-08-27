# Relatório — Lifecycle de notificações recorrentes e resiliência de leituras

**Sistema:** Nexus Gestão
**Período de execução:** 25–27 de agosto de 2026
**Responsável:** Manus AI
**Escopo:** aplicação Nexus no recurso Coolify `k68e0wa0djtqiqzgivruoe81`
**Status:** validação técnica e redeploy final concluídos no container `k68e0wa0djtqiqzgivruoe81-021655457644`; todos os endpoints críticos autenticados responderam HTTP 200 sem timeout.

## 1. Diagnóstico e correção do lifecycle recorrente

A implementação anterior usava `lida = FALSE` como parte do índice parcial e do `ON CONFLICT` do upsert recorrente. Como `lida` representa apenas se o usuário visualizou a notificação, a leitura fazia a linha deixar de participar da deduplicação. O job seguinte podia inserir outra linha para a mesma pendência, repetindo o processo a cada ciclo.

A correção separa leitura de lifecycle. A identidade recorrente passou a ser `org_id + user_id + referencia_id + chave_recorrencia`, com estado explícito em `recorrente`, `ativa`, `resolvida_em`, `ocorrencias`, `atualizada_em`, `arquivada` e `arquivada_em`. Mudanças de subtipo, como `tarefa_prazo_hoje` para `tarefa_atrasada`, atualizam a mesma linha. O primeiro INSERT pode disparar Web Push; atualizações posteriores são silenciosas via SSE. A resolução marca a ocorrência como inativa, resolvida e arquivada, preservando o histórico.

A migration `2026-08-25-notification-lifecycle` usa `ADD COLUMN IF NOT EXISTS`, índices idempotentes e criação concorrente fora de transação explícita. A chave única parcial `uq_notif_recorrente_ativa` cobre exclusivamente notificações recorrentes ativas com referência e chave válidas. Nenhum backfill destrutivo, `DELETE FROM notificacoes`, `TRUNCATE`, `DROP TABLE`, reset ou restauração de banco foi realizado.

## 2. Correções de performance identificadas na validação

A primeira validação real encontrou timeouts em Agenda, Tarefas, ranking e atrasos. A Agenda possuía aproximadamente 1,97 milhão de linhas; sua consulta precisava ordenar uma janela grande. A migration `2026-08-27-agenda-query-performance` criou o índice composto `idx_agenda_org_data_inicio_created_at`, incluindo a organização, a data de início e `created_at`, e executou `ANALYZE`. Depois do deploy, `/api/agenda?sync=false` respondeu HTTP 200 com 2.000 eventos em aproximadamente 2,24 segundos e a consulta mensal respondeu HTTP 200 com 43 eventos em aproximadamente 2,21 segundos.

O segundo gargalo não era a quantidade de tarefas: havia 67 tarefas e 67 registros de pontuação. Três checklists históricos tinham aproximadamente 30 MB cada, totalizando 90.164.768 bytes. As listas usavam `SELECT t.*`, o ranking selecionava `checklist` integral e `/atrasos-pendentes` também transferia esses objetos. A correção mantém a rota de detalhe completa, mas as leituras em massa aplicam projeção explícita: checklists até 1 MB são retornados normalmente; payloads acima desse limite retornam `[]` com `checklist_truncado=true` e `checklist_bytes`, sem modificar o registro original. Os jobs de recorrência e lembrete diário também pulam payloads patológicos com aviso conciso, em vez de gerar ocorrência vazia ou incorreta.

Os três registros preservados são `d8fff8a8-cc73-4ff7-a090-39581888f143`, `6c6d416c-5af3-456a-b288-3ef43de90bda` e `4168afbf-8c99-4293-a187-443321515b9a`. Nenhum deles foi apagado, reduzido ou regravado.

## 3. Arquivos e commits

| Commit | Conteúdo | Estado |
|---|---|---|
| `e517414b2c997ce260c3b6fc55415dea2e75b43c` | Lifecycle único de notificações recorrentes, migration, helper, resolução, push e testes | Publicado em `main` e deployado |
| `d88ac7637b524ad460488bfbedd1503876804a77` | Índice composto e migration de performance da Agenda | Publicado em `main` e deployado |
| `90f788f287a256d0b87e93c10677587d142b7431` | Projeção de checklist limitada em Tarefas, ranking e atrasos | Publicado em `main`, container healthy validado |
| `4a2ff37ef6807ebe1191051f10f2b4952ff3d43b` | Proteção dos leitores auxiliares e jobs de background e teste estático de regressão | Publicado em `main` e deployado |
| `1e16d4bf5b010f97320389a647614afb6a4dab54` | Atualização documental com o deployment final e a validação autenticada | Publicado em `main`; não altera código implantado |

A proteção final abrange `backend/src/routes/tarefas.ts`, `backend/src/routes/tarefasScoring.ts`, `backend/src/routes/notificacoes.ts`, `backend/src/lib/notifHelper.ts`, `backend/src/services/recorrenciaTarefasService.ts` e `backend/test/oversizedChecklistProtection.test.ts`. O Shop PermuPay, seu banco, seu recurso Coolify e o Destrava não foram tocados.

## 4. Backup lógico de produção

O backup foi criado antes da aplicação das migrations no PostgreSQL Nexus, usando dump lógico custom. O arquivo está em `/var/lib/postgresql/data/backups/nexus_pre_notification_lifecycle_20260827T012618Z.dump`, tem 190.397.340 bytes e SHA-256 `19142c6f04dcbb1de0611b13825bdf470f883f6263bbc4558205e3d65a4b64d1`. `pg_restore -l` confirmou que o dump é válido. Credenciais e valores secretos não foram registrados neste relatório.

## 5. Evidências de schema e banco após o deploy

| Verificação | Resultado observado |
|---|---|
| `2026-08-25-notification-lifecycle` | Aplicada em `2026-08-27T01:32:36.554Z` |
| `2026-08-27-agenda-query-performance` | Aplicada em `2026-08-27T01:50:05.265Z` |
| Índices de lifecycle | `uq_notif_recorrente_ativa`, `idx_notif_recorrente_referencia` e `idx_notif_recorrente_usuario` presentes |
| Índice de Agenda | `idx_agenda_org_data_inicio_created_at` presente |
| Checklists acima de 1 MB | 3 registros, máximo 30.044.115 bytes, total 90.164.768 bytes; preservados |
| Locks aguardando | 0 |
| Atividade não ociosa na consulta de diagnóstico | 0 |
| Estado do recurso | Running e healthy no Coolify |

Antes da primeira migration, o banco tinha 183.810 notificações, 67 tarefas e 185.556.992 bytes estimados na tabela de notificações. Após a aplicação do lifecycle, foram observadas 184.014 notificações e 204 notificações recorrentes ativas, todas com chave válida. O crescimento histórico não foi limpo, conforme exigência de preservação.

## 6. Deploys e validação real

| Deployment | Commit | Resultado |
|---|---|---|
| `v14ow86pk40opzdoglmq29zz` | `e517414` | Success, migration do lifecycle aplicada |
| `qb4izx2wbqubepg2k29b96t7` | `d88ac76` | Success, migration da Agenda aplicada e `ANALYZE` concluído |
| `ammy223hhq9sdv3y2h9aq89o` | `90f788f` | Container `k68e0wa0djtqiqzgivruoe81-020329968585` iniciou, API/DB healthy e projeção validada |
| `qrbsap5ant0bpxyfdxs7u9ge` | `4a2ff37` | Success; iniciado às 02:16:55 UTC, encerrado às 02:20:49 UTC, duração 03m54s; recurso Running e healthy |

No container baseado em `90f788f`, o health endpoint retornou `status=ok` e `db=connected`. A renovação de sessão pelo fluxo oficial de refresh foi bem-sucedida. A bateria autenticada inicial retornou HTTP 200 em todos os endpoints críticos: Tarefas em 121 ms, ranking em 228 ms, atrasos em 597 ms, Agenda em 502 ms, pagamentos em 277 ms, equipe em 280 ms e notificações em 556 ms.

Após o redeploy final de `4a2ff37`, o health endpoint continuou com `status=ok` e `db=connected`. A rodada final autenticada confirmou HTTP 200 em Tarefas (239 ms), ranking (191 ms), atrasos (163 ms), Agenda (338 ms), pagamentos (69 ms), equipe (62 ms) e notificações (64 ms), sem timeout.

A resposta de Tarefas continha 25 tarefas, maior checklist normal de 12.466 bytes e os três IDs patológicos como lista vazia, com `checklist_truncado=true` e tamanho declarado entre 30.038.526 e 30.044.115 bytes. Ranking retornou quatro linhas sem checklist gigante. Atrasos retornou nove tarefas, também sem materializar payload patológico.

A navegação autenticada carregou Dashboard, Agenda com 43 eventos, Tarefas com 21 listas, uma tarefa normal de três itens, Financeiro com 430 movimentos, Equipe com cinco membros e Notificações com 210 não lidas. Nenhum item foi criado, alterado, pago, aprovado, marcado como lido, arquivado ou excluído. O console do navegador não registrou exceções durante a abertura da tarefa normal.

## 7. Testes e build local

| Comando | Resultado |
|---|---|
| `cd backend && npm test -- --run` | 22 arquivos e 92 testes aprovados |
| `cd backend && npm run build` | TypeScript aprovado |
| `npm run build` | Frontend compilado com sucesso |
| `git diff --check` | Sem erro de whitespace |
| `npm run lint` | Falha preexistente no frontend, com 706 problemas fora do escopo; não foi alterado para mascarar esses avisos |

O teste `oversizedChecklistProtection.test.ts` garante por inspeção estática que a projeção de tarefas usa `pg_column_size`, devolve lista vazia para payloads acima do limite, mantém os metadados de truncamento, não reintroduz `SELECT t.*` na projeção e preserva a rota de detalhe. O segundo caso verifica a proteção em ranking, atrasos e jobs de background.

## 8. Rollback e limites conhecidos

O rollback da aplicação pode ser feito selecionando no Coolify a imagem saudável anterior ou revertendo o commit correspondente, sem remover colunas nem substituir o banco. As migrations são aditivas e os índices podem permanecer durante rollback de código. O dump lógico pré-migration deve ser mantido como proteção adicional e somente restaurado por procedimento operacional autorizado, nunca como limpeza automática.

Os três checklists patológicos continuam no banco por decisão explícita de preservação. Eles devem ser investigados e corrigidos manualmente em uma missão separada, com backup próprio e validação do conteúdo. A lista, ranking, atrasos e jobs não os materializam mais. O endpoint de detalhe continua deliberadamente completo para permitir tratamento manual de uma tarefa específica.

A integração Qualify não foi configurada porque não há conector habilitado, URL, documentação e credencial fornecidos; o usuário fará a conexão manual. Não foi criada integração aproximada.

## 9. Status de aprovação

A correção do lifecycle recorrente, a performance da Agenda e a proteção de payloads — incluindo leitores auxiliares e jobs de background — foram implementadas, testadas, publicadas e validadas em produção. O deployment final `qrbsap5ant0bpxyfdxs7u9ge` confirmou o SHA de código `4a2ff37` no Coolify, o recurso permaneceu Running e healthy, e a repetição dos endpoints críticos confirmou HTTP 200 sem timeout. O commit posterior `1e16d4b` atualizou somente este relatório e não requer novo redeploy. **Status: APROVADO.**
