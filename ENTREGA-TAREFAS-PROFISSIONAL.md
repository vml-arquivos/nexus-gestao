# Nexus Gestão — Evolução profissional das tarefas

## Entrega

Esta versão transforma a lista de tarefas em uma estrutura reutilizável, distribuída e auditável por item.

### Empresas da Destrava
- Catálogo local sincronizado no Nexus (`destrava_empresas_cache`).
- Sincronização manual na criação/edição da tarefa e tentativa automática ao abrir o formulário.
- Busca local resiliente, com fallback para a API direta da Destrava.
- Empresas removidas da origem são desativadas no cache, sem apagar vínculos históricos.

### Delegação e execução
- Cada item do checklist mantém seu executor próprio.
- Vários membros podem trabalhar na mesma tarefa/lista.
- O executor conclui somente os itens atribuídos a ele.
- A conclusão passa para `aguardando` e guarda executor e data de envio.
- O gestor aprova ou devolve cada item separadamente.
- Item aprovado fica bloqueado contra alteração silenciosa.
- Item devolvido volta para execução com ressalva registrada.

### Pontuação
- Pontuação do item é liberada imediatamente no aval do gestor.
- Registro é idempotente e não duplica pontos.
- Reatribuição não transfere autoria histórica.
- A aprovação final da lista permanece compatível com o fluxo anterior.

### Comentários e auditoria
- Comentários gerais da lista ou vinculados a um item.
- Membro só comenta em item que pode executar.
- Aprovação e devolução geram comentário de auditoria automaticamente.
- Histórico continua registrando mudanças operacionais.

### Reutilização
- O gestor pode incluir novos itens na mesma lista.
- A inclusão complementar reabre a tarefa sem apagar itens, autores, comentários ou pontos já registrados.

### Relatório
- Relatório consolidado com empresa, criador, status, prioridade, executores, execução, aval, pontos e comentários.
- Visualização em nova janela otimizada para impressão.
- O navegador permite imprimir ou salvar diretamente em PDF.

## Migration obrigatória

Aplicar `migration-2026-07-06-tarefas-profissionais.sql` antes ou junto do deploy.
O startup também contém criação idempotente das estruturas, mas a migration explícita é recomendada no processo de produção.

## Variáveis da integração
- `DESTRAVA_API_URL` (ou `DESTRAVA_INTERNAL_API_URL` / `DESTRAVA_PUBLIC_URL`)
- `NEXUS_DESTRAVA_INTEGRATION_SECRET` (ou `DESTRAVA_INTEGRATION_SECRET` / `INTEGRATION_SECRET`)

## Validação
- Frontend TypeScript + Vite: aprovado.
- Backend TypeScript: aprovado.
- Testes de regressão de checklist/pontuação: 8/8 aprovados.
