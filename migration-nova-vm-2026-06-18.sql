-- ============================================================
-- NEXUS GESTÃO — Migration Nova VM 2026-06-18
-- Execute ANTES do primeiro deploy na nova VM.
-- Idempotente — pode ser executada múltiplas vezes com segurança.
-- ============================================================

BEGIN;

-- 1. Remove bloqueio de produtividade
UPDATE tarefas
   SET bloquear_nova_livre_ate_concluir = FALSE
 WHERE COALESCE(bloquear_nova_livre_ate_concluir, TRUE) = TRUE;
ALTER TABLE tarefas
  ALTER COLUMN bloquear_nova_livre_ate_concluir SET DEFAULT FALSE;

-- 2. Coluna pedido_ajuda_pendente na tabela tarefas
ALTER TABLE tarefas
  ADD COLUMN IF NOT EXISTS pedido_ajuda_pendente BOOLEAN DEFAULT FALSE;

-- 3. Tabela de pedidos de ajuda (nova funcionalidade)
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
CREATE INDEX IF NOT EXISTS idx_ajuda_tarefa ON tarefas_ajuda(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_ajuda_org    ON tarefas_ajuda(org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ajuda_dest   ON tarefas_ajuda(destinatario_id, status);
CREATE INDEX IF NOT EXISTS idx_ajuda_solic  ON tarefas_ajuda(solicitante_id);

-- 4. Normalizar tipos antigos de notificação antes de recriar o constraint
UPDATE notificacoes
   SET tipo = 'info'
 WHERE tipo NOT IN (
    'info','aviso','erro','sistema','convite','equipe',
    'tarefa_nova','nova_tarefa','tarefa_criada','tarefa_atualizada',
    'tarefa_concluida','tarefa_nao_concluida','tarefa_devolvida',
    'tarefa_aprovada','tarefa_reenviada','tarefa_lembrete_manual',
    'tarefa_atrasada','tarefa_reaberta','tarefa_vencida',
    'lembrete_diario','financeiro_vencimento',
    'financeiro_cobranca','financeiro_vencido','agenda_lembrete',
    'aniversario','reaberta','excluida','comentario',
    'pedido_ajuda','ajuda_respondida','ajuda_resolvida'
 );

-- 5. Constraint de notificações com todos os tipos incluindo ajuda
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

-- 6. Índices auxiliares (idempotente)
CREATE INDEX IF NOT EXISTS idx_tarefas_livre_equipe
  ON tarefas(org_id, modo_distribuicao, aceita_por, status);
CREATE INDEX IF NOT EXISTS idx_tarefas_pontuacao_org_periodo
  ON tarefas_pontuacao(org_id, periodo_mes);
CREATE INDEX IF NOT EXISTS idx_tarefas_pontuacao_usuario
  ON tarefas_pontuacao(usuario_id);

COMMIT;

-- ============================================================
-- FIM — verifique que apareceu COMMIT sem erros antes do deploy
-- ============================================================
