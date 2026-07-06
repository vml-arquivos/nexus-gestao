from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(path):
    return (ROOT / path).read_text(encoding='utf-8')


def save(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise RuntimeError(f'{label}: esperado 1, encontrado {n}')
    return text.replace(old, new, 1)


def between(text, start, end, replacement, label):
    a = text.find(start)
    b = text.find(end, a + len(start)) if a >= 0 else -1
    if a < 0 or b < 0:
        raise RuntimeError(f'{label}: marcadores não encontrados')
    return text[:a] + replacement + text[b:]


p = 'backend/src/routes/tarefas.ts'
s = load(p)

s = once(s, '''function taskPontuacaoEscopo(task: any): PontuacaoEscopo {
  const payload = parseOriginPayloadSafe(task?.origem_payload);
  return normalizePontuacaoEscopo(
    payload?.nexus_pontuacao_escopo ||
      payload?.pontuacao_escopo ||
      payload?.pontuacao_tipo,
  );
}
''', '''function taskExecutorIdsForScore(task: any) {
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
  // Uma pessoa: pontua a lista. Várias pessoas: pontua cada item.
  if (normalizeTaskScope(task?.escopo) !== "equipe") return "tarefa";
  return taskExecutorIdsForScore(task).size > 1 ? "subtarefas" : "tarefa";
}
''', 'regra automática backend')

s = once(s, "          AND (t.status = 'aprovada' OR t.id IS NULL)\n", "          AND (t.id IS NULL OR t.status = 'aprovada' OR COALESCE(tp.motivo, '') LIKE 'checklist_aprovado%')\n", 'ranking por item')

s = once(s, '''    const tarefasExecutadas = await query<any>(
      `SELECT t.*
       FROM tarefas t
       WHERE t.org_id = $1
         AND COALESCE(t.conta_ranking, TRUE) = TRUE
         AND COALESCE(t.escopo, 'pessoal') = 'equipe'
         AND t.status = 'aprovada'
       ORDER BY COALESCE(t.aprovada_em, t.updated_at, t.created_at) DESC`,
      [orgId],
    );
''', '''    const tarefasExecutadas = await query<any>(
      `SELECT t.*
       FROM tarefas t
       WHERE t.org_id = $1
         AND COALESCE(t.conta_ranking, TRUE) = TRUE
         AND COALESCE(t.escopo, 'pessoal') = 'equipe'
       ORDER BY COALESCE(t.aprovada_em, t.updated_at, t.created_at) DESC`,
      [orgId],
    );
''', 'fallback inclui aprovação parcial')

s = once(s, '''      const items = parseChecklistItems(tarefa.checklist);
      const feitos = items.filter((item) => !!item.feito);

      const scoreScope = taskPontuacaoEscopo(tarefa);
      if (pontuacaoIncluiSubtarefas(scoreScope) && feitos.length) {
        for (const item of feitos) {
''', '''      const items = parseChecklistItems(tarefa.checklist);
      const itensPontuaveis = items.filter(
        (item) => !!item.feito &&
          (String(tarefa.status || "") === "aprovada" || String((item as any).aprovacao_status || "") === "aprovada"),
      );

      const scoreScope = taskPontuacaoEscopo(tarefa);
      if (pontuacaoIncluiSubtarefas(scoreScope) && itensPontuaveis.length) {
        for (const item of itensPontuaveis) {
''', 'fallback só itens aprovados')

s = once(s, '''      if (participanteTarefa && pontosTarefa > 0) {
        touchMember(
''', '''      if (String(tarefa.status || "") === "aprovada" && participanteTarefa && pontosTarefa > 0) {
        touchMember(
''', 'lista só pontua aprovada')

s = once(s, '''      if (!["concluida", "reenviada"].includes(String(existing.status || ""))) {
        res.status(409).json({
          error: "A tarefa só pode ser aprovada depois que o executor enviar a conclusão.",
        });
        return;
      }
      const tarefa = await queryOne<any>(
''', '''      if (!["concluida", "reenviada"].includes(String(existing.status || ""))) {
        res.status(409).json({
          error: "A tarefa só pode ser aprovada depois que o executor enviar a conclusão.",
        });
        return;
      }
      const approvalItems = parseChecklistItems(existing.checklist);
      const scoreScopeBeforeApproval = taskPontuacaoEscopo(existing);
      if (pontuacaoIncluiSubtarefas(scoreScopeBeforeApproval)) {
        const pendentes = approvalItems.filter(
          (item) => !!item.feito && String((item as any).aprovacao_status || "") !== "aprovada",
        );
        if (pendentes.length) {
          res.status(409).json({ error: `Aprove cada parte antes da aprovação final (${pendentes.length} pendente(s)).` });
          return;
        }
      }
      const tarefa = await queryOne<any>(
''', 'aprovação final valida partes')

s = once(s, '''      if (existing.conta_ranking !== false) {
        const items = parseChecklistItems(existing.checklist);
        const periodo = periodMonth();
        const scoreScope = taskPontuacaoEscopo(existing);
''', '''      if (existing.conta_ranking !== false) {
        const items = approvalItems;
        const periodo = periodMonth();
        const scoreScope = scoreScopeBeforeApproval;
''', 'reusar regra da aprovação')

s = once(s, '''        if (pontuacaoIncluiSubtarefas(scoreScope) && items.length) {
          for (const item of items) {
            if (!item.feito) continue;
''', '''        if (pontuacaoIncluiSubtarefas(scoreScope) && items.length) {
          for (const item of items) {
            if (!item.feito || String((item as any).aprovacao_status || "") !== "aprovada") continue;
''', 'não pontuar parte sem aval')

s = once(s, '''    const item:any = items[idx];
    if (!item.feito && decisao === "aprovar") { await client.query("ROLLBACK"); res.status(409).json({ error: "O executor ainda não enviou este item." }); return; }
''', '''    const item:any = items[idx];
    const jaAprovado = decisao === "aprovar" && String(item.aprovacao_status || "") === "aprovada";
    if (!item.feito && decisao === "aprovar") { await client.query("ROLLBACK"); res.status(409).json({ error: "O executor ainda não enviou este item." }); return; }
''', 'aprovação idempotente')

s = once(s, '''    await client.query(`INSERT INTO tarefas_comentarios (org_id,tarefa_id,checklist_id,autor_id,comentario,tipo) VALUES ($1,$2,$3,$4,$5,$6)`,
      [orgId,tarefa.id,String(item.id),userId,String(req.body?.ressalva || (decisao === "aprovar" ? "Item aprovado pela gestão." : "Item devolvido para correção.")),decisao === "aprovar" ? "aprovacao" : "devolucao"]);
''', '''    if (!jaAprovado || decisao === "devolver") {
      await client.query(`INSERT INTO tarefas_comentarios (org_id,tarefa_id,checklist_id,autor_id,comentario,tipo) VALUES ($1,$2,$3,$4,$5,$6)`,
        [orgId,tarefa.id,String(item.id),userId,String(req.body?.ressalva || (decisao === "aprovar" ? "Item aprovado pela gestão." : "Item devolvido para correção.")),decisao === "aprovar" ? "aprovacao" : "devolucao"]);
    }
''', 'sem comentário duplicado')

s = once(s, '''        CREATE INDEX IF NOT EXISTS idx_ajuda_solic  ON tarefas_ajuda(solicitante_id);

        CREATE TABLE IF NOT EXISTS tarefas_comentarios (
''', '''        CREATE INDEX IF NOT EXISTS idx_ajuda_solic  ON tarefas_ajuda(solicitante_id);
        ALTER TABLE tarefas_ajuda ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;

        CREATE TABLE IF NOT EXISTS tarefas_comentarios (
''', 'schema ajuda')

s = once(s, "      `UPDATE tarefas_ajuda SET resposta = $1, status = 'respondida', respondida_em = NOW()\n", "      `UPDATE tarefas_ajuda SET resposta = $1, status = 'respondida', respondida_em = NOW(), updated_at = NOW()\n", 'updated ajuda resposta')
s = once(s, "      `UPDATE tarefas_ajuda SET status = 'resolvida', resolvida_em = NOW()\n", "      `UPDATE tarefas_ajuda SET status = 'resolvida', resolvida_em = NOW(), updated_at = NOW()\n", 'updated ajuda resolução')
save(p, s)

p = 'src/pages/Tarefas.tsx'
s = load(p)

s = once(s, '''function taskPontuacaoEscopo(tarefa?: Tarefa | null): PontuacaoEscopo {
  // Nova lista mantém a escolha padrão atual; registros antigos sem metadado
  // explícito são interpretados de forma idêntica no frontend e no backend.
  if (!tarefa) return 'ambos'
  const payload = (tarefa.origem_payload || {}) as Record<string, any>
  return normalizePontuacaoEscopo((tarefa as any)?.pontuacao_escopo || payload?.nexus_pontuacao_escopo || payload?.pontuacao_escopo || payload?.pontuacao_tipo)
}
''', '''function automaticPontuacaoEscopo(items?: ChecklistItem[] | null, fallbackOwnerId?: string | null): PontuacaoEscopo {
  const ids = new Set<string>()
  const normalized = normalizeChecklistItems(items)
  normalized.forEach(item => {
    const id = (item.feito ? (item.concluido_por || item.feito_por) : undefined)
      || checklistItemAssignmentId(item) || fallbackOwnerId
    if (id) ids.add(id)
  })
  if (!normalized.length && fallbackOwnerId) ids.add(fallbackOwnerId)
  return ids.size > 1 ? 'subtarefas' : 'tarefa'
}

function taskPontuacaoEscopo(tarefa?: Tarefa | null): PontuacaoEscopo {
  if (!tarefa) return 'tarefa'
  return automaticPontuacaoEscopo(tarefa.checklist, tarefa.aceita_por || tarefa.responsavel_id)
}
''', 'regra automática frontend')

s = once(s, '''  const isMemberRequest = !isGestor && tipoTarefa === 'equipe' && !!responsavelId && responsavelId !== user?.id

  async function buscarCadastroDestrava() {
''', '''  const isMemberRequest = !isGestor && tipoTarefa === 'equipe' && !!responsavelId && responsavelId !== user?.id
  const pontuacaoEscopoAutomatico = tipoTarefa === 'equipe'
    ? automaticPontuacaoEscopo(checklist, modoDistribuicao === 'livre_equipe' ? undefined : responsavelId)
    : 'tarefa'

  async function buscarCadastroDestrava() {
''', 'escopo automático formulário')

s = once(s, "    const exigePontosNasTarefas = tipoTarefa === 'equipe' && pontuacaoIncluiSubtarefas(pontuacaoEscopo)\n", "    const exigePontosNasTarefas = tipoTarefa === 'equipe' && pontuacaoIncluiSubtarefas(pontuacaoEscopoAutomatico)\n", 'validar pontos automáticos')

s = once(s, '''      : { ...item, revelar_apos_assumir: tarefaSurpresa ? true : Boolean((item as any).revelar_apos_assumir) })
    setLoading(true)
''', '''      : { ...item, revelar_apos_assumir: tarefaSurpresa ? true : Boolean((item as any).revelar_apos_assumir) })
    const pontuacaoEscopoFinal = tipoTarefa === 'equipe'
      ? automaticPontuacaoEscopo(checklistFinal, modoDistribuicao === 'livre_equipe' ? undefined : responsavelId)
      : 'tarefa'
    setLoading(true)
''', 'escopo final')

s = once(s, '''        pontuacao: tipoTarefa === 'equipe' && pontuacaoIncluiTarefa(pontuacaoEscopo) ? Number(pontuacao || 0) : 0,
        pontuacao_escopo: tipoTarefa === 'equipe' ? pontuacaoEscopo : undefined,
        pontuacao_tipo: tipoTarefa === 'equipe' ? pontuacaoEscopo : undefined,
''', '''        pontuacao: tipoTarefa === 'equipe' && pontuacaoIncluiTarefa(pontuacaoEscopoFinal) ? Number(pontuacao || 0) : 0,
        pontuacao_escopo: tipoTarefa === 'equipe' ? pontuacaoEscopoFinal : undefined,
        pontuacao_tipo: tipoTarefa === 'equipe' ? pontuacaoEscopoFinal : undefined,
''', 'payload automático')
s = once(s, 'nexus_pontuacao_escopo: pontuacaoEscopo }\n', 'nexus_pontuacao_escopo: pontuacaoEscopoFinal }\n', 'metadado automático')

creation_ui = '''        {isGestor && tipoTarefa === 'equipe' && (
          <div className="task-points-box">
            <div className="integration-help">
              {pontuacaoEscopoAutomatico === 'subtarefas'
                ? <><strong>Lista para várias pessoas:</strong> cada item libera seus pontos quando a parte for aprovada.</>
                : <><strong>Lista para uma pessoa:</strong> os pontos são liberados somente na aprovação final da lista.</>}
            </div>
            {pontuacaoIncluiTarefa(pontuacaoEscopoAutomatico) && <div className="form-group">
              <label className="form-label">Pontuação da lista de tarefas</label>
              <select className="form-input" value={difficultyFromPoints(Number(pontuacao || 0))} onChange={e => setPontuacao(String(taskPointsFromDifficulty(e.target.value as ChecklistDifficulty)))}>
                {CHECKLIST_DIFFICULTY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label} · {opt.points} pts</option>)}
              </select>
            </div>}
            <label className="task-surprise-toggle task-surprise-toggle--task">
              <input type="checkbox" checked={tarefaSurpresa} onChange={e => { const checked = e.target.checked; setTarefaSurpresa(checked); if (checked) { setNovoItemSurpresa(true); setChecklist(prev => prev.map(item => ({ ...item, revelar_apos_assumir: true }))) } }} />
              <span>Lista surpresa: antes de assumir, o membro vê somente quantos pontos vale.</span>
            </label>
            <div className="team-ranking-note">{pontuacaoEscopoAutomatico === 'subtarefas' ? 'Cada aprovação de parte sobe imediatamente no ranking.' : 'A lista pontua uma única vez após a aprovação final.'}</div>
          </div>
        )}
'''
s = between(s, "        {isGestor && tipoTarefa === 'equipe' && (\n          <div className=\"task-points-box\">", "        {isGestor && tipoTarefa === 'equipe' && modoDistribuicao !== 'livre_equipe' && (", creation_ui, 'UI criação')

s = once(s, '''  const hasHelpPending = Boolean((tarefa as any).pedido_ajuda_pendente)

  useEffect(() => {
''', '''  const hasHelpPending = Boolean((tarefa as any).pedido_ajuda_pendente)
  const editPontuacaoEscopoAutomatico = automaticPontuacaoEscopo(checklist, tarefa.aceita_por || tarefa.responsavel_id)

  useEffect(() => {
''', 'escopo detalhe')

s = once(s, '''        pontuacao: isPersonal ? 0 : (pontuacaoIncluiTarefa(editPontuacaoEscopo) ? Number(editPontuacao || 0) : 0),
        pontuacao_escopo: isPersonal ? undefined : editPontuacaoEscopo,
        pontuacao_tipo: isPersonal ? undefined : editPontuacaoEscopo,
        conta_ranking: isPersonal ? false : tarefa.conta_ranking,
        origem_payload: isPersonal ? tarefa.origem_payload : { ...((tarefa.origem_payload || {}) as Record<string, unknown>), nexus_pontuacao_escopo: editPontuacaoEscopo },
''', '''        pontuacao: isPersonal ? 0 : (pontuacaoIncluiTarefa(editPontuacaoEscopoAutomatico) ? Number(editPontuacao || 0) : 0),
        pontuacao_escopo: isPersonal ? undefined : editPontuacaoEscopoAutomatico,
        pontuacao_tipo: isPersonal ? undefined : editPontuacaoEscopoAutomatico,
        conta_ranking: isPersonal ? false : tarefa.conta_ranking,
        origem_payload: isPersonal ? tarefa.origem_payload : { ...((tarefa.origem_payload || {}) as Record<string, unknown>), nexus_pontuacao_escopo: editPontuacaoEscopoAutomatico },
''', 'salvar detalhe automático')

detail_ui = '''            {!isPersonal && <div className="task-points-box">
              <div className="integration-help">{editPontuacaoEscopoAutomatico === 'subtarefas' ? <><strong>Várias pessoas:</strong> somente os itens pontuam.</> : <><strong>Uma pessoa:</strong> somente a lista completa pontua.</>}</div>
              {pontuacaoIncluiTarefa(editPontuacaoEscopoAutomatico) && <div className="form-group">
                <label className="form-label">Pontuação da lista de tarefas</label>
                <select className="form-input" value={difficultyFromPoints(Number(editPontuacao || 0))} onChange={e => setEditPontuacao(String(taskPointsFromDifficulty(e.target.value as ChecklistDifficulty)))}>
                  {CHECKLIST_DIFFICULTY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label} · {opt.points} pts</option>)}
                </select>
              </div>}
            </div>}

'''
s = between(s, '            {!isPersonal && <div className="task-points-box">', '            <div className="task-inline-add-subtask">', detail_ui, 'UI detalhe')

s = once(s, "      toast(decisao === 'aprovar' ? 'Item aprovado e pontuação liberada.' : 'Item devolvido ao executor para correção.')\n", "      toast(decisao === 'aprovar' ? 'Item aprovado e pontuação liberada no ranking.' : 'Item devolvido ao executor para correção.')\n      if (decisao === 'aprovar') onClose()\n", 'fechar modal')
s = once(s, "{isGestor && item.feito && (item as any).aprovacao_status !== 'aprovada' && (", "{isGestor && editPontuacaoEscopoAutomatico === 'subtarefas' && item.feito && (item as any).aprovacao_status !== 'aprovada' && (", 'aprovar parte só multipessoa')
s = once(s, "{isGestor && (item as any).aprovacao_status === 'aprovada' && <span className=\"badge badge-success\">Aprovada · pontos liberados</span>}", "{isGestor && editPontuacaoEscopoAutomatico === 'subtarefas' && (item as any).aprovacao_status === 'aprovada' && <span className=\"badge badge-success\">Aprovada · pontos liberados</span>}\n                        {isGestor && editPontuacaoEscopoAutomatico === 'tarefa' && item.feito && <span className=\"badge\">Concluída · aguardando aprovação final</span>}", 'badge correto')
s = once(s, "{!isPersonal && <span className=\"task-check-points\">{difficultyLabel((item as any).dificuldade)} · {(item as any).pontuacao ?? difficultyPoints((item as any).dificuldade)} ponto(s)</span>}", "{!isPersonal && editPontuacaoEscopoAutomatico === 'subtarefas' && <span className=\"task-check-points\">{difficultyLabel((item as any).dificuldade)} · {(item as any).pontuacao ?? difficultyPoints((item as any).dificuldade)} ponto(s)</span>}\n                            {!isPersonal && editPontuacaoEscopoAutomatico === 'tarefa' && <span className=\"task-check-points\">Pontuação somente na aprovação final da lista</span>}", 'texto pontos')
s = once(s, "{isPersonal ? 'marque cada tarefa conforme concluir. O progresso fica salvo imediatamente e não gera pontuação.' : 'cada membro conclui somente suas tarefas e envia sua parte. O gestor visualiza os arquivos enviados e aprova ou devolve a lista inteira.'}", "{isPersonal ? 'marque cada tarefa conforme concluir. O progresso fica salvo imediatamente e não gera pontuação.' : editPontuacaoEscopoAutomatico === 'subtarefas' ? 'cada membro conclui sua tarefa; o gestor aprova cada parte e os pontos sobem imediatamente.' : 'uma pessoa executa a lista; os pontos sobem uma única vez na aprovação final.'}", 'resumo fluxo')
save(p, s)

print('Patch de pontuação automática aplicado.')
