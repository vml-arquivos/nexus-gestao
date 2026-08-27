# Manifest técnico de limpeza — Nexus Gestão

**Data:** 27 de agosto de 2026. **Escopo:** somente o banco Nexus da organização autenticada; Shop, Destrava e Qualify ficam fora. **Modo atual:** pré-operação, sem exclusões ou alterações de dados.

## Regra de decisão

Uma tarefa só pode ser excluída se houver, simultaneamente, a mesma `org_id`, a mesma `external_key` (ou prova equivalente de duplicata física da mesma ocorrência), assinatura idêntica de conteúdo, ausência de dependentes e ausência de vínculos de auditoria, pontuação, ajuda, agenda, anexo, comentário, aprovação ou integração externa. O título `Lista de tarefas da equipe`, o prazo, a origem ou a semelhança parcial de checklist **não são critérios de exclusão**.

A raiz de uma linhagem recorrente não pode ser excluída enquanto o gerador de próximas ocorrências depender dela. Checklists com `pg_column_size(checklist) > 1 MB` ficam fora da limpeza e de qualquer regravação até existir tratamento específico de payload grande.

## Linhagem CKP — `938a30f2-30d2-4ffc-b6ac-1e5c0f29bae6`

| Papel | ID | Chave externa | Status / data | Checklist | Vínculos conhecidos | Decisão |
|---|---|---|---|---:|---|---|
| Raiz/cânone | `938a30f2-30d2-4ffc-b6ac-1e5c0f29bae6` | `recorrencia-nexus:938a30f2-30d2-4ffc-b6ac-1e5c0f29bae6:2026-07-29` | não concluída; criada 2026-07-27; prazo 2026-07-31 | 1.985 B | 4 eventos de histórico, 1 comentário | **Preservar**; nunca excluir automaticamente. |
| Ocorrência | `1168f844-bd7f-44aa-9037-3c1c3abe30fd` | `...:2026-07-28` | cancelada; criada 2026-07-28; prazo 2026-08-01 | 371 B | ainda requer consulta autenticada completa de vínculos | **Bloqueada**; chave externa é período distinto e não prova duplicata física. |
| Ocorrência | `55adc79c-a3f6-4802-ac67-2bffc366d10f` | `...:2026-07-30` | pendente; criada 2026-07-30; prazo 2026-08-03 | 1.893 B | nenhum vínculo de histórico/comentário/anexo identificado na triagem | **Preservar registro**; corrigir apenas itens de checklist repetidos após backup e validação de metadados. |
| Ocorrência | `049b31a8-beb5-47a4-81ab-b51240e5cbda` | `...:2026-07-31` | pendente; criada 2026-07-31; prazo 2026-08-04 | 1.898 B | nenhum vínculo de histórico/comentário/anexo identificado na triagem | **Preservar registro**; corrigir apenas itens de checklist repetidos após backup e validação de metadados. |

Os três registros menores exibem o mesmo sintoma visual: 32 itens iguais, todos com texto datado de 27/07/2026. Isso é duplicação interna de checklist, não prova de que as três ocorrências diárias sejam a mesma tarefa. A correção segura é compactar itens repetidos dentro de cada checklist pequeno, preservando todos os campos não relacionados e registrando histórico; não apagar as tarefas sem prova de duplicata física.

## Linhagem `f94fca1d-d83d-4497-8529-7057a1718756`

A consulta read-only encontrou seis ocorrências filhas e **nenhuma tarefa cujo próprio ID seja a raiz `f94fca1d`**. A linhagem está historicamente órfã/ambígua e não pode ser “consertada” por exclusão automática.

| ID | Chave externa / período | Status | Checklist | Vínculos conhecidos | Decisão |
|---|---|---|---:|---|---|
| `d8fff8a8-cc73-4ff7-a090-39581888f143` | `...:2026-07-24` | não concluída | 30.044.115 B | 14 eventos de histórico; endpoints auxiliares retornaram 500 | **Preservar e bloquear**; não carregar/regravar checklist gigante. |
| `d0c67645-db2e-445c-994c-f69ff6547c8c` | `...:2026-07-26` | cancelada | 351 B | 1 evento de histórico | **Preservar**; histórico impede exclusão cega. |
| `88db406a-8d42-443f-b6ec-186cbe760149` | `...:2026-07-27` | cancelada | 687 B | sem vínculo de pontuação identificado | **Bloqueada**; ocorrência de chave distinta, sem raiz presente. |
| `552eb94d-f139-47b0-988f-0cfcdaf33e29` | `...:2026-07-28` | cancelada | 351 B | sem vínculo de pontuação identificado | **Bloqueada**; ocorrência de chave distinta, não duplicata física comprovada. |
| `4168afbf-8c99-4293-a187-443321515b9a` | `...:2026-07-30` | pendente | 30.038.526 B | endpoints auxiliares retornaram 500 | **Preservar e bloquear**; checklist gigante. |
| `6c6d416c-5af3-456a-b288-3ef43de90bda` | `...:2026-07-31` | pendente | 30.042.485 B | endpoints auxiliares retornaram 500 | **Preservar e bloquear**; checklist gigante. |

## Cânones e candidatos de exclusão

No estado observado, **nenhum ID atende a todos os critérios de exclusão**. As `external_key` são distintas por período; as raízes/linhagens têm dependência funcional; há histórico/comentário em registros relevantes; e três checklists excedem 1 MB. Portanto, o primeiro ciclo de limpeza não deve apagar linhas de `tarefas`. O ciclo seguro deve corrigir a duplicação interna dos três checklists pequenos da linhagem CKP e melhorar a visualização, deixando os registros históricos preservados.

Se uma duplicata física futura for confirmada, o manifest de execução deverá listar o ID canônico, o ID duplicado, a chave externa, snapshot lógico das linhas relacionadas, contagens pré-operação, backup custom e SHA-256, além da transação de exclusão com um único `PoolClient`. O rollback deverá restaurar o snapshot e/ou o backup em banco isolado antes de qualquer reentrada em produção.

## Salvaguardas

Nenhum checklist acima de 1 MB deve ser retornado em endpoints auxiliares ou regravado por PATCH genérico. Histórico, comentários, anexos, ajuda, agenda e pontuação devem ser contados com `org_id` e preservados. Toda exclusão, se algum candidato futuro for comprovado, deverá ocorrer somente após novo `pg_dump --format=custom --no-owner --no-privileges`, checksum SHA-256 e validação pós-operação.
