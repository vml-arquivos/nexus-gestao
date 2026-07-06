from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(content: str, before: str, after: str, label: str) -> str:
    count = content.count(before)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1 trecho, encontrado {count}")
    return content.replace(before, after, 1)


def replace_between(content: str, start_marker: str, end_marker: str, replacement: str, label: str) -> str:
    start = content.find(start_marker)
    if start < 0:
        raise RuntimeError(f"{label}: marcador inicial não encontrado")
    end = content.find(end_marker, start)
    if end < 0:
        raise RuntimeError(f"{label}: marcador final não encontrado")
    return content[:start] + replacement + content[end:]


# ── Backend: regra automática e ranking por item ─────────────────────────────
backend_path = "backend/src/routes/tarefas.ts"
backend = read(backend_path)

backend = replace_once(
    backend,
    '''function taskPontuacaoEscopo(task: any): PontuacaoEscopo {
  const payload = parseOriginPayloadSafe(task?.origem_payload);
  return normalizePontuacaoEscopo(
    payload?.nexus_pontuacao_escopo ||
      payload?.pontuacao_escopo ||
      payload?.pontuacao_tipo,
  );
}
''',
    '''function taskExecutorIdsForScore(task: any) {
  const ids = new Set<string>();
  const items = parseChecklistItems(task?.checklist);

  if (items.length) {
    for (const item of items) {
      const executorId = checklistExecutorId(item, task);
      if (executorId) ids.add(executorId);
    }
  } else {
    const executorId = task?.aceita_por || task?.responsavel_id;
    if (isUuid(executorId)) ids.add(executorId);
  }

  return ids;
}

function taskPontuacaoEscopo(task: any): PontuacaoEscopo {
  // Regra única de negócio:
  // - lista executada por uma pessoa: pontuação somente no nível da lista;
  // - lista distribuída entre duas ou mais pessoas: pontuação somente por item.
  // Metadados antigos de "ambos" não podem mais duplicar pontuação.
  if (normalizeTaskScope(task?.escopo) !== "equipe") return "tarefa";
  return taskExecutorIdsForScore(task).size > 1 ? "subtarefas" : "tarefa";
}
''',
    "regra automática de pontuação",
)

backend = replace_once(
    backend,
    "          AND (t.status = 'aprovada' OR t.id IS NULL)\n",
    "          AND (\n            t.id IS NULL\n            OR t.status = 'aprovada'\n            OR COALESCE(tp.motivo, '') LIKE 'checklist_aprovado%'\n          )\n",
    "ranking aceita item aprovado antes da lista inteira",
)

backend = replace_once(
    backend,
    '''    const tarefasExecutadas = await query<any>(
      `SELECT t.*
       FROM tarefas t
       WHERE t.org_id = $1
         AND COALESCE(t.conta_ranking, TRUE) = TRUE
         AND COALESCE(t.escopo, 'pessoal') = 'equipe'
         AND t.status = 'aprovada'
       ORDER BY COALESCE(t.aprovada_em, t.updated_at, t.created_at) DESC`,
      [orgId],
    );
''',
    '''    const tarefasExecutadas = await query<any>(
      `SELECT t.*
       FROM tarefas t
       WHERE t.org_id = $1
         AND COALESCE(t.conta_ranking, TRUE) = TRUE
         AND COALESCE(t.escopo, 'pessoal') = 'equipe'
       ORDER BY COALESCE(t.aprovada_em, t.updated_at, t.created_at) DESC`,
      [orgId],
    );
''',
    "fonte de segurança inclui listas parcialmente aprovadas",
)

backend = replace_once(
    backend,
    '''      const items = parseChecklistItems(tarefa.checklist);
      const feitos = items.filter((item) => !!item.feito);

      const scoreScope = taskPontuacaoEscopo(tarefa);
      if (pontuacaoIncluiSubtarefas(scoreScope) && feitos.length) {
        for (const item of feitos) {
''',
    '''      const items = parseChecklistItems(tarefa.checklist);
      const itensPontuaveis = items.filter(
        (item) =>
          !!item.feito &&
          (String(tarefa.status || "") === "aprovada" ||
            String((item as any).aprovacao_status || "") === "aprovada"),
      );

      const scoreScope = taskPontuacaoEscopo(tarefa);
      if (pontuacaoIncluiSubtarefas(scoreScope) && itensPontuaveis.length) {
        for (const item of itensPontuaveis) {
''',
    "fallback do ranking usa somente itens aprovados",
)

