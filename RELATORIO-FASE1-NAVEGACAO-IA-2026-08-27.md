# Relatório — Fase 1: navegação e IA leve

**Sistema:** Nexus Gestão  
**Período:** 27 de agosto de 2026  
**Escopo:** command palette global, visões calendário/tabela, sugestão de checklist por IA e sugestão de prazo em linguagem natural.  
**Status:** implementação local concluída; validação de produção será registrada após o deploy da fase.

## Diagnóstico e decisão técnica

O Nexus já possuía uma palette global em `GlobalSearch.tsx`, com atalho Ctrl/Cmd+K e busca em dados carregados de Tarefas, Financeiro, Pessoas e Documentos. A decisão segura foi estender a implementação existente com ações diretas para Tarefas, Agenda, Financeiro e Equipe, sem criar índice de busca paralelo nem nova chamada por tecla.

A tela de Tarefas já possuía uma lista filtrada e agrupada em `filtered`/`visualEntries`. As visões Calendário e Tabela foram criadas como componentes próprios e recebem a seleção já filtrada, preservando permissões, agrupamento, ações e contratos existentes. Nenhuma regra de negócio foi duplicada e nenhum endpoint foi criado para essas visões.

O formulário já tinha geração manual de checklist. Foi adicionada uma sugestão de IA server-side em módulo e rota próprios. A IA retorna apenas itens para revisão; o usuário seleciona e confirma a inclusão no rascunho, e o salvamento final continua usando o endpoint existente de criação/edição de tarefas. O serviço limita entrada e saída e não grava dados automaticamente.

A detecção de prazo é local e conservadora. Expressões como “amanhã”, “até sexta-feira”, “em 5 dias” e datas explícitas são convertidas para ISO somente como sugestão. O valor do campo `DateFieldBR` só muda quando o usuário confirma, respeitando o contrato existente e a validação de data mínima.

## Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `src/components/GlobalSearch.tsx` | Ações rápidas para Tarefas, Agenda, Financeiro e Equipe. |
| `src/components/TaskCalendarView.tsx` | Nova visão mensal sobre as tarefas filtradas. |
| `src/components/TaskTableView.tsx` | Nova visão tabular, com abertura e edição delegadas à tela existente. |
| `src/lib/naturalLanguageDate.ts` | Parser local e validado de prazos em português. |
| `src/pages/Tarefas.tsx` | Conexão dos quatro modos e controles de IA/sugestão de prazo no modal. |
| `src/lib/api.ts` | Método autenticado `tarefasApi.sugerirChecklist`. |
| `backend/src/services/geminiService.ts` | Sugestão estruturada server-side com limites e fallback seguro. |
| `backend/src/routes/iaChecklist.ts` | Rota autenticada `POST /api/tarefas/ia-checklist`; não persiste dados. |
| `backend/src/index.ts` | Montagem da nova rota. |
| `backend/test/phase1Productivity.test.ts` | Testes de parser e regressão de conexões da fase. |

Não houve migration nem alteração de schema nesta fase; portanto, não foi necessário novo dump de PostgreSQL. Nenhuma linha existente foi apagada, truncada ou reescrita.

## Evidências locais

A suíte completa passou com **23 arquivos e 95 testes**. O build do backend, o build do frontend e `git diff --check` passaram. O lint global continua fora do escopo por conter problemas preexistentes no frontend; não foi alterado para mascarar esses avisos.

## Produção

A preencher após o deploy: SHA, deployment ID, estado do container, tempos e status HTTP dos endpoints críticos, abertura visual das visões e confirmação de ausência de regressão.

## Rollback

O rollback consiste em selecionar no Coolify a imagem saudável anterior ou reverter o commit da fase. Como não houve alteração de schema, não há rollback de banco associado. A rota nova pode deixar de ser chamada sem impactar criação/edição de tarefas; os componentes novos são isolados e os modos anteriores Lista/Quadro permanecem disponíveis.

## Preservação e limitações

Os três checklists históricos grandes permanecem preservados conforme a missão anterior. O Shop PermuPay, seu banco, o Destrava e a integração Qualify não foram tocados. A sugestão de IA depende da configuração Gemini existente no servidor; quando indisponível, o usuário recebe uma mensagem e mantém o gerador manual.
