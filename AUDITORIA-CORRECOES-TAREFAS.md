# Auditoria e correções — Tarefas, checklist e pontuação do Nexus

## Escopo analisado

Fluxo completo do módulo de tarefas, incluindo:

- criação e edição de listas;
- distribuição de itens entre membros;
- visualização do checklist por perfil;
- marcação e reabertura de itens;
- aprovação pelo gestor;
- registro e leitura do ranking;
- compatibilidade com tarefas e checklists legados.

## Causas identificadas

### 1. Checklist parcial do membro substituía o checklist completo

A API devolve ao membro somente os itens que ele pode visualizar. Ao marcar um item, o frontend enviava esse recorte pelo `PATCH /tarefas/:id`. O backend gravava o recorte como se fosse a lista integral, eliminando os itens ocultos ou atribuídos a outros membros.

**Efeito:** tarefas desapareciam, o checklist carregava incompleto e atualizações simultâneas podiam sobrescrever o trabalho de outro usuário.

### 2. Atualização concorrente sem bloqueio por item

A marcação de um item atualizava o JSON completo. Duas pessoas trabalhando na mesma lista podiam salvar versões antigas da estrutura e perder a alteração mais recente.

**Efeito:** estado intermitente, itens que voltavam a ficar pendentes ou deixavam de aparecer.

### 3. IDs legados eram regenerados em cada leitura

Itens sem UUID, inclusive IDs válidos gerados pelo frontend, recebiam um UUID novo toda vez que o checklist era normalizado.

**Efeito:** o item exibido no navegador deixava de corresponder ao item localizado no backend, causando falha de carregamento, “item não encontrado” e inconsistência no vínculo da pontuação.

### 4. Escopo explícito `ambos` não era reconhecido no backend

O formulário salvava `ambos`, mas o normalizador do backend reconhecia apenas tarefa ou subtarefas e aplicava o fallback de tarefa.

**Efeito:** os itens do checklist não entravam no ranking mesmo quando a configuração indicava pontuação da lista e das subtarefas.

### 5. Nível 4 era convertido para o nível errado

O valor `nivel_4` era normalizado como `nivel_2` em uma das regras do backend.

**Efeito:** tarefas configuradas com 5 pontos podiam ser calculadas como 1 ponto.

### 6. Autoria da conclusão e responsável atual eram confundidos

O ranking podia usar o responsável atual do item depois de uma reatribuição, em vez da pessoa que efetivamente concluiu a atividade. Alguns registros antigos também usam `assumido_por`, `executor_id` ou `aceita_por`, mas partes do sistema consultavam apenas `responsavel_id`.

**Efeito:** pontos atribuídos ao membro errado, itens concluídos que desapareciam do executor e permissões inconsistentes.

### 7. Frontend e backend tinham fallback diferente para tarefas antigas

Tarefas antigas sem metadado de escopo eram interpretadas como `ambos` no frontend e como `tarefa` no backend.

**Efeito:** a interface podia indicar uma regra de pontuação diferente da aplicada no ranking.

## Correções implementadas

- Criado endpoint atômico `PATCH /tarefas/:id/checklist/:itemId`.
- Uso de transação e `SELECT ... FOR UPDATE` para impedir sobrescrita concorrente.
- Atualização de somente um item do checklist, preservando integralmente os demais.
- Compatibilidade mantida no endpoint genérico: atualizações parciais de membros são mescladas, nunca substituem a lista completa.
- IDs explícitos são preservados; itens realmente sem ID recebem um identificador determinístico baseado no conteúdo.
- Registro de `concluido_por` e `feito_por` com o usuário que realizou a conclusão.
- Separação entre responsável atual, autoria histórica e permissão de edição.
- Leitura unificada dos campos legados `responsavel_id`, `assumido_por`, `executor_id` e `aceita_por`.
- Ranking passa a priorizar o autor real da conclusão e consegue localizar registros legados também pelo título armazenado.
- Normalização corrigida para `ambos` e aliases equivalentes.
- Escala corrigida: nível 1 = 0, nível 2 = 1, nível 3 = 3, nível 4 = 5, nível 5 = 20.
- Fallback de tarefas antigas alinhado entre frontend e backend, sem mudar o padrão atual da criação de novas listas.
- Rollback visual no frontend em caso de falha da API.
- Sincronização da tabela auxiliar continua não bloqueante; o JSON da tarefa permanece a fonte principal.

## Arquivos alterados

- `backend/src/routes/tarefas.ts`
- `backend/package.json`
- `backend/test/tarefas.logic.test.js`
- `src/lib/api.ts`
- `src/pages/Tarefas.tsx`

## Validações executadas

- Build de produção do frontend: aprovado.
- Compilação TypeScript do backend: aprovada.
- Testes automatizados de regressão: 8 de 8 aprovados.
- `git diff --check`: aprovado, sem erros de whitespace.
- Comparação de lint no código-fonte: nenhuma nova violação introduzida; o conjunto corrigido tem uma ocorrência a menos que o repositório original.

Cenários cobertos pelos testes:

1. escopo explícito `ambos` e fallback legado;
2. nível 4 preservado com 5 pontos;
3. IDs legados determinísticos;
4. atualização parcial preserva itens invisíveis;
5. membro não altera item de outro executor;
6. item concluído permanece visível para seu autor;
7. ranking mantém os pontos com quem concluiu após reatribuição;
8. reatribuição transfere a permissão de edição sem apagar a autoria histórica.

## Banco de dados e implantação

Não foi necessária alteração de schema nem migration. A correção é compatível com os dados atuais e faz normalização progressiva ao ler/salvar os checklists.

Procedimento recomendado:

1. realizar backup do banco e do volume de uploads;
2. substituir o código pela versão corrigida;
3. executar o build normal do projeto;
4. reiniciar frontend e backend pelo fluxo atual do Coolify;
5. validar em homologação: membro A e membro B na mesma lista, aprovação do gestor e ranking.

## Observação sobre lint legado

O repositório original já contém centenas de apontamentos globais de ESLint, principalmente `no-explicit-any` e variáveis antigas não utilizadas. Eles não impedem o build atual. Esta correção não aumentou esse passivo e não realizou uma refatoração ampla fora do módulo de tarefas, evitando risco de regressão em áreas não relacionadas.
