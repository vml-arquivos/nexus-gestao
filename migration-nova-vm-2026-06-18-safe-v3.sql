-- ============================================================
-- NEXUS GESTÃO — Migration Nova VM SAFE v3
-- Objetivo: corrigir schema de ajuda/notificações sem apagar
-- nem reescrever dados existentes.
-- Pode ser executada mais de uma vez.
-- REGRA: backup antes; executar com ON_ERROR_STOP=1.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ajuda em tarefas: cria somente o que falta.
ALTER TABLE tarefas
  ADD COLUMN IF NOT EXISTS pedido_ajuda_pendente BOOLEAN DEFAULT FALSE;

-- Mantém somente padrão futuro; NÃO altera tarefas antigas.
ALTER TABLE tarefas
  ADD COLUMN IF NOT EXISTS bloquear_nova_livre_ate_concluir BOOLEAN DEFAULT FALSE;
ALTER TABLE tarefas
  ALTER COLUMN bloquear_nova_livre_ate_concluir SET DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS tarefas_ajuda (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL,
  tarefa_id       UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  checklist_id    TEXT,
  solicitante_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  destinatario_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mensagem        TEXT NOT NULL,
  resposta        TEXT,
  status          TEXT NOT NULL DEFAULT 'pendente',
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  respondida_em   TIMESTAMPTZ,
  resolvida_em    TIMESTAMPTZ
);

-- Caso a tabela tenha sido criada parcialmente em deploy anterior.
ALTER TABLE tarefas_ajuda ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE tarefas_ajuda ADD COLUMN IF NOT EXISTS tarefa_id UUID;
ALTER TABLE tarefas_ajuda ADD COLUMN IF NOT EXISTS checklist_id TEXT;
ALTER TABLE tarefas_ajuda ADD COLUMN IF NOT EXISTS solicitante_id UUID;
ALTER TABLE tarefas_ajuda ADD COLUMN IF NOT EXISTS destinatario_id UUID;
ALTER TABLE tarefas_ajuda ADD COLUMN IF NOT EXISTS mensagem TEXT;
ALTER TABLE tarefas_ajuda ADD COLUMN IF NOT EXISTS resposta TEXT;
ALTER TABLE tarefas_ajuda ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pendente';
ALTER TABLE tarefas_ajuda ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE tarefas_ajuda ADD COLUMN IF NOT EXISTS respondida_em TIMESTAMPTZ;
ALTER TABLE tarefas_ajuda ADD COLUMN IF NOT EXISTS resolvida_em TIMESTAMPTZ;

ALTER TABLE tarefas_ajuda DROP CONSTRAINT IF EXISTS tarefas_ajuda_status_check;
ALTER TABLE tarefas_ajuda ADD CONSTRAINT tarefas_ajuda_status_check
  CHECK (status IN ('pendente','respondida','resolvida')) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_ajuda_tarefa ON tarefas_ajuda(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_ajuda_org    ON tarefas_ajuda(org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ajuda_dest   ON tarefas_ajuda(destinatario_id, status);
CREATE INDEX IF NOT EXISTS idx_ajuda_solic  ON tarefas_ajuda(solicitante_id);

-- Notificações: não normaliza histórico e não perde tipos antigos.
-- O objetivo é impedir 500 ao gravar pedido_ajuda/ajuda_respondida,
-- sem reescrever notificações legadas.
ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;
ALTER TABLE notificacoes ADD CONSTRAINT notificacoes_tipo_check
  CHECK (tipo IS NOT NULL AND btrim(tipo) <> '' AND length(tipo) <= 80) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_tarefas_livre_equipe
  ON tarefas(org_id, modo_distribuicao, aceita_por, status);
CREATE INDEX IF NOT EXISTS idx_tarefas_pontuacao_org_periodo
  ON tarefas_pontuacao(org_id, periodo_mes);
CREATE INDEX IF NOT EXISTS idx_tarefas_pontuacao_usuario
  ON tarefas_pontuacao(usuario_id);

COMMIT;

-- Conferência pós-execução:
-- SELECT to_regclass('public.tarefas_ajuda');
-- SELECT column_name FROM information_schema.columns WHERE table_name='tarefas' AND column_name='pedido_ajuda_pendente';
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='notificacoes'::regclass AND conname='notificacoes_tipo_check';
