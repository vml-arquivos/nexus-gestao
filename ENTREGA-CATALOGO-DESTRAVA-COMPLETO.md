# Entrega — Catálogo completo Destrava no Nexus

- Sincronização paginada de todas as Pessoas Jurídicas e Pessoas Físicas.
- Leitura em lotes de 500 registros até `has_more=false`.
- Atualização transacional: falhas não inativam o catálogo anterior.
- Chave composta por tipo e ID para impedir colisão entre PJ e PF.
- Compatibilidade com vínculos antigos de empresas.
- Seletor de tarefas identificado por PJ/PF.
- Migration: `migration-2026-07-06-catalogo-destrava-completo.sql`.
- Backend compilado, frontend compilado e 8 testes de regressão aprovados.
