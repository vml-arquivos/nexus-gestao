/**
 * dispatcher.test.ts
 *
 * Regressão do deadlock corrigido no fix49: registrarAuditoria() rodando em
 * uma conexão SEPARADA do pool, enquanto a transação de despacho (BEGIN em
 * dispatcher.ts) ainda está aberta e segurando a linha correspondente em
 * automation_events, travava para sempre -- automation_audit_log.event_id
 * tem FK para automation_events(id), então o INSERT da auditoria espera a
 * transação (que só termina depois desse mesmo INSERT retornar) liberar a
 * linha. Reproduzido e confirmado contra Postgres real fora deste repo de
 * testes (ver relatório de entrega fix49); aqui garantimos por contrato que
 * dispatcher.ts sempre passa o `client` da transação para registrarAuditoria
 * nos três caminhos possíveis (sucesso, Destrava não configurado, falha).
 *
 * FakePool é single-threaded e não modela lock entre conexões reais, então
 * não consegue reproduzir o deadlock em si -- por isso este teste verifica o
 * contrato (client sempre propagado) em vez de tentar simular o travamento.
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

vi.mock("../src/services/automation/webhookClient", () => ({
  destravaConfigurado: vi.fn(),
  enviarWebhookDestrava: vi.fn(),
}));

import * as dbPoolMock from "../src/db/pool";
import * as webhookClient from "../src/services/automation/webhookClient";
import * as outboxRepository from "../src/services/automation/outboxRepository";
import { inserirEvento } from "../src/services/automation/outboxRepository";
import { despacharAgora, executarVarreduraOutboxAutomation } from "../src/services/automation/dispatcher";

const fakePoolInstance = (dbPoolMock as any).__fakePoolInstance as FakePool;

describe("dispatcher (Nexus) — client transacional sempre propagado para registrarAuditoria", () => {
  beforeEach(() => {
    fakePoolInstance.events = [];
    fakePoolInstance.auditLog = [];
    vi.mocked(webhookClient.destravaConfigurado).mockReset();
    vi.mocked(webhookClient.enviarWebhookDestrava).mockReset();
  });

  it("caminho de SUCESSO: registrarAuditoria recebe o client (2º argumento definido)", async () => {
    const spy = vi.spyOn(outboxRepository, "registrarAuditoria");
    vi.mocked(webhookClient.destravaConfigurado).mockReturnValue(true);
    vi.mocked(webhookClient.enviarWebhookDestrava).mockResolvedValue({ ok: true, status: 200, body: "{}" });

    const evento = await inserirEvento({ eventType: "TarefaConcluidaNexus", aggregateId: "t1", idempotencyKey: "k1", payload: {} });
    await despacharAgora(evento!);

    expect(spy).toHaveBeenCalledTimes(1);
    const [, clientArg] = spy.mock.calls[0];
    expect(clientArg).toBeDefined();
    expect(typeof (clientArg as any).query).toBe("function");
  });

  it("caminho Destrava NÃO CONFIGURADO: registrarAuditoria recebe o client (2º argumento definido)", async () => {
    const spy = vi.spyOn(outboxRepository, "registrarAuditoria");
    vi.mocked(webhookClient.destravaConfigurado).mockReturnValue(false);

    const evento = await inserirEvento({ eventType: "TarefaConcluidaNexus", aggregateId: "t2", idempotencyKey: "k2", payload: {} });
    await despacharAgora(evento!);

    expect(spy).toHaveBeenCalledTimes(1);
    const [, clientArg] = spy.mock.calls[0];
    expect(clientArg).toBeDefined();
  });

  it("caminho de FALHA (webhook lança erro): registrarAuditoria recebe o client (2º argumento definido)", async () => {
    const spy = vi.spyOn(outboxRepository, "registrarAuditoria");
    vi.mocked(webhookClient.destravaConfigurado).mockReturnValue(true);
    vi.mocked(webhookClient.enviarWebhookDestrava).mockRejectedValue(new Error("timeout simulado"));

    const evento = await inserirEvento({ eventType: "TarefaConcluidaNexus", aggregateId: "t3", idempotencyKey: "k3", payload: {} });
    await despacharAgora(evento!);

    expect(spy).toHaveBeenCalledTimes(1);
    const [, clientArg] = spy.mock.calls[0];
    expect(clientArg).toBeDefined();
  });

  it("varredura em lote: todos os eventos do lote propagam o MESMO client para registrarAuditoria", async () => {
    const spy = vi.spyOn(outboxRepository, "registrarAuditoria");
    vi.mocked(webhookClient.destravaConfigurado).mockReturnValue(true);
    vi.mocked(webhookClient.enviarWebhookDestrava).mockResolvedValue({ ok: true, status: 200, body: "{}" });

    await inserirEvento({ eventType: "TarefaConcluidaNexus", aggregateId: "t4", idempotencyKey: "k4", payload: {} });
    await inserirEvento({ eventType: "TarefaConcluidaNexus", aggregateId: "t5", idempotencyKey: "k5", payload: {} });

    const resultado = await executarVarreduraOutboxAutomation();

    expect(resultado.processados).toBe(2);
    expect(resultado.sucesso).toBe(2);
    expect(spy).toHaveBeenCalledTimes(2);
    const clientesUsados = spy.mock.calls.map((chamada) => chamada[1]);
    expect(clientesUsados[0]).toBeDefined();
    expect(clientesUsados[0]).toBe(clientesUsados[1]); // mesma transação para o lote inteiro
  });
});
