# Nexus Gestão — correção de deploy fix39

## Erro encontrado

O build do frontend e do backend terminava com sucesso. O novo contêiner
travava antes de iniciar o servidor, enquanto mostrava apenas:

`[MIGRATE] Conectando ao PostgreSQL…`

O motivo estava no próprio gerenciador de conexões: toda chamada a
`pool.connect()` executava uma manutenção de pontuação e criação de índice.
A migração também chamava `pool.connect()`, ficando presa nessa manutenção
antes de executar o schema e antes de iniciar Nginx, API e healthcheck.

## Correções realizadas

- Removida a alteração global de `pool.connect()`.
- Deduplicação e índices permanecem na migração oficial, onde já existiam.
- Adicionados timeouts configuráveis de conexão, consulta, statement e lock.
- A migração agora valida `DATABASE_URL` e exibe erro seguro e objetivo.
- Criados entrypoints versionados para o Docker unificado e para o backend.
- Healthcheck usa `127.0.0.1` e possui janela adequada para a migração.
- A modalidade de pontuação `ambos` não é mais removida durante o build.
- O antigo patch textual do seletor PJ/PF foi transformado em validador
  idempotente: o Docker não tenta mais alterar um arquivo já corrigido.
- Corrigida a liberação duplicada de uma conexão PostgreSQL na rota de
  atualização de atraso do checklist.
- Atualizado o Vitest para uma versão compatível com o runtime de validação.
- Credenciais reais foram removidas da documentação.

## Garantias preservadas

- Criação e edição de tarefas continuam aceitando pontuação por lista, por
  tarefa ou por ambos.
- A integração Destrava usa chave externa determinística, lock transacional e
  índice único para impedir que uma mesma entrega crie duas tarefas.
- Visibilidade, autoria, aprovação, devolução, ranking e tarefas livres
  continuam cobertos pelos testes de lógica existentes.

## Validação executada

- Backend TypeScript: compilado sem erros.
- Frontend TypeScript: compilado sem erros.
- Frontend Vite: build de produção concluído.
- Testes Vitest: 9 de 9 aprovados.
- Testes de regras de tarefas/ranking: 14 de 14 aprovados.
- Scripts Python e entrypoints shell: sintaxe validada.
- Os três validadores do Docker foram executados em uma cópia limpa e
  concluíram sem modificar ou quebrar o código.

O Vite informa apenas um aviso não bloqueante de tamanho do bundle principal;
isso não impede o deploy nem altera o funcionamento.

## Variáveis obrigatórias no Coolify

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `FRONTEND_URL=https://nexus.permupay.com.br`
- `VITE_API_URL=/api`

Os segredos que apareceram em logs anteriores devem ser trocados antes do
redeploy.

## Resultado esperado

O contêiner deve registrar, nesta ordem:

1. Aplicando migrations.
2. Conexão com o PostgreSQL iniciada.
3. Execução do schema.
4. Schema aplicado.
5. Nginx e Nexus API iniciados.
6. Healthcheck `/health` respondendo com status 200.
