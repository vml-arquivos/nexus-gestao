# Relatório — Fase 1: navegação e IA leve

**Sistema:** Nexus Gestão
**Período:** 27 de agosto de 2026
**Escopo:** command palette global, visões calendário/tabela, sugestão de checklist assistida e sugestão de prazo em linguagem natural.
**Status:** **aprovada após deploy, healthcheck, validação autenticada e inspeção visual em produção.**

## Diagnóstico e decisão técnica

O Nexus já possuía uma palette global em `GlobalSearch.tsx`, com atalho Ctrl/Cmd+K e busca em dados carregados de Tarefas, Financeiro, Pessoas e Documentos. A decisão segura foi estender a implementação existente com ações diretas para Tarefas, Agenda, Financeiro e Equipe, sem criar índice de busca paralelo nem nova chamada por tecla.

A tela de Tarefas já possuía uma lista filtrada e agrupada em `filtered`/`visualEntries`. As visões Calendário e Tabela foram criadas como componentes próprios e recebem a seleção já filtrada, preservando permissões, agrupamento, ações e contratos existentes. Nenhuma regra de negócio foi duplicada e nenhum endpoint foi criado para essas visões.

O formulário já tinha geração manual de checklist. Foi adicionada uma sugestão server-side em módulo e rota próprios. A resposta contém somente itens candidatos para revisão; o usuário seleciona e confirma a inclusão no rascunho, e o salvamento final continua usando o endpoint existente de criação/edição de tarefas. A funcionalidade não persiste nada durante a sugestão.

A detecção de prazo é local e conservadora. Expressões como “amanhã”, “até sexta-feira”, “em 5 dias” e datas explícitas são convertidas para ISO somente como sugestão. O valor do campo `DateFieldBR` só muda quando o usuário confirma, respeitando o contrato existente e a validação de data mínima.

Durante a validação, o Gemini configurado no Coolify respondeu HTTP 429 por créditos pré-pagos esgotados. O serviço foi corrigido para utilizar o fallback determinístico server-side `nexus-local` em ausência de chave, 429/quota, falhas de rede e respostas inválidas. O fallback informa `provider=nexus-local`, `model=heuristic-checklist-v1` e `fallback=true`, sem expor credenciais e sem persistir dados.

Também foi encontrado e corrigido um chamador amplo de Agenda no Dashboard. Antes, `Dashboard.tsx` buscava `agendaApi.list()` sem mês/ano e filtrava depois no cliente. O Dashboard agora solicita explicitamente o mês selecionado e refaz a chamada quando o seletor mensal muda. A correção evita competir no startup com a consulta de Agenda de histórico grande.

## Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `src/components/GlobalSearch.tsx` | Ações rápidas para Tarefas, Agenda, Financeiro e Equipe. |
| `src/components/TaskCalendarView.tsx` | Nova visão mensal sobre as tarefas filtradas. |
| `src/components/TaskTableView.tsx` | Nova visão tabular, com abertura e edição delegadas à tela existente. |
| `src/lib/naturalLanguageDate.ts` | Parser local e validado de prazos em português. |
| `src/pages/Tarefas.tsx` | Conexão dos quatro modos e controles de sugestão de checklist/prazo no modal. |
| `src/pages/Dashboard.tsx` | Chamada mensal parametrizada da Agenda, eliminando a busca ampla no Dashboard. |
| `src/lib/api.ts` | Método autenticado `tarefasApi.sugerirChecklist` e `agendaApi.list(mes, ano)`. |
| `backend/src/services/geminiService.ts` | Sugestão estruturada server-side com limites e fallback seguro. |
| `backend/src/routes/iaChecklist.ts` | Rota autenticada `POST /api/tarefas/ia-checklist`; não persiste dados. |
| `backend/src/index.ts` | Montagem da nova rota. |
| `backend/test/phase1Productivity.test.ts` | Testes de parser, fallback, conexões de componentes/rota e proteção da chamada mensal da Agenda. |

Não houve migration nem alteração de schema nesta fase; portanto, não houve DDL e não foi necessário gerar novo backup lógico de PostgreSQL. Nenhuma linha existente foi apagada, truncada ou reescrita.

## Testes e builds

A rodada final local passou com **23 arquivos e 97 testes**. O build do backend, o build do frontend e `git diff --check` passaram. O lint global continua fora do escopo por conter problemas preexistentes no frontend; ele não foi alterado para mascarar esses avisos.

| Verificação | Resultado |
|---|---|
| Suíte de testes `npm test -- --run` | Passou — 23 arquivos / 97 testes |
| Build do backend | Passou |
| Build do frontend | Passou |
| `git diff --check` | Passou |
| Teste estático contra `agendaApi.list()` sem parâmetros no Dashboard | Passou |
| Alteração de schema | Não realizada |
| Dados históricos grandes | Preservados |

## Commits e deployments

A Fase 1 foi publicada incrementalmente, sem redeploy cego e com acompanhamento do rolling update no único recurso Nexus autorizado.

| Commit | Objetivo | Deployment Coolify | Resultado |
|---|---|---|---|
| `921f5a3` | Visões de produtividade, palette e planejamento assistido | `esk8nsk4ounh7j7azkj2rl1j` | Success; 04m03s |
| `ff7834c` | Manter sugestão disponível sem chave Gemini | `pynoh3srewz5xa2bvohaac11` | Success; 03m52s |
| `97b3ab2` | Fallback também em 429/quota e respostas inválidas | `fzewu55gmbazk6h6oroqd8yh` | Success; 04m01s |
| `5d9470d` | Restringir Agenda do Dashboard ao mês selecionado | `o8dg4x3xlsd8mgf85q81hnaq` | Success; 03m50s |

