import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, 'utf8')
}

function replaceOnce(content, oldValue, newValue, label) {
  if (content.includes(newValue)) return content
  const matches = content.split(oldValue).length - 1
  if (matches !== 1) {
    throw new Error(`[task-visibility-patch] Âncora "${label}" deveria existir uma vez; encontrada(s): ${matches}`)
  }
  return content.replace(oldValue, newValue)
}

const tarefasPath = 'src/pages/Tarefas.tsx'
let tarefas = read(tarefasPath)

const oldNormalize = `function normalizeChecklistItems(items?: ChecklistItem[] | null): ChecklistItem[] {
  if (!Array.isArray(items)) return []
  return items.map(item => ({
    id: item.id || nanoid(),
    texto: item.texto || '',
    descricao: item.descricao || undefined,
    data: item.data ? String(item.data).slice(0, 10) : undefined,
    responsavel_id: item.responsavel_id || undefined,
    responsavel_nome: item.responsavel_nome || undefined,
    assumido_por: item.assumido_por || undefined,
    executor_id: item.executor_id || undefined,
    aceita_por: item.aceita_por || undefined,
    concluido_por: item.concluido_por || undefined,
    feito_por: item.feito_por || undefined,
    dificuldade: (item as any).dificuldade || difficultyFromPoints(Number((item as any).pontuacao ?? 3)),
    pontuacao: Math.max(0, Math.min(SCORE_MAX, Number((item as any).pontuacao ?? difficultyPoints((item as any).dificuldade)))),
    subtarefas: normalizeObjectiveSubitems((item as any).subtarefas || (item as any).subtasks),
    revelar_apos_assumir: Boolean((item as any).revelar_apos_assumir),
    oculta_ate_assumir: Boolean((item as any).oculta_ate_assumir),
    feito: Boolean(item.feito),
  }))
}`

const newNormalize = `function normalizeChecklistItems(items?: ChecklistItem[] | null): ChecklistItem[] {
  if (!Array.isArray(items)) return []
  return items.map(rawItem => {
    const item = rawItem as ChecklistItem & Record<string, any>
    const dificuldade = item.dificuldade || item.difficulty || difficultyFromPoints(Number(item.pontuacao ?? item.pontos ?? 3))
    const pontosInformados = Number(item.pontuacao ?? item.pontos ?? difficultyPoints(dificuldade))
    const pontuacao = Number.isFinite(pontosInformados)
      ? Math.max(0, Math.min(SCORE_MAX, pontosInformados))
      : difficultyPoints(dificuldade)

    // Preserva todos os metadados atuais e legados (aprovação, devolução,
    // executor e auditoria). Antes, a normalização recriava o objeto e
    // descartava campos não enumerados, causando comportamento diferente
    // entre listas novas e antigas.
    return {
      ...item,
      id: item.id || item.checklist_id || item.item_id || nanoid(),
      texto: item.texto || item.title || item.label || '',
      descricao: item.descricao || item.description || undefined,
      data: (item.data || item.date || item.due_date) ? String(item.data || item.date || item.due_date).slice(0, 10) : undefined,
      responsavel_id: item.responsavel_id || item.responsavelId || item.assigned_to || item.assignedToId || undefined,
      responsavel_nome: item.responsavel_nome || item.responsavelNome || item.assigned_to_name || item.assignedToName || undefined,
      assumido_por: item.assumido_por || item.assumidoPor || item.claimed_by || item.claimedBy || undefined,
      executor_id: item.executor_id || item.executorId || undefined,
      aceita_por: item.aceita_por || item.aceitaPor || undefined,
      concluido_por: item.concluido_por || item.concluidoPor || item.completed_by || undefined,
      feito_por: item.feito_por || item.feitoPor || item.done_by || undefined,
      dificuldade,
      pontuacao,
      subtarefas: normalizeObjectiveSubitems(item.subtarefas || item.subtasks || item.etapas),
      revelar_apos_assumir: Boolean(item.revelar_apos_assumir ?? item.revelarAposAssumir ?? item.surpresa),
      oculta_ate_assumir: Boolean(item.oculta_ate_assumir ?? item.ocultaAteAssumir),
      feito: Boolean(item.feito ?? item.concluido ?? item.completed ?? item.done),
    } as ChecklistItem
  })
}`

