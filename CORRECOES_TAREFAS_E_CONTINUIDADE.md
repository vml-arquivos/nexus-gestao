# Correções de tarefas e continuidade — Nexus

## Resultado funcional

- Cada criação gera uma lista independente com `tarefa.id` próprio.
- Listas da mesma Empresa ou Cliente PF continuam juntas no modal do cadastro, mas checklist, membro, data, aprovação, comentários, anexos e histórico ficam separados por lista.
- Itens com o mesmo texto e membro ou data diferentes permanecem distintos.
- O formulário exige título e oferece os contextos `empresa`, `pessoa_fisica`, `escritorio` e `pessoal`.
- Empresa e PF exigem a seleção do cadastro correspondente.
- `lembrete_diario_ate_aprovacao` relembra a mesma lista até a aprovação final; não usa recorrência e não cria cópia diária.
- A Central de continuidade em `/painel-offline/` mantém a carga no IndexedDB, aceita execução offline, exporta JSON e sincroniza ao restabelecer a conexão.
- O service worker offline usa escopo exclusivo `/painel-offline/`; o service worker principal e as demais rotas não foram alterados.

## Banco de dados

A inicialização executa migração aditiva e idempotente:

- `tarefas.contexto_tipo TEXT`
- `tarefas.lembrete_diario_ate_aprovacao BOOLEAN NOT NULL DEFAULT FALSE`
- constraint dos quatro contextos e índices parciais de consulta

Não há remoção ou renomeação de coluna. Registros antigos são classificados de forma compatível na primeira inicialização.

## Ordem de publicação

1. Publicar e confirmar o Nexus (frontend + backend).
2. Confirmar que a migração aditiva terminou no log de inicialização.
3. Testar criação Nexus, lembrete diário e `/painel-offline/` em homologação.
4. Só então publicar o Destrava corrigido.

Essa ordem impede que uma versão antiga do Nexus descarte os novos metadados de checklist enviados pelo Destrava.

## Gate de regressão executado

- Frontend: `npm run build`
- Backend: `npm run build`
- Backend: suíte Vitest completa
- Teste adicional: texto igual com membro/data diferentes
- Teste adicional: ID repetido de item é idempotente

Antes da produção, repetir smoke test com o banco de homologação e um cadastro Empresa e PF reais.
