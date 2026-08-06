/**
 * tarefaEstaFechada.test.ts
 *
 * FIX60: regra que decide se uma ocorrência aparece em "Ativa" ou em
 * "Histórico" no modal agregado por empresa. Precisa bater exatamente com a
 * mesma noção de "aberta" usada pela guarda de recorrência (FIX57), senão
 * as duas partes do sistema discordam sobre quando uma empresa está livre
 * para gerar a próxima ocorrência.
 */
import { describe, it, expect } from "vitest";
import { tarefaEstaFechada } from "../src/routes/tarefas";

describe("tarefaEstaFechada (FIX60 — agrupamento por empresa)", () => {
  it("cancelada é fechada, independente do status_gestor", () => {
    expect(tarefaEstaFechada({ status: "cancelada", status_gestor: "aguardando" })).toBe(true);
    expect(tarefaEstaFechada({ status: "cancelada" })).toBe(true);
  });

  it("concluida + aprovada é fechada", () => {
    expect(tarefaEstaFechada({ status: "concluida", status_gestor: "aprovada" })).toBe(true);
  });

  it("concluida mas AINDA sem aprovação do gestor continua aberta", () => {
    expect(tarefaEstaFechada({ status: "concluida", status_gestor: "aguardando" })).toBe(false);
  });

  it("concluida devolvida pelo gestor continua aberta (precisa de rework)", () => {
    expect(tarefaEstaFechada({ status: "concluida", status_gestor: "devolvida" })).toBe(false);
  });

  it("pendente, em_progresso e nao_concluida são sempre abertas", () => {
    expect(tarefaEstaFechada({ status: "pendente" })).toBe(false);
    expect(tarefaEstaFechada({ status: "em_progresso" })).toBe(false);
    expect(tarefaEstaFechada({ status: "nao_concluida", status_gestor: "aguardando" })).toBe(false);
  });
});
