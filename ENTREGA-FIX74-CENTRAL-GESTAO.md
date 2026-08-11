# Nexus Gestão — FIX74 · Central de Gestão

## Resultado

Segunda camada da evolução premium do Nexus. A nova rota `/central-gestao` reúne as informações que exigem atenção do gestor sem duplicar nem contornar a página oficial de tarefas.

## Entregas

- Fila de tarefas aguardando aprovação.
- Visão de tarefas atrasadas.
- Visão de listas devolvidas e em correção.
- Riscos de alta prioridade com prazo vencido ou até três dias.
- Capacidade operacional da equipe calculada por volume, atrasos, prioridade e devoluções.
- Indicador claramente apresentado como atenção operacional, não avaliação de desempenho.
- Navegação protegida para admin, dev, gestor e subgestor.
- Acesso direto ao registro oficial da tarefa, equipe e relatórios.
- Layout premium responsivo para desktop e celular.
- Texto do menu integrado ao editor visual.

## Proteções

- Nenhuma migration, tabela ou coluna nova.
- Nenhum endpoint ou contrato de API alterado.
- Nenhuma rota anterior removida.
- A Central de Gestão é somente leitura.
- Aprovar, devolver, editar ou executar continua exclusivamente no fluxo oficial.
- Membros não visualizam a rota nem conseguem acessá-la diretamente.
- Contagens ignoram tarefas aprovadas ou canceladas.
- Capacidade ignora tarefas entregues que já aguardam decisão do gestor.

## Arquivos desta etapa

- `src/pages/CentralGestao.tsx`
- `src/pages/CentralGestao.css`
- `src/lib/managementInsights.ts`
- `src/App.tsx`
- `src/components/Layout.tsx`
- `src/hooks/useVisualTexts.ts`
- `backend/test/managementInsights.test.ts`

O pacote completo FIX74 também contém integralmente o FIX73 Meu Dia.

## Validação

- Build frontend de produção aprovado.
- Build TypeScript do backend aprovado.
- 9 testes das novas centrais aprovados: 5 do Meu Dia e 4 da Central de Gestão.
- A base continua com uma única falha legada de recorrência já documentada no FIX73.