backend = replace_once(
    backend,
    '''      if (participanteTarefa && pontosTarefa > 0) {
        touchMember(
''',
    '''      if (
        String(tarefa.status || "") === "aprovada" &&
        participanteTarefa &&
        pontosTarefa > 0
      ) {
        touchMember(
''',
    "pontuação de lista exige aprovação final",
)

backend = replace_once(
    backend,
    '''      if (!["concluida", "reenviada"].includes(String(existing.status || ""))) {
        res.status(409).json({
          error: "A tarefa só pode ser aprovada depois que o executor enviar a conclusão.",
        });
        return;
      }
      const tarefa = await queryOne<any>(
''',
    '''      if (!["concluida", "reenviada"].includes(String(existing.status || ""))) {
        res.status(409).json({
          error: "A tarefa só pode ser aprovada depois que o executor enviar a conclusão.",
        });
        return;
      }

      const approvalItems = parseChecklistItems(existing.checklist);
      const scoreScopeBeforeApproval = taskPontuacaoEscopo(existing);
      if (pontuacaoIncluiSubtarefas(scoreScopeBeforeApproval)) {
        const itensAguardandoAprovacao = approvalItems.filter(
          (item) =>
            !!item.feito &&
            String((item as any).aprovacao_status || "") !== "aprovada",
        );
        if (itensAguardandoAprovacao.length) {
          res.status(409).json({
            error: `Aprove cada parte da lista antes da aprovação final (${itensAguardandoAprovacao.length} pendente(s)).`,
          });
          return;
        }
      }

      const tarefa = await queryOne<any>(
''',
    "aprovação final exige partes aprovadas",
)

backend = replace_once(
    backend,
    '''      if (existing.conta_ranking !== false) {
        const items = parseChecklistItems(existing.checklist);
        const periodo = periodMonth();
        const scoreScope = taskPontuacaoEscopo(existing);
''',
    '''      if (existing.conta_ranking !== false) {
        const items = approvalItems;
        const periodo = periodMonth();
        const scoreScope = scoreScopeBeforeApproval;
''',
    "reuso da regra calculada na aprovação final",
)

backend = replace_once(
    backend,
    '''        if (pontuacaoIncluiSubtarefas(scoreScope) && items.length) {
          for (const item of items) {
            if (!item.feito) continue;
''',
    '''        if (pontuacaoIncluiSubtarefas(scoreScope) && items.length) {
          for (const item of items) {
            if (
              !item.feito ||
              String((item as any).aprovacao_status || "") !== "aprovada"
            )
              continue;
''',
    "aprovação final não pontua item sem aval individual",
)

backend = replace_once(
    backend,
    '''    const item:any = items[idx];
    if (!item.feito && decisao === "aprovar") { await client.query("ROLLBACK"); res.status(409).json({ error: "O executor ainda não enviou este item." }); return; }
''',
    '''    const item:any = items[idx];
    const jaAprovado =
      decisao === "aprovar" &&
      String(item.aprovacao_status || "") === "aprovada";
    if (!item.feito && decisao === "aprovar") { await client.query("ROLLBACK"); res.status(409).json({ error: "O executor ainda não enviou este item." }); return; }
''',
    "aprovação por item idempotente",
)

