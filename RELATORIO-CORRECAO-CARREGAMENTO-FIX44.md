# Nexus Gestão — correção de carregamento, healthcheck e estabilidade

Data: 30/07/2026  
Base analisada: commit público `5cb9cd7200272185394eb447e3e8d5221751ea22`

## Diagnóstico confirmado

O print do DevTools mostra o mesmo padrão nas rotas `/api/tarefas`,
`/api/agenda` e `/api/tarefas/ranking`: aproximadamente 60 segundos de espera
seguidos por HTTP 500. O frontend aguardava essas rotas e mais duas APIs num
único `Promise.all`; por isso, uma única falha mantinha toda a lista do gestor
no carregador.

As causas encontradas no código foram:

1. `GET /api/agenda` executava e aguardava uma sincronização operacional de até
   3.000 tarefas e 3.000 lançamentos financeiros antes de listar a agenda.
2. Tarefas e ranking repetiam consultas e processamento de checklist para
   requisições simultâneas da mesma organização.
3. O ranking buscava todas as colunas de todas as tarefas, mesmo usando apenas
   um subconjunto.
4. O painel disparava tarefas, agenda, financeiro, membros e ranking ao mesmo
   tempo. Uma falha descartava todas as respostas.
5. Atualização por foco, visibilidade e intervalo podia iniciar chamadas
   sobrepostas e voltar a esconder a lista já carregada.
6. A fila de refresh do JWT não rejeitava os consumidores quando a renovação
   falhava; as Promises podiam ficar pendentes indefinidamente.
7. O cliente HTTP não tinha tempo limite.
8. A conexão SSE passava pelo proxy genérico com cabeçalhos de WebSocket e
   tentava reconectar a cada 5 segundos sem limite.
9. Readiness usava o mesmo pool das consultas operacionais. Quando o pool
   saturava, o healthcheck falhava junto com as telas.
10. O job de agenda começava 10 segundos após o boot, ao mesmo tempo que outros
    jobs, e materializava milhares de linhas em memória.
11. O cache curto era um `Map` sem limite e não reunia consultas simultâneas.
12. Os índices compostos usados pelo feed, ranking e anexos não eram garantidos
    em bancos que já estavam no schema atual.

Os registros fornecidos de `heap out of memory`, `OOMKilled=true`, heap de
aproximadamente 259 MB e HTTP 503 são compatíveis com essa combinação de
consultas pesadas, rajadas concorrentes e jobs executados durante o boot.

## Correções aplicadas

### Tarefas e ranking

- Cache TTL com limite de organizações e `single-flight`: chamadas simultâneas
  compartilham a mesma consulta em andamento.
- Agregação de anexos por organização em uma única subconsulta.
- Ranking busca somente as colunas necessárias.
- Ranking deixou de bloquear a abertura da lista e só é carregado quando usado.
- Índices para feed de tarefas, ranking e anexos.
- Regras existentes de visibilidade, criação, execução, aprovação, pontuação,
  ranking, anexos, integração Destrava e deduplicação foram preservadas.

### Frontend

- A lista principal carrega de forma independente.
- Membros e pedidos de ajuda entram depois, sem bloquear as tarefas.
- O dashboard aceita resultados parciais.
- Apenas o primeiro carregamento sem dados exibe o spinner de página inteira.
- Atualizações conservam a lista visível e exibem “Atualizando”.
- Há mensagem persistente, dados em cache e botão “Tentar novamente” em falhas.
- Há trava contra requisições concorrentes e janela mínima entre atualizações.
- GET: 20 s; escrita: 35 s; upload: 120 s, todos configuráveis no build.
- Refresh JWT compartilhado e com falha propagada para todas as chamadas.

### Agenda e jobs

- `GET /agenda` não sincroniza dados por padrão.
- A sincronização explícita (`POST /agenda/sincronizar`) foi preservada.
- O modo legado continua possível somente com `sync=true`.
- Frontend envia `sync=false`, protegendo também um deploy misto.
- Job automático começa após 120 s e processa lotes de 200 registros.
- Verificação de schema evita repetir `ALTER TABLE` em todo boot.
- Valores inválidos de configuração não geram intervalo zero ou `LIMIT NaN`.

### Coolify, Docker e healthcheck

