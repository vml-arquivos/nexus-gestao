# Aplicação segura da migration Nexus — 06/07/2026

Migration única deste release:

`migration-2026-07-06-nexus-tarefas-e-catalogo-destrava.sql`

As duas migrations preliminares foram removidas e não devem ser executadas.

## Produção

1. Faça backup do PostgreSQL.
2. Copie a migration para `/root/migrations/` no servidor Nexus.
3. Aplique manualmente antes do primeiro deploy deste release.
4. Faça deploy primeiro da Destrava e depois do Nexus.

```bash
cat /root/migrations/migration-2026-07-06-nexus-tarefas-e-catalogo-destrava.sql \
  | docker exec -i q9s0fac7m9bnjnacuwymxlit \
      psql -U postgrespostgres -d postgres -v ON_ERROR_STOP=1
```

O Dockerfile do backend também executa o schema idempotente na inicialização. A execução duplicada que existia dentro de `src/index.ts` foi removida; assim há apenas um ponto automático de execução no container.
