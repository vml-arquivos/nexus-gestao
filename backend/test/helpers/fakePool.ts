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

// Simula o bloqueio real de pg_advisory_xact_lock: uma transação que pede a
// mesma chave de outra ainda em andamento espera até ela liberar (COMMIT ou
// ROLLBACK). Sem isso, chamadas "concorrentes" no fake nunca serializam de
// verdade -- só o Postgres real bloqueia nesse ponto.
class MutexPorChave {
  private travas = new Map<string, Promise<void>>();

  async adquirir(chave: string): Promise<() => void> {
    while (this.travas.has(chave)) {
      await this.travas.get(chave);
    }
    let liberar!: () => void;
    const promessa = new Promise<void>((resolve) => { liberar = resolve; });
    this.travas.set(chave, promessa);
    return () => {
      this.travas.delete(chave);
      liberar();
    };
  }
}

export class FakePool {
  events: any[] = [];
  auditLog: any[] = [];
  tarefas: any[] = [];
  externalLinks: any[] = [];
  processedKeys: any[] = [];
  profiles: any[] = [{ id: "user-1", org_id: "org-1", nome: "Usuário Teste", email: "user@teste.local", role: "gestor", ativo: true }];
  private mutex = new MutexPorChave();

  async query(text: string, params: any[] = [], liberacoesPendentes: Array<() => void> = []): Promise<{ rows: any[] }> {
    const sql = text.trim();

    if (sql === "BEGIN") {
      return { rows: [] };
    }
    if (sql === "COMMIT" || sql === "ROLLBACK") {
      while (liberacoesPendentes.length) {
        const liberar = liberacoesPendentes.pop()!;
        liberar();
      }
      return { rows: [] };
    }
    if (sql.startsWith("SELECT pg_advisory_xact_lock")) {
      const liberar = await this.mutex.adquirir(String(params[0]));
      liberacoesPendentes.push(liberar);
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

    // ── automation_processed_keys (idempotência por ocorrência, agora
    // desacoplada de "criar linha nova", pra permitir mesclar em lista
    // já aberta da mesma empresa) ────────────────────────────────────────
    if (sql.startsWith("SELECT t.* FROM automation_processed_keys")) {
      const [orgId, externalKey] = params;
      const chave = this.processedKeys.find((k) => k.org_id === orgId && k.external_key === externalKey);
      if (!chave) return { rows: [] };
      return { rows: this.tarefas.filter((t) => t.id === chave.tarefa_id) };
    }
    if (sql.startsWith("INSERT INTO automation_processed_keys")) {
      const [orgId, externalKey, tarefaId] = params;
      const existente = this.processedKeys.find((k) => k.org_id === orgId && k.external_key === externalKey);
      if (existente) return { rows: [] }; // ON CONFLICT DO NOTHING
      this.processedKeys.push({ org_id: orgId, external_key: externalKey, tarefa_id: tarefaId });
      return { rows: [] };
    }

    // ── busca de lista já aberta da mesma empresa (mesclagem) ───────────
    if (sql.startsWith("SELECT * FROM tarefas") && sql.includes("origem_id = $2") && sql.includes("FOR UPDATE")) {
      const [orgId, origemId] = params;
      const abertas = this.tarefas
        .filter((t) => t.org_id === orgId && t.origem_id === origemId && (t.escopo || "equipe") === "equipe" && t.status !== "cancelada")
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return { rows: abertas.slice(0, 1) };
    }
    if (sql.startsWith("UPDATE tarefas SET") && sql.includes("checklist = $1") && sql.includes("aprovada_por")) {
      const [checklistJson, tarefaId, orgId, finalizada] = params;
      const t = this.tarefas.find((x) => x.id === tarefaId && x.org_id === orgId);
      if (!t) return { rows: [] };
      t.checklist = JSON.parse(checklistJson || "[]");
      if (finalizada) { t.status = "pendente"; t.status_gestor = "aguardando"; t.aprovada_em = null; t.aprovada_por = null; }
      return { rows: [t] };
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
        created_at: new Date(Date.now() + contador).toISOString(),
        escopo: "equipe",
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
    const liberacoesPendentes: Array<() => void> = [];
    return { query: (text: string, params?: any[]) => this.query(text, params, liberacoesPendentes), release: () => {} };
  }
}
