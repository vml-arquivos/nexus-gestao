/**
 * recorrenciaGuardaListaAberta.test.ts
 *
 * FIX57: uma empresa só pode ter uma ocorrência "aberta" por vez na mesma
 * linhagem de recorrência (mesmo grupo_recorrencia_id). Antes desta correção,
 * gerarProximaOcorrencia() criava uma linha nova todo dia sem nunca checar
 * se a ocorrência anterior já tinha sido concluída e aprovada -- é o que
 * produzia várias "Lista de tarefas da equipe" simultâneas para a mesma
 * empresa (CKP, Ana Amélia) na tela de Tarefas.
 *
 * Este teste garante, por contrato, que:
 *  1. Existindo uma ocorrência ainda aberta na linhagem, nenhuma transação
 *     é sequer aberta (pool.connect nunca é chamado) -- a função retorna
 *     cedo, sem tentar inserir nada.
 *  2. Não existindo ocorrência aberta (a última está concluída+aprovada, ou
 *     cancelada), o fluxo normal de geração roda até o fim.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

const queryMock = vi.fn();
const connectMock = vi.fn();

vi.mock("../src/db/pool", () => ({
  default: {
    query: (...args: any[]) => queryMock(...args),
    connect: (...args: any[]) => connectMock(...args),
  },
}));

import { avaliarRecorrenciaTarefas } from "../src/services/recorrenciaTarefasService";

const TAREFA_BASE = {
  id: "raiz-1",
  org_id: "org-1",
  criado_por: "user-1",
  responsavel_id: "user-1",
  responsavel_nome: "Fulano",
  titulo: "Lista de tarefas da equipe",
  descricao: null,
  prazo: null,
  created_at: "2026-07-01T00:00:00.000Z", // não é hoje -- deveGerarHoje deve considerar
  prioridade: "alta",
  checklist: [{ id: "i1", texto: "Item 1", feito: false }],
  escopo: "equipe",
  modo_distribuicao: "normal",
  pontuacao: 10,
  conta_ranking: true,
  status: "pendente",
  origem_sistema: "destrava",
  origem_tipo: "empresa",
  origem_id: "empresa-1",
  origem_nome: "Empresa Teste",
  origem_url: null,
  origem_payload: {},
  recorrencia: "diario",
  recorrencia_dia_mes: null,
  recorrencia_dia_semana: null,
  recorrencia_fim: null,
  grupo_recorrencia_id: null,
};

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
});

describe("recorrência — guarda contra lista duplicada aberta (FIX57)", () => {
  it("NÃO gera nova ocorrência quando já existe uma aberta na linhagem (pendente)", async () => {
    // 1ª chamada: scan de avaliarRecorrenciaTarefas (retorna a tarefa raiz)
    queryMock.mockResolvedValueOnce({ rows: [TAREFA_BASE] });
    // 2ª chamada: existeOcorrenciaAbertaNaLinhagem -- SIM, existe uma aberta
    queryMock.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    await avaliarRecorrenciaTarefas();

    expect(queryMock).toHaveBeenCalledTimes(2);
    // Nunca deveria ter aberto uma transação para inserir -- retornou cedo.
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("GERA nova ocorrência quando a linhagem está livre (última concluída+aprovada)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [TAREFA_BASE] });
    // existeOcorrenciaAbertaNaLinhagem -- NÃO existe nenhuma aberta
    queryMock.mockResolvedValueOnce({ rows: [] });

    const clientMock = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
    connectMock.mockResolvedValueOnce(clientMock);

    await avaliarRecorrenciaTarefas();

    expect(connectMock).toHaveBeenCalledTimes(1);
    const chamadas = clientMock.query.mock.calls.map((c: any[]) => String(c[0]));
    expect(chamadas).toContain("BEGIN");
    expect(chamadas.some((q: string) => q.startsWith("INSERT INTO tarefas"))).toBe(true);
    expect(chamadas).toContain("COMMIT");
  });

  it("a query de guarda considera concluida+aprovada e cancelada como \"fechadas\"", async () => {
    // Prova de que a condição SQL da guarda exclui exatamente esses dois casos.
    queryMock.mockResolvedValueOnce({ rows: [TAREFA_BASE] });
    queryMock.mockResolvedValueOnce({ rows: [] });
    const clientMock = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    connectMock.mockResolvedValueOnce(clientMock);

    await avaliarRecorrenciaTarefas();

    const guardaSql = String(queryMock.mock.calls[1][0]);
    expect(guardaSql).toContain("status = 'cancelada'");
    expect(guardaSql).toContain("status = 'concluida' AND status_gestor = 'aprovada'");
  });
});