tarefas = replaceOnce(tarefas, oldNormalize, newNormalize, 'normalizeChecklistItems')

const oldVisible = `function visibleChecklistItems(tarefa: Tarefa, userId: string, isGestor: boolean) {
  const items = normalizeChecklistItems(tarefa.checklist)
  if (isGestor) return items
  const assigned = items.filter(item => isChecklistItemExecutor(item, tarefa, userId))
  // Depois de assumir/receber uma subtarefa, o membro vê somente a parte dele.
  if (assigned.length) return assigned
  // Antes de assumir, ele vê apenas subtarefas livres em aberto. As surpresas ficam mascaradas.
  return items
    .filter(item => !item.feito && !checklistItemAssignmentId(item))
    .map(item => maskSurpriseChecklistItemForViewer(item, tarefa, userId))
}`

const newVisible = `function visibleChecklistItems(tarefa: Tarefa, userId: string, isGestor: boolean) {
  const items = normalizeChecklistItems(tarefa.checklist)
  if (isGestor) return items

  // Visibilidade e permissão de execução são responsabilidades diferentes:
  // o membro sempre enxerga a lista completa para compreender o fluxo,
  // enquanto isChecklistItemExecutor continua limitando quem pode marcar.
  // Itens surpresa de outro executor permanecem mascarados até a assunção.
  return items.map(item =>
    isSurpriseChecklistItem(item) && !isChecklistItemExecutor(item, tarefa, userId)
      ? maskSurpriseChecklistItemForViewer(item, tarefa, userId)
      : item
  )
}`

tarefas = replaceOnce(tarefas, oldVisible, newVisible, 'visibleChecklistItems')

tarefas = replaceOnce(
  tarefas,
  `    <div style={{ maxWidth: 980, margin: '0 auto', padding: '16px 16px calc(var(--bottom-nav-h, 72px) + env(safe-area-inset-bottom) + 24px)' }}>`,
  `    <div className="tarefas-page-shell">`,
  'tarefas-page-shell',
)

tarefas = replaceOnce(
  tarefas,
  `    <article className="task-board-card" onClick={() => onOpen(tarefa)} title="Clique para abrir a lista">`,
  `    <article
      className="task-board-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(tarefa)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(tarefa)
        }
      }}
      title="Clique para abrir a lista"
    >`,
  'task-board-card-accessibility',
)

write(tarefasPath, tarefas)

// Nota (2026-07-08): o passo que editava TaskWorkflowEffects.tsx para
// refinar a detecção de "card aprovado" foi removido. Aquele mecanismo
// (syncTaskUi/task-runtime-archived) escondia itens de checklist já
// aprovados do formulário de edição — um comportamento não desejado que
// impedia reabrir/editar tarefas concluídas quantas vezes fosse preciso.
// TaskWorkflowEffects.tsx hoje só cuida de proteção contra duplo clique
// na aprovação e fechamento do modal na aprovação final da lista.