backend = replace_once(
    backend,
    '''    await client.query(`INSERT INTO tarefas_comentarios (org_id,tarefa_id,checklist_id,autor_id,comentario,tipo) VALUES ($1,$2,$3,$4,$5,$6)`,
      [orgId,tarefa.id,String(item.id),userId,String(req.body?.ressalva || (decisao === "aprovar" ? "Item aprovado pela gestão." : "Item devolvido para correção.")),decisao === "aprovar" ? "aprovacao" : "devolucao"]);
''',
    '''    if (!jaAprovado || decisao === "devolver") {
      await client.query(`INSERT INTO tarefas_comentarios (org_id,tarefa_id,checklist_id,autor_id,comentario,tipo) VALUES ($1,$2,$3,$4,$5,$6)`,
        [orgId,tarefa.id,String(item.id),userId,String(req.body?.ressalva || (decisao === "aprovar" ? "Item aprovado pela gestão." : "Item devolvido para correção.")),decisao === "aprovar" ? "aprovacao" : "devolucao"]);
    }
''',
    "evitar comentário duplicado ao reaplicar aprovação",
)

backend = replace_once(
    backend,
    '''        CREATE INDEX IF NOT EXISTS idx_ajuda_solic  ON tarefas_ajuda(solicitante_id);

        CREATE TABLE IF NOT EXISTS tarefas_comentarios (
''',
    '''        CREATE INDEX IF NOT EXISTS idx_ajuda_solic  ON tarefas_ajuda(solicitante_id);
        ALTER TABLE tarefas_ajuda ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;

        CREATE TABLE IF NOT EXISTS tarefas_comentarios (
''',
    "coluna updated_at de ajuda",
)

backend = replace_once(
    backend,
    '''      `UPDATE tarefas_ajuda SET resposta = $1, status = 'respondida', respondida_em = NOW()
       WHERE id = $2 AND org_id = $3 RETURNING *`,
''',
    '''      `UPDATE tarefas_ajuda SET resposta = $1, status = 'respondida', respondida_em = NOW(), updated_at = NOW()
       WHERE id = $2 AND org_id = $3 RETURNING *`,
''',
    "atualização temporal ao responder ajuda",
)

backend = replace_once(
    backend,
    '''      `UPDATE tarefas_ajuda SET status = 'resolvida', resolvida_em = NOW()
       WHERE id = $1 AND org_id = $2 RETURNING *`,
''',
    '''      `UPDATE tarefas_ajuda SET status = 'resolvida', resolvida_em = NOW(), updated_at = NOW()
       WHERE id = $1 AND org_id = $2 RETURNING *`,
''',
    "atualização temporal ao resolver ajuda",
)

write(backend_path, backend)


# ── Frontend: regra visível, aprovação fecha modal ───────────────────────────
frontend_path = "src/pages/Tarefas.tsx"
frontend = read(frontend_path)

frontend = replace_once(
    frontend,
    '''function taskPontuacaoEscopo(tarefa?: Tarefa | null): PontuacaoEscopo {
  // Nova lista mantém a escolha padrão atual; registros antigos sem metadado
  // explícito são interpretados de forma idêntica no frontend e no backend.
  if (!tarefa) return 'ambos'
  const payload = (tarefa.origem_payload || {}) as Record<string, any>
  return normalizePontuacaoEscopo((tarefa as any)?.pontuacao_escopo || payload?.nexus_pontuacao_escopo || payload?.pontuacao_escopo || payload?.pontuacao_tipo)
}
''',
    '''function automaticPontuacaoEscopo(items?: ChecklistItem[] | null, fallbackOwnerId?: string | null): PontuacaoEscopo {
  const ids = new Set<string>()
  const normalized = normalizeChecklistItems(items)

  if (normalized.length) {
    normalized.forEach(item => {
      const executorId = (item.feito ? (item.concluido_por || item.feito_por) : undefined)
        || checklistItemAssignmentId(item)
        || fallbackOwnerId
      if (executorId) ids.add(executorId)
    })
  } else if (fallbackOwnerId) {
    ids.add(fallbackOwnerId)
  }

  return ids.size > 1 ? 'subtarefas' : 'tarefa'
}

function taskPontuacaoEscopo(tarefa?: Tarefa | null): PontuacaoEscopo {
  if (!tarefa) return 'tarefa'
  return automaticPontuacaoEscopo(tarefa.checklist, tarefa.aceita_por || tarefa.responsavel_id)
}
''',
    "regra automática de pontuação no frontend",
)

