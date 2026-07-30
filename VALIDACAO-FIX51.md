# Validação da release FIX51

Data: 30/07/2026

Release: `fix51-sequential-build-20260730`

## Resultado

- build TypeScript do backend: aprovado;
- build TypeScript/Vite do frontend: aprovado;
- testes Vitest de resiliência e integração: 22/22 aprovados;
- testes nativos das regras de tarefas: 14/14 aprovados;
- sintaxe dos scripts de diagnóstico e recuperação da VPS: aprovada;
- FIX49 preservado em `dispatcher.ts`, `outboxRepository.ts` e seu teste;
- DDL ausente do caminho HTTP de tarefas e ranking;
- polling de 25 segundos removido;
- Service Worker sem interceptação de `/api/` e `/uploads/`;
- liveness, readiness e versão separados;
- release presente no backend, Nginx e imagens Docker;
- patches de tarefas incorporados ao fonte antes do empacotamento;
- Dockerfile com um único builder e barreira que impede etapas concorrentes;
- dependências de produção reaproveitadas do builder, sem terceiro `npm ci`.

## Limite desta validação

O build da imagem não foi executado porque o ambiente de validação não expõe
um daemon Docker. Os dois estágios de aplicação usados pelo Dockerfile foram
validados diretamente com `npm ci` e seus builds, e os scripts shell passaram
por `bash -n`.

## Aceite em produção

O redeploy só está confirmado quando:

```bash
curl -fsS https://nexus.permupay.com.br/version
curl -fsS https://nexus.permupay.com.br/health/live
curl -fsS https://nexus.permupay.com.br/health
```

`/version` deve retornar a release FIX51; `/health/live` deve ser JSON da API;
`/health` deve informar banco conectado.
