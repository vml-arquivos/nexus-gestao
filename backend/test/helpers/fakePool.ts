/**
 * fakePool.ts
 *
 * Pool de Postgres falso, em memória, usado nos testes do Automation
 * Engine do Nexus. Não há Postgres disponível neste ambiente de testes
 * (o único teste pré-existente do backend, test/tarefas.logic.test.js, é
 * puramente lógico/sem banco), então esta fake reconhece as queries
 * literais que outboxRepository.ts/automationHandlers/shared.ts emitem --
 * o suficiente para exercitar de verdade a lógica de idempotência e
 * concorrência que vive no SQL (UNIQUE + ON CONFLICT DO NOTHING), não só
 * no JS.
 */

let contador = 0;
function proximoId(): string {
  contador += 1;
  return `evt-${contador}`;
}

export class FakePool {
  events: any[] = [];
  auditLog: any[] = [];
  tarefas: any[] = [];
  externalLinks: any[] = [];
  profiles: any[] = [{ id: "user-1", org_id: "org-1", nome: "Usuário Teste", email: "user@teste.local", role: "gestor", ativo: true }];

  async query(text: string, params: any[] = []): Promise<{ rows: any[] }> {
    const sql = text.trim();

    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK" || sql.startsWith("SELECT pg_advisory_xact_lock")) {
      return { rows: [] };
    }

    // ── automation_events ──────────────────────────────────────────────
    if (sql.startsWith("INSERT INTO automation_events")) {
      const [orgId, eventType, aggregateType, aggregateId, idempotencyKey, payloadJson, correlationId] = params;
      const existente = this.events.find((e) => e.event_type === eventType && e.idempotency_key === idempotencyKey);
      if (existente) return { rows: [] };
      const row = {
        id: proximoId(),
        org_id: orgId,
        event_type: eventType,
        event_version: 1,
        aggregate_type: aggregateType,
        aggregate_id: aggregateId,
        idempotency_key: idempotencyKey,
        payload: JSON.parse(payloadJson || "{}"),
        correlation_id: correlationId,
        status: "pending",
        attempts: 0,
        last_error: null,
        created_at: new Date().toISOString(),
        dispatched_at: null,
      };
      this.events.push(row);
      return { rows: [row] };
    }

    if (sql.includes("FROM automation_events") && sql.includes("FOR UPDATE SKIP LOCKED")) {
      const limite = params[0] ?? 20;
      return { rows: this.events.filter((e) => ["pending", "failed"].includes(e.status) && e.attempts < 10).slice(0, limite) };
    }

    if (sql.startsWith("UPDATE automation_events SET status = 'dispatched'")) {
      const ev = this.events.find((e) => e.id === params[0]);
      if (ev) { ev.status = "dispatched"; ev.dispatched_at = new Date().toISOString(); }
      return { rows: [] };
    }

    if (sql.startsWith("UPDATE automation_events SET status = $1")) {
      const [status, attempts, erro, id] = params;
      const ev = this.events.find((e) => e.id === id);
      if (ev) { ev.status = status; ev.attempts = attempts; ev.last_error = erro; }
      return { rows: [] };
    }

    if (sql.startsWith("SELECT * FROM automation_events WHERE id")) {
      return { rows: this.events.filter((e) => e.id === params[0]) };
    }

    if (sql.startsWith("INSERT INTO automation_audit_log")) {
      const [eventId, evento, origemSistema, orgId, executadoPor, tempoMs, resultado, erro] = params;
      this.auditLog.push({ event_id: eventId, evento, org_id: orgId, resultado, erro });
      return { rows: [] };
    }

    // ── profiles (resolveIntegrationUser / findActiveUserByEmail) ───────
    if (sql.includes("FROM profiles") && sql.includes("lower(email)")) {
      const email = String(params[0] || "").toLowerCase();
      return { rows: this.profiles.filter((p) => p.email.toLowerCase() === email && p.ativo) };
    }
    if (sql.includes("FROM profiles") && sql.includes("ORDER BY CASE role")) {
      return { rows: this.profiles.filter((p) => p.ativo) };
    }
    if (sql.includes("FROM profiles") && sql.includes("WHERE id = $1")) {
      return { rows: this.profiles.filter((p) => p.id === params[0] && p.ativo) };
    }

    // ── tarefas (criarTarefaAutomacao) ──────────────────────────────────
    // Cuidado: "INSERT INTO tarefas" também é prefixo de "INSERT INTO
    // tarefas_historico"/"tarefas_pontuacao" -- o \s*\( exige um parêntese
    // logo em seguida (ignorando espaço/quebra de linha) pra não confundir.
    if (/^INSERT INTO tarefas\s*\(/.test(sql)) {
      // ordem dos parâmetros conforme automationHandlers/shared.ts
      const [orgId, criadoPor, responsavelId, responsavelNome, titulo, descricao, prazo, checklistJson,
        origemTipo, origemId, origemNome, origemPayloadJson, externalKey, workflowTipo, competencia, recorrencia, projetoGrupoId] = params;

      const existente = this.tarefas.find((t) => t.org_id === orgId && t.external_key === externalKey);
      if (existente) return { rows: [] }; // ON CONFLICT DO NOTHING

      const row = {
        id: proximoId(),
        org_id: orgId,
        criado_por: criadoPor,
        responsavel_id: responsavelId,
        responsavel_nome: responsavelNome,
        titulo,
        descricao,
        prazo,
        checklist: JSON.parse(checklistJson || "[]"),
        status: "pendente",
        status_gestor: "aguardando",
        origem_sistema: "destrava",
        origem_tipo: origemTipo,
        origem_id: origemId,
        origem_nome: origemNome,
        origem_payload: JSON.parse(origemPayloadJson || "{}"),
        external_key: externalKey,
        workflow_tipo: workflowTipo,
        competencia,
        recorrencia,
        projeto_grupo_id: projetoGrupoId,
      };
      this.tarefas.push(row);
      return { rows: [row] };
    }

    if (sql.startsWith("SELECT * FROM tarefas WHERE org_id = $1 AND external_key = $2")) {
      const [orgId, externalKey] = params;
      return { rows: this.tarefas.filter((t) => t.org_id === orgId && t.external_key === externalKey) };
    }

    if (sql.startsWith("INSERT INTO nexus_external_links")) {
      this.externalLinks.push({ params });
      return { rows: [] };
    }

    if (sql.startsWith("INSERT INTO tarefas_historico") || sql.startsWith("INSERT INTO tarefa_historico")) {
      return { rows: [] };
    }

    throw new Error(`FakePool (Nexus): query não reconhecida nos testes: ${sql.slice(0, 150)}`);
  }

  async connect() {
    return { query: (text: string, params?: any[]) => this.query(text, params), release: () => {} };
  }
}