frontend = replace_once(
    frontend,
    '''  const isMemberRequest = !isGestor && tipoTarefa === 'equipe' && !!responsavelId && responsavelId !== user?.id

  async function buscarCadastroDestrava() {
''',
    '''  const isMemberRequest = !isGestor && tipoTarefa === 'equipe' && !!responsavelId && responsavelId !== user?.id
  const pontuacaoEscopoAutomatico: PontuacaoEscopo = tipoTarefa === 'equipe'
    ? automaticPontuacaoEscopo(checklist, modoDistribuicao === 'livre_equipe' ? undefined : responsavelId)
    : 'tarefa'

  async function buscarCadastroDestrava() {
''',
    "escopo automático no formulário",
)

frontend = replace_once(
    frontend,
    "    const exigePontosNasTarefas = tipoTarefa === 'equipe' && pontuacaoIncluiSubtarefas(pontuacaoEscopo)\n",
    "    const exigePontosNasTarefas = tipoTarefa === 'equipe' && pontuacaoIncluiSubtarefas(pontuacaoEscopoAutomatico)\n",
    "validação de pontos por item automática",
)

frontend = replace_once(
    frontend,
    '''      : { ...item, revelar_apos_assumir: tarefaSurpresa ? true : Boolean((item as any).revelar_apos_assumir) })
    setLoading(true)
''',
    '''      : { ...item, revelar_apos_assumir: tarefaSurpresa ? true : Boolean((item as any).revelar_apos_assumir) })
    const pontuacaoEscopoFinal: PontuacaoEscopo = tipoTarefa === 'equipe'
      ? automaticPontuacaoEscopo(checklistFinal, modoDistribuicao === 'livre_equipe' ? undefined : responsavelId)
      : 'tarefa'
    setLoading(true)
''',
    "escopo final antes de salvar",
)

frontend = replace_once(
    frontend,
    '''        pontuacao: tipoTarefa === 'equipe' && pontuacaoIncluiTarefa(pontuacaoEscopo) ? Number(pontuacao || 0) : 0,
        pontuacao_escopo: tipoTarefa === 'equipe' ? pontuacaoEscopo : undefined,
        pontuacao_tipo: tipoTarefa === 'equipe' ? pontuacaoEscopo : undefined,
''',
    '''        pontuacao: tipoTarefa === 'equipe' && pontuacaoIncluiTarefa(pontuacaoEscopoFinal) ? Number(pontuacao || 0) : 0,
        pontuacao_escopo: tipoTarefa === 'equipe' ? pontuacaoEscopoFinal : undefined,
        pontuacao_tipo: tipoTarefa === 'equipe' ? pontuacaoEscopoFinal : undefined,
''',
    "payload com escopo automático",
)

frontend = replace_once(
    frontend,
    "          ? { ...(destravaSelecionado?.metadata || {}), nexus_tarefa_surpresa: Boolean(tarefaSurpresa), nexus_pontuacao_escopo: pontuacaoEscopo }\n",
    "          ? { ...(destravaSelecionado?.metadata || {}), nexus_tarefa_surpresa: Boolean(tarefaSurpresa), nexus_pontuacao_escopo: pontuacaoEscopoFinal }\n",
    "metadado com escopo automático",
)

