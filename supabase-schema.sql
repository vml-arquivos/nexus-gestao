-- ============================================================
-- NEXUS — Gestão Inteligente
-- Script SQL para configurar o Supabase
-- Execute no SQL Editor do seu projeto Supabase
-- ============================================================

-- ── TABELA: pessoas ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pessoas (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT NOT NULL,
  nome        TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('funcionario','prestador','credor','devedor','cliente')),
  cargo       TEXT,
  contato     TEXT,
  email       TEXT,
  valor       NUMERIC,
  obs         TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── TABELA: tarefas ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tarefas (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id          TEXT NOT NULL,
  titulo           TEXT NOT NULL,
  descricao        TEXT,
  data             DATE,
  prazo            DATE,
  prioridade       TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa','media','alta')),
  status           TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_progresso','concluida','cancelada')),
  responsavel_id   TEXT,
  responsavel_nome TEXT,
  checklist        JSONB DEFAULT '[]',
  obs              TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── TABELA: agenda ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agenda (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id           TEXT NOT NULL,
  titulo            TEXT NOT NULL,
  descricao         TEXT,
  data_inicio       TIMESTAMPTZ NOT NULL,
  data_fim          TIMESTAMPTZ,
  local             TEXT,
  tipo              TEXT NOT NULL DEFAULT 'compromisso' CHECK (tipo IN ('reuniao','compromisso','prazo','outro')),
  participantes     JSONB DEFAULT '[]',
  lembrete_minutos  INTEGER DEFAULT 15,
  lembrete_enviado  BOOLEAN DEFAULT FALSE,
  cor               TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── TABELA: pagamentos ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS pagamentos (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id           TEXT NOT NULL,
  descricao         TEXT NOT NULL,
  valor             NUMERIC NOT NULL,
  tipo              TEXT NOT NULL CHECK (tipo IN ('pagamento','recebimento')),
  vencimento        DATE,
  pago_dia          DATE,
  status            TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','vencido','cancelado')),
  categoria         TEXT,
  pessoa_id         TEXT,
  pessoa_nome       TEXT,
  obs               TEXT,
  comprovante_url   TEXT,
  comprovante_key   TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── TABELA: documentos ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS documentos (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id       TEXT NOT NULL,
  titulo        TEXT NOT NULL,
  descricao     TEXT,
  tipo          TEXT NOT NULL DEFAULT 'outro' CHECK (tipo IN ('comprovante','contrato','nota_fiscal','outro')),
  arquivo_url   TEXT NOT NULL,
  arquivo_key   TEXT NOT NULL,
  mime_type     TEXT,
  tamanho       INTEGER,
  pessoa_id     TEXT,
  pessoa_nome   TEXT,
  pagamento_id  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── ROW LEVEL SECURITY (RLS) ────────────────────────────────
ALTER TABLE pessoas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarefas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;

-- Políticas abertas (o app controla o user_id via código)
CREATE POLICY "allow_all_pessoas"    ON pessoas    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_tarefas"    ON tarefas    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_agenda"     ON agenda     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_pagamentos" ON pagamentos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_documentos" ON documentos FOR ALL USING (true) WITH CHECK (true);

-- ── ÍNDICES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pessoas_user      ON pessoas(user_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_user      ON tarefas(user_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_status    ON tarefas(status);
CREATE INDEX IF NOT EXISTS idx_agenda_user       ON agenda(user_id);
CREATE INDEX IF NOT EXISTS idx_agenda_inicio     ON agenda(data_inicio);
CREATE INDEX IF NOT EXISTS idx_pagamentos_user   ON pagamentos(user_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON pagamentos(status);
CREATE INDEX IF NOT EXISTS idx_documentos_user   ON documentos(user_id);

-- ============================================================
-- PRONTO! Agora configure o Nexus com a URL e chave do projeto.
-- ============================================================
