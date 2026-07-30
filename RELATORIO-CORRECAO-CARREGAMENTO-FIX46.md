# Nexus Gestão — correção FIX46

Release: `fix46-db-locks-realtime-20260730`  
Data: 30/07/2026

## Diagnóstico comprovado

O print de produção mostrou falha simultânea em rotas independentes:

- `/api/tarefas`: 503 e 524;
- `/api/tarefas/ranking`: 503 e 524;
- `/api/notificacoes/atrasos-pendentes`: 524;
- `/api/agenda`: 503;
- `/api/notificacoes/stream`: `ERR_QUIC_PROTOCOL_ERROR`.

O frontend permanecia aberto, portanto o problema comum estava no backend,
pool PostgreSQL e fluxo de tempo real, não no layout.

A árvore do ZIP 46 havia voltado ao FIX44. Ela ainda:

1. executava `ALTER TABLE`, recriação de constraints, índices e atualização
   histórica dentro da primeira requisição de tarefas;
2. executava outro bloco DDL dentro da primeira requisição de ranking;
3. carregava tarefas, ranking, membros e duas rotas de ajuda em um único
   `Promise.all`, mantendo o spinner até a chamada mais lenta terminar;
4. repetia esse lote a cada 25 segundos, no foco e na troca de visibilidade;
5. iniciava vários jobs pesados entre 10 e 30 segundos após o backend;
6. habilitava sincronização automática da agenda por padrão;
7. interceptava e tentava armazenar o SSE infinito no Service Worker;
8. rotacionava o refresh token, derrubando sessões com duas abas;
9. fazia o healthcheck do contêiner atingir o HTML da SPA, sem conferir o Node;
10. não utilizava o script que calcula o heap do Node conforme o limite real.

Em 30/07/2026, antes deste redeploy, a produção também comprovou estar em uma
versão anterior: `/version` e `/health/live` retornaram HTML, enquanto
`/api/health/live` retornou 404.

## Correções aplicadas

### Banco e rotas

- Todo DDL saiu do caminho HTTP e ficou somente em `db/migrate.ts`.
- Pool configurável e limitado, com timeout de conexão, lock, statement e query.
- Erros transitórios do banco retornam 503 curto e `Retry-After`, antes de 524.
- Listagem usa single-flight de 2 segundos para reunir rajadas iguais.
- Agregação de anexos foi consolidada em `LATERAL`, sem subconsultas repetidas.
- Agenda usa intervalo de datas indexável, sem `EXTRACT` sobre todas as linhas.
- Foram adicionados índices para tarefas, atrasos, pagamentos, agenda e avisos.
- Ranking busca apenas as colunas necessárias.

### Frontend e sessão

- Apenas `/tarefas` controla o spinner da página.
- Membros e ajuda carregam em paralelo sem bloquear a lista.
- Ranking só é buscado quando a aba Ranking é aberta.
- Chamadas concorrentes de listagem são reunidas.
- Atualização automática passou de 25 segundos para no máximo uma carga a cada
  5 minutos, com conferência leve a cada minuto.
- Toda chamada tem timeout e pode usar cache local isolado por usuário.
- Fila de refresh que podia ficar pendurada foi substituída por single-flight.
- Refresh token permanece estável entre abas até expirar ou ser revogado.

### Tempo real e jobs

- Service Worker não intercepta mais `/api`, SSE ou uploads autenticados.
- SSE tem limite de conexões por usuário, limpeza em close/abort/error e
  reconexão com backoff exponencial.
- Nginx desativa buffering/cache especificamente no stream.
- Jobs usam advisory lock no PostgreSQL, não se sobrepõem localmente e cedem
  quando o pool tem requisições aguardando.
- Jobs iniciais foram escalonados a partir de 180 segundos.
- Consultas de jobs têm limites de lote.
- Sincronização automática da agenda tornou-se opt-in:
  `AGENDA_AUTO_SYNC_ENABLED=true`.

### Deploy, heap e observabilidade