creation_points_ui = '''        {isGestor && tipoTarefa === 'equipe' && (
          <div className="task-points-box">
            <div className="form-group">
              <label className="form-label">Regra automática de pontuação</label>
              <div className="integration-help">
                {pontuacaoEscopoAutomatico === 'subtarefas'
                  ? <><strong>Lista para várias pessoas:</strong> cada tarefa da lista libera seus próprios pontos quando o gestor aprovar a parte.</>
                  : <><strong>Lista para uma pessoa:</strong> os pontos são liberados somente na aprovação final da lista, sem somar pontos dos itens.</>}
              </div>
            </div>
            {pontuacaoIncluiTarefa(pontuacaoEscopoAutomatico) && (
              <div className="form-group">
                <label className="form-label">Pontuação da lista de tarefas</label>
                <select
                  className="form-input"
                  value={difficultyFromPoints(Number(pontuacao || 0))}
                  onChange={e => setPontuacao(String(taskPointsFromDifficulty(e.target.value as ChecklistDifficulty)))}
                >
                  {CHECKLIST_DIFFICULTY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label} · {opt.points} pts</option>)}
                </select>
              </div>
            )}
            <label className="task-surprise-toggle task-surprise-toggle--task">
              <input type="checkbox" checked={tarefaSurpresa} onChange={e => { const checked = e.target.checked; setTarefaSurpresa(checked); if (checked) { setNovoItemSurpresa(true); setChecklist(prev => prev.map(item => ({ ...item, revelar_apos_assumir: true }))) } }} />
              <span>Lista surpresa: antes de assumir, o membro vê somente quantos pontos vale. Título da lista, descrição e todas as tarefas da lista ficam escondidos.</span>
            </label>
            <div className="team-ranking-note">
              {pontuacaoEscopoAutomatico === 'subtarefas'
                ? 'Cada aprovação de parte sobe imediatamente os pontos do executor correspondente no ranking.'
                : 'A lista inteira pontua uma única vez para o executor, somente depois da aprovação final do gestor.'}
            </div>
          </div>
        )}
'''

frontend = replace_between(
    frontend,
    "        {isGestor && tipoTarefa === 'equipe' && (\n          <div className=\"task-points-box\">",
    "        {isGestor && tipoTarefa === 'equipe' && modoDistribuicao !== 'livre_equipe' && (",
    creation_points_ui,
    "interface automática de pontuação na criação",
)

frontend = replace_once(
    frontend,
    '''  const hasHelpPending = Boolean((tarefa as any).pedido_ajuda_pendente)

  useEffect(() => {
''',
    '''  const hasHelpPending = Boolean((tarefa as any).pedido_ajuda_pendente)
  const editPontuacaoEscopoAutomatico = automaticPontuacaoEscopo(
    checklist,
    tarefa.aceita_por || tarefa.responsavel_id,
  )

  useEffect(() => {
''',
    "escopo automático no detalhe",
)

frontend = replace_once(
    frontend,
    '''        pontuacao: isPersonal ? 0 : (pontuacaoIncluiTarefa(editPontuacaoEscopo) ? Number(editPontuacao || 0) : 0),
        pontuacao_escopo: isPersonal ? undefined : editPontuacaoEscopo,
        pontuacao_tipo: isPersonal ? undefined : editPontuacaoEscopo,
        conta_ranking: isPersonal ? false : tarefa.conta_ranking,
        origem_payload: isPersonal ? tarefa.origem_payload : { ...((tarefa.origem_payload || {}) as Record<string, unknown>), nexus_pontuacao_escopo: editPontuacaoEscopo },
''',
    '''        pontuacao: isPersonal ? 0 : (pontuacaoIncluiTarefa(editPontuacaoEscopoAutomatico) ? Number(editPontuacao || 0) : 0),
        pontuacao_escopo: isPersonal ? undefined : editPontuacaoEscopoAutomatico,
        pontuacao_tipo: isPersonal ? undefined : editPontuacaoEscopoAutomatico,
        conta_ranking: isPersonal ? false : tarefa.conta_ranking,
        origem_payload: isPersonal ? tarefa.origem_payload : { ...((tarefa.origem_payload || {}) as Record<string, unknown>), nexus_pontuacao_escopo: editPontuacaoEscopoAutomatico },
''',
    "edição salva regra automática",
)

detail_points_ui = '''            {!isPersonal && <div className="task-points-box">
              <div className="form-group">
                <label className="form-label">Regra automática de pontuação</label>
                <div className="integration-help">
                  {editPontuacaoEscopoAutomatico === 'subtarefas'
                    ? <><strong>Várias pessoas executando:</strong> somente as tarefas individuais pontuam.</>
                    : <><strong>Uma pessoa executando:</strong> somente a lista completa pontua.</>}
                </div>
              </div>
              {pontuacaoIncluiTarefa(editPontuacaoEscopoAutomatico) && (
                <div className="form-group">
                  <label className="form-label">Pontuação da lista de tarefas</label>
                  <select className="form-input" value={difficultyFromPoints(Number(editPontuacao || 0))} onChange={e => setEditPontuacao(String(taskPointsFromDifficulty(e.target.value as ChecklistDifficulty)))}>
                    {CHECKLIST_DIFFICULTY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label} · {opt.points} pts</option>)}
                  </select>
                </div>
              )}
            </div>}

'''

