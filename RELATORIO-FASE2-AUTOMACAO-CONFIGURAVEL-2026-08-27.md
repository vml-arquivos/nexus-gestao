# Relatório da Fase 2 — Automação configurável

**Projeto:** Nexus Gestão  
**Data:** 27 de agosto de 2026  
**Repositório:** [vml-arquivos/nexus-gestao](https://github.com/vml-arquivos/nexus-gestao)  
**Aplicativo de produção:** `nexus.permupay.com.br`  
**Escopo:** regras configuráveis de tarefas e checklists, com condições AND/OR, ações auditáveis e execução integrada ao outbox existente.

## 1. Diagnóstico e baseline

A fase começou com a exigência de não duplicar o motor de automação existente. O diagnóstico confirmou que o Nexus já possui `automation_events`, `automation_audit_log`, dispatcher, locks de cluster, retry e o job singleton de notificações. A implementação foi acoplada a esse fluxo, sem criar outro worker, outro `setInterval` ou outro mecanismo paralelo de persistência.

O baseline local anterior às alterações registrou **23 arquivos e 97 testes verdes**, além de build backend e build frontend concluídos. O baseline foi preservado nos artefatos de execução da sessão. Após a implementação e a correção da consulta real de membros de equipe, a validação completa passou em **24 arquivos e 101 testes**.

## 2. Backup obrigatório antes de DDL

Antes da migration da Fase 2 foi executado, no container Nexus correto pelo terminal do Coolify, um backup lógico customizado do PostgreSQL. O comando foi somente leitura e não alterou schema nem dados.

| Item | Evidência |
|---|---|
| Artefato | `/app/backups/nexus-fase2-pre-ddl-20260827.dump` |
| Formato | `pg_dump --format=custom --no-owner --no-privileges` |
| Tamanho | `190783353` bytes |
| SHA-256 | `b521bf64e1161c9c4d9151e2b35348483a2e71f9fa29ed79934ff1951975d698` |
| Container | `k68e0wa0djtqiqzgivruoe81-173912748696` |

O backup foi concluído antes de qualquer DDL. O artefato e o checksum também estão registrados em `phase2_deploy_evidence_2026-08-27.txt`, mantido localmente como evidência operacional e não incluído no commit de código.

## 3. Implementação realizada

Foi criado o módulo backend `backend/src/services/automation/userRules.ts`, responsável por normalizar regras, validar gatilhos, avaliar condições AND/OR, gerar chaves de idempotência e executar ações por organização. Os quatro gatilhos previstos foram ligados aos fluxos existentes: tarefa criada, mudança de status, prazo vencendo/atrasado e item de checklist concluído. O gatilho de prazo foi integrado ao job singleton de lembretes, sem timer adicional.

As ações suportadas são notificar uma pessoa, notificar uma equipe, mover status, adicionar item ao checklist e enviar webhook HTTP/HTTPS com timeout curto. A ação de equipe usa o schema real `equipes_membros.profile_id`, com filtro de organização e perfil ativo; não foi criada tabela relacional paralela. A adição de checklist mantém a proteção existente para payloads acima de 1 MB.

O outbox existente recebeu apenas o reconhecimento do namespace interno `NexusUserRule`, evitando que eventos de regras do Nexus sejam enviados indevidamente ao webhook do Destrava. As execuções continuam registradas em `automation_audit_log`, com resultado, tempo, erro e detalhe seguro. Repetições são deduplicadas por chave idempotente e eventos previamente falhos podem ser reprocessados pelo mecanismo existente.

A migration adicionou somente a tabela `automation_user_rules`, com `org_id`, `created_by`, nome, descrição, gatilho, condições, ações, estado ativo e timestamps. Os índices `idx_automation_user_rules_org_trigger` e `idx_automation_user_rules_created_by` foram criados com `CREATE INDEX CONCURRENTLY IF NOT EXISTS`, fora de transação, conforme o executor de migrations do Nexus. Nenhum registro existente foi reescrito, apagado ou truncado.

No frontend foi criada a página própria `src/pages/Automacoes.tsx`, registrada em `/automacoes` e no menu lateral. A tela oferece formulário de regra, condições opcionais, ações, ativação/pausa, lista de regras e auditoria recente. O cliente `automacoesApi` reutiliza o REST autenticado compartilhado, e os textos de navegação passam pelo sistema visual existente.

## 4. Testes locais pós-implementação

A validação final executou a suíte backend, build backend, build frontend e `git diff --check` em sequência. O resultado foi:

| Verificação | Resultado |
|---|---|
| Vitest backend | **24 arquivos aprovados; 101 testes aprovados** |
| Build TypeScript backend | **Aprovado** |
| Build Vite frontend | **Aprovado** |
| `git diff --check` | **Aprovado** |
| Testes específicos da Fase 2 | Normalização, AND/OR, transição de checklist, namespace local, proteção de checklist grande e migration aditiva/concurrente |

Os testes não criam dados reais. O teste negativo de produção também foi feito com payload vazio e não persistiu regra.

## 5. Commit e deployment

A implementação foi publicada no `main` em [commit `976200f`](https://github.com/vml-arquivos/nexus-gestao/commit/976200f4cd26b8cccff2d1ed99ea7c5ec2ed971a), com a mensagem `feat(nexus): add configurable user automations`.

O deployment no recurso Nexus foi [o deployment `ufry0p0a6fmhx6hq8szt60qm`](https://coolify.permupay.com.br/project/n9q32zjvccor52spawxqa1ri/environment/joaqkqkbgkj22zea6lfe09b0/application/k68e0wa0djtqiqzgivruoe81/deployment/ufry0p0a6fmhx6hq8szt60qm). O Coolify importou exatamente o SHA completo `976200f4cd26b8cccff2d1ed99ea7c5ec2ed971a`, marcou o deployment como **Success**, com início às 18:32:56 UTC, término às 18:36:54 UTC e duração de 3m58s.

O novo container foi `k68e0wa0djtqiqzgivruoe81-183256524440`. Os logs confirmaram migration concluída, aplicação de automação do usuário, conexão PostgreSQL, API na porta 3001, jobs existentes iniciados e container saudável. O trecho pós-deploy revisado não apresentou novo timeout de Agenda, erro de pool ou deadlock.

## 6. Validação real em produção

A página [Automação](https://nexus.permupay.com.br/automacoes) foi aberta com sessão autenticada. O menu, formulário, quatro gatilhos, cinco ações e catálogo de pessoas foram carregados. A validação foi somente de leitura e de entrada inválida; nenhuma regra real foi criada, ativada, pausada ou executada.

| Endpoint | Status | Tempo | Tamanho | Resultado seguro |
|---|---:|---:|---:|---|
| `/api/health` | 200 | 69 ms | 242 bytes | `status=ok`, `db=connected` |
| `/api/tarefas` | 200 | 194 ms | 113868 bytes | Lista funcional |
| `/api/agenda?mes=8&ano=2026&sync=false` | 200 | 117 ms | 38427 bytes | Agenda mensal funcional |
| `/api/notificacoes` | 200 | 203 ms | 31993 bytes | Endpoint funcional |
| `/api/equipe/membros` | 200 | 117 ms | 1662 bytes | Membros carregados |
| `/api/pagamentos` | 200 | 295 ms | 317184 bytes | Endpoint funcional |
| `/api/automation/rules` | 200 | 232 ms | 13 bytes | Lista vazia, sem regra criada |
| `/api/automation/rules/catalogo` | 200 | 240 ms | 664 bytes | Catálogo carregado |
| `/api/automation/rules/auditoria` | 200 | 123 ms | 16 bytes | Auditoria vazia |

Como verificação negativa, `POST /api/automation/rules` com payload vazio retornou **400 em 112 ms**, e a consulta imediatamente posterior à lista retornou **200**, 13 bytes e lista vazia. Isso confirmou o guard de validação sem persistência acidental.

## 7. Preservação, segurança e limites

A fase não tocou nos aplicativos Shop PermuPay ou Destrava, nem nos bancos correspondentes. Os três checklists JSONB históricos de aproximadamente 30 MB foram preservados; não houve `DELETE` em massa, `TRUNCATE`, regravação ou truncamento desses registros. As regras são isoladas por `org_id`, as operações de escrita exigem autenticação e papel permitido, e o histórico de auditoria permanece separado da configuração ativa.

A integração Qualify não foi configurada, pois a conexão será realizada manualmente pelo usuário e não foram fornecidos URL, documentação ou credencial oficial. O fallback de IA da fase anterior permanece independente; a Fase 2 usa lógica determinística e não depende de créditos Gemini.

## 8. Rollback conhecido

O rollback de aplicação é feito revertendo o commit `976200f` e executando novo deployment do Nexus pelo Coolify. A migration é aditiva e idempotente; portanto, o rollback do código não exige apagar a tabela `automation_user_rules` nem remover índices. As regras criadas posteriormente podem permanecer inativas sem afetar o código anterior. Em caso de necessidade de restauração de dados, o dump customizado pré-DDL pode ser restaurado em uma instância controlada com `pg_restore`, após confirmação operacional e verificação de destino.

## 9. Status da fase

**Fase 2 aprovada tecnicamente.** O baseline, a implementação, os testes, o backup pré-DDL, o commit/push, o deployment Success, o healthcheck, os logs de startup, as APIs críticas e a interface de produção foram validados. O próximo passo planejado é a Fase 3, de mapa mental e Projetos, mantendo `tarefas.checklist` JSONB como fonte de verdade e repetindo o mesmo protocolo de baseline, backup antes de DDL, testes, deployment e validação real.
