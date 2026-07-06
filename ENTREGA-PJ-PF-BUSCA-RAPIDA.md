# Nexus + Destrava — catálogo completo PJ/PF com busca rápida

## Resultado

- O Nexus diferencia **Clientes PJ** e **Clientes PF** antes da pesquisa.
- A pesquisa só inicia após 2 caracteres, por botão ou Enter.
- A tela consulta o cache local do Nexus e retorna até 50 resultados por pesquisa.
- Busca por nome/razão social, CPF/CNPJ, e-mail e telefone.
- O Nexus não carrega milhares de registros ao abrir o formulário.
- O botão **Sincronizar PJ e PF** continua importando todo o catálogo paginado da Destrava.
- A Destrava consulta diretamente a tabela correta conforme o tipo escolhido, evitando `UNION` desnecessário nas pesquisas PJ/PF.

## Migrations

### Nexus — obrigatória antes do deploy

Arquivo:

```text
migration-2026-07-06-nexus-tarefas-e-catalogo-destrava.sql
```

Ela cria/ajusta o cache PJ/PF, comentários de tarefas, chave externa composta e índice trigram de busca.

No servidor `vps-nova`, usando o container informado:

```bash
docker exec -i q9s0fac7m9bnjnacuwymxlit \
  psql -U postgrespostgres -d postgres -v ON_ERROR_STOP=1 \
  < /root/migrations/migration-2026-07-06-nexus-tarefas-e-catalogo-destrava.sql
```

### Destrava — recomendada para desempenho

Arquivo:

```text
db/migrations/068_nexus_catalogo_busca_pj_pf.sql
```

Ela não altera dados nem cria novas colunas. Adiciona `pg_trgm` e índices GIN para buscas rápidas em PJ e PF.

No servidor `site-destrava`, usando o container informado:

```bash
docker exec -i tr3go0jqyc5h3tuvz7f46zkc \
  psql -U destravadb -d postgres -v ON_ERROR_STOP=1 \
  < /root/migrations/068_nexus_catalogo_busca_pj_pf.sql
```

Também pode ser executada dentro do código da Destrava, com `DATABASE_URL` configurada:

```bash
npm run migrate:nexus-catalog
```

## Variáveis no Coolify

### Backend da Destrava

```env
FRONTEND_URL=https://destravacredito.com
NEXUS_INTEGRATION_SECRET=UMA_CHAVE_FORTE_IGUAL_NOS_DOIS_SISTEMAS
```

### Backend do Nexus

```env
DESTRAVA_API_URL=https://destravacredito.com
NEXUS_DESTRAVA_INTEGRATION_SECRET=UMA_CHAVE_FORTE_IGUAL_NOS_DOIS_SISTEMAS
```

Nunca use prefixo `VITE_` no segredo.

## Ordem de implantação

1. Fazer backup dos dois bancos.
2. Aplicar a migration obrigatória do Nexus.
3. Aplicar a migration de desempenho da Destrava.
4. Commit/push da Destrava e redeploy.
5. Testar o catálogo da Destrava.
6. Commit/push do Nexus e redeploy.
7. No Nexus, abrir Tarefas → Nova lista → escolher Clientes PJ ou Clientes PF.
8. Digitar pelo menos 2 caracteres e pesquisar.
9. Se o cache estiver vazio, clicar em Sincronizar PJ e PF e repetir a pesquisa.

## Teste da API da Destrava

```bash
read -s -p "Chave da integração: " NEXUS_SECRET; echo
curl -fsS \
  -H "x-nexus-integration-secret: ${NEXUS_SECRET}" \
  "https://destravacredito.com/api/nexus/catalogo?tipo=empresa&q=teste&page=1&limit=10"

curl -fsS \
  -H "x-nexus-integration-secret: ${NEXUS_SECRET}" \
  "https://destravacredito.com/api/nexus/catalogo?tipo=pessoa_fisica&q=teste&page=1&limit=10"
unset NEXUS_SECRET
```

## Validação executada nos pacotes

### Nexus

- Backend TypeScript: aprovado.
- 8 testes críticos de tarefas: aprovados.
- Frontend TypeScript + build de produção: aprovado.

### Destrava

- TypeScript completo (`tsc --noEmit`): aprovado.
- 40 testes automatizados: aprovados.
- Build frontend e backend: aprovado.

Os avisos de tamanho de bundle permanecem como melhoria de performance futura; não impedem o deploy.
