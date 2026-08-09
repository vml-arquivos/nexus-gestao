/**
 * empresaIdObrigatorio.test.ts
 *
 * FIX62: os três handlers que criam tarefa a partir de eventos do Destrava
 * (Rotina CND, Rotina CEMPROT, Acompanhamento Bancário) precisam do
 * empresa_id do payload para nunca deixar duas empresas diferentes caindo
 * no mesmo "balde vazio" de agrupamento quando o campo falta. Antes desta
 * correção, o campo faltando virava silenciosamente string vazia -- não é
 * mais aceitável, cada uma dessas chamadas deve rejeitar explicitamente.
 */
import { describe, it, expect } from "vitest";
import { handleRotinaCndDue, handleRotinaCemprotDue } from "../src/routes/automationHandlers/rotinas";
import { handleAcompanhamentoCriado } from "../src/routes/automationHandlers/acompanhamento";

describe("empresa_id obrigatório nos handlers de automação (FIX62)", () => {
  it("RotinaCndDue rejeita payload sem empresa_id", async () => {
    await expect(
      handleRotinaCndDue({
        contrato_id: "contrato-1",
        competencia: "2026-08",
        empresa_nome: "Empresa X",
        // empresa_id ausente de propósito
      }),
    ).rejects.toThrow(/empresa_id/i);
  });

  it("RotinaCemprotDue rejeita payload sem empresa_id", async () => {
    await expect(
      handleRotinaCemprotDue({
        contrato_id: "contrato-1",
        iso_week: "2026-W32",
        empresa_nome: "Empresa X",
      }),
    ).rejects.toThrow(/empresa_id/i);
  });

  it("AcompanhamentoCriado rejeita payload sem empresa_id", async () => {
    await expect(
      handleAcompanhamentoCriado({
        acompanhamento_id: "acomp-1",
        data_inicio: "2026-08-01",
        numero_semanas: 4,
        empresa_nome: "Empresa X",
      }),
    ).rejects.toThrow(/empresa_id/i);
  });
});
