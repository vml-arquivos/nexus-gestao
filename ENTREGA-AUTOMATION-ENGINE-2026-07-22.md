# Nexus Gestão — Automation Engine (Destrava ⇄ Nexus)

**Data:** 2026-07-22
**Status:** Entregue com zero regressão
**Testes:** 12 novos testes (vitest, introduzido nesta entrega) + 13 testes legados (`test/tarefas.logic.test.js`) — todos passando
**TypeScript:** 0 erros (`npx tsc --noEmit` em `backend/`)
**Build:** `npm run build` (tsc) completo

Este documento cobre a metade Nexus do Automation Engine. O Destrava tem seu próprio `ENTREGA_AUTOMATION_ENGINE_2026-07-22.md` espelhando esta estrutura, com o catálogo de eventos completo.

---

## Objetivo

Receber e processar os eventos de domínio que o Destrava passa a emitir automaticamente (contrato assinado/encerrado, rotinas CND/CEMPROT vencidas, acompanhamento bancário criado) e criar as tarefas correspondentes sem nunca duplicar — e emitir de volta para o Destrava quando uma tarefa originada de lá muda de estado dentro do próprio Nexus.

---

## Arquivos Criados

| Arquivo | Descrição |
|---|---|
| `backend/src/services/automation/outboxRepository.ts` | Outbox (`automation_events`): inserir (idempotente), reivindicar lote pendente, marcar sucesso/falha, auditoria. |
| `backend/src/services/automation/eventBus.ts` | `publishEvent()` para os eventos que o Nexus emite (`TarefaConcluidaNexus`, `AlertaAutomacao`). |
| `backend/src/services/automation/dispatcher.ts` | Despacho imediato + `executarVarreduraOutboxAutomation()` (varredura de retry). |
| `backend/src/services/automation/webhookClient.ts` | Cliente HTTP assinado (HMAC) para chamar o Destrava. |
| `backend/src/services/automation/alertJob.ts` | Ladder de alertas 7d/3d/1d/hoje/atrasado para tarefas do Automation Engine. |
| `backend/src/middleware/webhookAuth.ts` | Verificação de assinatura HMAC + janela de replay + nonce. |
| `backend/src/routes/automation.ts` | `POST /destrava/eventos` (recebe do Destrava) + `GET/POST /events*` (ops, admin). |
| `backend/src/routes/automationHandlers/{shared,contrato,rotinas,acompanhamento,publish}.ts` | Handlers de cada evento e a criação idempotente de tarefa (`criarTarefaAutomacao`, com `pg_advisory_xact_lock` + `ON CONFLICT DO NOTHING`). |
| `backend/vitest.config.ts`, `backend/test/helpers/fakePool.ts`, `backend/test/automationOutbox.test.ts`, `backend/test/automationTarefas.test.ts` | Suíte de testes (vitest introduzido nesta entrega). |

## Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `backend/src/db/migrate.ts` | `automation_events`, `automation_audit_log`; colunas de recorrência/agrupamento em `tarefas` (`recorrencia`, `competencia`, `projeto_grupo_id`, `workflow_tipo`); consolidação de `nexus_external_links` (bloco duplicado removido, `UNIQUE` adicionada); `external_key` de `tarefas` ganhou índice único. |
| `backend/src/routes/integracoes.ts` | **Corrigido bug pré-existente**: `POST /destrava/tarefas` gerava `external_key` com `Date.now()`, nunca idempotente de verdade — uma reentrega de rede virava tarefa duplicada. Agora a chave é determinística (hash do conteúdo) e o insert usa `pg_advisory_xact_lock` + `ON CONFLICT DO NOTHING` com fallback de leitura. Adicionadas `POST /destrava/tarefas/:id` (leitura), `PATCH /destrava/tarefas/:id/checklist` e `.../status` (escrita) para o Workflow 2. Funções internas exportadas (`findActiveUserByEmail`, `resolveIntegrationUser`, `addHistorico`, `requireIntegrationSecret`) para reuso pelos novos handlers. |
| `backend/src/routes/tarefas.ts` | Publica `TarefaConcluidaNexus` quando uma tarefa com `origem_sistema='destrava'` muda de status/checklist dentro do próprio Nexus (3 pontos: `PATCH /:id/checklist/:itemId`, `PATCH /:id`, `POST /:id/resposta`) — tarefas nativas do Nexus não são afetadas. |
| `backend/src/index.ts` | Monta `automation`/`automationOps` routers; inicia a varredura de retry e o job de alertas junto com `iniciarJobsNotificacao()`; `express.json()` passa a capturar `rawBody` para a verificação de assinatura. |
| `backend/package.json` | `+vitest` (devDependency), script `test`. |
| `.env.example` | `AUTOMATION_RETRY_INTERVAL_MS` (reaproveita `NEXUS_DESTRAVA_INTEGRATION_SECRET` como chave HMAC). |

---

## Garantia central: nunca duplicar tarefa

`criarTarefaAutomacao()` (usada por rotinas CND/CEMPROT e pelas semanas do acompanhamento bancário) serializa com `pg_advisory_xact_lock(hashtext(externalKey))` dentro de uma transação e usa `INSERT ... ON CONFLICT (org_id, external_key) DO NOTHING` — testado em `test/automationTarefas.test.ts` com 10 chamadas concorrentes reais (via `Promise.all`, exercitando a função de produção) para a mesma `externalKey`, resultando em exatamente 1 tarefa.

---

## Limitações conhecidas / follow-up sugerido

- **Sem Postgres real no ambiente de testes** (nem aqui nem no Destrava) — os testes usam uma fake de Postgres em memória (`test/helpers/fakePool.ts`) que reproduz a mesma regra (`ON CONFLICT DO NOTHING`), mas não uma corrida real entre duas conexões/processos. Recomenda-se validar com um smoke test manual em staging antes do primeiro uso em produção real.
- **CND/CEMPROT não têm integração com API de órgão público** — são tarefas com checklist para execução manual por um analista dentro do próprio Nexus (não há RPA/scraping, que exigiria contornar CAPTCHA).
- **WhatsApp/Email** para os alertas — adiado pelo usuário para depois.

---

## Validações Executadas

| Checagem | Resultado |
|---|---|
| `npx tsc --noEmit` (backend) | **0 erros** |
| `npm run build` (backend, tsc) | **Completo** |
| `npx vitest run` (backend) | **12/12 novos testes passando** |
| `node --test test/tarefas.logic.test.js` | **13/13 (legado, sem regressão)** |
