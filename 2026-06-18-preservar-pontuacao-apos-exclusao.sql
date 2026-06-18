BEGIN;

ALTER TABLE tarefas_pontuacao
  ADD COLUMN IF NOT EXISTS tarefa_titulo_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS item_titulo_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS escopo_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS conta_ranking_snapshot BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS tarefa_excluida_em TIMESTAMPTZ;

ALTER TABLE tarefas_pontuacao
  ALTER COLUMN tarefa_id DROP NOT NULL;

ALTER TABLE tarefas_pontuacao
  DROP CONSTRAINT IF EXISTS tarefas_pontuacao_tarefa_id_fkey;

ALTER TABLE tarefas_pontuacao
  ADD CONSTRAINT tarefas_pontuacao_tarefa_id_fkey
  FOREIGN KEY (tarefa_id)
  REFERENCES tarefas(id)
  ON DELETE SET NULL;

UPDATE tarefas_pontuacao tp
   SET tarefa_titulo_snapshot = COALESCE(tp.tarefa_titulo_snapshot, t.titulo),
       escopo_snapshot = COALESCE(tp.escopo_snapshot, t.escopo),
       conta_ranking_snapshot = COALESCE(tp.conta_ranking_snapshot, t.conta_ranking, TRUE)
  FROM tarefas t
 WHERE tp.tarefa_id = t.id
   AND tp.org_id = t.org_id;

COMMIT;
