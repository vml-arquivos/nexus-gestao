import { v4 as uuidv4 } from "uuid";
import pool from "../db/pool";

type TarefaRecorrenteRow = {
  id: string;
  org_id: string;
  criado_por: string;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  titulo: string;
  descricao: string | null;
  prazo: string | null;
  created_at: string;
  prioridade: string;
  checklist: unknown;
  escopo: string;
  modo_distribuicao: string;
  pontuacao: number;
  conta_ranking: boolean;
  status: string;
  origem_sistema: string | null;
  origem_tipo: string | null;
  origem_id: string | null;
  origem_nome: string | null;
  origem_url: string | null;
  origem_payload: unknown;
  recorrencia: string;
  recorrencia_dia_mes: number | null;
  recorrencia_dia_semana: number | null;
  recorrencia_fim: string | null;
  grupo_recorrencia_id: string | null;
};

/** Chave estável do período corrente, usada como parte da chave de
 * idempotência — garante que a mesma ocorrência nunca é gerada duas vezes,
 * mesmo que a varredura rode mais de uma vez no mesmo dia/semana/mês. */
function periodoAtual(recorrencia: string, hoje: Date): string {
  const y = hoje.getFullYear();
  const m = String(hoje.getMonth() + 1).padStart(2, "0");
  const d = String(hoje.getDate()).padStart(2, "0");
  if (recorrencia === "mensal") return `${y}-${m}`;
  if (recorrencia === "semanal") {
    // Chave da semana ISO (ano + número da semana) — estável independente
    // de qual dia da semana a tarefa foi originalmente configurada.
    const dt = new Date(Date.UTC(y, hoje.getMonth(), hoje.getDate()));
    const diaSemanaIso = (dt.getUTCDay() + 6) % 7;
    dt.setUTCDate(dt.getUTCDate() - diaSemanaIso + 3);
    const primeiraQuinta = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
    const semana =
      1 +
      Math.round(
        ((dt.getTime() - primeiraQuinta.getTime()) / 86400000 -
          3 +
          ((primeiraQuinta.getUTCDay() + 6) % 7)) /
          7,
      );
    return `${dt.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
  }
  return `${y}-${m}-${d}`; // diário
}

function deveGerarHoje(t: TarefaRecorrenteRow, hoje: Date): boolean {
  if (t.recorrencia === "diario") return true;
  if (t.recorrencia === "semanal") {
    const diaAlvo = t.recorrencia_dia_semana ?? new Date(t.created_at).getDay();
    return hoje.getDay() === Number(diaAlvo);
  }
  if (t.recorrencia === "mensal") {
    const diaAlvo = Number(t.recorrencia_dia_mes || new Date(t.created_at).getDate() || 1);
    const ultimoDiaDoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    return hoje.getDate() === Math.min(diaAlvo, ultimoDiaDoMes);
  }
  return false;
}

/** Reseta cada item do checklist para uma nova ocorrência: id novo (evita
 * colisão com a ocorrência anterior), não concluído, sem autoria de conclusão
 * anterior. Mantém texto, executor, pontuação e demais configurações. */
function resetarChecklist(raw: unknown): unknown[] {
  const items = Array.isArray(raw) ? raw : [];
  return items.map((item) => {
    const it = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    return {
      ...it,
      id: uuidv4(),
      feito: false,
      concluido_por: undefined,
      feito_por: undefined,
      aceita_por: undefined,
      assumido_por: undefined,
    };
  });
}

/** Calcula o novo prazo preservando o intervalo relativo original (ex.: se a
 * tarefa vencia 3 dias após criada, a nova ocorrência também vence 3 dias
 * após hoje). Sem prazo original, a nova ocorrência também não tem prazo. */
function calcularNovoPrazo(t: TarefaRecorrenteRow, hoje: Date): string | null {
  if (!t.prazo) return null;
  const prazoOriginal = new Date(`${t.prazo}T00:00:00Z`);
  const criadoOriginal = new Date(t.created_at);
  const offsetDias = Math.max(
    0,
    Math.round((prazoOriginal.getTime() - Date.UTC(criadoOriginal.getUTCFullYear(), criadoOriginal.getUTCMonth(), criadoOriginal.getUTCDate())) / 86400000),
  );
  const novo = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  novo.setUTCDate(novo.getUTCDate() + offsetDias);
  return novo.toISOString().slice(0, 10);
}

async function gerarProximaOcorrencia(t: TarefaRecorrenteRow, hoje: Date): Promise<void> {
  const raizId = t.grupo_recorrencia_id || t.id;
  const periodo = periodoAtual(t.recorrencia, hoje);
  const externalKey = `recorrencia-nexus:${raizId}:${periodo}`;
  const novoPrazo = calcularNovoPrazo(t, hoje);
  const novoChecklist = JSON.stringify(resetarChecklist(t.checklist));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Trava por raiz+período: evita duas varreduras concorrentes gerarem a
    // mesma ocorrência simultaneamente antes do índice único intervir.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [externalKey]);
    await client.query(
      `INSERT INTO tarefas (
         org_id, criado_por, responsavel_id, responsavel_nome, titulo, descricao, data, prazo, prioridade,
         checklist, obs, escopo, modo_distribuicao, pontuacao, conta_ranking, bloquear_nova_livre_ate_concluir,
         status, status_gestor, origem_sistema, origem_tipo, origem_id, origem_nome, origem_url, origem_payload,
         recorrencia, recorrencia_dia_mes, recorrencia_dia_semana, recorrencia_fim, grupo_recorrencia_id, external_key
       )
       SELECT
         org_id, criado_por, responsavel_id, responsavel_nome, titulo, descricao, NULL, $2::date, prioridade,
         $3::jsonb, NULL, escopo, modo_distribuicao, pontuacao, conta_ranking, FALSE,
         'pendente', 'aguardando', origem_sistema, origem_tipo, origem_id, origem_nome, origem_url, origem_payload,
         recorrencia, recorrencia_dia_mes, recorrencia_dia_semana, recorrencia_fim, $4, $5
       FROM tarefas WHERE id = $1
       ON CONFLICT (org_id, external_key) WHERE external_key IS NOT NULL DO NOTHING`,
      [t.id, novoPrazo, novoChecklist, raizId, externalKey],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Varre todas as tarefas recorrentes ativas e gera a próxima ocorrência de
 * quem já está no dia certo e ainda não foi gerada neste período. Chamada
 * pelo agendador (setInterval) — nunca lançada diretamente por uma rota. */
export async function avaliarRecorrenciaTarefas(): Promise<void> {
  const hoje = new Date();
  const { rows } = await pool.query<TarefaRecorrenteRow>(
    `SELECT id, org_id, criado_por, responsavel_id, responsavel_nome, titulo, descricao, prazo, created_at,
            prioridade, checklist, escopo, modo_distribuicao, pontuacao, conta_ranking, status,
            origem_sistema, origem_tipo, origem_id, origem_nome, origem_url, origem_payload,
            recorrencia, recorrencia_dia_mes, recorrencia_dia_semana, recorrencia_fim, grupo_recorrencia_id
     FROM tarefas
     WHERE recorrencia IN ('diario','semanal','mensal')
       AND status <> 'cancelada'
       AND (recorrencia_fim IS NULL OR recorrencia_fim >= CURRENT_DATE)`,
  );
  for (const t of rows) {
    try {
      // Nunca gera uma nova ocorrência no mesmo dia em que esta própria linha
      // foi criada -- evita duplicar a primeira instância recém-criada pelo gestor.
      const criadaHoje = new Date(t.created_at).toDateString() === hoje.toDateString();
      if (criadaHoje) continue;
      if (!deveGerarHoje(t, hoje)) continue;
      await gerarProximaOcorrencia(t, hoje);
    } catch (err) {
      console.error(`[RECORRENCIA] Erro ao gerar próxima ocorrência da tarefa ${t.id}:`, err);
    }
  }
}

export function iniciarRecorrenciaTarefas(): void {
  const intervaloMs = Number(process.env.RECORRENCIA_TAREFAS_INTERVAL_MS || 60 * 60_000); // 1h
  const rodar = () => {
    avaliarRecorrenciaTarefas().catch((err) => {
      console.error("[RECORRENCIA] Erro na varredura de tarefas recorrentes:", err);
    });
  };
  setInterval(rodar, intervaloMs);
  setTimeout(rodar, 20_000);
}
