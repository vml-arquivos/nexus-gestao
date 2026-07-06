BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (org_id, external_id)
);
UPDATE destrava_empresas_cache SET external_key = COALESCE(external_key, tipo || ':' || external_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_destrava_cache_org_external_key ON destrava_empresas_cache(org_id, external_key);
CREATE INDEX IF NOT EXISTS idx_destrava_empresas_cache_org_nome
  ON destrava_empresas_cache(org_id, lower(nome));
CREATE INDEX IF NOT EXISTS idx_destrava_empresas_cache_org_ativo
  ON destrava_empresas_cache(org_id, ativo, sincronizado_em DESC);

CREATE TABLE IF NOT EXISTS tarefas_comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  tarefa_id UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  checklist_id TEXT,
  autor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  comentario TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'comentario'
    CHECK (tipo IN ('comentario','execucao','devolucao','aprovacao','sistema')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  editado_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tarefas_comentarios_tarefa
  ON tarefas_comentarios(org_id, tarefa_id, criado_em ASC);
CREATE INDEX IF NOT EXISTS idx_tarefas_comentarios_checklist
  ON tarefas_comentarios(org_id, tarefa_id, checklist_id, criado_em ASC);

COMMIT;
