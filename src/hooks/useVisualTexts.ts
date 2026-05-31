// src/hooks/useVisualTexts.ts
// Textos visuais personalizáveis do Nexus.
// Altera somente nomes exibidos na interface, sem mudar rotas, APIs ou lógica.

import { useEffect, useMemo, useState } from 'react'

export const VISUAL_TEXTS_STORAGE_KEY = 'nexus_visual_texts'
export const VISUAL_TEXTS_EVENT = 'nexus_visual_texts_updated'

export const DEFAULT_VISUAL_TEXTS = {
  'app.name': 'NEXUS',
  'app.subtitle': 'GESTÃO',

  'nav.home': 'Início',
  'nav.team': 'Equipe',
  'nav.teams': 'Equipes',
  'nav.tasks': 'Tarefas',
  'nav.agenda': 'Agenda',
  'nav.finance': 'Financeiro',
  'nav.people': 'Pessoas',
  'nav.files': 'Arquivos',
  'nav.reports': 'Relatórios',
  'nav.users': 'Usuários',
  'nav.settings': 'Config.',

  'dashboard.greeting.morning': 'Bom dia',
  'dashboard.greeting.afternoon': 'Boa tarde',
  'dashboard.greeting.night': 'Boa noite',
  'dashboard.greeting.fallbackName': 'tudo bem',
  'dashboard.subtitle': 'Seu painel central junta tarefas, agenda e financeiro em uma visão mensal limpa.',
  'dashboard.primaryAction': 'Nova tarefa',
  'dashboard.secondaryAction': 'Financeiro',
  'dashboard.metrics.openTasks': 'Tarefas abertas',
  'dashboard.metrics.todayEvents': 'Compromissos hoje',
  'dashboard.metrics.todayFinance': 'Financeiro hoje',
  'dashboard.metrics.team': 'Equipe',
  'dashboard.filters.title': 'Filtros do painel',
  'dashboard.filters.description': 'Controle a visão mensal por tipo de informação, status e busca.',
  'dashboard.filters.clear': 'Limpar filtros',
  'dashboard.organization.title': 'Organização do mês',
  'dashboard.organization.description': 'Tarefas, compromissos e pagamentos organizados por data.',
  'dashboard.calendar.title': 'Calendário do mês',
  'dashboard.calendar.description': 'Tarefas com status, compromissos e financeiro por dia, respeitando os filtros acima.',
  'dashboard.finance.title': 'Resumo financeiro',

  'tasks.pageTitle': 'Tarefas',
  'tasks.newButton': 'Nova tarefa',
  'tasks.tabs.personal': 'Pessoais',
  'tasks.tabs.team': 'Equipe',
  'tasks.tabs.recent': 'Últimas',
  'tasks.tabs.all': 'Todas',
  'tasks.filters.title': 'Filtros dinâmicos',
  'tasks.filters.clear': 'Limpar filtros',
  'tasks.search.placeholder': 'Buscar tarefa, membro...',

  'finance.pageTitle': 'Financeiro',
  'agenda.pageTitle': 'Agenda',
  'people.pageTitle': 'Contatos',
  'people.pageSubtitle': 'Pessoas, clientes, fornecedores e membros',
  'settings.pageTitle': '⚙️ Configurações',
  'settings.visualTitle': 'Visual do sistema',
  'settings.visualButton': 'Editar layout, tema, textos e fontes',
  'settings.backupTitle': 'Backup do sistema',
  'settings.backupButton': 'Baixar backup completo',
  'settings.downloadsTitle': 'Downloads',
} as const

export type VisualTextKey = keyof typeof DEFAULT_VISUAL_TEXTS
export type VisualTexts = Record<VisualTextKey, string>

export function loadVisualTexts(): VisualTexts {
  try {
    const raw = localStorage.getItem(VISUAL_TEXTS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_VISUAL_TEXTS }
    return { ...DEFAULT_VISUAL_TEXTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_VISUAL_TEXTS }
  }
}

