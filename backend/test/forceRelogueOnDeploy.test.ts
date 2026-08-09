/**
 * forceRelogueOnDeploy.test.ts
 *
 * FIX63: garante que a revogação de sessões só acontece quando a opção está
 * ligada E a release realmente mudou desde o último boot -- nunca em boot
 * repetido da mesma release (evita expulsar todo mundo num simples restart
 * sem deploy de verdade).
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const queryMock = vi.fn();
const connectMock = vi.fn(() => Promise.resolve({ query: queryMock, release: vi.fn() }));

vi.mock("../src/db/pool", () => ({
  default: { connect: (...args: any[]) => connectMock(...args) },
}));

vi.mock("../src/release", () => ({ NEXUS_RELEASE: "fix63-teste-release" }));

import { forceRelogueOnDeployOnce } from "../src/db/forceRelogueOnDeployOnce";

const ORIGINAL_ENV = process.env.FORCE_RELOGIN_ON_DEPLOY;

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockClear();
});

afterEach(() => {
  process.env.FORCE_RELOGIN_ON_DEPLOY = ORIGINAL_ENV;
});

describe("forceRelogueOnDeployOnce (FIX63)", () => {
  it("não faz nada (nem conecta no banco) quando a opção está desligada", async () => {
    delete process.env.FORCE_RELOGIN_ON_DEPLOY;
    await forceRelogueOnDeployOnce();
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("revoga refresh_tokens quando a release mudou desde o último boot", async () => {
    process.env.FORCE_RELOGIN_ON_DEPLOY = "true";
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
      .mockResolvedValueOnce({ rows: [{ ultima_release: "fix62-antiga" }] }) // SELECT ultima_release
      .mockResolvedValueOnce({ rowCount: 7 }) // DELETE FROM refresh_tokens
      .mockResolvedValueOnce({ rows: [] }); // INSERT/UPDATE nexus_deploy_state

    await forceRelogueOnDeployOnce();

    const deleteCall = queryMock.mock.calls.find((c) => String(c[0]).includes("DELETE FROM refresh_tokens"));
    expect(deleteCall).toBeTruthy();
    const upsertCall = queryMock.mock.calls.find((c) => String(c[0]).includes("INSERT INTO nexus_deploy_state"));
    expect(upsertCall![1]).toEqual(["fix63-teste-release"]);
  });

  it("NÃO revoga nada quando a release é a mesma do último boot registrado", async () => {
    process.env.FORCE_RELOGIN_ON_DEPLOY = "true";
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
      .mockResolvedValueOnce({ rows: [{ ultima_release: "fix63-teste-release" }] }); // já é a atual

    await forceRelogueOnDeployOnce();

    const deleteCall = queryMock.mock.calls.find((c) => String(c[0]).includes("DELETE FROM refresh_tokens"));
    expect(deleteCall).toBeUndefined();
  });

  it("primeiro boot (tabela vazia) conta como release nova e revoga", async () => {
    process.env.FORCE_RELOGIN_ON_DEPLOY = "true";
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
      .mockResolvedValueOnce({ rows: [] }) // SELECT vazio -- nunca registrado
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rows: [] });

    await forceRelogueOnDeployOnce();

    const deleteCall = queryMock.mock.calls.find((c) => String(c[0]).includes("DELETE FROM refresh_tokens"));
    expect(deleteCall).toBeTruthy();
  });
});
