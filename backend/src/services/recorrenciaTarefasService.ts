import { v4 as uuidv4 } from "uuid";
import pool from "../db/pool";
import { runClusterSingletonJob } from "../lib/clusterJob";

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
  checklist_truncado: boolean;
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
 * anterior. Mantém texto, executor, pontuação e demais configurações.
 *
 * LIMITE_CHECKLIST_RECORRENCIA (FIX56): tarefas recorrentes nunca deveriam
 * ter centenas de milhares de itens de checklist — isso é sinal de dado
 * corrompido herdado de uma ocorrência anterior, não uma lista de tarefas
 * real. Gerar milhares de UUIDs síncronos em JS trava o event loop do Node
 * por vários segundos a cada execução, derrubando todas as outras rotas do
 * mesmo processo (foi a causa raiz real dos travamentos intermitentes de
 * /tarefas — não falta de RAM, não lock de banco: geração de checklist
 * corrompido bloqueando a única thread do Node). Corta o checklist para um
 * tamanho seguro antes de processar, e loga bem alto para ser notado.
 *
 * dedupPorIdentidade (FIX58): variante menor do mesmo problema — um item real
 * (ex.: "Finalizar o registro dos documentos...") aparecendo dezenas de
 * vezes idêntico dentro do MESMO checklist, abaixo do limite acima então
 * nunca barrado por ele. Provavelmente herdado de uma ocorrência antiga já
 * corrompida e perpetuado por esta mesma função (que só reseta id/feito,
 * nunca removia duplicata). A identidade inclui texto, data, responsável e
 * descrição: ações homônimas para pessoas ou datas diferentes são distintas. */
const LIMITE_CHECKLIST_RECORRENCIA = 300

function dedupPorIdentidade(items: unknown[]): unknown[] {
  const vistos = new Set<string>()
  const resultado: unknown[] = []
  for (const item of items) {
    const value = (item && typeof item === "object" ? item : {}) as Record<string, unknown>
    const chave = JSON.stringify({
      texto: String(value.texto || '').trim().toLowerCase(),
      data: String(value.data || '').slice(0, 10),
      responsavel: String(value.responsavel_id || value.atribuido_a || value.executor_id || ''),
      descricao: String(value.descricao || '').trim().toLowerCase(),
    })
    if (vistos.has(chave)) continue
    vistos.add(chave)
    resultado.push(item)
  }
  return resultado
}

function resetarChecklist(raw: unknown): unknown[] {
  const itemsBrutos = Array.isArray(raw) ? raw : [];
  if (itemsBrutos.length > LIMITE_CHECKLIST_RECORRENCIA) {
    console.error(
      `[RECORRENCIA] ALERTA: checklist com ${itemsBrutos.length} itens (limite ${LIMITE_CHECKLIST_RECORRENCIA}). ` +
      `Isso é dado corrompido, não uma lista real — truncando para evitar travar o processo. ` +
      `Investigue e corrija a origem manualmente.`
    )
  }
  const itemsSemDuplicata = dedupPorIdentidade(itemsBrutos.slice(0, LIMITE_CHECKLIST_RECORRENCIA));
  if (itemsSemDuplicata.length !== Math.min(itemsBrutos.length, LIMITE_CHECKLIST_RECORRENCIA)) {
    console.error(
      `[RECORRENCIA] ALERTA: checklist com itens de identidade duplicada — reduzido de ` +
      `${Math.min(itemsBrutos.length, LIMITE_CHECKLIST_RECORRENCIA)} para ${itemsSemDuplicata.length} itens únicos.`
    )
  }
  return itemsSemDuplicata.map((item) => {
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

async function existeOcorrenciaAbertaNaLinhagem(orgId: string, raizId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM tarefas
     WHERE org_id = $1
       AND (id = $2 OR grupo_recorrencia_id = $2)
       AND NOT (status = 'cancelada' OR (status = 'concluida' AND status_gestor = 'aprovada'))
     LIMIT 1`,
    [orgId, raizId],
  );
  return rows.length > 0;
}

async function gerarProximaOcorrencia(t: TarefaRecorrenteRow, hoje: Date): Promise<void> {
  const raizId = t.grupo_recorrencia_id || t.id;

  // FIX57: uma empresa tem uma única lista ativa por vez nessa linhagem.
  // Só gera a próxima ocorrência depois que a atual foi concluída E
  // aprovada pelo gestor (ou cancelada) -- caso contrário a lista anterior
  // continua sendo a "ativa" e as concluídas ficam como histórico/registro,
  // consultável na aba Concluídas, com seus anexos e arquivos preservados.
  const jaTemAberta = await existeOcorrenciaAbertaNaLinhagem(t.org_id, raizId);
  if (jaTemAberta) return;

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
            prioridade,
            CASE
              WHEN checklist IS NULL OR pg_column_size(checklist) <= 1000000
                THEN COALESCE(checklist, '[]'::jsonb)
              ELSE '[]'::jsonb
            END AS checklist,
            (COALESCE(pg_column_size(checklist), 0) > 1000000) AS checklist_truncado,
            escopo, modo_distribuicao, pontuacao, conta_ranking, status,
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
      if (t.checklist_truncado) {
        console.warn(`[RECORRENCIA] Checklist acima de 1 MB; ocorrência ${t.id} não gerada até correção manual.`);
        continue;
      }
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
    void runClusterSingletonJob("tarefas-recorrentes", avaliarRecorrenciaTarefas);
  };
  setInterval(rodar, intervaloMs);
  // 360s (não 300s) de propósito: o job de arquivamento de notificações
  // (lib/notifHelper.ts) também dispara sua primeira execução aos 300s do
  // boot. Rodar os dois no mesmo instante, logo após o container subir --
  // quando o cache do Postgres ainda está frio --, soma trabalho concorrente
  // bem no momento mais sensível do startup. Um minuto de intervalo entre os
  // dois é suficiente para não colidirem, sem atrasar nenhum dos dois de
  // forma perceptível.
  setTimeout(rodar, 360_000);
}