export function saveVisualTexts(texts: Partial<VisualTexts>): VisualTexts {
  const merged = { ...DEFAULT_VISUAL_TEXTS, ...texts }
  localStorage.setItem(VISUAL_TEXTS_STORAGE_KEY, JSON.stringify(merged))
  window.dispatchEvent(new CustomEvent(VISUAL_TEXTS_EVENT, { detail: merged }))
  return merged
}

export function setVisualText(key: VisualTextKey, value: string): VisualTexts {
  const current = loadVisualTexts()
  const clean = String(value ?? '').trim()
  return saveVisualTexts({ ...current, [key]: clean || DEFAULT_VISUAL_TEXTS[key] })
}

export function resetVisualTexts(): VisualTexts {
  localStorage.removeItem(VISUAL_TEXTS_STORAGE_KEY)
  const defaults = { ...DEFAULT_VISUAL_TEXTS }
  window.dispatchEvent(new CustomEvent(VISUAL_TEXTS_EVENT, { detail: defaults }))
  return defaults
}

export function getVisualText(key: VisualTextKey): string {
  return loadVisualTexts()[key] || DEFAULT_VISUAL_TEXTS[key]
}

export function useVisualTexts() {
  const [texts, setTexts] = useState<VisualTexts>(() => loadVisualTexts())

  useEffect(() => {
    function refresh(event?: Event) {
      const custom = event as CustomEvent<VisualTexts>
      setTexts(custom?.detail || loadVisualTexts())
    }
    window.addEventListener(VISUAL_TEXTS_EVENT, refresh as EventListener)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(VISUAL_TEXTS_EVENT, refresh as EventListener)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  return useMemo(() => ({
    texts,
    t: (key: VisualTextKey) => texts[key] || DEFAULT_VISUAL_TEXTS[key],
  }), [texts])
}

export const VISUAL_TEXT_GROUPS: { title: string; description: string; keys: VisualTextKey[] }[] = [
  {
    title: 'Sistema e menu',
    description: 'Nome do sistema e nomes que aparecem na navegação.',
    keys: ['app.name', 'app.subtitle', 'nav.home', 'nav.team', 'nav.teams', 'nav.tasks', 'nav.agenda', 'nav.finance', 'nav.people', 'nav.files', 'nav.reports', 'nav.users', 'nav.settings'],
  },
  {
    title: 'Página inicial',
    description: 'Saudação, ações principais e nomes do painel inicial.',
    keys: ['dashboard.greeting.morning', 'dashboard.greeting.afternoon', 'dashboard.greeting.night', 'dashboard.greeting.fallbackName', 'dashboard.subtitle', 'dashboard.primaryAction', 'dashboard.secondaryAction', 'dashboard.metrics.openTasks', 'dashboard.metrics.todayEvents', 'dashboard.metrics.todayFinance', 'dashboard.metrics.team', 'dashboard.filters.title', 'dashboard.filters.description', 'dashboard.filters.clear', 'dashboard.organization.title', 'dashboard.organization.description', 'dashboard.calendar.title', 'dashboard.calendar.description', 'dashboard.finance.title'],
  },
  {
    title: 'Tarefas',
    description: 'Títulos, abas e botões visuais da tela de tarefas.',
    keys: ['tasks.pageTitle', 'tasks.newButton', 'tasks.tabs.personal', 'tasks.tabs.team', 'tasks.tabs.recent', 'tasks.tabs.all', 'tasks.filters.title', 'tasks.filters.clear', 'tasks.search.placeholder'],
  },
  {
    title: 'Outras páginas',
    description: 'Títulos principais de páginas e seções de configuração.',
    keys: ['finance.pageTitle', 'agenda.pageTitle', 'people.pageTitle', 'people.pageSubtitle', 'settings.pageTitle', 'settings.visualTitle', 'settings.visualButton', 'settings.backupTitle', 'settings.backupButton', 'settings.downloadsTitle'],
  },
]
