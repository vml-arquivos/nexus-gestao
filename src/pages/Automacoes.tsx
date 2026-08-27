import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, Bell, Check, ChevronDown, GitBranch, Globe, ListPlus, Loader2, Pause, Play, Plus, Save, Trash2, UserRound, UsersRound, X } from 'lucide-react'
import { automacoesApi, type AutomacaoAcao, type AutomacaoAcaoTipo, type AutomacaoAuditoria, type AutomacaoCampo, type AutomacaoCondicao, type AutomacaoEquipe, type AutomacaoGatilho, type AutomacaoOperador, type AutomacaoPessoa, type AutomacaoRegra } from '../lib/api'

type RuleForm = {
  name: string
  description: string
  trigger_type: AutomacaoGatilho
  conditions: { mode: 'AND' | 'OR'; items: AutomacaoCondicao[] }
  actions: AutomacaoAcao[]
  active: boolean
}

const TRIGGER_LABELS: Record<AutomacaoGatilho, string> = {
  tarefa_criada: 'Tarefa criada',
  status_alterado: 'Status alterado',
  prazo_vencendo: 'Prazo vence ou está atrasado',
  checklist_concluido: 'Item de checklist concluído',
}
const FIELD_LABELS: Record<AutomacaoCampo, string> = {
  titulo: 'Título da tarefa',
  status: 'Status atual',
  prioridade: 'Prioridade',
  responsavel_id: 'Responsável (ID)',
  projeto_grupo_id: 'Projeto (ID)',
  status_anterior: 'Status anterior',
  status_novo: 'Novo status',
  checklist_item_texto: 'Texto do item concluído',
}
const OPERATOR_LABELS: Record<AutomacaoOperador, string> = {
  igual: 'é igual a',
  diferente: 'é diferente de',
  contem: 'contém',
  vazio: 'está vazio',
  nao_vazio: 'não está vazio',
}
const ACTION_LABELS: Record<AutomacaoAcaoTipo, string> = {
  notificar_pessoa: 'Notificar uma pessoa',
  notificar_equipe: 'Notificar uma equipe',
  mover_status: 'Mover status',
  adicionar_checklist: 'Adicionar item ao checklist',
  webhook: 'Enviar webhook',
}
const STATUS_OPTIONS = ['pendente', 'em_progresso', 'cancelada']

