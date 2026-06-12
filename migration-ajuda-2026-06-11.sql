-- ============================================================
-- NEXUS GESTÃO — Migration Pedir Ajuda 2026-06-11
-- Cria tabela tarefas_ajuda para a função de colaboração.
--
-- GARANTIAS:
--   ✅ Não apaga dados existentes
--   ✅ Idempotente (IF NOT EXISTS em todo lugar)
--   ✅ Compatível com PostgreSQL nativo
--   ✅ Dentro de transaction BEGIN/COMMIT
-- ============================================================

BEGIN;

-- Tabela principal de pedidos de ajuda
CREATE TABLE IF NOT EXISTS tarefas_ajuda (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL,
  tarefa_id       UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  checklist_id    TEXT,
  solicitante_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  destinatario_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mensagem        TEXT NOT NULL,
  resposta        TEXT,
  status          TEXT NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','respondida','resolvida')),
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  respondida_em   TIMESTAMPTZ,
  resolvida_em    TIMESTAMPTZ
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ajuda_tarefa   ON tarefas_ajuda(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_ajuda_org      ON tarefas_ajuda(org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ajuda_dest     ON tarefas_ajuda(destinatario_id, status);
CREATE INDEX IF NOT EXISTS idx_ajuda_solic    ON tarefas_ajuda(solicitante_id);

-- Coluna auxiliar para badge visual rápido no card (sem query extra)
ALTER TABLE tarefas
  ADD COLUMN IF NOT EXISTS pedido_ajuda_pendente BOOLEAN DEFAULT FALSE;

-- Ampliar constraint de notificações para incluir tipos do pedir ajuda
ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;
ALTER TABLE notificacoes ADD CONSTRAINT notificacoes_tipo_check
  CHECK (tipo IN (
    'info','aviso','erro','sistema','convite','equipe',
    'tarefa_nova','nova_tarefa','tarefa_criada','tarefa_atualizada',
    'tarefa_concluida','tarefa_nao_concluida','tarefa_devolvida',
    'tarefa_aprovada','tarefa_reenviada','tarefa_lembrete_manual',
    'tarefa_atrasada','tarefa_reaberta','tarefa_vencida',
    'lembrete_diario','financeiro_vencimento',
    'financeiro_cobranca','financeiro_vencido','agenda_lembrete',
    'aniversario','reaberta','excluida','comentario',
    'pedido_ajuda','ajuda_respondida','ajuda_resolvida'
  ));

COMMIT;

-- ============================================================
-- FIM — executar ANTES do deploy com a feature Pedir Ajuda
-- ============================================================
