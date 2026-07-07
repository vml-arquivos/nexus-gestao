from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'src/pages/Tarefas.tsx'


def replace_once(text: str, before: str, after: str, label: str) -> str:
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f'{label}: esperado 1 trecho, encontrado {count}')
    return text.replace(before, after, 1)


text = PATH.read_text(encoding='utf-8')

# Nova lista: a quantidade de executores define automaticamente onde pontuar.
text = replace_once(
    text,
    "  const isMemberRequest = !isGestor && tipoTarefa === 'equipe' && !!responsavelId && responsavelId !== user?.id\n",
    "  const isMemberRequest = !isGestor && tipoTarefa === 'equipe' && !!responsavelId && responsavelId !== user?.id\n  const creationScoringExecutorIds = new Set(\n    checklist\n      .map(item => checklistItemAssignmentId(item) || (modoDistribuicao === 'livre_equipe' ? undefined : responsavelId))\n      .filter((id): id is string => Boolean(id)),\n  )\n  const creationScoreByChecklistItem = creationScoringExecutorIds.size > 1\n  const pontuacaoEscopoAutomatico: PontuacaoEscopo = creationScoreByChecklistItem ? 'subtarefas' : 'tarefa'\n",
    'regra automática no cadastro',
)

text = replace_once(
    text,
    "    const exigePontosNasTarefas = tipoTarefa === 'equipe' && pontuacaoIncluiSubtarefas(pontuacaoEscopo)\n",
    "    const exigePontosNasTarefas = tipoTarefa === 'equipe' && pontuacaoIncluiSubtarefas(pontuacaoEscopoAutomatico)\n",
    'validação automática dos pontos dos itens',
)

text = replace_once(
    text,
    "        pontuacao: tipoTarefa === 'equipe' && pontuacaoIncluiTarefa(pontuacaoEscopo) ? Number(pontuacao || 0) : 0,\n        pontuacao_escopo: tipoTarefa === 'equipe' ? pontuacaoEscopo : undefined,\n        pontuacao_tipo: tipoTarefa === 'equipe' ? pontuacaoEscopo : undefined,\n",
    "        pontuacao: tipoTarefa === 'equipe' && pontuacaoIncluiTarefa(pontuacaoEscopoAutomatico) ? Number(pontuacao || 0) : 0,\n        pontuacao_escopo: tipoTarefa === 'equipe' ? pontuacaoEscopoAutomatico : undefined,\n        pontuacao_tipo: tipoTarefa === 'equipe' ? pontuacaoEscopoAutomatico : undefined,\n",
    'payload automático da nova lista',
)

text = replace_once(
    text,
    "          ? { ...(destravaSelecionado?.metadata || {}), nexus_tarefa_surpresa: Boolean(tarefaSurpresa), nexus_pontuacao_escopo: pontuacaoEscopo }\n",
    "          ? { ...(destravaSelecionado?.metadata || {}), nexus_tarefa_surpresa: Boolean(tarefaSurpresa), nexus_pontuacao_escopo: pontuacaoEscopoAutomatico }\n",
    'metadado automático da nova lista',
)

creation_before = '''        {isGestor && tipoTarefa === 'equipe' && (
          <div className="task-points-box">
            <div className="form-group">
              <label className="form-label">Onde a pontuação será contabilizada?</label>
              <select
                className="form-input"
                value={pontuacaoEscopo}
                onChange={e => setPontuacaoEscopo(e.target.value as PontuacaoEscopo)}
              >
                <option value="tarefa">Somente pontuação da lista</option>
                <option value="subtarefas">Somente pontuação das tarefas da lista</option>
                <option value="ambos">Pontuação da lista e das tarefas</option>
              </select>
            </div>
            {pontuacaoIncluiTarefa(pontuacaoEscopo) && (
              <>
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
              </>
            )}
            <label className="task-surprise-toggle task-surprise-toggle--task">
              <input type="checkbox" checked={tarefaSurpresa} onChange={e => { const checked = e.target.checked; setTarefaSurpresa(checked); if (checked) { setNovoItemSurpresa(true); setChecklist(prev => prev.map(item => ({ ...item, revelar_apos_assumir: true }))) } }} />
              <span>Lista surpresa: antes de assumir, o membro vê somente quantos pontos vale. Título da lista, descrição e todas as tarefas da lista ficam escondidos.</span>
            </label>
            <div className="team-ranking-note">
              O ranking respeita a escolha acima: pode pontuar só a lista, só as tarefas da lista ou os dois, sempre somente após aprovação do gestor.
            </div>
          </div>
        )}
'''
creation_after = '''        {isGestor && tipoTarefa === 'equipe' && (
          <div className="task-points-box">
            <div className="integration-help">
              {creationScoreByChecklistItem
                ? <><strong>Lista para várias pessoas:</strong> cada tarefa libera somente os próprios pontos quando a parte for aprovada.</>
                : <><strong>Lista para uma pessoa:</strong> os itens não somam pontos separados; a pontuação é liberada uma vez na aprovação final da lista.</>}
            </div>
            {!creationScoreByChecklistItem && (
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
              {creationScoreByChecklistItem ? 'Cada aprovação de parte sobe imediatamente no ranking do respectivo executor.' : 'A lista inteira pontua somente na aprovação final do gestor.'}
            </div>
          </div>
        )}
'''
text = replace_once(text, creation_before, creation_after, 'interface automática da nova lista')