- `/health/live`: liveness do processo Node, sem depender da fila do banco.
- `/health`: readiness com conexão PostgreSQL isolada e timeout de 2 s.
- O healthcheck do contêiner usa diretamente a liveness na porta 3001.
- Heap calculado a partir do limite cgroup, com substituição opcional por
  `NEXUS_NODE_HEAP_MB`.
- Dockerfile aceita os timeouts Vite como build arguments.
- Compose inclui as novas variáveis de heap, agenda e timeout.
- Nginx possui rota SSE dedicada, sem buffering, sem upgrade de WebSocket e com
  timeout longo.
- Cliente SSE usa backoff exponencial, pausa em aba oculta/offline e renova o
  JWT antes de reconectar.

### Observabilidade

Respostas acima de 2 segundos registram método, rota sem query string, status,
duração, heap e estado do pool. O token SSE nunca é incluído no log.

## Validações executadas

- Build TypeScript + Vite de produção: aprovado.
- Build TypeScript do backend: aprovado.
- Vitest: 14/14 testes aprovados.
- Testes de regras de tarefas: 14/14 aprovados.
- Testes novos: concorrência/limite/recuperação do cache e política de
  sincronização da agenda.
- `git diff --check`: aprovado.
- Sintaxe dos scripts POSIX (`backend-start.sh`, `docker-entrypoint.sh` e
  `healthcheck.sh`): aprovada.
- `docker-compose.yml`: YAML válido e healthcheck resolvido.
- O ambiente de análise não disponibiliza Docker Engine; por isso a construção
  integral da imagem fica para o BuildKit do Coolify. Os dois builds executados
  dentro dos estágios da imagem foram reproduzidos e aprovados.

O lint global do repositório não é etapa do Dockerfile e já falhava na base
original porque a configuração varre frontend, backend e artefatos `dist` com
regras incompatíveis com o legado. Não foi alterado para esconder esses débitos;
os gates reais do deploy — builds, testes e scripts — estão aprovados.

## Configuração recomendada no Coolify

Para um contêiner com 1 GiB de RAM:

```env
NEXUS_NODE_HEAP_MB=640
AGENDA_AUTO_SYNC_ENABLED=true
AGENDA_AUTO_SYNC_INTERVAL_MINUTES=10
AGENDA_AUTO_SYNC_INITIAL_DELAY_SECONDS=120
AGENDA_SYNC_BATCH_SIZE=200
DB_POOL_MAX=20
DB_CONNECT_TIMEOUT_MS=10000
DB_QUERY_TIMEOUT_MS=60000
DB_STATEMENT_TIMEOUT_MS=60000
```

Se o limite continuar em 512 MiB, deixe `NEXUS_NODE_HEAP_MB` vazio para o
startup calcular aproximadamente 60% do limite. Para produção, 1 GiB é o
mínimo recomendado para o contêiner unificado Nginx + Node; 1,5 GiB oferece
mais margem durante deploy e jobs.

Não cadastre `NODE_OPTIONS` e `NEXUS_NODE_HEAP_MB` ao mesmo tempo. Se
`NODE_OPTIONS` já contiver `--max-old-space-size`, ele tem prioridade.

## Redeploy

1. Substitua o conteúdo do repositório pelo pacote corrigido ou aplique o commit.
2. No Coolify, mantenha o Dockerfile na raiz e faça deploy sem cache.
3. Não execute migração manual concorrente. O entrypoint aplica a migração
   idempotente antes de iniciar a API.
4. Aguarde o contêiner ficar `healthy`.
5. Verifique:

```bash
curl -fsS https://nexus.permupay.com.br/health
docker ps --filter name=k68e0wa0djtqiqzgivruoe81
docker logs --since 10m k68e0wa0djtqiqzgivruoe81-183724304189
```

6. No navegador, recarregue `/tarefas` com o DevTools aberto. A lista não deve
   mais aguardar agenda/ranking e não deve haver chamadas de 60 s.

## Critério de rollback

O pacote não remove tabelas, colunas, rotas nem recursos. Se o ambiente tiver
uma particularidade externa não reproduzida, reverta o deploy para a imagem
anterior no Coolify; os índices adicionados são compatíveis e não precisam ser
removidos.