- O Docker unificado agora executa `/app/backend-start.sh`.
- O heap é calculado a partir do cgroup do contêiner.
- Migrations têm retry antes de iniciar a API.
- Healthcheck interno usa liveness do Node em `127.0.0.1:3001/health/live`.
- Nginx encaminha corretamente `/version`, `/health/live` e `/health`.
- Rotas `/version`, `/api/version`, `/health/live` e `/api/health/live`
  identificam a release.
- Todas as respostas do backend incluem `X-Nexus-Release`.

## Regras preservadas

Não foram alteradas as regras de negócio de:

- criação, edição, aprovação, devolução e exclusão de tarefas;
- privacidade de tarefas pessoais;
- visibilidade de tarefas de equipe e listas livres;
- bloqueio contra duas pessoas assumirem a mesma tarefa livre;
- deduplicação por ID e `external_key`;
- escala de pontuação 0/1/3/5/20;
- pontuação por lista, item ou regra histórica;
- preservação da pontuação após exclusão;
- integração Nexus/Destrava e idempotência do Automation Engine.

## Validações executadas

- build TypeScript do backend: aprovado;
- build TypeScript/Vite do frontend: aprovado;
- testes Vitest: 17/17 aprovados;
- testes de regras de tarefas: 14/14 aprovados;
- smoke test das rotas sem banco:
  - `/version`: 200 JSON;
  - `/health/live`: 200 JSON;
  - `/api/version`: 200 JSON;
  - `/api/health/live`: 200 JSON;
  - `/health`: 503 JSON quando o banco está indisponível, como esperado.

## Redeploy correto no Coolify

1. Substitua o conteúdo do repositório pelo conteúdo completo deste pacote.
   Não copie apenas arquivos isolados.
2. Preserve as variáveis já cadastradas no Coolify. O pacote não contém o
   `.env` real.
3. Confirme:
   - Build Pack: Dockerfile;
   - Base Directory: raiz do repositório;
   - Dockerfile: `/Dockerfile`;
   - porta interna: `80`;
   - Health Check Path: `/health/live`;
   - Health Check Port: `80`.
4. Para o primeiro FIX46, defina:

   ```env
   DB_POOL_MAX=12
   DB_CONNECTION_TIMEOUT_MS=4000
   DB_LOCK_TIMEOUT_MS=5000
   DB_STATEMENT_TIMEOUT_MS=15000
   DB_QUERY_TIMEOUT_MS=18000
   BACKGROUND_JOBS_ENABLED=true
   AGENDA_AUTO_SYNC_ENABLED=false
   ```

5. Faça um deploy com limpeza do build cache.
6. Se a migration encontrar lock contínuo da versão antiga, pare o recurso
   Nexus uma única vez e inicie o redeploy. Não pare PostgreSQL, Coolify,
   Traefik ou os demais sistemas.

## Critério obrigatório de aceite

Antes de testar a página de tarefas:

```bash
curl -sS https://nexus.permupay.com.br/version
curl -sS https://nexus.permupay.com.br/health/live
curl -sS https://nexus.permupay.com.br/health
```

O primeiro comando precisa conter exatamente o marcador:

```json
"release":"fix46-db-locks-realtime-20260730"
```

O JSON real contém campos adicionais. Se `/version` retornar HTML, o Coolify
ainda está executando a imagem antiga e o teste de tarefas não é válido.

Após confirmar a release, abra o Nexus em janela anônima e valide:

1. Tarefas abre e encerra o spinner;
2. Ranking não é chamado até abrir a aba Ranking;
3. atualizar/focar a janela não dispara rajadas;
4. criar, assumir, concluir, devolver e aprovar continuam funcionando;
5. membro e gestor não veem tarefas duplicadas;
6. pontuação continua idempotente.

Se, já com a release correta, apenas o SSE ainda mostrar erro QUIC, desative
temporariamente HTTP/3 no Cloudflare. O FIX46 mantém reconexão com backoff e
esse stream não bloqueia tarefas, agenda ou ranking.