# Detalhe da lista: mesma regra usada pelo backend e pelo ranking.
text = replace_once(
    text,
    "      toast(decisao === 'aprovar' ? 'Item aprovado e pontuação liberada.' : 'Item devolvido ao executor para correção.')\n",
    "      toast(decisao === 'aprovar' ? (scoreByChecklistItem ? 'Item aprovado e pontuação liberada no ranking.' : 'Item aprovado. Os pontos sobem quando a lista inteira for aprovada.') : 'Item devolvido ao executor para correção.')\n",
    'mensagem honesta sobre quando os pontos sobem',
)

text = replace_once(
    text,
    "  const executorSummary = checklistExecutorSummary({ ...tarefa, checklist })\n",
    "  const executorSummary = checklistExecutorSummary({ ...tarefa, checklist })\n  const scoringExecutorIds = new Set(\n    checklist\n      .map(item => (item.feito ? (item.concluido_por || item.feito_por) : undefined) || checklistItemAssignmentId(item) || tarefa.aceita_por || tarefa.responsavel_id)\n      .filter((id): id is string => Boolean(id)),\n  )\n  const scoreByChecklistItem = scoringExecutorIds.size > 1\n  const editPontuacaoEscopoAutomatico: PontuacaoEscopo = scoreByChecklistItem ? 'subtarefas' : 'tarefa'\n",
    'detecção automática da quantidade de executores',
)

text = replace_once(
    text,
    "        pontuacao: isPersonal ? 0 : (pontuacaoIncluiTarefa(editPontuacaoEscopo) ? Number(editPontuacao || 0) : 0),\n        pontuacao_escopo: isPersonal ? undefined : editPontuacaoEscopo,\n        pontuacao_tipo: isPersonal ? undefined : editPontuacaoEscopo,\n        conta_ranking: isPersonal ? false : tarefa.conta_ranking,\n        origem_payload: isPersonal ? tarefa.origem_payload : { ...((tarefa.origem_payload || {}) as Record<string, unknown>), nexus_pontuacao_escopo: editPontuacaoEscopo },\n",
    "        pontuacao: isPersonal ? 0 : (pontuacaoIncluiTarefa(editPontuacaoEscopoAutomatico) ? Number(editPontuacao || 0) : 0),\n        pontuacao_escopo: isPersonal ? undefined : editPontuacaoEscopoAutomatico,\n        pontuacao_tipo: isPersonal ? undefined : editPontuacaoEscopoAutomatico,\n        conta_ranking: isPersonal ? false : tarefa.conta_ranking,\n        origem_payload: isPersonal ? tarefa.origem_payload : { ...((tarefa.origem_payload || {}) as Record<string, unknown>), nexus_pontuacao_escopo: editPontuacaoEscopoAutomatico },\n",
    'edição salva a regra automática',
)

