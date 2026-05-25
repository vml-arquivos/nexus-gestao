import 'dotenv/config'
import pool from './pool'

const SCHEMA = `
-- ============================================================
-- NEXUS GESTÃO — Schema PostgreSQL 17 Nativo v2
-- Executado automaticamente no startup do backend
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ORGANIZAÇÕES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizacoes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL,
  criado_por  UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── PERFIS DE USUÁRIO ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID REFERENCES organizacoes(id) ON DELETE CASCADE,
  nome         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  senha_hash   TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'membro' CHECK (role IN ('gestor','membro')),
  avatar_url   TEXT,
  ativo        BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profiles_org   ON profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- ── PESSOAS / EQUIPE ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pessoas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  nome        TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'funcionario' CHECK (tipo IN ('funcionario','prestador','credor','devedor','cliente')),
  cargo       TEXT,
  contato     TEXT,
  email       TEXT,
  valor       NUMERIC(12,2),
  obs         TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pessoas_org ON pessoas(org_id);

-- ── TAREFAS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tarefas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  criado_por            UUID NOT NULL REFERENCES profiles(id),
  responsavel_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  responsavel_nome      TEXT,
  titulo                TEXT NOT NULL,
  descricao             TEXT,
  data                  DATE,
  prazo                 DATE,
  prioridade            TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa','media','alta')),
  status                TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_progresso','concluida','cancelada')),
  checklist             JSONB DEFAULT '[]'::jsonb,
  obs                   TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tarefas_org         ON tarefas(org_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_responsavel ON tarefas(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_status      ON tarefas(status);
CREATE INDEX IF NOT EXISTS idx_tarefas_prazo       ON tarefas(prazo);

-- ── HISTÓRICO DE TAREFAS ──────────────────────────────────────
-- Registra cada mudança de status, checklist e edição — permite rastreabilidade total
CREATE TABLE IF NOT EXISTS tarefa_historico (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id   UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL,
  usuario_id  UUID NOT NULL REFERENCES profiles(id),
  usuario_nome TEXT NOT NULL DEFAULT '',
  acao        TEXT NOT NULL,
  dados       JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tarefa_hist_tarefa ON tarefa_historico(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_tarefa_hist_org    ON tarefa_historico(org_id);

-- ── TRIGGERS updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tarefas_updated_at ON tarefas;
CREATE TRIGGER tarefas_updated_at
  BEFORE UPDATE ON tarefas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS pessoas_updated_at ON pessoas;
CREATE TRIGGER pessoas_updated_at
  BEFORE UPDATE ON pessoas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── AGENDA ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agenda (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  criado_por        UUID NOT NULL REFERENCES profiles(id),
  titulo            TEXT NOT NULL,
  descricao         TEXT,
  data_inicio       TIMESTAMPTZ NOT NULL,
  data_fim          TIMESTAMPTZ,
  local             TEXT,
  tipo              TEXT NOT NULL DEFAULT 'compromisso' CHECK (tipo IN ('reuniao','compromisso','prazo','outro')),
  participantes     JSONB DEFAULT '[]'::jsonb,
  lembrete_minutos  INTEGER DEFAULT 15,
  lembrete_enviado  BOOLEAN DEFAULT FALSE,
  cor               TEXT DEFAULT '#6C3BFF',
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agenda_org    ON agenda(org_id);
CREATE INDEX IF NOT EXISTS idx_agenda_inicio ON agenda(data_inicio);

DROP TRIGGER IF EXISTS agenda_updated_at ON agenda;
CREATE TRIGGER agenda_updated_at
  BEFORE UPDATE ON agenda
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── PAGAMENTOS ───────────────────────────────────────────────
-- tipo='pagamento'   → eu devo / vou pagar (saída)
-- tipo='recebimento' → me devem / vou receber (entrada)
CREATE TABLE IF NOT EXISTS pagamentos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  criado_por       UUID NOT NULL REFERENCES profiles(id),
  titulo           TEXT NOT NULL,
  descricao        TEXT,
  valor            NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  tipo             TEXT NOT NULL CHECK (tipo IN ('pagamento','recebimento')),
  vencimento       DATE,
  pago_em          DATE,
  status           TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','cancelado')),
  categoria        TEXT,
  pessoa_id        UUID REFERENCES pessoas(id) ON DELETE SET NULL,
  pessoa_nome      TEXT,
  obs              TEXT,
  comprovante_url  TEXT,
  grupo_id         UUID,
  recorrencia      TEXT NOT NULL DEFAULT 'nenhum' CHECK (recorrencia IN ('nenhum','semanal','quinzenal','mensal','anual')),
  recorrencia_fim  DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_org        ON pagamentos(org_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status     ON pagamentos(status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pessoa     ON pagamentos(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_vencimento ON pagamentos(vencimento);
CREATE INDEX IF NOT EXISTS idx_pagamentos_grupo      ON pagamentos(grupo_id);

DROP TRIGGER IF EXISTS pagamentos_updated_at ON pagamentos;
CREATE TRIGGER pagamentos_updated_at
  BEFORE UPDATE ON pagamentos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── MIGRAÇÃO: adicionar grupo_id em pagamentos existentes ─────
-- (seguro de rodar múltiplas vezes — IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='pagamentos' AND column_name='grupo_id'
  ) THEN
    ALTER TABLE pagamentos ADD COLUMN grupo_id UUID;
    CREATE INDEX IF NOT EXISTS idx_pagamentos_grupo ON pagamentos(grupo_id);
  END IF;
END$$;

-- Migrar grupo_id legado do campo obs para a nova coluna
UPDATE pagamentos
SET grupo_id = (regexp_match(obs, 'grupo_id:([a-f0-9\-]+)'))[1]::uuid
WHERE grupo_id IS NULL
  AND obs ~ 'grupo_id:[a-f0-9\-]+'
  AND (regexp_match(obs, 'grupo_id:([a-f0-9\-]+)'))[1] IS NOT NULL;

-- ── DOCUMENTOS / ARQUIVOS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS documentos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  criado_por    UUID NOT NULL REFERENCES profiles(id),
  titulo        TEXT NOT NULL,
  descricao     TEXT,
  tipo          TEXT NOT NULL DEFAULT 'outro' CHECK (tipo IN ('comprovante','contrato','nota_fiscal','recibo','foto','outro')),
  arquivo_url   TEXT NOT NULL,
  mime_type     TEXT,
  tamanho       BIGINT,
  pessoa_id     UUID REFERENCES pessoas(id) ON DELETE SET NULL,
  pessoa_nome   TEXT,
  pagamento_id  UUID REFERENCES pagamentos(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documentos_org      ON documentos(org_id);
CREATE INDEX IF NOT EXISTS idx_documentos_pessoa   ON documentos(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_documentos_pagamento ON documentos(pagamento_id);

DROP TRIGGER IF EXISTS documentos_updated_at ON documentos;
CREATE TRIGGER documentos_updated_at
  BEFORE UPDATE ON documentos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── NOTIFICAÇÕES ──────────────────────────────────────────────
-- Armazena alertas de prazo, atribuições de tarefas, vencimentos etc.
CREATE TABLE IF NOT EXISTS notificacoes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL DEFAULT 'info' CHECK (tipo IN ('tarefa','vencimento','info','alerta')),
  titulo      TEXT NOT NULL,
  body        TEXT,
  referencia_id   UUID,
  referencia_tipo TEXT,
  lida        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notif_user   ON notificacoes(user_id, lida);
CREATE INDEX IF NOT EXISTS idx_notif_org    ON notificacoes(org_id);

-- ── REFRESH TOKENS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user  ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);

-- ============================================================
-- SCHEMA v2 PRONTO
-- ============================================================
`

async function migrate() {
  console.log('[MIGRATE] Conectando ao PostgreSQL…')
  const client = await pool.connect()
  try {
    console.log('[MIGRATE] Executando schema v2…')
    await client.query(SCHEMA)
    console.log('[MIGRATE] ✅ Schema v2 aplicado com sucesso!')
  } catch (err) {
    console.error('[MIGRATE] ❌ Erro ao aplicar schema:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()
