# Nexus Gestão — correção FIX51

Release: `fix51-sequential-build-20260730`

## Diagnóstico do log de 30/07/2026

O deploy não apresentou erro de TypeScript, Vite, npm ou Dockerfile. Ele foi
interrompido abruptamente com `exit code 255` enquanto o BuildKit executava ao
mesmo tempo:

1. `npm ci` do frontend;
2. `tsc` do backend;
3. montagem e instalação de pacotes da imagem de produção.

O comando `docker exec ... bash /artifacts/build.sh` perdeu o processo antes que
qualquer etapa emitisse erro próprio. Esse padrão é compatível com queda ou
reinício do Docker/helper e com saturação da origem já observada nos 522/524.

O ZIP 49 anexado possui o mesmo SHA-256 do ZIP 48 e o mesmo commit
`bbe4d48f5e40726b975697e4ba86862e3e97d268`. Portanto ele não continha o FIX50.

## Correções do build

- um único builder para frontend e backend;
- instalações e compilações estritamente sequenciais;
- barreira `COPY --from=builder` antes de qualquer trabalho da produção;
- cache BuildKit separado para dependências de frontend e backend;
- patches de tarefas incorporados diretamente ao código;
- Python removido do build;
- dependências de produção copiadas do builder após `npm prune --omit=dev`;
- terceiro `npm ci` eliminado;
- release atualizada em backend, Nginx, Docker e Service Worker.

## Correções funcionais preservadas

- FIX49 do deadlock do Automation Engine;
- pool e timeouts do FIX50;
- DDL fora das rotas de tarefas e ranking;
- carregamento não bloqueado por ranking, ajuda e membros;
- polling reduzido e requisições deduplicadas;
- SSE com limpeza e backoff;
- Service Worker sem API/SSE/uploads;
- jobs serializados e agenda automática opt-in;
- liveness real do Node e readiness do banco;
- regras de tarefas, visibilidade, deduplicação e pontuação.

## Dados e volumes

Não há remoção de tabela, seed, `docker prune`, `docker compose down`, exclusão
de volume, reinício de PostgreSQL ou alteração automática de credencial.

## Critério de aceite

```text
/version     -> fix51-sequential-build-20260730
/health/live -> JSON do nexus-api
/health      -> status=ok e db=connected
```
