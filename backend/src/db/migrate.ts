import 'dotenv/config'
import pool from './pool'
import type { PoolClient } from 'pg'

// O schema histórico é extenso e contém correções de dados que só podem rodar
// uma vez por release de banco. Antes, o bloco inteiro era reexecutado em todo
// restart/redeploy e ainda herdava o query_timeout de 18s das rotas HTTP. Em
// bancos com muito histórico de agenda/notificações isso causava cancelamento,
// retry e disputa de locks justamente enquanto a nova API tentava subir.
//
// Ao adicionar uma nova alteração de schema no futuro, crie um novo ID. O
// registro só é gravado depois que TODO o SCHEMA termina com sucesso.
const SCHEMA_MIGRATION_ID = '2026-08-03-fix54-startup-db-priority'
const NOTIFICATION_LIFECYCLE_MIGRATION_ID = '2026-08-25-notification-lifecycle'
const AGENDA_PERFORMANCE_MIGRATION_ID = '2026-08-27-agenda-query-performance'
const USER_AUTOMATION_MIGRATION_ID = '2026-08-27-user-automation-rules'

const SCHEMA = `
-- ============================================================
-- NEXUS GESTÃO — Schema PostgreSQL 17 Nativo
-- Executado automaticamente no startup do backend
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

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
  role         TEXT NOT NULL DEFAULT 'membro' CHECK (role IN ('admin','dev','gestor','sub_gestor','membro')),
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
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin','dev','gestor','sub_gestor','membro'));

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
CREATE INDEX IF NOT EXISTS idx_pessoas_user ON pessoas(user_id);

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

-- Workflow completo gestor -> membro -> aprovação/devolução (idempotente)
ALTER TABLE tarefas DROP CONSTRAINT IF EXISTS tarefas_status_check;
ALTER TABLE tarefas ADD CONSTRAINT tarefas_status_check
  CHECK (status IN ('pendente','em_progresso','concluida','nao_concluida','devolvida','reenviada','aprovada','cancelada'));

ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS resposta_membro TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS motivo_nao_conclusao TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS observacao_conclusao TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS status_gestor TEXT NOT NULL DEFAULT 'aguardando';
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS escopo TEXT NOT NULL DEFAULT 'pessoal';
ALTER TABLE tarefas DROP CONSTRAINT IF EXISTS tarefas_escopo_check;
ALTER TABLE tarefas ADD CONSTRAINT tarefas_escopo_check CHECK (escopo IN ('pessoal','equipe'));

-- Tarefas livres para a equipe: o gestor publica, um membro pega, executa e só pontua após aprovação.
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS modo_distribuicao TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE tarefas DROP CONSTRAINT IF EXISTS tarefas_modo_distribuicao_check;
ALTER TABLE tarefas ADD CONSTRAINT tarefas_modo_distribuicao_check CHECK (modo_distribuicao IN ('normal','livre_equipe'));
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS aceita_por UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS aceita_em TIMESTAMPTZ;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS pontuacao INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS conta_ranking BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS bloquear_nova_livre_ate_concluir BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_tarefas_livre_equipe ON tarefas(org_id, modo_distribuicao, aceita_por, status);

CREATE TABLE IF NOT EXISTS tarefas_pontuacao (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  tarefa_id   UUID REFERENCES tarefas(id) ON DELETE SET NULL,
  usuario_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  checklist_id TEXT,
  pontos      INTEGER NOT NULL DEFAULT 1,
  motivo      TEXT,
  aprovado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  aprovado_em TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  periodo_mes TEXT NOT NULL,
  tarefa_titulo_snapshot TEXT,
  item_titulo_snapshot TEXT,
  escopo_snapshot TEXT,
  conta_ranking_snapshot BOOLEAN NOT NULL DEFAULT TRUE,
  tarefa_excluida_em TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (tarefa_id, usuario_id, motivo)
);
ALTER TABLE tarefas_pontuacao ADD COLUMN IF NOT EXISTS checklist_id TEXT;
ALTER TABLE tarefas_pontuacao ADD COLUMN IF NOT EXISTS tarefa_titulo_snapshot TEXT;
ALTER TABLE tarefas_pontuacao ADD COLUMN IF NOT EXISTS item_titulo_snapshot TEXT;
ALTER TABLE tarefas_pontuacao ADD COLUMN IF NOT EXISTS escopo_snapshot TEXT;
ALTER TABLE tarefas_pontuacao ADD COLUMN IF NOT EXISTS conta_ranking_snapshot BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tarefas_pontuacao ADD COLUMN IF NOT EXISTS tarefa_excluida_em TIMESTAMPTZ;
ALTER TABLE tarefas_pontuacao ALTER COLUMN tarefa_id DROP NOT NULL;
ALTER TABLE tarefas_pontuacao DROP CONSTRAINT IF EXISTS tarefas_pontuacao_tarefa_id_fkey;
ALTER TABLE tarefas_pontuacao ADD CONSTRAINT tarefas_pontuacao_tarefa_id_fkey
  FOREIGN KEY (tarefa_id) REFERENCES tarefas(id) ON DELETE SET NULL;
UPDATE tarefas_pontuacao tp
   SET tarefa_titulo_snapshot = COALESCE(tp.tarefa_titulo_snapshot, t.titulo),
       escopo_snapshot = COALESCE(tp.escopo_snapshot, t.escopo),
       conta_ranking_snapshot = COALESCE(tp.conta_ranking_snapshot, t.conta_ranking, TRUE)
  FROM tarefas t
 WHERE tp.tarefa_id = t.id
   AND tp.org_id = t.org_id;
CREATE INDEX IF NOT EXISTS idx_tarefas_pontuacao_org_periodo ON tarefas_pontuacao(org_id, periodo_mes);
CREATE INDEX IF NOT EXISTS idx_tarefas_pontuacao_usuario ON tarefas_pontuacao(usuario_id);
ALTER TABLE tarefas DROP CONSTRAINT IF EXISTS tarefas_status_gestor_check;
ALTER TABLE tarefas ADD CONSTRAINT tarefas_status_gestor_check CHECK (status_gestor IN ('aguardando','aprovada','devolvida'));
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS ressalva_gestor TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS aprovada_em TIMESTAMPTZ;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS aprovada_por UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS devolvida_em TIMESTAMPTZ;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS data_inicio TIMESTAMPTZ;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS data_conclusao TIMESTAMPTZ;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS reenviada_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tarefas_org         ON tarefas(org_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_responsavel ON tarefas(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_status      ON tarefas(status);
CREATE INDEX IF NOT EXISTS idx_tarefas_prazo       ON tarefas(prazo);
CREATE INDEX IF NOT EXISTS idx_tarefas_criado_por  ON tarefas(criado_por);
CREATE INDEX IF NOT EXISTS idx_tarefas_status_gestor ON tarefas(status_gestor);
CREATE INDEX IF NOT EXISTS idx_tarefas_escopo ON tarefas(org_id, escopo);

-- Integração externa: permite que o mesmo Nexus receba tarefas vindas do Destrava
-- sem deixar de funcionar como sistema independente.
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_sistema TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_tipo TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_id TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_nome TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_url TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_payload JSONB DEFAULT '{}'::jsonb;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS external_key TEXT;

CREATE INDEX IF NOT EXISTS idx_tarefas_origem ON tarefas(origem_sistema, origem_tipo, origem_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_external_key ON tarefas(external_key);

-- Usado pela mesclagem automática (criar tarefa para empresa que já tem
-- lista em aberto/finalizada junta os itens em vez de duplicar a lista):
-- SELECT ... WHERE org_id = $1 AND origem_id = $2 AND status <> 'cancelada'
-- ORDER BY created_at DESC LIMIT 1 FOR UPDATE. Sem este índice, a consulta
-- cairia em varredura sequencial da tabela inteira a cada tarefa criada
-- para uma empresa, piorando conforme o volume de tarefas cresce.
CREATE INDEX IF NOT EXISTS idx_tarefas_org_origem_status
  ON tarefas(org_id, origem_id, status)
  WHERE origem_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS nexus_external_links (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  source_system  TEXT NOT NULL,
  external_type  TEXT NOT NULL,
  external_id    TEXT NOT NULL,
  external_name  TEXT,
  nexus_type     TEXT NOT NULL,
  nexus_id       UUID NOT NULL,
  source_url     TEXT,
  metadata       JSONB DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nexus_external_links_lookup
  ON nexus_external_links(source_system, external_type, external_id);
CREATE INDEX IF NOT EXISTS idx_nexus_external_links_nexus
  ON nexus_external_links(nexus_type, nexus_id);


-- Checklist estruturado por item, mantendo compatibilidade com tarefas.checklist JSONB.
CREATE TABLE IF NOT EXISTS tarefa_checklist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id  UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  criado_por  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  texto       TEXT NOT NULL,
  feito       BOOLEAN NOT NULL DEFAULT FALSE,
  ordem       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tarefa_checklist_tarefa ON tarefa_checklist(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_tarefa_checklist_org ON tarefa_checklist(org_id);
CREATE INDEX IF NOT EXISTS idx_tarefa_checklist_criado_por ON tarefa_checklist(criado_por);

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

DROP TRIGGER IF EXISTS tarefa_checklist_updated_at ON tarefa_checklist;
CREATE TRIGGER tarefa_checklist_updated_at
  BEFORE UPDATE ON tarefa_checklist
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
  -- Agrupamento de parcelas: todas as parcelas de um mesmo financiamento/parcelamento
  -- recebem o mesmo grupo_id. NULL = lançamento avulso.
  grupo_id         UUID,
  num_parcelas     INT,
  num_parcela      INT,
  created_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_org       ON pagamentos(org_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status    ON pagamentos(status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pessoa    ON pagamentos(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_vencimento ON pagamentos(vencimento);
CREATE INDEX IF NOT EXISTS idx_pagamentos_criado_por ON pagamentos(criado_por);

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
CREATE INDEX IF NOT EXISTS idx_documentos_criado_por ON documentos(criado_por);

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
  role       TEXT NOT NULL DEFAULT 'membro' CHECK (role IN ('admin','gestor','sub_gestor','membro')),
  cargo      TEXT,
  token      TEXT NOT NULL UNIQUE,
  usado      BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_convites_token ON convites(token);
CREATE INDEX IF NOT EXISTS idx_convites_org   ON convites(org_id);

-- ── MIGRAÇÕES IDEMPOTENTES (colunas adicionadas após criação inicial) ────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pagamentos' AND column_name='grupo_id') THEN
    ALTER TABLE pagamentos ADD COLUMN grupo_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pagamentos' AND column_name='num_parcelas') THEN
    ALTER TABLE pagamentos ADD COLUMN num_parcelas INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pagamentos' AND column_name='num_parcela') THEN
    ALTER TABLE pagamentos ADD COLUMN num_parcela INT;
  END IF;
END$$;
CREATE INDEX IF NOT EXISTS idx_pagamentos_grupo ON pagamentos(grupo_id);



-- ── ETAPA 3: USUÁRIOS, CONVITES E EQUIPES (MIGRAÇÃO IDEMPOTENTE) ───────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS primeiro_acesso BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS convite_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS convite_expira_em TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_ativo ON profiles(ativo);
CREATE INDEX IF NOT EXISTS idx_profiles_convite_token ON profiles(convite_token) WHERE convite_token IS NOT NULL;

ALTER TABLE equipes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipes_org_criado_por ON equipes(org_id, criado_por);

ALTER TABLE equipes_membros ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE equipes_membros ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE equipes_membros ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE equipes_membros ADD COLUMN IF NOT EXISTS role_na_equipe TEXT DEFAULT 'membro';
ALTER TABLE equipes_membros ADD COLUMN IF NOT EXISTS criado_por UUID;
ALTER TABLE equipes_membros ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;
ALTER TABLE equipes_membros ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;
UPDATE equipes_membros em SET org_id = e.org_id FROM equipes e WHERE em.equipe_id = e.id AND em.org_id IS NULL;
UPDATE equipes_membros SET user_id = profile_id WHERE user_id IS NULL AND profile_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipes_membros_equipe_user ON equipes_membros(equipe_id, user_id);
CREATE INDEX IF NOT EXISTS idx_equipes_membros_org ON equipes_membros(org_id);
CREATE INDEX IF NOT EXISTS idx_equipes_membros_user ON equipes_membros(user_id);
CREATE INDEX IF NOT EXISTS idx_equipes_membros_equipe ON equipes_membros(equipe_id);

ALTER TABLE convites ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE convites ADD COLUMN IF NOT EXISTS usado BOOLEAN DEFAULT FALSE;
ALTER TABLE convites ADD COLUMN IF NOT EXISTS cargo TEXT;
ALTER TABLE convites DROP CONSTRAINT IF EXISTS convites_role_check;
ALTER TABLE convites
  ADD CONSTRAINT convites_role_check
  CHECK (role IN ('admin','gestor','sub_gestor','membro'));
CREATE INDEX IF NOT EXISTS idx_convites_usado ON convites(usado);

-- ── NOTIFICAÇÕES ─────────────────────────────────────────────────────────────
-- Armazena todas as notificações do sistema (tarefas, financeiro, agenda, etc.)
CREATE TABLE IF NOT EXISTS notificacoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL DEFAULT 'info'
                    CHECK (tipo IN (
                      'tarefa_nova', 'tarefa_concluida', 'tarefa_nao_concluida',
                      'tarefa_vencida', 'lembrete_diario', 'financeiro_vencimento',
                      'agenda_lembrete', 'aniversario', 'info', 'aviso', 'erro'
                    )),
  titulo          TEXT NOT NULL,
  body            TEXT,
  referencia_id   UUID,
  referencia_tipo TEXT CHECK (referencia_tipo IN ('tarefa','pagamento','agenda','pessoa') OR referencia_tipo IS NULL),
  lida            BOOLEAN DEFAULT FALSE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  recorrente      BOOLEAN NOT NULL DEFAULT FALSE,
  ativa           BOOLEAN NOT NULL DEFAULT FALSE,
  chave_recorrencia TEXT,
  resolvida_em    TIMESTAMPTZ,
  ocorrencias     INT NOT NULL DEFAULT 1,
  atualizada_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  arquivada       BOOLEAN NOT NULL DEFAULT FALSE,
  arquivada_em    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notificacoes(user_id, lida, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_org  ON notificacoes(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_ref  ON notificacoes(referencia_id) WHERE referencia_id IS NOT NULL;

-- Ajusta bancos existentes para aceitar os tipos reais criados pelos jobs/fluxo do sistema.
ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;
ALTER TABLE notificacoes
  ADD CONSTRAINT notificacoes_tipo_check
  CHECK (tipo IS NOT NULL AND btrim(tipo) <> '' AND length(tipo) <= 80) NOT VALID;


-- ── HISTÓRICO DE TAREFAS ─────────────────────────────────────────────────────
-- Auditoria de todas as ações sobre tarefas
CREATE TABLE IF NOT EXISTS tarefa_historico (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id     UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL,
  usuario_id    UUID NOT NULL REFERENCES profiles(id),
  usuario_nome  TEXT NOT NULL DEFAULT '',
  acao          TEXT NOT NULL CHECK (acao IN (
                  'criada','atualizada','concluida','nao_concluida',
                  'reaberta','excluida','comentario'
                )),
  dados         JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_th_tarefa  ON tarefa_historico(tarefa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_th_org     ON tarefa_historico(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_th_usuario ON tarefa_historico(usuario_id);


-- Tabela nova padronizada de histórico de tarefas (Etapa 4)
CREATE TABLE IF NOT EXISTS tarefas_historico (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  tarefa_id       UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  acao            TEXT NOT NULL,
  status_anterior TEXT,
  status_novo     TEXT,
  observacao      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tarefas_hist_tarefa ON tarefas_historico(tarefa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tarefas_hist_org ON tarefas_historico(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tarefas_hist_user ON tarefas_historico(user_id, created_at DESC);

-- Evidências/anexos enviados na execução de tarefas
CREATE TABLE IF NOT EXISTS tarefa_anexos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  tarefa_id     UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  enviado_por   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  titulo        TEXT NOT NULL,
  descricao     TEXT,
  tipo          TEXT NOT NULL DEFAULT 'evidencia' CHECK (tipo IN ('evidencia','referencia','correcao','outro')),
  arquivo_url   TEXT NOT NULL,
  nome_original TEXT,
  mime_type     TEXT,
  tamanho       BIGINT,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tarefa_anexos_tarefa ON tarefa_anexos(tarefa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tarefa_anexos_org ON tarefa_anexos(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tarefa_anexos_enviado_por ON tarefa_anexos(enviado_por, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tarefa_anexos_org_tarefa_created
  ON tarefa_anexos(org_id, tarefa_id, created_at DESC);



-- Histórico/extrato financeiro por dívida/crédito
CREATE TABLE IF NOT EXISTS pagamentos_historico (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pagamento_id UUID REFERENCES pagamentos(id) ON DELETE SET NULL,
  grupo_id     UUID,
  group_key    TEXT,
  tipo_evento  TEXT NOT NULL DEFAULT 'movimento'
               CHECK (tipo_evento IN ('criacao','pagamento','abatimento','acrescimo','recalculo','cancelamento','edicao','movimento')),
  titulo       TEXT NOT NULL,
  descricao    TEXT,
  valor        NUMERIC(14,2),
  data_evento  DATE,
  forma_pagamento TEXT,
  saldo_anterior NUMERIC(14,2),
  saldo_posterior NUMERIC(14,2),
  metadata     JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pagamentos_hist_org_user ON pagamentos_historico(org_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pagamentos_hist_pagamento ON pagamentos_historico(pagamento_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pagamentos_hist_grupo ON pagamentos_historico(grupo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pagamentos_hist_group_key ON pagamentos_historico(group_key, created_at DESC);

-- ── LEMBRETES PERSONALIZADOS ───────────────────────────────────────────────
-- Lembretes criados pelo gestor ou membro, vinculados a qualquer entidade
CREATE TABLE IF NOT EXISTS lembretes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  criado_por      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  destinatario_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  titulo          TEXT NOT NULL,
  body            TEXT,
  data_lembrete   TIMESTAMPTZ NOT NULL,
  recorrencia     TEXT NOT NULL DEFAULT 'nenhum'
                    CHECK (recorrencia IN ('nenhum','diario','semanal','mensal','anual')),
  referencia_id   UUID,
  referencia_tipo TEXT CHECK (referencia_tipo IN ('tarefa','pagamento','agenda','pessoa') OR referencia_tipo IS NULL),
  enviado         BOOLEAN DEFAULT FALSE NOT NULL,
  ativo           BOOLEAN DEFAULT TRUE  NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lembretes_data ON lembretes(data_lembrete) WHERE enviado = FALSE AND ativo = TRUE;
CREATE INDEX IF NOT EXISTS idx_lembretes_org  ON lembretes(org_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_dest ON lembretes(destinatario_id);

-- ── PUSH SUBSCRIPTIONS (notificações PWA) ────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL,
  user_id      UUID NOT NULL,
  endpoint     TEXT NOT NULL,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  device_label TEXT,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_sent_at TIMESTAMPTZ,
  fail_count   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user     ON push_subscriptions(org_id, user_id, active);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);

-- ── COLUNAS ADICIONAIS EM TAREFAS (idempotente) ──────────────
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS data_reabertura   TIMESTAMPTZ;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS reaberto_por      UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_sistema    TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_tipo       TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_id         TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_nome       TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_url        TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_payload    JSONB DEFAULT '{}'::jsonb;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS external_key      TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS resposta_status   TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS resposta_obs      TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS resposta_em       TIMESTAMPTZ;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS resposta_membro   TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS motivo_nao_conclusao TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS observacao_conclusao TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS status_gestor     TEXT NOT NULL DEFAULT 'aguardando';
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS escopo            TEXT NOT NULL DEFAULT 'pessoal';
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS modo_distribuicao TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS aceita_por        UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS aceita_em         TIMESTAMPTZ;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS pontuacao         INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS conta_ranking     BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS bloquear_nova_livre_ate_concluir BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS ressalva_gestor   TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS aprovada_em       TIMESTAMPTZ;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS aprovada_por      UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS devolvida_em      TIMESTAMPTZ;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS data_inicio       TIMESTAMPTZ;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS data_conclusao    TIMESTAMPTZ;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS reenviada_em      TIMESTAMPTZ;

ALTER TABLE tarefas DROP CONSTRAINT IF EXISTS tarefas_status_check;
ALTER TABLE tarefas ADD CONSTRAINT tarefas_status_check
  CHECK (status IN ('pendente','em_progresso','concluida','nao_concluida','devolvida','reenviada','aprovada','cancelada'));
ALTER TABLE tarefas DROP CONSTRAINT IF EXISTS tarefas_status_gestor_check;
ALTER TABLE tarefas ADD CONSTRAINT tarefas_status_gestor_check
  CHECK (status_gestor IN ('aguardando','aprovada','devolvida'));
ALTER TABLE tarefas DROP CONSTRAINT IF EXISTS tarefas_escopo_check;
ALTER TABLE tarefas ADD CONSTRAINT tarefas_escopo_check
  CHECK (escopo IN ('pessoal','equipe'));
ALTER TABLE tarefas DROP CONSTRAINT IF EXISTS tarefas_modo_distribuicao_check;
ALTER TABLE tarefas ADD CONSTRAINT tarefas_modo_distribuicao_check
  CHECK (modo_distribuicao IN ('normal','livre_equipe'));

CREATE INDEX IF NOT EXISTS idx_tarefas_livre_equipe  ON tarefas(org_id, modo_distribuicao, aceita_por, status);
CREATE INDEX IF NOT EXISTS idx_tarefas_status_gestor ON tarefas(status_gestor);
CREATE INDEX IF NOT EXISTS idx_tarefas_escopo        ON tarefas(org_id, escopo);
CREATE INDEX IF NOT EXISTS idx_tarefas_external_key  ON tarefas(external_key);
CREATE INDEX IF NOT EXISTS idx_tarefas_responsavel   ON tarefas(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_criado_por    ON tarefas(criado_por);
CREATE INDEX IF NOT EXISTS idx_tarefas_org_status_prazo
  ON tarefas(org_id, status, prazo) WHERE prazo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tarefas_org_updated
  ON tarefas(org_id, updated_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tarefas_org_list_order
  ON tarefas(org_id, (COALESCE(data_reabertura, updated_at, created_at)) DESC, created_at DESC);

-- (Definição de nexus_external_links fica a cargo do bloco original lá em
-- cima, linha ~204 -- havia uma segunda CREATE TABLE IF NOT EXISTS duplicada
-- aqui, mais fraca (sem FK em org_id, sem updated_at), que nunca chegava a
-- rodar de verdade por causa do IF NOT EXISTS, mas confundia quem lesse o
-- schema. Removida; a UNIQUE constraint abaixo é o que faltava de verdade
-- para o ON CONFLICT DO NOTHING em routes/integracoes.ts funcionar -- sem
-- ela, duas chamadas concorrentes de POST /destrava/tarefas podiam inserir
-- dois links para o mesmo par (external_id, nexus_id).
DELETE FROM nexus_external_links a USING nexus_external_links b
 WHERE a.id < b.id
   AND a.org_id = b.org_id AND a.source_system = b.source_system
   AND a.external_type = b.external_type AND a.external_id = b.external_id
   AND a.nexus_type = b.nexus_type;
ALTER TABLE nexus_external_links DROP CONSTRAINT IF EXISTS ux_nexus_external_links_source;
ALTER TABLE nexus_external_links ADD CONSTRAINT ux_nexus_external_links_source
  UNIQUE (org_id, source_system, external_type, external_id, nexus_type);

-- ── COLUNAS ADICIONAIS EM PROFILES (idempotente) ─────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS primeiro_acesso    BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS convite_token      TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS convite_expira_em  TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_profiles_ativo         ON profiles(ativo);
CREATE INDEX IF NOT EXISTS idx_profiles_convite_token ON profiles(convite_token) WHERE convite_token IS NOT NULL;

-- ── COLUNAS ADICIONAIS EM PAGAMENTOS (idempotente) ───────────
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS grupo_id      UUID;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS num_parcelas  INT;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS num_parcela   INT;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS pessoa_id     UUID;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS pessoa_nome   TEXT;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS pessoa_user_id     UUID;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS pessoa_contato     TEXT;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS pessoa_nome_atual  TEXT;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS pago_em       TIMESTAMPTZ;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS forma_pagamento TEXT;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS modelo        TEXT DEFAULT 'unico';
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS titulo        TEXT;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_pagamentos_grupo ON pagamentos(grupo_id);

-- ── NOTIFICAÇÕES — constraint ampliada (idempotente) ─────────
ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;
ALTER TABLE notificacoes ADD CONSTRAINT notificacoes_tipo_check
  CHECK (tipo IS NOT NULL AND btrim(tipo) <> '' AND length(tipo) <= 80) NOT VALID;

-- Mantém o comportamento futuro sem reescrever histórico.
-- Não executa UPDATE em tarefas existentes para preservar dados e regras salvas.
ALTER TABLE tarefas ALTER COLUMN bloquear_nova_livre_ate_concluir SET DEFAULT FALSE;

-- ── PEDIR AJUDA (idempotente) ─────────────────────────────────
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS pedido_ajuda_pendente BOOLEAN DEFAULT FALSE;

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
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  respondida_em   TIMESTAMPTZ,
  resolvida_em    TIMESTAMPTZ
);
ALTER TABLE tarefas_ajuda ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ajuda_tarefa ON tarefas_ajuda(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_ajuda_org    ON tarefas_ajuda(org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ajuda_dest   ON tarefas_ajuda(destinatario_id, status);
CREATE INDEX IF NOT EXISTS idx_ajuda_solic  ON tarefas_ajuda(solicitante_id);

-- Índices das rotas exibidas em todo carregamento do layout. Mantêm as
-- consultas de atrasos/agenda dentro do timeout mesmo com histórico grande.
CREATE INDEX IF NOT EXISTS idx_pagamentos_org_status_vencimento
  ON pagamentos(org_id, status, vencimento) WHERE vencimento IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agenda_org_data_inicio
  ON agenda(org_id, data_inicio);
CREATE INDEX IF NOT EXISTS idx_notificacoes_user_org_unread
  ON notificacoes(user_id, org_id, lida, created_at DESC);

-- ── EMPRESAS/PESSOAS DESTRAVA SINCRONIZADAS E COMENTÁRIOS AUDITÁVEIS ──
CREATE TABLE IF NOT EXISTS destrava_empresas_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'empresa',
  external_key TEXT,
  nome TEXT NOT NULL,
  documento TEXT,
  email TEXT,
  telefone TEXT,
  status TEXT,
  source_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_updated_at TIMESTAMPTZ,
  sincronizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);
ALTER TABLE destrava_empresas_cache ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'empresa';
ALTER TABLE destrava_empresas_cache ADD COLUMN IF NOT EXISTS external_key TEXT;
UPDATE destrava_empresas_cache
   SET tipo = CASE
     WHEN lower(COALESCE(NULLIF(btrim(tipo), ''), 'empresa')) IN ('pf','cliente','clientes','pessoa fisica','pessoa_fisica')
       THEN 'pessoa_fisica'
     ELSE 'empresa'
   END;
UPDATE destrava_empresas_cache
   SET external_key = tipo || ':' || external_id
 WHERE external_key IS NULL OR btrim(external_key) = '';
ALTER TABLE destrava_empresas_cache ALTER COLUMN tipo SET DEFAULT 'empresa';
ALTER TABLE destrava_empresas_cache ALTER COLUMN tipo SET NOT NULL;
ALTER TABLE destrava_empresas_cache ALTER COLUMN external_key SET NOT NULL;
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'destrava_empresas_cache'::regclass
       AND contype = 'u'
       AND pg_get_constraintdef(oid) = 'UNIQUE (org_id, external_id)'
  LOOP
    EXECUTE format('ALTER TABLE destrava_empresas_cache DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS ux_destrava_cache_org_external_key ON destrava_empresas_cache(org_id, external_key);
CREATE INDEX IF NOT EXISTS idx_destrava_empresas_cache_org_nome ON destrava_empresas_cache(org_id, lower(nome));
CREATE INDEX IF NOT EXISTS idx_destrava_empresas_cache_org_ativo ON destrava_empresas_cache(org_id, ativo, sincronizado_em DESC);
CREATE INDEX IF NOT EXISTS idx_destrava_cache_org_tipo_nome ON destrava_empresas_cache(org_id, tipo, lower(nome));
CREATE INDEX IF NOT EXISTS idx_destrava_cache_busca_trgm
ON destrava_empresas_cache USING GIN (
  lower(COALESCE(nome,'') || ' ' || COALESCE(documento,'') || ' ' || COALESCE(email,'') || ' ' || COALESCE(telefone,'')) gin_trgm_ops
);

CREATE TABLE IF NOT EXISTS tarefas_comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  tarefa_id UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  checklist_id TEXT,
  autor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  comentario TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'comentario' CHECK (tipo IN ('comentario','execucao','devolucao','aprovacao','sistema')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  editado_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tarefas_comentarios_tarefa ON tarefas_comentarios(org_id, tarefa_id, criado_em ASC);
CREATE INDEX IF NOT EXISTS idx_tarefas_comentarios_checklist ON tarefas_comentarios(org_id, tarefa_id, checklist_id, criado_em ASC);

-- ============================================================
-- Correção 2026-07-07: erro 500 ao aprovar/revisar itens de checklist.
--
-- Causa raiz: em bancos criados antes da constraint UNIQUE(tarefa_id,
-- usuario_id, motivo) existir em tarefas_pontuacao, o único mecanismo que
-- criava esse índice era uma chamada silenciosa em runtime
-- (ensureCompatibilitySchema, em tarefasScoring.ts) protegida por
-- ".catch(() => undefined)". Se já existissem linhas duplicadas para a
-- mesma combinação (ex.: pontuação registrada antes desse esquema de
-- idempotência existir), o CREATE UNIQUE INDEX falhava sempre, o erro era
-- descartado, e toda aprovação que dependia de "ON CONFLICT (tarefa_id,
-- usuario_id, motivo)" passava a responder 42P10 -> HTTP 500.
--
-- Esta migration remove as duplicatas de forma segura (mantendo a linha
-- mais recente de cada combinação, sem apagar pontuação legítima de
-- combinações distintas) e garante a existência do índice único de forma
-- definitiva e idempotente, para nunca mais depender só do runtime.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tarefas_pontuacao') THEN
    DELETE FROM tarefas_pontuacao tp
     WHERE tp.tarefa_id IS NOT NULL
       AND tp.motivo IS NOT NULL
       AND tp.id NOT IN (
         SELECT DISTINCT ON (tarefa_id, usuario_id, motivo) id
           FROM tarefas_pontuacao
          WHERE tarefa_id IS NOT NULL AND motivo IS NOT NULL
          ORDER BY tarefa_id, usuario_id, motivo, aprovado_em DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
       );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_tarefas_pontuacao_tarefa_usuario_motivo
  ON tarefas_pontuacao (tarefa_id, usuario_id, motivo);

-- ── AUTOMATION ENGINE (outbox de eventos Destrava <-> Nexus) ──
-- Espelha automation_events/automation_audit_log do lado Destrava. Todo
-- evento que o Nexus precisa emitir (ex.: TarefaConcluidaNexus) é gravado
-- aqui antes do despacho, garantindo entrega at-least-once e idempotência
-- via UNIQUE(event_type, idempotency_key).
CREATE TABLE IF NOT EXISTS automation_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID REFERENCES organizacoes(id) ON DELETE CASCADE,
  event_type      VARCHAR(60) NOT NULL,
  event_version   INT NOT NULL DEFAULT 1,
  aggregate_type  VARCHAR(60),
  aggregate_id    UUID,
  idempotency_key VARCHAR(200) NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id  UUID,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatched', 'failed', 'dead')),
  attempts        INT NOT NULL DEFAULT 0,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatched_at   TIMESTAMPTZ,
  UNIQUE (event_type, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_automation_events_status_created ON automation_events (status, created_at);
CREATE INDEX IF NOT EXISTS idx_automation_events_aggregate ON automation_events (aggregate_type, aggregate_id);

CREATE TABLE IF NOT EXISTS automation_audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID REFERENCES automation_events(id) ON DELETE SET NULL,
  evento         VARCHAR(60) NOT NULL,
  origem_sistema VARCHAR(20) NOT NULL DEFAULT 'nexus' CHECK (origem_sistema IN ('destrava', 'nexus')),
  org_id         UUID REFERENCES organizacoes(id) ON DELETE SET NULL,
  executado_por  VARCHAR(120),
  executado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tempo_ms       INT,
  resultado      VARCHAR(20) NOT NULL CHECK (resultado IN ('sucesso', 'falha', 'ignorado_duplicado')),
  erro           TEXT,
  detalhe        JSONB
);
CREATE INDEX IF NOT EXISTS idx_automation_audit_log_org ON automation_audit_log (org_id);
CREATE INDEX IF NOT EXISTS idx_automation_audit_log_executado_em ON automation_audit_log (executado_em DESC);

-- Recorrência e agrupamento de tarefas (Workflow 1 e 2 do Automation Engine).
-- Não existia recorrência para tarefas antes -- só para pagamentos (ver
-- coluna "recorrencia" lá em cima). Segue o mesmo padrão de nomenclatura.
-- "projeto_grupo_id"/"workflow_tipo" substituem uma entidade Project própria
-- (que este app nunca teve): como uma linha de tarefas já funciona como "a
-- lista", essas colunas de cabeçalho bastam para agrupar as N tarefas
-- semanais de um acompanhamento sem inventar uma tabela nova.
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS recorrencia TEXT NOT NULL DEFAULT 'nenhum';
ALTER TABLE tarefas DROP CONSTRAINT IF EXISTS tarefas_recorrencia_check;
ALTER TABLE tarefas ADD CONSTRAINT tarefas_recorrencia_check CHECK (recorrencia IN ('nenhum', 'diario', 'semanal', 'mensal'));
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS recorrencia_dia_mes INT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS recorrencia_dia_semana INT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS recorrencia_fim DATE;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS grupo_recorrencia_id UUID;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS competencia TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS projeto_grupo_id UUID;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS workflow_tipo TEXT;
ALTER TABLE tarefas DROP CONSTRAINT IF EXISTS tarefas_workflow_tipo_check;
ALTER TABLE tarefas ADD CONSTRAINT tarefas_workflow_tipo_check
  CHECK (workflow_tipo IS NULL OR workflow_tipo IN ('rotina_cnd', 'rotina_cemprot', 'acompanhamento_bancario'));

CREATE INDEX IF NOT EXISTS idx_tarefas_projeto_competencia
  ON tarefas(org_id, projeto_grupo_id, competencia, workflow_tipo);
CREATE INDEX IF NOT EXISTS idx_tarefas_grupo_recorrencia ON tarefas(grupo_recorrencia_id);

-- Corrige a não-idempotência de external_key: routes/integracoes.ts incluía
-- Date.now() na chave, então uma reentrega do Destrava (mesmo external_id)
-- nunca batia com a chave já gravada e gerava tarefa duplicada. A rota foi
-- corrigida para gerar uma chave determinística; o índice único abaixo é o
-- que de fato impede a duplicata (linhas antigas com sufixo de timestamp
-- continuam distintas entre si, então não há conflito com dados históricos).
CREATE UNIQUE INDEX IF NOT EXISTS ux_tarefas_org_external_key
  ON tarefas(org_id, external_key) WHERE external_key IS NOT NULL;

-- A rota legada da integração não informava escopo e as tarefas Destrava
-- herdavam o default 'pessoal'. Corrige somente registros identificados pela
-- origem/chave da integração; nenhuma tarefa pessoal nativa é alterada.
UPDATE tarefas
   SET escopo = 'equipe', updated_at = NOW()
 WHERE origem_sistema = 'destrava'
   AND external_key LIKE 'destrava:%'
   AND COALESCE(escopo, 'pessoal') <> 'equipe';

-- ── NOTIFICAÇÕES — lifecycle recorrente explícito ─────────────────────────────
-- lida é somente o estado de leitura do usuário. A autoridade para impedir
-- duplicidades recorrentes é a combinação recorrente/ativa/chave_recorrencia.
-- A migração é aditiva e não faz backfill nem limpeza histórica.
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS recorrente BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS ativa BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS chave_recorrencia TEXT;
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS resolvida_em TIMESTAMPTZ;
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS ocorrencias INT NOT NULL DEFAULT 1;
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS atualizada_em TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS arquivada BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS arquivada_em TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_recorrente_ativa
  ON notificacoes(org_id, user_id, referencia_id, chave_recorrencia)
  WHERE recorrente = TRUE
    AND ativa = TRUE
    AND referencia_id IS NOT NULL
    AND chave_recorrencia IS NOT NULL;

-- Consulta padrão da lista (exclui arquivadas) e do job de arquivamento.
CREATE INDEX IF NOT EXISTS idx_notif_user_ativas
  ON notificacoes(user_id, org_id, arquivada, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_arquivamento
  ON notificacoes(lida, arquivada, created_at) WHERE arquivada = FALSE;
-- Feed/contagem exibidos em todas as páginas e verificação de lembretes. Esses
-- índices evitam que o histórico volumoso de notificações/agenda ocupe o pool
-- enquanto GET /api/tarefas aguarda uma conexão.
CREATE INDEX IF NOT EXISTS idx_notif_user_feed_atualizada
  ON notificacoes(user_id, org_id, atualizada_em DESC) WHERE arquivada = FALSE;
CREATE INDEX IF NOT EXISTS idx_notif_user_unread_active
  ON notificacoes(user_id, org_id) WHERE lida = FALSE AND arquivada = FALSE;
CREATE INDEX IF NOT EXISTS idx_notif_referencia_tipo
  ON notificacoes(referencia_id, tipo) WHERE referencia_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notif_recorrente_referencia
  ON notificacoes(org_id, referencia_id, chave_recorrencia)
  WHERE recorrente = TRUE AND ativa = TRUE AND referencia_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notif_recorrente_usuario
  ON notificacoes(org_id, user_id, ativa, atualizada_em DESC)
  WHERE recorrente = TRUE;
CREATE INDEX IF NOT EXISTS idx_agenda_lembretes_pendentes
  ON agenda(data_inicio) WHERE lembrete_enviado = FALSE;

-- Sustenta a agregação de estatísticas por membro em /equipe/membros
-- (WHERE criado_por = $2 ... GROUP BY responsavel_id), que antes rodava
-- como 4 subconsultas correlacionadas por membro só para gestor/sub_gestor.
CREATE INDEX IF NOT EXISTS idx_tarefas_criado_por_responsavel_status
  ON tarefas(criado_por, responsavel_id, status) WHERE responsavel_id IS NOT NULL;

-- A sincronização automática de agenda (agendaSyncService.ts) tinha um
-- fallback instável para identificar itens de checklist sem id próprio,
-- e o índice de sync_key nunca foi único de verdade -- só acelerava a
-- busca, não impedia duplicata. Isso gerou 1,18 milhão de linhas
-- sintéticas em produção a partir de 65 tarefas reais. O fallback já foi
-- corrigido no código; esta trava impede qualquer futuro bug de repetir
-- o mesmo estrago, não importa a causa.
-- sync_key normalmente só é criada em tempo de execução por
-- ensureAgendaSyncSchema() (na primeira sincronização) -- garante aqui
-- também, senão o CREATE UNIQUE INDEX falha num banco que nunca sincronizou.
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS sync_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_agenda_org_sync_key
  ON agenda(org_id, sync_key) WHERE sync_key IS NOT NULL;

-- ============================================================
-- SCHEMA PRONTO
-- ============================================================
`

function positiveIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const MIGRATION_MAX_ATTEMPTS = positiveIntEnv(process.env.MIGRATION_MAX_ATTEMPTS, 12)
const MIGRATION_RETRY_DELAY_SECONDS = positiveIntEnv(process.env.MIGRATION_RETRY_DELAY_SECONDS, 5)
const MIGRATION_LOCK_TIMEOUT_MS = positiveIntEnv(process.env.DB_MIGRATION_LOCK_TIMEOUT_MS, 8_000)
// Timeout exclusivo de migration. Não muda os limites curtos das rotas HTTP.
// A consulta enviada ao PostgreSQL contém vários comandos; por isso precisa de
// uma janela maior do que DB_QUERY_TIMEOUT_MS, principalmente no primeiro
// deploy sobre um banco que já possui histórico volumoso.
const MIGRATION_STATEMENT_TIMEOUT_MS = positiveIntEnv(
  process.env.DB_MIGRATION_STATEMENT_TIMEOUT_MS,
  120_000,
)
const MIGRATION_QUERY_TIMEOUT_MS = positiveIntEnv(
  process.env.DB_MIGRATION_QUERY_TIMEOUT_MS,
  180_000,
)

async function hasCurrentSchemaBaseline(client: PoolClient): Promise<boolean> {
  const result = await client.query(`
    SELECT
      to_regclass('public.organizacoes') IS NOT NULL AS organizacoes,
      to_regclass('public.profiles') IS NOT NULL AS profiles,
      to_regclass('public.tarefas') IS NOT NULL AS tarefas,
      to_regclass('public.tarefa_anexos') IS NOT NULL AS tarefa_anexos,
      to_regclass('public.notificacoes') IS NOT NULL AS notificacoes,
      to_regclass('public.agenda') IS NOT NULL AS agenda,
      to_regclass('public.nexus_external_links') IS NOT NULL AS nexus_external_links,
      to_regclass('public.destrava_empresas_cache') IS NOT NULL AS destrava_empresas_cache,
      to_regclass('public.automation_events') IS NOT NULL AS automation_events,
      to_regclass('public.ux_tarefas_org_external_key') IS NOT NULL AS ux_tarefas_external,
      (
        to_regclass('public.uq_notif_recorrente_ativa') IS NOT NULL
        OR to_regclass('public.uq_notif_ativa_por_referencia') IS NOT NULL
      ) AS uq_notif_ativa,
      to_regclass('public.ux_agenda_org_sync_key') IS NOT NULL AS ux_agenda_sync,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'tarefas' AND column_name = 'data_reabertura'
      ) AS tarefas_data_reabertura,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'notificacoes' AND column_name = 'atualizada_em'
      ) AS notificacoes_atualizada_em,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'notificacoes' AND column_name = 'arquivada'
      ) AS notificacoes_arquivada,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'agenda' AND column_name = 'sync_key'
      ) AS agenda_sync_key
  `)
  const state = result.rows[0] || {}
  return Object.values(state).every(Boolean)
}

