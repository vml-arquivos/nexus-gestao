# NEXUS — Diagnóstico e correção da falha em Tarefas (FIX53)

Data: 03/08/2026
Release corrigida: `fix53-integracao-tarefas-20260803`

## Conclusão executiva

O erro exibido nas capturas de `/tarefas` **não é causado por uma chamada ao
Destrava**. A abertura da página executa `GET /api/tarefas`, e essa rota consulta
o PostgreSQL do próprio Nexus. A mensagem “O servidor demorou para responder” é
gerada pelo cliente Nexus quando esse GET ultrapassa 20 segundos.

O ZIP recebido com o nome `nexus-gestao-main (53).zip` ainda continha
internamente a release `fix52-loading-notificacoes-20260730` no backend,
Dockerfile, Nginx e Service Worker. Portanto, a versão enviada não era uma FIX53
implantada/identificável.

Há duas ocorrências diferentes:

| Ocorrência | Diagnóstico | Relação com o Destrava |
|---|---|---|
| Página `/tarefas` não carrega | Timeout no caminho Nexus → API → PostgreSQL | Nenhuma chamada ao Destrava é feita para listar as tarefas |
| Criação/sincronização de tarefas vindas do Destrava | Contratos novo e legado eram interpretados de forma diferente e a resolução de organização era ambígua | Falha separada, corrigida nesta release |

## Evidências do diagnóstico

1. `src/pages/Tarefas.tsx` chama `tarefasApi.list()` na carga principal.
2. `src/lib/api.ts` interrompe o GET após 20 segundos e produz exatamente a
   mensagem vista na captura.
3. `backend/src/routes/tarefas.ts`, em `GET /api/tarefas`, usa
   `listTasksForUser()` e PostgreSQL.
4. Chamadas ao Destrava nessa rota existem somente quando o usuário abre dados
   da empresa/documentos vinculados, envia anexo ao Destrava ou gera um evento
   de integração. Elas não participam da carga inicial.
5. A listagem da FIX52 fazia uma única consulta com `LEFT JOIN LATERAL` na tabela
   `tarefa_anexos` para cada tarefa. Assim, volume, lock ou incompatibilidade da
   tabela de anexos podia impedir toda a página de abrir.
6. O relatório técnico da FIX52 registra incidentes reais do banco de produção:
   18.212 notificações não lidas, backlog de 18.072 itens processado de uma vez e
   1.186.326 registros sintéticos na agenda para somente 65 tarefas reais. Esse
   histórico confirma que contenção do pool/locks e volume derivado já afetaram
   as rotas interativas do Nexus.

Sem acesso aos logs e ao PostgreSQL de produção no instante do erro, não é
tecnicamente possível afirmar qual sessão ou query estava mantendo o lock. O
código, entretanto, permite afirmar que a captura representa timeout interno do
Nexus/PostgreSQL, e não indisponibilidade do Destrava.

## Correções aplicadas

### 1. Carga de tarefas independente dos anexos

- Removido o `LEFT JOIN LATERAL` de anexos da consulta principal.
- A lista de tarefas passa a responder primeiro.
- Contagem e última evidência são carregadas depois por
  `GET /api/tarefas/anexos-resumo`.
- Falha no resumo de anexos não esconde nem bloqueia as tarefas.
- A rota mantém fallback compatível com bancos antigos durante a migração.

### 2. Índices do caminho crítico

- Índice composto para anexos por organização/tarefa/data.
- Índice da ordenação usada na tela de tarefas.
- Migrações são idempotentes (`IF NOT EXISTS`) e não removem dados.

### 3. Prioridade para requisições dos usuários

- O arquivamento de notificações continua em lotes com `SKIP LOCKED`.
- Se houver requisição aguardando conexão no pool, o job encerra a passada e
  retoma no ciclo seguinte, preservando os dados e o progresso já confirmado.

### 4. Integração Nexus ↔ Destrava

- Aceita tanto o payload plano atual quanto o payload legado aninhado.
- Chave externa/idempotente determinística evita tarefa duplicada.
- Usuários e responsáveis são resolvidos dentro da organização correta.
- Em ambiente multiempresa, a integração exige
  `NEXUS_DESTRAVA_ORG_ID` ou usuário padrão inequívoco; não escolhe uma
  organização arbitrariamente.
- Tarefas integradas entram explicitamente como `escopo=equipe` e
  `modo_distribuicao=normal`.
- Requisições externas ao Destrava agora têm timeout, evitando ocupar recursos
  do Nexus indefinidamente.

### 5. Identificação da release

Backend, Docker, Nginx e Service Worker foram alinhados para
`fix53-integracao-tarefas-20260803`. Isso impede concluir incorretamente que uma
correção foi implantada quando o container ainda serve a FIX52.

## Escopo preservado

Não foram alteradas as regras de pontuação, ranking, aprovação, status,
permissões de negócio, financeiro ou agenda. Não há exclusão automática do
histórico excedente da agenda: qualquer limpeza de dados de produção precisa ser
validada e executada separadamente com backup.

## Configuração mínima de produção

Conferir no Nexus/Coolify antes do deploy:

```env
DB_POOL_MAX=12
DB_CONNECTION_TIMEOUT_MS=4000
DB_LOCK_TIMEOUT_MS=5000
DB_STATEMENT_TIMEOUT_MS=15000
DB_QUERY_TIMEOUT_MS=18000
BACKGROUND_JOBS_ENABLED=true
AGENDA_AUTO_SYNC_ENABLED=false

DESTRAVA_API_URL=https://destravacredito.com
NEXUS_DESTRAVA_INTEGRATION_SECRET=<mesma-chave-configurada-no-destrava>
NEXUS_DESTRAVA_ORG_ID=<uuid-da-organizacao-correta-no-nexus>
NEXUS_DESTRAVA_DEFAULT_USER_EMAIL=<usuario-ativo-da-mesma-organizacao>
```

`NEXUS_DESTRAVA_DEFAULT_USER_ID` pode ser usado no lugar do e-mail, mas deve
pertencer à mesma organização de `NEXUS_DESTRAVA_ORG_ID`.

## Validação da implantação

Após publicar o pacote, executar da raiz do projeto:

```bash
bash scripts/verify-release.sh https://nexus.permupay.com.br
```

O comando só conclui com sucesso se `/version`, `/health/live` e `/health`
responderem corretamente. A release esperada é:

```text
fix53-integracao-tarefas-20260803
```

Depois, validar com um usuário gestor:

1. Abrir `/tarefas` e confirmar que as listas aparecem antes do resumo de
   anexos.
2. Alternar entre Lista/Quadro e filtros.
3. Abrir tarefa com vários anexos e confirmar contagem, visualização e download.
4. Criar uma tarefa nativa e uma tarefa enviada pelo Destrava.
5. Reenviar a mesma chave de integração e confirmar que não há duplicação.
6. Confirmar nos logs ausência de timeout e observar o status do pool em
   `/health`.

## Verificações executadas no pacote

- Build de produção do frontend.
- Build TypeScript do backend.
- Suíte Vitest do backend, incluindo contratos do Destrava e proteções de
  runtime.
- Suíte de lógica de negócio das tarefas.
- Comparação do pacote corrigido contra a origem, limitando as mudanças ao
  fluxo de tarefas/anexos, integração, resiliência do banco e identificação da
  release.

Essas verificações reduzem o risco e não detectaram regressão. Garantia absoluta
de “zero quebra” só pode ser concluída após deploy controlado e teste contra o
banco/configuração reais de produção; por isso o verificador de release e o
roteiro de aceite acima são parte obrigatória da entrega.
