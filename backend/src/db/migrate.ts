import 'dotenv/config'
import pool from './pool'

const SCHEMA = `
-- ============================================================
-- NEXUS GESTÃO — Schema PostgreSQL 17 Nativo
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
  -- Permissão do usuário dentro da organização. Pode ser 'gestor', 'sub_gestor' ou 'membro'.
  role         TEXT NOT NULL DEFAULT 'membro' CHECK (role IN ('gestor','sub_gestor','membro')),
  -- Cargo descritivo (ex: Gerente de Vendas, Financeiro, Diretor)
  cargo        TEXT,
  -- Identifica o criador deste perfil. Útil para sub-gestores ou membros.
  criado_por   UUID REFERENCES profiles(id),
  avatar_url   TEXT,
  ativo        BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
-- Adiciona colunas em bancos já existentes (idempotente)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cargo TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS criado_por UUID REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('gestor','sub_gestor','membro'));

CREATE INDEX IF NOT EXISTS idx_profiles_org        ON profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email      ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_criado_por ON profiles(criado_por);

-- ── PESSOAS / EQUIPE ─────────────────────────────────────────
-- tipo: funcionario, prestador, credor, devedor, cliente
-- Uma pessoa pode ter débitos E créditos ao mesmo tempo (bidirecional)
-- Isso é gerenciado via tabela pagamentos (tipo=pagamento = eu devo; tipo=recebimento = ela me deve)
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
  -- Resposta do responsável ao concluir/não concluir a tarefa
  resposta_status       TEXT CHECK (resposta_status IN ('concluida','nao_concluida')),
  resposta_obs          TEXT,
  resposta_em           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
-- Adiciona colunas de resposta em bancos já existentes (idempotente)
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS resposta_status TEXT CHECK (resposta_status IN ('concluida','nao_concluida'));
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS resposta_obs    TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS resposta_em     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tarefas_org         ON tarefas(org_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_responsavel ON tarefas(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_status      ON tarefas(status);
CREATE INDEX IF NOT EXISTS idx_tarefas_prazo       ON tarefas(prazo);

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
-- A mesma pessoa pode ter AMBOS os tipos ao mesmo tempo
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
  -- Recorrência: 'nenhum' (padrão), 'semanal', 'quinzenal', 'mensal', 'anual'
  recorrencia      TEXT NOT NULL DEFAULT 'nenhum' CHECK (recorrencia IN ('nenhum','semanal','quinzenal','mensal','anual')),
  -- Data de término da recorrência. Se nula, considera recorrência indefinida.
  recorrencia_fim  DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_org       ON pagamentos(org_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status    ON pagamentos(status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pessoa    ON pagamentos(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_vencimento ON pagamentos(vencimento);

DROP TRIGGER IF EXISTS pagamentos_updated_at ON pagamentos;
CREATE TRIGGER pagamentos_updated_at
  BEFORE UPDATE ON pagamentos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── DOCUMENTOS / ARQUIVOS ─────────────────────────────────────
-- Arquivos enviados pelo app (comprovantes, contratos, notas, etc.)
-- Vinculados a uma pessoa e/ou pagamento para histórico completo
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

-- ── EQUIPES E MEMBROS ─────────────────────────────────────────────────────
-- Representa grupos dentro de uma organização. Cada equipe possui um nome,
-- descrição opcional e um criador. Membros são armazenados em uma tabela
-- associativa. A coluna created_at registra quando a equipe foi criada.
CREATE TABLE IF NOT EXISTS equipes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  descricao   TEXT,
  criado_por  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Membros de cada equipe. A chave composta garante unicidade de cada
-- combinação equipe/perfil. Quando uma equipe ou perfil é removido,
-- seus vínculos são apagados automaticamente.
CREATE TABLE IF NOT EXISTS equipes_membros (
  equipe_id   UUID NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (equipe_id, profile_id)
);

-- ── CONVITES (link de acesso para novos membros) ─────────────────────────────
CREATE TABLE IF NOT EXISTS convites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  criado_por UUID NOT NULL REFERENCES profiles(id),
  email      TEXT,
  role       TEXT NOT NULL DEFAULT 'membro' CHECK (role IN ('sub_gestor','membro')),
  cargo      TEXT,
  token      TEXT NOT NULL UNIQUE,
  usado      BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_convites_token ON convites(token);
CREATE INDEX IF NOT EXISTS idx_convites_org   ON convites(org_id);

-- ============================================================
-- SCHEMA PRONTO
-- ============================================================
`

async function migrate() {
  console.log('[MIGRATE] Conectando ao PostgreSQL…')
  const client = await pool.connect()
  try {
    console.log('[MIGRATE] Executando schema…')
    await client.query(SCHEMA)
    console.log('[MIGRATE] ✅ Schema aplicado com sucesso!')
  } catch (err) {
    console.error('[MIGRATE] ❌ Erro ao aplicar schema:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()