async function applyNotificationLifecycleMigration(client: PoolClient): Promise<void> {
  // Migration separada do schema histórico: pode ser aplicada a um banco já
  // atualizado sem repetir backfills, deduplicações ou qualquer limpeza.
  const statements = [
    `ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS recorrente BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS ativa BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS chave_recorrencia TEXT`,
    `ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS resolvida_em TIMESTAMPTZ`,
    `ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS ocorrencias INT NOT NULL DEFAULT 1`,
    `ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS atualizada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    `ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS arquivada BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS arquivada_em TIMESTAMPTZ`,
    `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_notif_recorrente_ativa
       ON notificacoes(org_id, user_id, referencia_id, chave_recorrencia)
       WHERE recorrente = TRUE
         AND ativa = TRUE
         AND referencia_id IS NOT NULL
         AND chave_recorrencia IS NOT NULL`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notif_recorrente_referencia
       ON notificacoes(org_id, referencia_id, chave_recorrencia)
       WHERE recorrente = TRUE AND ativa = TRUE AND referencia_id IS NOT NULL`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notif_recorrente_usuario
       ON notificacoes(org_id, user_id, ativa, atualizada_em DESC)
       WHERE recorrente = TRUE`,
    // O índice novo é criado antes de retirar a autoridade do legado.
    `DROP INDEX CONCURRENTLY IF EXISTS uq_notif_ativa_por_referencia`,
  ]
  for (const text of statements) {
    await client.query({ text, query_timeout: MIGRATION_QUERY_TIMEOUT_MS } as any)
  }
}

async function applyAgendaPerformanceMigration(client: PoolClient): Promise<void> {
  // A consulta padrão da Agenda filtra por organização e janela de data e
  // ordena por data/hora de criação. O índice anterior cobria apenas
  // (org_id, data_inicio), obrigando o planner a ordenar uma fração enorme do
  // histórico antes de devolver LIMIT 2000. Este índice aditivo permite manter
  // a ordem no próprio B-tree e não apaga nem reescreve dados.
  const text = `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agenda_org_data_inicio_created_at
    ON agenda(org_id, data_inicio, created_at)`
  await client.query({ text, query_timeout: MIGRATION_QUERY_TIMEOUT_MS } as any)
}

async function applyUserAutomationMigration(client: PoolClient): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS automation_user_rules (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       org_id UUID NOT NULL,
       created_by UUID NOT NULL,
       name VARCHAR(120) NOT NULL,
       description VARCHAR(500),
       trigger_type VARCHAR(40) NOT NULL,
       conditions JSONB NOT NULL DEFAULT '{"mode":"AND","items":[]}'::jsonb,
       actions JSONB NOT NULL DEFAULT '[]'::jsonb,
       active BOOLEAN NOT NULL DEFAULT TRUE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_automation_user_rules_org_trigger
       ON automation_user_rules(org_id, trigger_type, active, created_at DESC)`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_automation_user_rules_created_by
       ON automation_user_rules(org_id, created_by, created_at DESC)`,
  ]
  for (const text of statements) {
    await client.query({ text, query_timeout: MIGRATION_QUERY_TIMEOUT_MS } as any)
  }
}

async function applyFix54PerformanceIndexes(client: PoolClient): Promise<void> {
  // Banco já atualizado recebe somente índices novos, sem reexecutar o schema
  // histórico ou suas correções de dados. CONCURRENTLY mantém leitura/escrita
  // disponíveis durante o primeiro deploy da FIX54.
  const indexes = [
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notif_user_feed_atualizada
       ON notificacoes(user_id, org_id, atualizada_em DESC) WHERE arquivada = FALSE`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notif_user_unread_active
       ON notificacoes(user_id, org_id) WHERE lida = FALSE AND arquivada = FALSE`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notif_referencia_tipo
       ON notificacoes(referencia_id, tipo) WHERE referencia_id IS NOT NULL`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agenda_lembretes_pendentes
       ON agenda(data_inicio) WHERE lembrete_enviado = FALSE`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tarefas_org_list_order
       ON tarefas(org_id, (COALESCE(data_reabertura, updated_at, created_at)) DESC, created_at DESC)`,
  ]
  for (const text of indexes) {
    await client.query({ text, query_timeout: MIGRATION_QUERY_TIMEOUT_MS } as any)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Erros que indicam disputa de lock com outra sessão (o container antigo
// ainda rodando durante um deploy sem downtime) -- vale tentar de novo,
// dando tempo para a outra transação terminar. Qualquer outro erro (SQL
// inválido, coluna que não existe, etc.) é um erro real e não deve ser
// tentado de novo às cegas.
function isLockContentionError(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === '55P03' || code === '40P01' || code === '57014'
}

async function runSchemaOnce(): Promise<void> {
  console.log('[MIGRATE] Conectando ao PostgreSQL…')
  const client = await pool.connect()
  let advisoryLockObtido = false
  try {
    // Serializa migrations de dois containers durante um deploy rolling sem
    // manter a API antiga presa: se outra instância já estiver migrando, esta
    // tentativa falha rápido e o laço externo tenta novamente.
    const lock = await client.query<{ obtido: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext('nexus:schema:migrate')) AS obtido",
    )
    advisoryLockObtido = Boolean(lock.rows[0]?.obtido)
    if (!advisoryLockObtido) {
      const err = new Error('Outra instância já está aplicando o schema do Nexus.') as Error & { code?: string }
      err.code = '55P03'
      throw err
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS nexus_schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const aplicado = await client.query<{ aplicado: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM nexus_schema_migrations WHERE id = $1) AS aplicado',
      [SCHEMA_MIGRATION_ID],
    )
    const lifecycleAplicado = await client.query<{ aplicado: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM nexus_schema_migrations WHERE id = $1) AS aplicado',
      [NOTIFICATION_LIFECYCLE_MIGRATION_ID],
    )
    const agendaPerformanceAplicado = await client.query<{ aplicado: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM nexus_schema_migrations WHERE id = $1) AS aplicado',
      [AGENDA_PERFORMANCE_MIGRATION_ID],
    )
    const userAutomationAplicado = await client.query<{ aplicado: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM nexus_schema_migrations WHERE id = $1) AS aplicado',
      [USER_AUTOMATION_MIGRATION_ID],
    )
    if (aplicado.rows[0]?.aplicado && lifecycleAplicado.rows[0]?.aplicado && agendaPerformanceAplicado.rows[0]?.aplicado && userAutomationAplicado.rows[0]?.aplicado) {
      console.log(`[MIGRATE] Schema ${SCHEMA_MIGRATION_ID}, lifecycle ${NOTIFICATION_LIFECYCLE_MIGRATION_ID}, performance ${AGENDA_PERFORMANCE_MIGRATION_ID} e automação do usuário ${USER_AUTOMATION_MIGRATION_ID} já aplicados; nenhuma DDL repetida.`)
      return
    }

    // Sem isso, uma instrução de ALTER/CREATE INDEX que precise de lock numa
    // tabela em uso pelo container antigo (ainda servindo tráfego normalmente
    // durante o deploy) espera indefinidamente -- nunca dá erro, nunca
    // termina. Com o timeout, ela falha rápido e o `runSchemaOnce` é
    // chamado de novo pelo laço de tentativas abaixo.
    await client.query(`SET lock_timeout = '${MIGRATION_LOCK_TIMEOUT_MS}ms'`)
    await client.query(`SET statement_timeout = '${MIGRATION_STATEMENT_TIMEOUT_MS}ms'`)

    if (aplicado.rows[0]?.aplicado && !lifecycleAplicado.rows[0]?.aplicado) {
      console.log(`[MIGRATE] Aplicando apenas ${NOTIFICATION_LIFECYCLE_MIGRATION_ID} ao banco existente…`)
      await applyNotificationLifecycleMigration(client)
      await client.query(
        'INSERT INTO nexus_schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
        [NOTIFICATION_LIFECYCLE_MIGRATION_ID],
      )
      await applyAgendaPerformanceMigration(client)
      await client.query(
        'INSERT INTO nexus_schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
        [AGENDA_PERFORMANCE_MIGRATION_ID],
      )
      if (!userAutomationAplicado.rows[0]?.aplicado) {
        await applyUserAutomationMigration(client)
        await client.query(
          'INSERT INTO nexus_schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
          [USER_AUTOMATION_MIGRATION_ID],
        )
      }
      console.log('[MIGRATE] ✅ Lifecycle de notificações, índice de Agenda e automação do usuário aplicados.')
      return
    }

    if (await hasCurrentSchemaBaseline(client)) {
      console.log('[MIGRATE] Banco atual detectado; aplicando índices FIX54 e lifecycle de notificações sem correção histórica de dados…')
      await applyFix54PerformanceIndexes(client)
      if (!lifecycleAplicado.rows[0]?.aplicado) {
        await applyNotificationLifecycleMigration(client)
        await client.query(
          'INSERT INTO nexus_schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
          [NOTIFICATION_LIFECYCLE_MIGRATION_ID],
        )
      }
      if (!agendaPerformanceAplicado.rows[0]?.aplicado) {
        await applyAgendaPerformanceMigration(client)
        await client.query(
          'INSERT INTO nexus_schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
          [AGENDA_PERFORMANCE_MIGRATION_ID],
        )
      }
      if (!userAutomationAplicado.rows[0]?.aplicado) {
        await applyUserAutomationMigration(client)
        await client.query(
          'INSERT INTO nexus_schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
          [USER_AUTOMATION_MIGRATION_ID],
        )
      }
      await client.query(
        'INSERT INTO nexus_schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
        [SCHEMA_MIGRATION_ID],
      )
      console.log('[MIGRATE] ✅ Banco atual registrado, índices FIX54, lifecycle, performance da Agenda e automação do usuário aplicados.')
      return
    }

    console.log('[MIGRATE] Executando schema…')
    // node-postgres aceita query_timeout por consulta em runtime; a versão de
    // @types/pg usada por este projeto ainda não expõe essa propriedade em
    // QueryConfig, por isso o cast fica restrito a esta chamada de migration.
    await client.query({
      text: SCHEMA,
      query_timeout: MIGRATION_QUERY_TIMEOUT_MS,
    } as any)
    await applyNotificationLifecycleMigration(client)
    await applyAgendaPerformanceMigration(client)
    await applyUserAutomationMigration(client)
    await client.query(
      'INSERT INTO nexus_schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
      [SCHEMA_MIGRATION_ID],
    )
    await client.query(
      'INSERT INTO nexus_schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
      [NOTIFICATION_LIFECYCLE_MIGRATION_ID],
    )
    await client.query(
      'INSERT INTO nexus_schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
      [AGENDA_PERFORMANCE_MIGRATION_ID],
    )
    await client.query(
      'INSERT INTO nexus_schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
      [USER_AUTOMATION_MIGRATION_ID],
    )
    console.log('[MIGRATE] ✅ Schema, lifecycle de notificações, performance da Agenda e automação do usuário aplicados com sucesso!')
  } finally {
    if (advisoryLockObtido) {
      await client
        .query("SELECT pg_advisory_unlock(hashtext('nexus:schema:migrate'))")
        .catch(() => undefined)
    }
    client.release()
  }
}

