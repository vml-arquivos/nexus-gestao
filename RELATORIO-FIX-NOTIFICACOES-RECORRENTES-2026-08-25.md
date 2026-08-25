# Relatório — Lifecycle de notificações recorrentes

**Sistema:** Nexus Gestão
**Data:** 2026-08-25
**Autor:** Manus AI
**Status antes do deploy:** implementação validada localmente; deploy real aguardando acesso manual ao Coolify.

## 1. Diagnóstico confirmado

A implementação anterior usava `lida = FALSE` como parte do índice parcial e do `ON CONFLICT` do upsert recorrente. Como `lida` representa somente se o usuário visualizou a notificação, a leitura fazia a linha deixar de participar da deduplicação. O job seguinte podia então inserir uma nova linha para a mesma pendência, repetindo o processo a cada ciclo.

O problema também atingia a transição de subtipo, por exemplo `tarefa_prazo_hoje` para `tarefa_atrasada`, e permitia reemissão de Web Push em atualizações da mesma pendência. A correção preserva o histórico legado e impede novo crescimento por esse mecanismo; ela não executa a restauração ou limpeza histórica descrita no prompt.

## 2. Arquitetura anterior e nova

| Aspecto | Antes | Depois |
|---|---|---|
| Estado de leitura | Participava da chave de deduplicação | Continua independente do lifecycle |
| Identidade recorrente | `org_id + user_id + referencia_id + tipo` | `org_id + user_id + referencia_id + chave_recorrencia` |
| Estado da pendência | Implícito em `lida` | Explícito em `recorrente`, `ativa` e `resolvida_em` |
| Mudança de subtipo | Podia criar nova linha | Atualiza a mesma linha e preserva o ID |
| Concorrência | Índice parcial dependente de não lida | UNIQUE parcial somente para recorrentes ativas |
| Repetição de push | Jobs podiam reemitir push | Primeiro INSERT envia; UPDATE usa SSE silencioso |
| Encerramento | Sem helper de origem | `ativa=false`, `resolvida_em` preenchida e arquivamento sem DELETE |

## 3. Implementação

Foi criada a migration `2026-08-25-notification-lifecycle`, independente da migration histórica, com as colunas `recorrente`, `ativa`, `chave_recorrencia`, `resolvida_em`, `ocorrencias`, `atualizada_em`, `arquivada` e `arquivada_em` usando `ADD COLUMN IF NOT EXISTS`. O índice `uq_notif_recorrente_ativa` é criado antes da remoção do legado `uq_notif_ativa_por_referencia`; ambos os passos são idempotentes e o uso de `CONCURRENTLY` ocorre fora de transação explícita.

As chaves de lifecycle implementadas são `tarefa_prazo`, `financeiro_prazo`, `tarefa_lembrete_diario` e `checklist_recorrente`. O helper `criarOuAtualizarNotificacaoRecorrente` faz upsert na mesma linha, atualiza título, tipo, corpo, timestamp e contador, sem alterar `lida`. A resolução filtra por origem e marca a linha como inativa, resolvida e arquivada, preservando o registro.

A reconciliação seletiva percorre somente notificações recorrentes ativas com referência relacionada a tarefas fechadas ou pagamentos pagos/cancelados. O arquivamento automático e a rota manual excluem recorrentes ainda ativas. Os fluxos de aprovação, exclusão/cancelamento de tarefa, pagamento resolvido/excluído e webhook de status do Destrava chamam a resolução imediata quando aplicável. O Destrava não foi modificado; apenas o endpoint Nexus que recebe o webhook foi ajustado.

## 4. Arquivos alterados

| Caminho | Motivo |
|---|---|
| `backend/src/db/migrate.ts` | Schema aditivo, migration independente, índices e remoção segura do índice legado |
| `backend/src/lib/notifHelper.ts` | Chaves estáveis, upsert explícito, resolução, reconciliação, push silencioso e arquivamento seguro |
| `backend/src/routes/notificacoes.ts` | Arquivamento manual não toca recorrente ativa |
| `backend/src/routes/pagamentos.ts` | Resolução em pagamento pago/cancelado e exclusão |
| `backend/src/routes/tarefas.ts` | Resolução em aprovação e exclusão |
| `backend/src/routes/tarefasScoring.ts` | Resolução no handler de aprovação de scoring |
| `backend/src/routes/integracoes.ts` | Resolução quando webhook Nexus recebe conclusão/cancelamento do Destrava |
| `backend/test/notificationLifecycle.test.ts` | Testes novos de upsert, leitura, transição, resolução, push, migration e arquivamento |
| `backend/test/runtimeResilience.test.ts` | Alinhamento de duas asserções textuais obsoletas à implementação atual de recorrência por item |
| `RELATORIO-FIX-NOTIFICACOES-RECORRENTES-2026-08-25.md` | Evidências e procedimento de rollback |

## 5. Testes e build locais

| Comando | Resultado |
|---|---|
| `cd backend && npm test -- --run test/notificationLifecycle.test.ts --reporter=verbose` | 7/7 testes aprovados |
| `cd backend && npm test -- --reporter=dot` | 21 arquivos e 90 testes aprovados |
| `cd backend && npm run build` | TypeScript aprovado |
| `npm run build` | Frontend compilado com sucesso |
| `git diff --check` | Sem erro de whitespace |
| `npm run lint` | Falha preexistente no frontend: 706 problemas em arquivos já existentes, fora do escopo desta correção |

## 6. Backup pré-migration

Ainda não executado no PostgreSQL de produção. Deve ser gerado no recurso Nexus do Coolify imediatamente antes da aplicação da migration, em formato custom lógico (`pg_dump -Fc --no-owner --no-acl`), com caminho, tamanho e SHA-256 registrados sem expor credenciais. Nenhum banco foi restaurado, substituído, resetado ou limpo por esta correção.

## 7. Git e deploy

| Item | Evidência |
|---|---|
| Branch | `main` |
| Commit anterior | `b058058ca9607df7160f26b0ea55ed4185295426` |
| Commit novo | A preencher após commit |
| Push | A confirmar após publicação |
| Recurso Coolify Nexus | `k68e0wa0djtqiqzgivruoe81` |
| Recurso Shop PermuPay | Não tocado |
| Aplicação da migration | Pendente de acesso ao Coolify/PostgreSQL |
| Redeploy e healthcheck | Pendente de acesso ao Coolify |

## 8. Rollback

O rollback da aplicação é feito revertendo o commit desta correção ou selecionando a imagem anterior no recurso Nexus. A migration é aditiva e não exige remoção de colunas para voltar o código. O índice novo deve permanecer no banco durante um rollback de aplicação; não há operação destrutiva prevista. O dump pré-migration, quando gerado, será mantido como proteção adicional.

## 9. Itens preservados

A agenda não foi limpa nem sua sincronização automática foi habilitada. O Shop PermuPay, seu banco e seu recurso Coolify não foram alterados. O Destrava não foi alterado. Nenhum `DELETE FROM notificacoes`, `TRUNCATE`, `DROP TABLE`, restauração de dump ou reset de banco foi executado.

## 10. Status

**BLOQUEADO para declarar conclusão de produção** até que o usuário forneça acesso manual ao Coolify ou a URL/sessão autenticada correspondente, permitindo gerar o backup, aplicar a migration, acompanhar o redeploy, consultar logs/saúde, confirmar o schema PostgreSQL e executar a navegação real sem alterar dados de negócio desnecessariamente.