O último deployment importou exatamente o SHA completo `5d9470d675ce96dd778629720132def1ef064d19`, terminou às 17:43:02 UTC e criou o container `k68e0wa0djtqiqzgivruoe81-173912748696`. O Coolify confirmou o novo container como `healthy`, e a aplicação ficou `Running (healthy)`.

## Validação real em produção

Após o último deployment, foi executada uma bateria autenticada por sessão interna do navegador. Foram registrados somente status, duração, tamanho e metadados seguros; nenhum token, conteúdo de credencial ou novo dado de negócio foi exposto.

| Endpoint | Status | Tempo | Tamanho/metadado seguro |
|---|---:|---:|---|
| `/api/health` | 200 | 72 ms | 242 B; `status`, `db`, `release`, `pool` |
| `/api/agenda?mes=8&ano=2026&sync=false` | 200 | 74 ms | 38.249 B; `eventos`, `sync` |
| `/api/tarefas` | 200 | 380 ms | 113.120 B; lista de tarefas |
| `/api/tarefas/ranking?periodo=todos` | 200 | 231 ms | 12.746 B; ranking/resumo |
| `/api/notificacoes/atrasos-pendentes` | 200 | 532 ms | 13.794 B; contagens e categorias |
| `/api/pagamentos` | 200 | 294 ms | 316.699 B; lista de pagamentos |
| `/api/equipe/membros` | 200 | 219 ms | 1.659 B; lista de membros |
| `/api/notificacoes` | 200 | 96 ms | 31.606 B; paginação e contagens |

A rota de sugestão assistida havia sido validada no deployment `97b3ab2` com `POST /api/tarefas/ia-checklist` retornando HTTP 200 em 293 ms, seis itens revisáveis, `provider=nexus-local`, `model=heuristic-checklist-v1`, `fallback=true` e sem erro. O teste não persistiu tarefa nem checklist.

O Dashboard em `/` foi aberto em produção e carregou os blocos de tarefas, Agenda, financeiro e equipe sem erro. O seletor estava em agosto de 2026, com os compromissos/financeiros organizados por data. O código implantado e o teste estático comprovam que o Dashboard passa mês e ano à Agenda; a API mensal respondeu em 74 ms. A página `/notificacoes` também abriu autenticada, exibindo 210 não lidas, filtros Todas/Não lidas, ações individuais e “Marcar todas como lidas”; nenhuma notificação foi alterada.

A página `/tarefas` exibiu Lista, Quadro, Calendário e Tabela. A visão Calendário mostrou 21 tarefas com data, e a visão Tabela mostrou 21 tarefas com colunas de tarefa, status, prazo, responsável, checklist e ações. Os três checklists históricos de aproximadamente 30 MB foram mostrados como `Checklist protegido`, sem materialização no endpoint de lista. A palette Ctrl/Cmd+K abriu as ações diretas e o filtro `agenda` mostrou `Abrir Agenda` e `Novo evento na agenda`. Uma tarefa normal foi aberta somente para inspeção; nenhum campo foi alterado e nenhum salvamento foi executado.

## Logs, banco e preservação

Os logs do container final registraram migration concluída, PostgreSQL conectado, pool configurado com os limites existentes, `ANALYZE` concluído em 6004 ms, API iniciada na porta 3001, jobs existentes iniciados e `AGENDA_AUTO_SYNC_ENABLED=false` preservado. As migrations já aplicadas foram reconhecidas sem DDL repetida.

Depois do commit `5d9470d`, a revisão dos logs do container novo não encontrou nova ocorrência de `[AGENDA] Erro ao buscar agenda` nem de `canceling statement due to statement timeout`. O timeout isolado observado no container anterior ficou associado ao chamador amplo removido do Dashboard. A resposta mensal de 74 ms fornece confirmação adicional da janela parametrizada.

Os três checklists históricos grandes continuam preservados. Os jobs seguem ignorando, de forma explícita e não destrutiva, payloads acima de 1 MB, sem apagar, truncar, regravar ou materializar os dados. O Shop PermuPay, seu banco, o Destrava e a integração Qualify não foram tocados.

## Rollback

O rollback conhecido consiste em selecionar no Coolify uma imagem saudável anterior ou reverter o commit correspondente. Como não houve alteração de schema, não existe rollback de banco associado. Os modos anteriores Lista e Quadro continuam disponíveis; a rota assistida pode deixar de ser chamada sem impactar a criação/edição existente de tarefas.

## Conclusão

A Fase 1 está aprovada. A entrega acrescenta navegação e produtividade sem criar um segundo sistema de busca ou de tarefas, mantém a IA como sugestão revisável, oferece fallback local quando o provedor externo está sem créditos, preserva os dados históricos grandes e elimina o chamador amplo identificado na Agenda. A Fase 2 pode começar com novo baseline e inspeção do Automation Engine existente; qualquer DDL futura deverá ser precedida de backup lógico customizado com SHA-256.

## Evidências complementares

As evidências operacionais detalhadas permanecem em `phase1_deploy_evidence_2026-08-27.txt`. O arquivo `production_validation_2026-08-27.txt` registra as evidências da missão anterior de lifecycle/performance e não foi incluído na alteração de código desta fase.
