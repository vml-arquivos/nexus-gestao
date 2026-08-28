# Auditoria e correção do fluxo de tarefas

## Escopo

Foram corrigidos os principais pontos de inconsistência de rotas, isolamento organizacional, entrega de arquivos e reaparecimento de tarefas novas. Registros existentes não foram apagados e nenhuma limpeza destrutiva foi executada.

## Correções aplicadas

| Área | Resultado |
|---|---|
| Tarefas atrasadas e agenda | O resumo `/api/notificacoes/atrasos-pendentes` passou a reutilizar o predicado central de visibilidade de tarefas. Sub-gestores deixaram de receber atrasos da organização inteira; compromissos vinculados a tarefas atribuídas continuam aparecendo para quem tem acesso. |
| Empresa e histórico | A rota de empresa passou a derivar metadados somente de tarefas autorizadas. O histórico de pessoa retorna apenas campos mínimos de tarefa e mantém escopo por organização e usuário. |
| Arquivos privados | Avatares, documentos e anexos passaram a receber tickets curtos e assinados. O diretório público `/uploads` foi desativado no backend e no Nginx. O download valida ticket, recurso, organização, registro e caminho físico. |
| Tokens | O fallback global de autenticação por `_t` foi removido. O parâmetro de query permanece reservado ao ticket curto do SSE e aos tickets de arquivo privado. |
| Respostas da API | Criação, idempotência, scoring, relatório e webhooks deixaram de devolver linhas cruas quando isso poderia expor campos internos. Ranking não retorna mais e-mails. |
| Sincronização offline | Criações pendentes são exibidas como registros otimistas, reconciliadas por `nexus_client_request_id` e recarregadas após o retry. Rejeições permanentes 4xx saem da fila ativa e são preservadas em `nexus:offline-failures` para diagnóstico, evitando alerta infinito de sincronização. |
| Integridade de associações | Uploads agora validam pessoa e pagamento pertencentes à organização e ao usuário autorizado. Joins de perfis e pessoas exigem `org_id`. |

## Validações

| Verificação | Resultado |
|---|---|
| Build frontend | Aprovado |
| Build backend | Aprovado |
| Suíte Vitest | 28 arquivos e 119 testes aprovados |
| Testes de lógica de tarefas | 15 de 15 aprovados |
| `git diff --check` | Aprovado |

O lint global ainda possui 751 problemas legados (740 erros e 11 avisos), concentrados principalmente em regras antigas de `any`, hooks e variáveis não utilizadas. Isso não impediu os builds nem os testes, mas significa que o lint do projeto ainda não está zerado.

## Observação operacional

As alterações estão no working tree de `/home/ubuntu/nexus-gestao`. Não foi feito commit, push, publicação ou exclusão automática de tarefas. O bloqueio existente para checklists grandes foi preservado.
