BEGIN;
ALTER TABLE destrava_empresas_cache ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'empresa';
ALTER TABLE destrava_empresas_cache ADD COLUMN IF NOT EXISTS external_key TEXT;
UPDATE destrava_empresas_cache SET external_key = COALESCE(external_key, tipo || ':' || external_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_destrava_cache_org_external_key ON destrava_empresas_cache(org_id, external_key);
CREATE INDEX IF NOT EXISTS idx_destrava_cache_org_tipo_nome ON destrava_empresas_cache(org_id, tipo, lower(nome));
COMMIT;
