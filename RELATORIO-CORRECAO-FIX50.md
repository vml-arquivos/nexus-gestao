# Nexus Gestão — consolidação FIX50 (histórico)

> Esta release foi sucedida pelo FIX51. Para novos deploys, use
> `fix51-sequential-build-20260730`.

Release: `fix50-origin-stability-db-locks-20260730`

## Escopo

Esta release parte do ZIP 48 (`bbe4d48f5e40726b975697e4ba86862e3e97d268`)
e consolida:

- o FIX49 já presente no ZIP 48, que usa a mesma conexão transacional para
  registrar a auditoria do Automation Engine;
- as proteções de banco, tarefas, jobs, SSE, sessão, Service Worker, Docker,
  healthcheck e observabilidade do FIX46;
- compatibilidade com `DB_CONNECT_TIMEOUT_MS` e
  `DB_CONNECTION_TIMEOUT_MS`;
- correção da segunda consulta fora da transação na atualização diária de item
  atrasado;
- remoção do arquivo acidental `-n` existente no ZIP 48;
- scripts de diagnóstico somente leitura e recuperação controlada da VPS.

## Falhas impedidas

- esgotamento do pool por deadlock entre transação e auditoria;
- DDL e criação de índices durante uma requisição de tarefas/ranking;
- spinner bloqueado por ranking, ajuda ou membros;
- rajadas completas a cada 25 segundos;
- cache/interceptação de API e SSE pelo Service Worker;
- sobreposição de jobs em múltiplas instâncias;
- healthcheck verde quando somente o HTML está acessível;
- heap Node incompatível com o limite do contêiner.

## Segurança de dados

Nenhuma migration destrutiva, remoção de tabela, seed, limpeza de Docker,
remoção de volume, alteração de credencial ou reinício automático de banco foi
adicionado.

## Critério de aceite

O deploy só é considerado atualizado quando:

```text
/version -> release=fix50-origin-stability-db-locks-20260730
/health/live -> JSON da API, nunca HTML
/health -> 200 com db=connected
```

Os testes automatizados e os builds devem ser executados antes da publicação.
