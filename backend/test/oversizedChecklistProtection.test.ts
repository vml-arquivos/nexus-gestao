import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const root = process.cwd();
const readBackend = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("proteção contra checklists gigantes em leituras em massa", () => {
  it("usa projeção limitada na listagem de tarefas sem remover a rota de detalhe", () => {
    const source = readBackend("src/routes/tarefas.ts");
    const start = source.indexOf("const TASK_LIST_SELECT");
    const end = source.indexOf("const taskListCache", start);
    const projection = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(projection).toContain("pg_column_size(t.checklist)");
    expect(projection).toContain("<= ${TASK_LIST_MAX_CHECKLIST_BYTES}");
    expect(projection).toContain("ELSE '[]'::jsonb");
    expect(projection).toContain("checklist_truncado");
    expect(projection).toContain("checklist_bytes");
    expect(projection).not.toContain("SELECT t.*");
    expect(source).toContain("WHERE t.id = $1 AND t.org_id = $2");
  });

  it("limita checklist em ranking, atrasos e jobs de background", () => {
    const scoring = readBackend("src/routes/tarefasScoring.ts");
    const notifications = readBackend("src/routes/notificacoes.ts");
    const helper = readBackend("src/lib/notifHelper.ts");
    const recurrence = readBackend("src/services/recorrenciaTarefasService.ts");

    expect(scoring).toContain("pg_column_size(checklist) <= 1000000");
    expect(notifications).toContain("pg_column_size(checklist) <= 1000000");
    expect(helper).toContain("checklist_truncado");
    expect(helper).toContain("Recorrência de checklist ignorada");
    expect(recurrence).toContain("pg_column_size(checklist) <= 1000000");
    expect(recurrence).toContain("Checklist acima de 1 MB; ocorrência");
  });
});
