# Nexus Gestão — diagnóstico real e correção FIX54

Release: `fix54-startup-integracao-estavel-20260803`

Data: 03/08/2026

## Conclusão

Os dados do Nexus não estão vazios. A inspeção da VPS confirmou 63 tarefas,
9 perfis, 2 organizações, 1 equipe, 12 anexos cadastrados e 15 arquivos no
volume persistente. A página `/tarefas` também não depende do Destrava para
abrir: ela consulta diretamente o PostgreSQL do Nexus.

O erro exibido na tela é um timeout no caminho Nexus → API → PostgreSQL. O
Destrava participa somente da criação/sincronização de tarefas integradas e da
consulta de dados/documentos vinculados, não da listagem inicial.

O arquivo `nexus-gestao-main (56).zip` recebido é byte a byte idêntico ao ZIP
54. Repetir o deploy desse mesmo arquivo não poderia produzir uma correção
nova.

## Causas encontradas

### 1. Migration extensa usando o timeout das requisições comuns

O startup enviava todo o schema histórico em uma única chamada do
`node-postgres`. Essa chamada herdava `DB_QUERY_TIMEOUT_MS=18000`, pensado para
rotas HTTP. Com 165.054 notificações e 504.527 eventos de agenda, a migration
podia ultrapassar 18 segundos, ser cancelada e reiniciada.

### 2. Schema e correções históricas repetidos em todo redeploy

Mesmo quando o banco já estava atualizado, o processo repetia `ALTER TABLE`,
recriação de constraints/triggers, varreduras de notificações e verificações de
compatibilidade. Isso criava disputa de locks e conexões durante a troca de
container.

### 3. Histórico derivado muito maior que os dados operacionais

Existem somente 63 tarefas, mas centenas de milhares de linhas em agenda e
notificações, herdadas de um defeito anterior de sincronização recorrente. O
FIX53 já impedia novas duplicações, mas o caminho de feed/lembretes ainda
precisava de índices específicos e o arquivamento podia atualizar até 50 mil
linhas em uma execução.

### 4. Integração passou a encontrar duas organizações

O banco possui duas organizações. A versão anterior passou a rejeitar payloads
legados do Destrava sem e-mail quando não havia `NEXUS_DESTRAVA_ORG_ID`, mesmo
que o cliente já possuísse vínculos históricos inequívocos no Nexus. Isso
explica a necessidade repentina de uma variável que não era usada no ambiente
antigo.

## Correções da FIX54

- Migration registrada em `nexus_schema_migrations` e executada somente uma
  vez para esta versão de banco.
- Timeout exclusivo de até 180 segundos para migration, sem aumentar os
  limites curtos das rotas HTTP.
- Lock consultivo impede dois containers de migrarem simultaneamente.
- Banco já atualizado recebe somente índices novos com `CREATE INDEX
  CONCURRENTLY`; não repete correções históricas nem altera tarefas.
- Verificações auxiliares de tarefas/pontuação consultam o catálogo e saem
  imediatamente quando o schema já existe.
- Removido `Promise.race` que encerrava a espera no JavaScript sem cancelar a
  query que continuava executando no PostgreSQL.
- Índices para feed/contagem de notificações, referência de lembretes, agenda
  pendente e ordenação da lista de tarefas.
- Arquivamento limitado a 10 mil notificações por execução, preservando todo o
  histórico e retomando o restante depois.
- Integração reutiliza organização já vinculada ao mesmo cliente no
  `nexus_external_links`, nas tarefas originadas do Destrava ou no cache de
  empresas.
- Se todos os vínculos históricos apontarem para uma única organização, ela é
  reutilizada automaticamente. Se houver conflito real entre organizações, o
  Nexus continua recusando o evento em vez de gravá-lo no cliente errado.
- `NEXUS_DESTRAVA_ORG_ID` continua disponível como override, mas deixa de ser
  requisito para o ambiente antigo com vínculo inequívoco.

## Escopo preservado

Não foram alteradas regras de criação, edição, exclusão, visibilidade pessoal,
distribuição, assumir tarefa, checklist, conclusão, aprovação, devolução,
ranking, escala de pontuação, anexos, financeiro ou permissões. A correção não
remove tarefas, usuários, equipes, anexos nem arquivos.

## Validações executadas

- Build TypeScript do backend: aprovado.
- Build TypeScript/Vite do frontend: aprovado.
- Testes Vitest: 33 aprovados.
- Testes de regras de tarefas/pontuação: 14 aprovados.
- Total: 47 testes aprovados, nenhuma falha.
- Testes novos cobrem organização Destrava inequívoca e rejeição de vínculos
  conflitantes.

## Configuração no Coolify

- Build Pack: `Dockerfile`.
- Base Directory: raiz do repositório.
- Dockerfile: `/Dockerfile`.
- Porta interna: `80`.
- Health Check Path: `/health/live`.
- Health Check Port: `80`.
- Preservar o bind `/data/coolify/nexus_uploads:/app/uploads`.
- Preservar a `DATABASE_URL` que aponta para o PostgreSQL do Nexus.

Nenhuma variável nova é obrigatória. Se não estiverem cadastradas, o código já
usa defaults seguros para pool e migrations. `AGENDA_AUTO_SYNC_ENABLED` também
permanece desativada por padrão.

## Aceite pós-deploy

Execute:

```bash
curl -fsS https://nexus.permupay.com.br/version
curl -fsS https://nexus.permupay.com.br/health/live
curl -fsS https://nexus.permupay.com.br/health
```

`/version` precisa mostrar:

```json
{"release":"fix54-startup-integracao-estavel-20260803"}
```

`/health` deve mostrar `"db":"connected"` e `pool.waiting: 0` em repouso.
Nos logs do primeiro deploy, um banco atual deve mostrar:

```text
[MIGRATE] Banco atual detectado; aplicando apenas índices FIX54 sem correção histórica de dados…
[MIGRATE] ✅ Banco atual registrado e índices FIX54 aplicados.
```

Nos redeploys seguintes deve mostrar:

```text
[MIGRATE] Schema 2026-08-03-fix54-startup-db-priority já aplicado; nenhuma DDL repetida.
```

Depois valide com gestor:

1. abrir `/tarefas` e confirmar as 63 tarefas conforme a organização do login;
2. abrir lista/quadro, filtros, anexos e ranking;
3. criar e editar uma tarefa nativa;
4. criar uma tarefa pelo Destrava e reenviar o mesmo evento para confirmar
   idempotência;
5. confirmar que o vínculo abre os dados/documentos da empresa correta.

## Rollback

Os índices e a tabela de controle adicionados pela FIX54 são compatíveis com a
release anterior. Em caso de falha de aplicação, use o rollback de deployment
do Coolify sem restaurar ou substituir o volume PostgreSQL e sem apagar o bind
de uploads.

Testes automatizados reduzem fortemente o risco, mas garantia absoluta de
produção depende deste aceite contra o banco, DNS, variáveis e container reais.