frontend = replace_between(
    frontend,
    '            {!isPersonal && <div className="task-points-box">',
    '            <div className="task-inline-add-subtask">',
    detail_points_ui,
    "interface automática de pontuação na edição",
)

frontend = replace_once(
    frontend,
    '''      toast(decisao === 'aprovar' ? 'Item aprovado e pontuação liberada.' : 'Item devolvido ao executor para correção.')
''',
    '''      toast(decisao === 'aprovar' ? 'Item aprovado e pontuação liberada no ranking.' : 'Item devolvido ao executor para correção.')
      if (decisao === 'aprovar') onClose()
''',
    "fechar modal após aprovar parte",
)

frontend = replace_once(
    frontend,
    '''                            {!isPersonal && <span className="task-check-points">{difficultyLabel((item as any).dificuldade)} · {(item as any).pontuacao ?? difficultyPoints((item as any).dificuldade)} ponto(s)</span>}
''',
    '''                            {!isPersonal && editPontuacaoEscopoAutomatico === 'subtarefas' && <span className="task-check-points">{difficultyLabel((item as any).dificuldade)} · {(item as any).pontuacao ?? difficultyPoints((item as any).dificuldade)} ponto(s)</span>}
                            {!isPersonal && editPontuacaoEscopoAutomatico === 'tarefa' && <span className="task-check-points">Pontuação contabilizada somente na aprovação final da lista</span>}
''',
    "texto de pontuação conforme quantidade de executores",
)

frontend = replace_once(
    frontend,
    '''                        {isGestor && item.feito && (item as any).aprovacao_status !== 'aprovada' && (
''',
    '''                        {isGestor && editPontuacaoEscopoAutomatico === 'subtarefas' && item.feito && (item as any).aprovacao_status !== 'aprovada' && (
''',
    "aprovação por parte apenas em lista multipessoa",
)

frontend = replace_once(
    frontend,
    '''                        {isGestor && (item as any).aprovacao_status === 'aprovada' && <span className="badge badge-success">Aprovada · pontos liberados</span>}
''',
    '''                        {isGestor && editPontuacaoEscopoAutomatico === 'subtarefas' && (item as any).aprovacao_status === 'aprovada' && <span className="badge badge-success">Aprovada · pontos liberados</span>}
                        {isGestor && editPontuacaoEscopoAutomatico === 'tarefa' && item.feito && <span className="badge">Concluída · aguardando aprovação final da lista</span>}
''',
    "status visual por regra de pontuação",
)

frontend = replace_once(
    frontend,
    '''              <strong>{isPersonal ? 'Progresso pessoal:' : 'Fluxo da lista:'}</strong> {isPersonal ? 'marque cada tarefa conforme concluir. O progresso fica salvo imediatamente e não gera pontuação.' : 'cada membro conclui somente suas tarefas e envia sua parte. O gestor visualiza os arquivos enviados e aprova ou devolve a lista inteira.'}
''',
    '''              <strong>{isPersonal ? 'Progresso pessoal:' : 'Fluxo da lista:'}</strong> {isPersonal
                ? 'marque cada tarefa conforme concluir. O progresso fica salvo imediatamente e não gera pontuação.'
                : editPontuacaoEscopoAutomatico === 'subtarefas'
                  ? 'cada membro conclui sua tarefa. O gestor aprova cada parte e os pontos sobem imediatamente para o executor daquele item.'
                  : 'uma pessoa executa a lista inteira. Os pontos sobem uma única vez quando o gestor aprovar a lista completa.'}
''',
    "resumo do fluxo de pontuação",
)

write(frontend_path, frontend)

print("Patch de pontuação automática, ranking por item e fechamento do modal aplicado com sucesso.")