const cssPath = 'src/app-styles.css'
let css = read(cssPath)
const cssMarker = 'NEXUS — TASK BOARD LAYOUT HARDENING 2026-07-07'
if (!css.includes(cssMarker)) {
  css += `

/* ═══════════════════════════════════════════════════════════════
   NEXUS — TASK BOARD LAYOUT HARDENING 2026-07-07
   Quadro amplo no desktop, responsivo no tablet e navegação
   horizontal previsível no mobile, sem alterar regras de negócio.
═══════════════════════════════════════════════════════════════ */
.tarefas-page-shell {
  width: 100%;
  max-width: 1680px;
  margin: 0 auto;
  padding: 20px clamp(14px, 2vw, 28px) calc(var(--bottom-nav-h, 72px) + env(safe-area-inset-bottom) + 28px);
}

.tarefas-page-shell .tarefas-page-header {
  margin-bottom: 16px;
}

.tarefas-page-shell .tarefas-search-row {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) auto auto;
  align-items: center;
  gap: 10px;
}

.tarefas-page-shell .task-board {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  align-items: stretch;
  overflow: visible;
  padding: 2px 2px 12px;
}

.tarefas-page-shell .task-board-column {
  min-width: 0;
  min-height: 340px;
  max-height: calc(100dvh - 310px);
  border-radius: 16px;
  background: color-mix(in srgb, var(--bg3) 88%, var(--bg2));
  box-shadow: 0 8px 24px rgba(15, 23, 42, .06);
  overflow: hidden;
}

.tarefas-page-shell .task-board-column-head {
  position: sticky;
  top: 0;
  z-index: 2;
  min-height: 48px;
  padding: 13px 14px;
  background: color-mix(in srgb, var(--bg2) 94%, transparent);
  backdrop-filter: blur(10px);
}

.tarefas-page-shell .task-board-column-body {
  flex: 1 1 auto;
  min-height: 0;
  gap: 12px;
  padding: 12px;
  overscroll-behavior: contain;
}

.tarefas-page-shell .task-board-card {
  min-height: 132px;
  padding: 13px;
  border-radius: 14px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
  outline: none;
}

.tarefas-page-shell .task-board-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(15, 23, 42, .10);
}

.tarefas-page-shell .task-board-card:focus-visible {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-dim), 0 10px 24px rgba(15, 23, 42, .10);
}

.tarefas-page-shell .task-board-card-title {
  font-size: 14px;
  line-height: 1.4;
}

.tarefas-page-shell .task-board-card-foot {
  margin-top: auto;
}

@media (min-width: 1500px) {
  .tarefas-page-shell .task-board {
    grid-template-columns: repeat(4, minmax(250px, 1fr));
  }
}

@media (min-width: 701px) and (max-width: 1499px) {
  .tarefas-page-shell {
    max-width: 1180px;
  }

  .tarefas-page-shell .task-board {
    grid-template-columns: repeat(2, minmax(280px, 1fr));
  }

  .tarefas-page-shell .task-board-column {
    max-height: none;
  }
}

@media (max-width: 700px) {
  .tarefas-page-shell {
    max-width: none;
    padding: 12px 12px calc(var(--bottom-nav-h, 72px) + env(safe-area-inset-bottom) + 20px);
  }

  .tarefas-page-shell .tarefas-page-header {
    align-items: flex-start;
    gap: 10px;
  }

  .tarefas-page-shell .tarefas-new-btn {
    min-height: 40px;
    padding-inline: 12px;
  }

  .tarefas-page-shell .tarefas-search-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .tarefas-page-shell .tarefas-view-toggle,
  .tarefas-page-shell .tarefas-filter-dropdown,
  .tarefas-page-shell .tarefas-filter-btn {
    width: 100%;
  }

  .tarefas-page-shell .tarefas-filter-panel {
    position: fixed;
    left: 12px;
    right: 12px;
    top: auto;
    bottom: calc(var(--bottom-nav-h, 72px) + env(safe-area-inset-bottom) + 12px);
    width: auto;
    max-width: none;
    max-height: min(70dvh, 560px);
    overflow-y: auto;
  }

  .tarefas-page-shell .task-board {
    display: grid;
    grid-template-columns: none;
    grid-auto-flow: column;
    grid-auto-columns: minmax(84vw, 320px);
    gap: 12px;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    scroll-padding-inline: 2px;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
    padding: 2px 2px 14px;
  }

  .tarefas-page-shell .task-board-column {
    scroll-snap-align: start;
    min-height: 360px;
    max-height: calc(100dvh - 300px);
  }

  .tarefas-page-shell .task-board-column-body {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .tarefas-page-shell .task-board-card {
    min-height: 126px;
  }
}

@media (max-width: 390px) {
  .tarefas-page-shell .task-board {
    grid-auto-columns: calc(100vw - 32px);
  }

  .tarefas-page-shell .task-board-card-foot {
    align-items: flex-start;
    flex-direction: column;
  }
}
`
  write(cssPath, css)
}

console.log('[task-visibility-patch] Visibilidade integral do checklist e quadro responsivo aplicados.')
