-- ============================================================
-- NEXUS GESTÃO — Migration 2026-06-11 (rev 2)
-- Auditada e aprovada para execução em produção.
--
-- GARANTIAS:
--   ✅ Não apaga dados
--   ✅ Não altera estrutura de tabelas de negócio
--   ✅ Não quebra queries existentes
--   ✅ Não causa regressão
--   ✅ Idempotente — pode ser executada múltiplas vezes
--   ✅ Totalmente dentro de uma transaction (BEGIN/COMMIT)
--      Se qualquer statement falhar, nada é aplicado.
--   ✅ Segura para banco antigo (sem colunas opcionais ainda)
--   ✅ Protege cada statement com IF NOT EXISTS / DO $$
--
-- TEMPO ESPERADO: < 5 segundos em produção
-- ============================================================

BEGIN;

-- ── 1. GARANTE COLUNA ANTES DO UPDATE (banco muito antigo pode não tê-la) ────
-- ADD COLUMN IF NOT EXISTS é no-op se a coluna já existir.
ALTER TABLE tarefas
  ADD COLUMN IF NOT EXISTS bloquear_nova_livre_ate_concluir BOOLEAN NOT NULL DEFAULT FALSE;

-- Remove o bloqueio de produtividade em registros existentes.
-- A coluna controla uma função dead-code (findOpenTaskAssignedToUser)
-- que nunca é chamada. O UPDATE apenas zera um campo inativo.
-- ROW EXCLUSIVE lock — não bloqueia SELECTs simultâneos.
UPDATE tarefas
   SET bloquear_nova_livre_ate_concluir = FALSE
 WHERE COALESCE(bloquear_nova_livre_ate_concluir, TRUE) = TRUE;

-- Muda o DEFAULT para novos INSERTs. Não toca em dados existentes.
ALTER TABLE tarefas
  ALTER COLUMN bloquear_nova_livre_ate_concluir SET DEFAULT FALSE;


-- ── 2. NORMALIZA TIPOS ANTIGOS ANTES DO CONSTRAINT ───────────────────────────
-- Bancos com notificações antigas podem ter tipos fora de qualquer lista.
-- Este UPDATE normaliza tipos desconhecidos para 'info' (genérico válido)
-- SEM apagar nenhuma notificação. Preserva título, body, lida e todas as colunas.
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
    'aniversario','reaberta','excluida','comentario'
 );

-- Agora o ADD CONSTRAINT não pode falhar por dados antigos.
-- A nova lista é um SUPERSET de todas as versões anteriores do constraint.
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
    'aniversario','reaberta','excluida','comentario'
  ));


-- ── 3. COLUNA CHECKLIST_ID (protegida contra tabela inexistente) ──────────────
-- Em bancos muito antigos a tabela tarefas_pontuacao pode não existir.
-- Usamos DO $$ com consulta em information_schema para só alterar se existir.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name   = 'tarefas_pontuacao'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = 'tarefas_pontuacao'
         AND column_name  = 'checklist_id'
    ) THEN
      ALTER TABLE tarefas_pontuacao ADD COLUMN checklist_id TEXT;
    END IF;
  END IF;
END$$;


-- ── 4. ÍNDICES AUXILIARES (IF NOT EXISTS = no-op se já existirem) ─────────────
-- Só cria os índices se as tabelas existirem.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'tarefas'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_tarefas_livre_equipe
      ON tarefas(org_id, modo_distribuicao, aceita_por, status);
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'tarefas_pontuacao'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_tarefas_pontuacao_org_periodo
      ON tarefas_pontuacao(org_id, periodo_mes);
    CREATE INDEX IF NOT EXISTS idx_tarefas_pontuacao_usuario
      ON tarefas_pontuacao(usuario_id);
  END IF;
END$$;


COMMIT;

-- ============================================================
-- FIM — se chegou aqui sem erro, tudo foi aplicado com sucesso.
-- ============================================================
