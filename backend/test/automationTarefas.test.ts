/**
 * automationTarefas.test.ts
 *
 * A garantia mais importante do Workflow 2 (Acompanhamento Bancário) e do
 * Workflow 1 (rotinas CND/CEMPROT): o mesmo evento (mesma externalKey)
 * nunca cria duas tarefas no Nexus, mesmo sob duas criações concorrentes --
 * é o que garante "não existir duplicação de tarefas" do critério de aceite.
 * Exercita a função real (criarTarefaAutomacao), só trocando a camada de
 * banco por uma fake em memória (ver test/helpers/fakePool.ts).
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
import { criarTarefaAutomacao } from "../src/routes/automationHandlers/shared";

const fakePoolInstance = (dbPoolMock as any).__fakePoolInstance as FakePool;

const INPUT_BASE = {
  externalKey: "acomp:acomp-1:semana:1",
  origemTipo: "acompanhamento_semana",
  origemId: "acomp-1",
  origemNome: "Empresa Teste — Semana 1",
  titulo: "Acompanhamento Bancário — Empresa Teste — Semana 1",
  responsavelEmail: "user@teste.local",
  workflowTipo: "acompanhamento_bancario" as const,
  competencia: "2026-07",
  recorrencia: "nenhum" as const,
  projetoGrupoId: "acomp-1",
  checklist: ["Executar acompanhamento da semana no Destrava", "Concluir"],
  metadata: { empresa_id: "empresa-1", numero_semana: 1 },
};

describe("criarTarefaAutomacao", () => {
  beforeEach(() => {
    fakePoolInstance.tarefas = [];
    fakePoolInstance.externalLinks = [];
  });

  it("cria a tarefa na primeira chamada", async () => {
    const { tarefa, criada } = await criarTarefaAutomacao(INPUT_BASE);
    expect(criada).toBe(true);
    expect(tarefa.external_key).toBe(INPUT_BASE.externalKey);
    expect(fakePoolInstance.tarefas.length).toBe(1);
  });

  it("a segunda chamada com a mesma externalKey retorna a tarefa existente, sem criar outra", async () => {
    const primeira = await criarTarefaAutomacao(INPUT_BASE);
    const segunda = await criarTarefaAutomacao(INPUT_BASE);

    expect(primeira.criada).toBe(true);
    expect(segunda.criada).toBe(false);
    expect(segunda.tarefa.id).toBe(primeira.tarefa.id);
    expect(fakePoolInstance.tarefas.length).toBe(1);
  });

  it("dez chamadas concorrentes com a mesma externalKey produzem exatamente uma tarefa", async () => {
    const resultados = await Promise.all(Array.from({ length: 10 }, () => criarTarefaAutomacao(INPUT_BASE)));

    const criadas = resultados.filter((r) => r.criada);
    expect(criadas.length).toBe(1);
    expect(fakePoolInstance.tarefas.length).toBe(1);

    const idsUnicos = new Set(resultados.map((r) => r.tarefa.id));
    expect(idsUnicos.size).toBe(1);
  });

  it("semanas diferentes do mesmo acompanhamento geram tarefas distintas", async () => {
    const semana1 = await criarTarefaAutomacao(INPUT_BASE);
    const semana2 = await criarTarefaAutomacao({
      ...INPUT_BASE,
      externalKey: "acomp:acomp-1:semana:2",
      titulo: "Acompanhamento Bancário — Empresa Teste — Semana 2",
      metadata: { empresa_id: "empresa-1", numero_semana: 2 },
    });

    expect(semana1.tarefa.id).not.toBe(semana2.tarefa.id);
    expect(fakePoolInstance.tarefas.length).toBe(2);
    // Mesmo projeto_grupo_id -- é o que agrupa as semanas na UI.
    expect(semana1.tarefa.projeto_grupo_id).toBe(semana2.tarefa.projeto_grupo_id);
  });
});
