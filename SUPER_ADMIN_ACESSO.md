# Política de Super Admin

No modelo atual do Nexus Gestão, o papel `dev` é o papel exibido na interface como **Super Admin**. A política foi centralizada no helper `isSuperAdmin` para que esse papel tenha exclusão administrativa irrestrita dentro da própria organização.

## Comportamento aplicado

| Módulo | Super Admin (`dev`) |
|---|---|
| Tarefas | Pode excluir qualquer tarefa da organização, inclusive checklists históricos acima de 1 MB. A exclusão continua transacional e remove anexos, histórico, agenda vinculada e registros derivados. |
| Anexos | Pode apagar anexos sem confirmação adicional na interface. |
| Documentos | Pode excluir documentos sem confirmação adicional na interface. |
| Financeiro | Pode excluir lançamentos e grupos/parcelas sem confirmação adicional na interface. |
| Agenda | Pode excluir eventos sem confirmação adicional na interface. |
| Pessoas e equipe | Pode excluir contatos e remover membros sem confirmação adicional na interface. |
| Usuários | Pode excluir outros usuários e seus registros da organização. O próprio usuário continua protegido contra autoexclusão para não invalidar o acesso durante a operação. |
| Pontuação | Pode apagar lançamentos e zerar o ranking sem as duas confirmações da interface. |
| Limpeza administrativa | As rotas de limpeza de usuários e de dados totais também incluem outras contas privilegiadas quando executadas por `dev`; o próprio acesso é preservado. |

Os demais papéis continuam sujeitos às confirmações e aos limites existentes. O escopo organizacional permanece obrigatório em todas as exclusões; “irrestrito” significa sem bloqueio por proprietário, responsável, tamanho de checklist ou confirmação de interface, não significa apagar dados de outra organização.

## Validação

O build frontend e o build backend passaram. A suíte completa do backend passou com 28 arquivos e 119 testes, os testes de lógica passaram com 15 de 15 casos, e `git diff --check` não encontrou problemas.

O lint direcionado continua não zerado porque os arquivos grandes já possuem problemas legados de estilo, hooks e tipos; essa pendência não impediu a compilação nem os testes.

Nenhum dado foi apagado durante esta alteração. O código foi atualizado no working tree de `/home/ubuntu/nexus-gestao`; commit, push e publicação não foram executados.