edit_before = '''            {!isPersonal && <div className="task-points-box">
              <div className="form-group">
                <label className="form-label">Onde a pontuação será contabilizada?</label>
                <select className="form-input" value={editPontuacaoEscopo} onChange={e => setEditPontuacaoEscopo(e.target.value as PontuacaoEscopo)}>
                  <option value="tarefa">Somente pontuação da lista</option>
                  <option value="subtarefas">Somente pontuação das tarefas da lista</option>
                  <option value="ambos">Pontuação da lista e das tarefas</option>
                </select>
              </div>
              {pontuacaoIncluiTarefa(editPontuacaoEscopo) && (
                <>
                  <div className="form-group">
                    <label className="form-label">Pontuação da lista de tarefas</label>
                    <select className="form-input" value={difficultyFromPoints(Number(editPontuacao || 0))} onChange={e => setEditPontuacao(String(taskPointsFromDifficulty(e.target.value as ChecklistDifficulty)))}>
                      {CHECKLIST_DIFFICULTY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label} · {opt.points} pts</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>}
'''
edit_after = '''            {!isPersonal && <div className="task-points-box">
              <div className="integration-help">
                {scoreByChecklistItem
                  ? <><strong>Várias pessoas executando:</strong> somente as tarefas individuais pontuam.</>
                  : <><strong>Uma pessoa executando:</strong> somente a lista completa pontua.</>}
              </div>
              {!scoreByChecklistItem && (
                <div className="form-group">
                  <label className="form-label">Pontuação da lista de tarefas</label>
                  <select className="form-input" value={difficultyFromPoints(Number(editPontuacao || 0))} onChange={e => setEditPontuacao(String(taskPointsFromDifficulty(e.target.value as ChecklistDifficulty)))}>
                    {CHECKLIST_DIFFICULTY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label} · {opt.points} pts</option>)}
                  </select>
                </div>
              )}
            </div>}
'''
text = replace_once(text, edit_before, edit_after, 'interface automática da edição')

text = replace_once(
    text,
    "                            {!isPersonal && <span className=\"task-check-points\">{difficultyLabel((item as any).dificuldade)} · {(item as any).pontuacao ?? difficultyPoints((item as any).dificuldade)} ponto(s)</span>}\n",
    "                            {!isPersonal && scoreByChecklistItem && <span className=\"task-check-points\">{difficultyLabel((item as any).dificuldade)} · {(item as any).pontuacao ?? difficultyPoints((item as any).dificuldade)} ponto(s)</span>}\n                            {!isPersonal && !scoreByChecklistItem && <span className=\"task-check-points\">Pontuação somente na aprovação final da lista</span>}\n",
    'texto de pontuação por regra',
)

text = replace_once(
    text,
    "                            <button className=\"btn btn-primary btn-sm\" type=\"button\" onClick={() => revisarItem(item, 'aprovar')} disabled={saving}>Aprovar parte</button>\n",
    "                            <button className=\"btn btn-primary btn-sm\" type=\"button\" onClick={() => revisarItem(item, 'aprovar')} disabled={saving}>{scoreByChecklistItem ? 'Aprovar parte' : 'Aprovar item'}</button>\n",
    'rótulo do botão conforme a regra',
)

text = replace_once(
    text,
    "                        {isGestor && (item as any).aprovacao_status === 'aprovada' && <span className=\"badge badge-success\">Aprovada · pontos liberados</span>}\n",
    "                        {isGestor && scoreByChecklistItem && (item as any).aprovacao_status === 'aprovada' && <span className=\"badge badge-success\">Aprovada · pontos liberados</span>}\n                        {isGestor && !scoreByChecklistItem && tarefa.status === 'aprovada' && item.feito && <span className=\"badge badge-success\">Aprovada · pontos liberados</span>}\n                        {isGestor && !scoreByChecklistItem && tarefa.status !== 'aprovada' && (item as any).aprovacao_status === 'aprovada' && <span className=\"badge\">Revisado pela gestão · pontos na aprovação final da lista</span>}\n                        {isGestor && !scoreByChecklistItem && tarefa.status !== 'aprovada' && (item as any).aprovacao_status !== 'aprovada' && item.feito && <span className=\"badge\">Concluída · aguardando revisão</span>}\n",
    'status visual conforme regra',
)

text = replace_once(
    text,
    "              <strong>{isPersonal ? 'Progresso pessoal:' : 'Fluxo da lista:'}</strong> {isPersonal ? 'marque cada tarefa conforme concluir. O progresso fica salvo imediatamente e não gera pontuação.' : 'cada membro conclui somente suas tarefas e envia sua parte. O gestor visualiza os arquivos enviados e aprova ou devolve a lista inteira.'}\n",
    "              <strong>{isPersonal ? 'Progresso pessoal:' : 'Fluxo da lista:'}</strong> {isPersonal ? 'marque cada tarefa conforme concluir. O progresso fica salvo imediatamente e não gera pontuação.' : scoreByChecklistItem ? 'cada membro conclui sua tarefa; o gestor pode aprovar ou devolver cada parte assim que ela for concluída, sem esperar as demais. Cada aprovação libera os pontos na hora para o respectivo executor.' : 'o gestor pode revisar, aprovar ou devolver cada tarefa da lista assim que for concluída, sem esperar as demais — mas os pontos da lista só sobem quando ela for aprovada por inteiro.'}\n",
    'explicação do fluxo de pontuação',
)

PATH.write_text(text, encoding='utf-8')
print('Regra automática de pontuação aplicada em toda a interface.')
