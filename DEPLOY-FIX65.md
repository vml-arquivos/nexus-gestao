# Deploy Nexus FIX65

Release esperada: `fix65-destinatarios-ranking-destrava-20260810`.

## O que muda

- novo catálogo protegido de equipes e perfis ativos para o Destrava;
- nenhum filtro por cargo: membro, subgestor, gestor, admin e dev podem ser selecionados;
- isolamento obrigatório por `org_id` e validação do responsável novamente na criação;
- responsável persistido pelo UUID canônico do Nexus;
- escala oficial por item: N1=0, N2=1, N3=3, N4=5 e N5=20;
- listas manuais do Destrava entram no ranking por item, somente após aprovação;
- contratos antigos continuam com o comportamento histórico de pontuação.

## Ordem segura

1. Publique este Nexus antes do Destrava FIX66.
2. Preserve banco, volumes e variáveis atuais; não há migration nova.
3. Confirme no Nexus:

   ```bash
   curl -fsS https://SEU-NEXUS/version
   curl -fsS https://SEU-NEXUS/health/live
   ```

4. `/version` deve retornar esta FIX65.

## Integração

No Nexus, mantenha `NEXUS_DESTRAVA_INTEGRATION_SECRET` configurado. O valor deve ser o mesmo usado em `NEXUS_API_TOKEN` no Destrava. Nunca disponibilize essas variáveis durante o build.

## Rollback

Republique a imagem anterior. Como esta release não cria nem remove tabelas/colunas, o rollback não exige alteração no banco.