async function migrate() {
  let ultimoErro: unknown = null
  for (let tentativa = 1; tentativa <= MIGRATION_MAX_ATTEMPTS; tentativa++) {
    try {
      await runSchemaOnce()
      ultimoErro = null
      break
    } catch (err) {
      ultimoErro = err
      const porLock = isLockContentionError(err)
      console.error(
        `[MIGRATE] ❌ Tentativa ${tentativa}/${MIGRATION_MAX_ATTEMPTS} falhou` +
          (porLock ? ' (disputa de lock com outra sessão -- tentando de novo)' : '') +
          ':',
        err instanceof Error ? err.message : err,
      )
      if (tentativa >= MIGRATION_MAX_ATTEMPTS) break
      await sleep(MIGRATION_RETRY_DELAY_SECONDS * 1000)
    }
  }

  if (ultimoErro) {
    console.error('[MIGRATE] ❌ Erro ao aplicar schema após todas as tentativas:', ultimoErro)
    process.exit(1)
  }

  // Chamadas explícitas e idempotentes. Cada rotina possui lock/statement
  // timeout próprio do pool; Promise.race foi removido porque ele encerrava a
  // espera em JavaScript sem cancelar a query PostgreSQL, deixando trabalho
  // oculto continuar durante o startup.
  try {
    const { ensureTaskScoreCompatibilityOnce } = await import('./taskScoreCompatibility')
    await ensureTaskScoreCompatibilityOnce()
  } catch (err) {
    console.warn('[MIGRATE] Compatibilidade de pontuação pulada (não essencial):', err)
  }

  // Verificação adicional e idempotente das colunas/tabela que a listagem de
  // tarefas (GET /api/tarefas) depende (profiles.cargo, tarefas.aceita_por,
  // tarefas.data_reabertura, tarefa_anexos). Protege contra schema
  // desatualizado -- por exemplo, um banco restaurado de um backup mais
  // antigo que o código -- que faria a página de Tarefas parar de carregar
  // mesmo com o backend e o Postgres saudáveis. Mesmo limite de segurança:
  // nunca prende o startup, e nunca remove coluna, tabela ou dado.
  try {
    const { ensureTarefasListSchemaOnce } = await import('./ensureTarefasListSchema')
    await ensureTarefasListSchemaOnce()
  } catch (err) {
    console.warn('[MIGRATE] Verificação de schema de tarefas pulada (não essencial):', err)
  }

  // FIX63: opção (ligada só via FORCE_RELOGIN_ON_DEPLOY=true) que revoga
  // sessões de todo mundo quando detecta que a release realmente mudou desde
  // o último boot. Desligada por padrão -- zero mudança de comportamento
  // pra quem não ativar.
  try {
    const { forceRelogueOnDeployOnce } = await import('./forceRelogueOnDeployOnce')
    await forceRelogueOnDeployOnce()
  } catch (err) {
    console.warn('[MIGRATE] Verificação de FORCE_RELOGIN_ON_DEPLOY pulada (não essencial):', err)
  }

  // Estatísticas atualizadas para o planner (best-effort, nunca trava o
  // startup). Cenário observado: banco migrado/restaurado para um servidor
  // novo, com dados carregados em lote pouco antes do primeiro boot -- se o
  // autovacuum ainda não alcançou uma tabela quente (ex.: tarefas,
  // notificacoes) nesse momento, o planner pode escolher um plano ruim para
  // as primeiras consultas logo após o deploy, batendo nos timeouts curtos
  // das rotas HTTP mesmo com o Postgres saudável e sem nenhum lock real. Um
  // ANALYZE explícito aqui garante estatísticas frescas em todo boot, sem
  // depender de o autovacuum já ter rodado. ANALYZE não bloqueia leituras
  // nem escritas concorrentes (lock leve, compatível com tráfego normal).
  try {
    const client = await pool.connect()
    try {
      const analyzeTimeoutMs = positiveIntEnv(process.env.DB_MIGRATION_ANALYZE_TIMEOUT_MS, 60_000)
      await client.query(`SET statement_timeout = '${analyzeTimeoutMs}ms'`)
      const startedAt = Date.now()
      await client.query('ANALYZE')
      console.log(`[MIGRATE] ANALYZE concluído em ${Date.now() - startedAt}ms.`)
    } finally {
      client.release()
    }
  } catch (err) {
    console.warn('[MIGRATE] ANALYZE pulado (não essencial):', err instanceof Error ? err.message : err)
  }

  await pool.end()
}

migrate()
