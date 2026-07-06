BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Catálogo local completo da Destrava: PJ e PF.
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

-- Compatibilidade com ambientes que tenham recebido uma versão anterior da tabela.
ALTER TABLE destrava_empresas_cache ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'empresa';
ALTER TABLE destrava_empresas_cache ADD COLUMN IF NOT EXISTS external_key TEXT;

UPDATE destrava_empresas_cache
   SET tipo = CASE
     WHEN lower(COALESCE(NULLIF(btrim(tipo), ''), 'empresa')) IN
          ('pf','cliente','clientes','pessoa fisica','pessoa_fisica')
       THEN 'pessoa_fisica'
     ELSE 'empresa'
   END;

UPDATE destrava_empresas_cache
   SET external_key = tipo || ':' || external_id
 WHERE external_key IS NULL OR btrim(external_key) = '';

ALTER TABLE destrava_empresas_cache ALTER COLUMN tipo SET DEFAULT 'empresa';
ALTER TABLE destrava_empresas_cache ALTER COLUMN tipo SET NOT NULL;
ALTER TABLE destrava_empresas_cache ALTER COLUMN external_key SET NOT NULL;

-- Remove somente a unicidade legada (org_id, external_id), incompatível com IDs iguais em PJ e PF.
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_destrava_cache_org_external_key
  ON destrava_empresas_cache(org_id, external_key);
CREATE INDEX IF NOT EXISTS idx_destrava_empresas_cache_org_nome
  ON destrava_empresas_cache(org_id, lower(nome));
CREATE INDEX IF NOT EXISTS idx_destrava_empresas_cache_org_ativo
  ON destrava_empresas_cache(org_id, ativo, sincronizado_em DESC);
CREATE INDEX IF NOT EXISTS idx_destrava_cache_org_tipo_nome
  ON destrava_empresas_cache(org_id, tipo, lower(nome));

-- Comentários e auditoria por tarefa/item de checklist.
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
