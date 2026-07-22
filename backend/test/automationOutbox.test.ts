/**
 * automationOutbox.test.ts
 *
 * Espelha destrava-main/tests/automationOutbox.test.ts, para o outbox do
 * lado Nexus (services/automation/outboxRepository.ts). Mocka o módulo de
 * conexão (src/db/pool) com uma fake em memória -- ver test/helpers/fakePool.ts
 * e o motivo de não haver Postgres real neste ambiente de testes.
 *
 * O factory de vi.mock é assíncrono (usa import() dinâmico) porque vi.mock
 * é hoisted para o topo do arquivo -- não dá pra referenciar uma variável
 * de módulo normal ali, então a fake é criada e exposta como
 * __fakePoolInstance no próprio módulo mockado, e recuperada via import()
 * no beforeEach/testes abaixo.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { FakePool } from "./helpers/fakePool";

vi.mock("../src/db/pool", async () => {
  const { FakePool } = await import("./helpers/fakePool");
  const instance = new FakePool();
  return {
    default: instance,
    query: async (text: string, params?: any[]) => (await instance.query(text, params)).rows,
    queryOne: async (text: string, params?: any[]) => {
      const r = await instance.query(text, params);
      return r.rows[0] ?? null;
    },
    __fakePoolInstance: instance,
  };
});

import * as dbPoolMock from "../src/db/pool";
import {
  inserirEvento,
  reivindicarLotePendente,
  marcarDespachado,
  marcarFalha,
  buscarEventoPorId,
} from "../src/services/automation/outboxRepository";

const fakePoolInstance = (dbPoolMock as any).__fakePoolInstance as FakePool;

describe("outboxRepository (Nexus)", () => {
  beforeEach(() => {
    fakePoolInstance.events = [];
    fakePoolInstance.auditLog = [];
  });

  it("insere um evento novo", async () => {
    const evento = await inserirEvento({
      eventType: "TarefaConcluidaNexus",
      aggregateId: "t1",
      idempotencyKey: "tarefa_nexus:t1:concluida:2026-07-22",
      payload: {},
    });
    expect(evento).not.toBeNull();
    expect(evento!.status).toBe("pending");
  });

  it("não duplica evento com a mesma idempotency_key", async () => {
    const a = await inserirEvento({
      eventType: "TarefaConcluidaNexus",
      aggregateId: "t1",
      idempotencyKey: "tarefa_nexus:t1:concluida:2026-07-22",
      payload: {},
    });
    const b = await inserirEvento({
      eventType: "TarefaConcluidaNexus",
      aggregateId: "t1",
      idempotencyKey: "tarefa_nexus:t1:concluida:2026-07-22",
      payload: {},
    });
    expect(a).not.toBeNull();
    expect(b).toBeNull();
    expect(fakePoolInstance.events.length).toBe(1);
  });

  it("reivindicarLotePendente só retorna pending/failed via client de transação", async () => {
    const e1 = await inserirEvento({ eventType: "A", aggregateId: "1", idempotencyKey: "k1", payload: {} });
    const client = await fakePoolInstance.connect();
    await marcarDespachado(client as any, e1!.id);
    await inserirEvento({ eventType: "B", aggregateId: "2", idempotencyKey: "k2", payload: {} });

    const lote = await reivindicarLotePendente(client as any);
    expect(lote.length).toBe(1);
    expect(lote[0].event_type).toBe("B");
  });

  it("marcarFalha acumula tentativas e vira 'dead' na décima", async () => {
    const evento = await inserirEvento({ eventType: "A", aggregateId: "1", idempotencyKey: "k1", payload: {} });
    const client = await fakePoolInstance.connect();
    await marcarFalha(client as any, evento!.id, "erro", 10);
    const atualizado = await buscarEventoPorId(evento!.id);
    expect(atualizado!.status).toBe("dead");
  });
});