function emptyForm(): RuleForm {
  return {
    name: '',
    description: '',
    trigger_type: 'tarefa_criada',
    conditions: { mode: 'AND', items: [] },
    actions: [{ type: 'notificar_pessoa' }],
    active: true,
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function resultTone(value: string) {
  if (value === 'sucesso') return 'text-emerald-300'
  if (value === 'falha') return 'text-red-300'
  return 'text-amber-300'
}

function describeAudit(item: AutomacaoAuditoria) {
  const detail = item.detalhe || {}
  const name = String(detail.regra_nome || detail.regra_id || 'regra')
  const task = String(detail.tarefa_id || '')
  const actions = Array.isArray(detail.acoes) ? detail.acoes.join(', ') : ''
  return [name, task ? `tarefa ${task.slice(0, 8)}` : '', actions].filter(Boolean).join(' · ')
}

function ConditionRow({ condition, onChange, onRemove }: { condition: AutomacaoCondicao; onChange: (next: AutomacaoCondicao) => void; onRemove: () => void }) {
  const needsValue = !['vazio', 'nao_vazio'].includes(condition.operator)
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/10 p-3 md:flex-row md:items-center">
      <select className="nexus-input md:flex-1" value={condition.field} onChange={e => onChange({ ...condition, field: e.target.value as AutomacaoCampo })} aria-label="Campo da condição">
        {Object.entries(FIELD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <select className="nexus-input md:w-44" value={condition.operator} onChange={e => onChange({ ...condition, operator: e.target.value as AutomacaoOperador })} aria-label="Operador da condição">
        {Object.entries(OPERATOR_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      {needsValue && <input className="nexus-input md:flex-1" value={condition.value || ''} onChange={e => onChange({ ...condition, value: e.target.value })} placeholder="Valor" aria-label="Valor da condição" />}
      <button className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-red-300" type="button" onClick={onRemove} title="Remover condição" aria-label="Remover condição"><X size={16} /></button>
    </div>
  )
}

function ActionRow({ action, pessoas, equipes, onChange, onRemove }: { action: AutomacaoAcao; pessoas: AutomacaoPessoa[]; equipes: AutomacaoEquipe[]; onChange: (next: AutomacaoAcao) => void; onRemove: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/10 p-3 md:flex-row md:items-center">
      <select className="nexus-input md:w-64" value={action.type} onChange={e => onChange({ type: e.target.value as AutomacaoAcaoTipo })} aria-label="Tipo da ação">
        {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      {action.type === 'notificar_pessoa' && (
        <select className="nexus-input md:flex-1" value={action.user_id || ''} onChange={e => onChange({ ...action, user_id: e.target.value })} aria-label="Pessoa destinatária">
          <option value="">Selecione uma pessoa</option>
          {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome} · {p.email}</option>)}
        </select>
      )}
      {action.type === 'notificar_equipe' && (
        <select className="nexus-input md:flex-1" value={action.equipe_id || ''} onChange={e => onChange({ ...action, equipe_id: e.target.value })} aria-label="Equipe destinatária">
          <option value="">Selecione uma equipe</option>
          {equipes.map(equipe => <option key={equipe.id} value={equipe.id}>{equipe.nome} · {equipe.members_count} membro(s)</option>)}
        </select>
      )}
      {action.type === 'mover_status' && (
        <select className="nexus-input md:flex-1" value={action.status || ''} onChange={e => onChange({ ...action, status: e.target.value })} aria-label="Novo status">
          <option value="">Selecione o status</option>
          {STATUS_OPTIONS.map(status => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
        </select>
      )}
      {action.type === 'adicionar_checklist' && <input className="nexus-input md:flex-1" value={action.texto || ''} onChange={e => onChange({ ...action, texto: e.target.value })} placeholder="Ex.: Conferir documento" aria-label="Texto do novo item" />}
      {action.type === 'webhook' && <input className="nexus-input md:flex-1" value={action.url || ''} onChange={e => onChange({ ...action, url: e.target.value })} placeholder="https://exemplo.com/webhook" aria-label="URL do webhook" inputMode="url" />}
      <button className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-red-300" type="button" onClick={onRemove} title="Remover ação" aria-label="Remover ação"><X size={16} /></button>
    </div>
  )
}

export default function Automacoes() {
  const [rules, setRules] = useState<AutomacaoRegra[]>([])
  const [audit, setAudit] = useState<AutomacaoAuditoria[]>([])
  const [pessoas, setPessoas] = useState<AutomacaoPessoa[]>([])
  const [equipes, setEquipes] = useState<AutomacaoEquipe[]>([])
  const [form, setForm] = useState<RuleForm>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [nextRules, nextAudit, catalog] = await Promise.all([automacoesApi.list(), automacoesApi.auditoria(50), automacoesApi.catalogo()])
      setRules(nextRules)
      setAudit(nextAudit)
      setPessoas(catalog.pessoas || [])
      setEquipes(catalog.equipes || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as automações.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const activeCount = useMemo(() => rules.filter(rule => rule.active).length, [rules])

  function editRule(rule: AutomacaoRegra) {
    setEditingId(rule.id)
    setForm({ name: rule.name, description: rule.description || '', trigger_type: rule.trigger_type, conditions: rule.conditions || { mode: 'AND', items: [] }, actions: rule.actions || [], active: rule.active })
    setNotice('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetForm() {
    setEditingId(null)
    setForm(emptyForm())
    setNotice('')
  }

  function updateCondition(index: number, next: AutomacaoCondicao) {
    setForm(current => ({ ...current, conditions: { ...current.conditions, items: current.conditions.items.map((item, itemIndex) => itemIndex === index ? next : item) } }))
  }

  function updateAction(index: number, next: AutomacaoAcao) {
    setForm(current => ({ ...current, actions: current.actions.map((item, itemIndex) => itemIndex === index ? next : item) }))
  }

  async function saveRule(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const payload = { ...form, name: form.name.trim(), description: form.description.trim(), conditions: { mode: form.conditions.mode, items: form.conditions.items.filter(item => ['vazio', 'nao_vazio'].includes(item.operator) || String(item.value || '').trim()) } }
      if (!payload.name) throw new Error('Informe um nome para a regra.')
      if (!payload.actions.length) throw new Error('Informe ao menos uma ação.')
      if (editingId) await automacoesApi.update(editingId, payload)
      else await automacoesApi.create(payload)
      await load()
      setNotice(editingId ? 'Regra atualizada.' : 'Regra criada e pronta para uso.')
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a regra.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleRule(rule: AutomacaoRegra) {
    setError('')
    try {
      await automacoesApi.update(rule.id, { active: !rule.active })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar a regra.')
    }
  }

  async function deactivateRule(rule: AutomacaoRegra) {
    if (!window.confirm(`Desativar a regra “${rule.name}”? O histórico será preservado.`)) return
    setError('')
    try {
      await automacoesApi.deactivate(rule.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível desativar a regra.')
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-300"><GitBranch size={15} /> Automação configurável</div>
            <h1 className="text-2xl font-black text-white md:text-3xl">Regras que acompanham o trabalho</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">Crie gatilhos sobre tarefas e checklists. Cada ação passa pelo outbox do Nexus, fica auditável e pode ser pausada sem apagar o histórico.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:w-64">
            <div className="nexus-card p-3"><div className="text-xs text-white/50">Regras ativas</div><div className="mt-1 text-2xl font-black text-emerald-300">{activeCount}</div></div>
            <div className="nexus-card p-3"><div className="text-xs text-white/50">Execuções recentes</div><div className="mt-1 text-2xl font-black text-violet-300">{audit.length}</div></div>
          </div>
        </header>

        {error && <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div>}
        {notice && <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
          <section className="nexus-card p-4 md:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div><h2 className="flex items-center gap-2 text-lg font-bold text-white"><Activity size={18} className="text-violet-300" /> Regras da organização</h2><p className="mt-1 text-xs text-white/50">Gestores veem a organização; cada usuário também pode manter suas próprias regras.</p></div>
              <button className="nexus-btn-primary" type="button" onClick={resetForm}><Plus size={16} /> Nova regra</button>
            </div>
            {loading ? <div className="flex items-center gap-2 py-12 text-sm text-white/60"><Loader2 size={18} className="animate-spin" /> Carregando regras…</div> : rules.length === 0 ? <div className="rounded-xl border border-dashed border-white/15 px-5 py-12 text-center text-sm text-white/55">Nenhuma regra configurada. Comece com uma notificação de prazo ou de nova tarefa.</div> : <div className="space-y-3">{rules.map(rule => <article key={rule.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-violet-300/30"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-white">{rule.name}</h3><span className={`nexus-badge ${rule.active ? 'nexus-badge-green' : 'nexus-badge-gold'}`}>{rule.active ? 'ativa' : 'pausada'}</span></div><p className="mt-1 text-sm text-white/60">{rule.description || 'Sem descrição'}</p><div className="mt-3 flex flex-wrap gap-2 text-xs text-white/55"><span className="rounded-full bg-violet-300/10 px-2 py-1 text-violet-200">Quando: {TRIGGER_LABELS[rule.trigger_type]}</span><span className="rounded-full bg-white/5 px-2 py-1">{rule.conditions?.items?.length || 0} condição(ões)</span><span className="rounded-full bg-white/5 px-2 py-1">{rule.actions?.length || 0} ação(ões)</span></div></div><div className="flex shrink-0 items-center gap-1"><button className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white" type="button" onClick={() => editRule(rule)} title="Editar regra"><ChevronDown size={16} className="rotate-[-90deg]" /></button><button className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-emerald-300" type="button" onClick={() => void toggleRule(rule)} title={rule.active ? 'Pausar regra' : 'Ativar regra'}>{rule.active ? <Pause size={16} /> : <Play size={16} />}</button><button className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-red-300" type="button" onClick={() => void deactivateRule(rule)} title="Desativar e preservar histórico"><Trash2 size={16} /></button></div></div></article>)}</div>}
          </section>

          <form className="nexus-card p-4 md:p-6" onSubmit={saveRule}>
            <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-white">{editingId ? 'Editar regra' : 'Nova regra'}</h2><p className="mt-1 text-xs text-white/50">A regra só roda quando estiver ativa e as condições forem satisfeitas.</p></div>{editingId && <button className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white" type="button" onClick={resetForm} title="Cancelar edição"><X size={17} /></button>}</div>
            <div className="space-y-4">
              <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">Nome</span><input className="nexus-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Avisar gestor quando uma tarefa atrasar" maxLength={120} required /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">Descrição</span><textarea className="nexus-input min-h-20 resize-y" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Explique o objetivo da regra" maxLength={500} /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55">Gatilho</span><select className="nexus-input" value={form.trigger_type} onChange={e => setForm({ ...form, trigger_type: e.target.value as AutomacaoGatilho })}>{Object.entries(TRIGGER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <div><div className="mb-2 flex items-center justify-between gap-2"><div><span className="text-xs font-semibold uppercase tracking-wide text-white/55">Condições opcionais</span><p className="mt-1 text-xs text-white/40">Sem condições, toda ocorrência do gatilho é elegível.</p></div>{form.conditions.items.length > 1 && <select className="nexus-input w-auto py-2 text-xs" value={form.conditions.mode} onChange={e => setForm({ ...form, conditions: { ...form.conditions, mode: e.target.value as 'AND' | 'OR' } })}><option value="AND">Todas (AND)</option><option value="OR">Qualquer (OR)</option></select>}</div><div className="space-y-2">{form.conditions.items.map((condition, index) => <ConditionRow key={`${index}-${condition.field}`} condition={condition} onChange={next => updateCondition(index, next)} onRemove={() => setForm(current => ({ ...current, conditions: { ...current.conditions, items: current.conditions.items.filter((_, itemIndex) => itemIndex !== index) } }))} />)}</div><button className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-300/10" type="button" onClick={() => setForm(current => ({ ...current, conditions: { ...current.conditions, items: [...current.conditions.items, { field: 'titulo', operator: 'contem', value: '' }] } }))}><Plus size={14} /> Adicionar condição</button></div>
              <div><div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-white/55">Ações</span><span className="text-xs text-white/40">Executadas com idempotência</span></div><div className="space-y-2">{form.actions.map((action, index) => <ActionRow key={`${index}-${action.type}`} action={action} pessoas={pessoas} equipes={equipes} onChange={next => updateAction(index, next)} onRemove={() => setForm(current => ({ ...current, actions: current.actions.filter((_, itemIndex) => itemIndex !== index) }))} />)}</div><button className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-300/10" type="button" onClick={() => setForm(current => ({ ...current, actions: [...current.actions, { type: 'notificar_pessoa' }] }))}><Plus size={14} /> Adicionar ação</button></div>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"><input className="h-4 w-4 accent-violet-400" type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /><span><span className="block text-sm font-semibold text-white">Regra ativa</span><span className="block text-xs text-white/50">Pode ser pausada a qualquer momento sem apagar auditoria.</span></span></label>
              <div className="flex flex-wrap gap-2 pt-1"><button className="nexus-btn-primary" type="submit" disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar regra'}</button>{editingId && <button className="nexus-btn-ghost" type="button" onClick={resetForm}>Cancelar</button>}</div>
            </div>
          </form>
        </div>

        <section className="nexus-card p-4 md:p-6"><div className="mb-4 flex items-center gap-2"><Bell size={18} className="text-amber-300" /><div><h2 className="text-lg font-bold text-white">Auditoria das regras</h2><p className="text-xs text-white/50">O que rodou, quando e com qual resultado. O histórico não é apagado ao pausar ou desativar uma regra.</p></div></div>{audit.length === 0 ? <div className="rounded-xl border border-dashed border-white/15 px-5 py-8 text-center text-sm text-white/55">Ainda não houve execução registrada.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/45"><th className="px-3 py-2">Quando</th><th className="px-3 py-2">Resultado</th><th className="px-3 py-2">Detalhe</th><th className="px-3 py-2">Tempo</th></tr></thead><tbody>{audit.map(item => <tr key={item.id} className="border-b border-white/5 last:border-0"><td className="px-3 py-3 text-white/60">{formatDate(item.executado_em)}</td><td className={`px-3 py-3 font-semibold ${resultTone(item.resultado)}`}>{item.resultado}</td><td className="max-w-xl px-3 py-3 text-white/65">{describeAudit(item)}{item.erro && <span className="mt-1 block text-xs text-red-300">{item.erro}</span>}</td><td className="px-3 py-3 text-white/50">{item.tempo_ms ?? '—'} ms</td></tr>)}</tbody></table></div>}</section>

        <div className="grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-violet-300/15 bg-violet-300/[0.06] p-4"><div className="mb-2 flex items-center gap-2 text-violet-200"><GitBranch size={16} /> Eventos</div><p className="text-xs leading-5 text-white/55">Tarefa criada, status alterado, prazo vencendo e item concluído compartilham o outbox do Nexus.</p></div><div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] p-4"><div className="mb-2 flex items-center gap-2 text-emerald-200"><Check size={16} /> Segurança</div><p className="text-xs leading-5 text-white/55">As regras são isoladas por organização, ações são validadas e checklists acima de 1 MB continuam protegidos.</p></div><div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.06] p-4"><div className="mb-2 flex items-center gap-2 text-amber-200"><Globe size={16} /> Webhook</div><p className="text-xs leading-5 text-white/55">Webhooks usam POST HTTP/HTTPS com timeout curto e entram no mesmo fluxo auditável de retry.</p></div></div>
      </div>
    </div>
  )
}
