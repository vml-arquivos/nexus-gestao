# FIX67 — Área única de tarefas por empresa

## Diagnóstico confirmado no print

As duas listas exibidas separadamente pertencem à mesma empresa do Destrava. O vínculo da empresa já estava correto, mas a página principal ainda renderizava um cartão para cada registro de lista.

## Regra implementada

- Uma empresa do Destrava ocupa somente um cartão na operação diária do Nexus.
- O cartão abre um único modal da empresa.
- Dentro desse modal, cada lista continua independente, preservando checklist, responsável, prazo, prioridade, pontuação, anexos e aprovação.
- Listas concluídas ainda aguardando aprovação continuam na área ativa.
- Listas aprovadas, concluídas com aprovação do gestor ou canceladas são retiradas da operação diária e arquivadas no histórico da empresa.
- O histórico fica recolhido por padrão para não poluir o modal.
- No modo de aprovação em lote, os registros individuais voltam a aparecer temporariamente para manter a seleção e a aprovação existentes.
- A visualização em quadro segue o mesmo agrupamento por empresa.

## Compatibilidade

- A chave de agrupamento continua sendo o `empresa_id` real recebido do Destrava, com fallback para tarefas antigas.
- Nenhuma lista foi fundida ou excluída no banco.
- Nenhuma migration ou variável de ambiente nova.
- Nenhuma alteração no contrato de integração, recorrência, ranking, notificações ou armazenamento offline.
- O Destrava não precisa ser substituído para esta correção.

## Arquivos alterados

- `src/pages/Tarefas.tsx`
- `src/app-styles.css`
- `backend/src/routes/tarefas.ts`
- `backend/test/tarefaEstaFechada.test.ts`
- `backend/test/empresaTaskGroupingVisual.test.ts`

## Validação

- TypeScript frontend: aprovado.
- TypeScript backend: aprovado.
- Build Vite de produção: aprovado, 2.165 módulos transformados.
- Testes da classificação ativa/histórico: 6 aprovados.
- Testes estáticos do agrupamento e preservação da aprovação em lote: 3 aprovados.

