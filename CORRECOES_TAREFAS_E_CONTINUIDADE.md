# Correções de tarefas e continuidade — Nexus

## Regra final de dados

- Cada criação gera uma lista independente com `tarefas.id` próprio. Texto, empresa, membro ou data iguais nunca fundem duas listas.
- Dentro da lista, somente o mesmo `checklist.id` identifica o mesmo item. Texto igual com membro, data ou frequência diferentes continua sendo item distinto.
- Empresa e Cliente PF recebem título canônico no frontend e novamente no backend: `Tarefa para empresa — Nome` ou `Tarefa para Cliente PF — Nome`.
- Escritório e Pessoal recebem um título inicial automático, mas continuam aceitando título manual.
- O Nexus é a fonte única de armazenamento. O modal do Destrava envia o contrato canônico e não grava uma cópia paralela da tarefa.

## Recorrência correta

- A frequência pertence ao item do checklist: `unica`, `diaria`, `semanal` ou `mensal`.
- A mesma lista pode misturar todas as frequências e diferentes responsáveis/datas.
- A recorrência apenas lembra o mesmo item até conclusão/aprovação. Não clona item nem lista.
- Mês com menos dias ajusta uma recorrência do dia 29, 30 ou 31 para o último dia disponível.
- Configurações antigas de recorrência da lista continuam funcionando para preservar histórico. Novas criações não entram no gerador legado de listas recorrentes.
- Payload antigo que ainda enviar recorrência na lista é convertido no backend para recorrência dos itens, protegendo deploys com versões desencontradas.

## Continuidade offline

- `/painel-offline/` usa identidade Destrava, resumo, filtros, busca, cartões recolhíveis, progresso, responsável, datas e frequência por ação.
- A carga fica no IndexedDB e alterações são enfileiradas de forma idempotente para sincronização posterior.
- A exportação gera painel HTML autônomo e legível, com frequência por item.
- O cache do painel offline é isolado do cache do shell principal. Atualização/recuperação de chunks do Nexus não apaga a carga operacional.
- O service worker do painel foi versionado como `nexus-painel-offline-v2`.

## Compatibilidade de banco

As colunas aditivas anteriores (`contexto_tipo` e `lembrete_diario_ate_aprovacao`) foram preservadas. A nova recorrência fica dentro do JSONB do checklist, portanto não exige alteração destrutiva de tabela. Nenhuma coluna ou registro histórico é removido.

## Gate executado

- Frontend: `npm run build`.
- Backend: `npm run build`.
- Backend: 14 arquivos / 58 testes Vitest aprovados.
- Backend: 14 testes de lógica de tarefas aprovados.
- Testes novos: quatro frequências no mesmo checklist, início da cadência, semanal, mensal/último dia, título canônico e identidade por ID.

Antes da produção, publicar Nexus antes do Destrava e executar smoke test em homologação com uma Empresa e um Cliente PF reais.
