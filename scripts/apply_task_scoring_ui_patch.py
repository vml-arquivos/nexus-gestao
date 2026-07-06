from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'src/pages/Tarefas.tsx'


def replace_once(text: str, before: str, after: str, label: str) -> str:
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f'{label}: esperado 1 trecho, encontrado {count}')
    return text.replace(before, after, 1)


text = PATH.read_text(encoding='utf-8')

text = replace_once(
    text,
    "      toast(decisao === 'aprovar' ? 'Item aprovado e pontuação liberada.' : 'Item devolvido ao executor para correção.')\n",
    "      toast(decisao === 'aprovar' ? 'Item aprovado e pontuação liberada no ranking.' : 'Item devolvido ao executor para correção.')\n      if (decisao === 'aprovar') onClose()\n",
    'fechamento após aprovação da parte',
)

text = replace_once(
    text,
    "  const executorSummary = checklistExecutorSummary({ ...tarefa, checklist })\n",
    "  const executorSummary = checklistExecutorSummary({ ...tarefa, checklist })\n  const scoringExecutorIds = new Set(\n    checklist\n      .map(item => (item.feito ? (item.concluido_por || item.feito_por) : undefined) || checklistItemAssignmentId(item) || tarefa.aceita_por || tarefa.responsavel_id)\n      .filter((id): id is string => Boolean(id)),\n  )\n  const scoreByChecklistItem = scoringExecutorIds.size > 1\n",
    'detecção automática da quantidade de executores',
)

text = replace_once(
    text,
    "                            {!isPersonal && <span className=\"task-check-points\">{difficultyLabel((item as any).dificuldade)} · {(item as any).pontuacao ?? difficultyPoints((item as any).dificuldade)} ponto(s)</span>}\n",
    "                            {!isPersonal && scoreByChecklistItem && <span className=\"task-check-points\">{difficultyLabel((item as any).dificuldade)} · {(item as any).pontuacao ?? difficultyPoints((item as any).dificuldade)} ponto(s)</span>}\n                            {!isPersonal && !scoreByChecklistItem && <span className=\"task-check-points\">Pontuação somente na aprovação final da lista</span>}\n",
    'texto de pontuação por regra',
)

text = replace_once(
    text,
    "                        {isGestor && item.feito && (item as any).aprovacao_status !== 'aprovada' && (\n",
    "                        {isGestor && scoreByChecklistItem && item.feito && (item as any).aprovacao_status !== 'aprovada' && (\n",
    'aprovação por parte somente para vários executores',
)

text = replace_once(
    text,
    "                        {isGestor && (item as any).aprovacao_status === 'aprovada' && <span className=\"badge badge-success\">Aprovada · pontos liberados</span>}\n",
    "                        {isGestor && scoreByChecklistItem && (item as any).aprovacao_status === 'aprovada' && <span className=\"badge badge-success\">Aprovada · pontos liberados</span>}\n                        {isGestor && !scoreByChecklistItem && item.feito && <span className=\"badge\">Concluída · aguardando aprovação final da lista</span>}\n",
    'status visual conforme regra',
)

text = replace_once(
    text,
    "              <strong>{isPersonal ? 'Progresso pessoal:' : 'Fluxo da lista:'}</strong> {isPersonal ? 'marque cada tarefa conforme concluir. O progresso fica salvo imediatamente e não gera pontuação.' : 'cada membro conclui somente suas tarefas e envia sua parte. O gestor visualiza os arquivos enviados e aprova ou devolve a lista inteira.'}\n",
    "              <strong>{isPersonal ? 'Progresso pessoal:' : 'Fluxo da lista:'}</strong> {isPersonal ? 'marque cada tarefa conforme concluir. O progresso fica salvo imediatamente e não gera pontuação.' : scoreByChecklistItem ? 'cada membro conclui sua tarefa; o gestor aprova cada parte e os pontos sobem imediatamente para o respectivo executor.' : 'uma pessoa executa a lista; os pontos sobem uma única vez na aprovação final da lista.'}\n",
    'explicação do fluxo de pontuação',
)

PATH.write_text(text, encoding='utf-8')
print('Regra visual de pontuação aplicada.')
