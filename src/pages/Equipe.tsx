import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, X, Loader, Search, Mail, Phone, Trash2, Edit2,
  UserPlus, Check, Mic, MicOff, ChevronLeft, ChevronRight,
  Calendar, Send, CheckCircle2, Clock, Crown, Users,
  Briefcase, BarChart2
} from 'lucide-react'
import { equipeApi, tarefasApi, auth, type Pessoa, type MembroEquipe, type Tarefa } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { nanoid } from '../lib/utils'

// ── Toast ──────────────────────────────────────────────────────────────────────
function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:88px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;padding:10px 22px;border-radius:12px;font-size:14px;font-weight:700;z-index:9999;box-shadow:0 4px 24px rgba(0,0,0,0.35);`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3200)
}

// ── useSpeechToText ────────────────────────────────────────────────────────────
function useSpeechToText(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const recRef = useRef<any>(null)
  function toggle() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Use Chrome ou Edge para reconhecimento de voz.'); return }
    if (listening && recRef.current) { recRef.current.stop(); setListening(false); return }
    const rec = new SR(); rec.lang = 'pt-BR'; rec.interimResults = false; rec.maxAlternatives = 1
    rec.onresult = (e: any) => { onResult(e.results[0][0].transcript); }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    rec.start(); recRef.current = rec; setListening(true)
  }
  return { listening, toggle }
}

// ── MicButton ─────────────────────────────────────────────────────────────────
function MicButton({ onResult, style }: { onResult: (t: string) => void; style?: React.CSSProperties }) {
  const { listening, toggle } = useSpeechToText(onResult)
  return (
    <button type="button" onClick={toggle} title={listening ? 'Parar' : 'Falar'} style={{
      width: 34, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0,
      background: listening ? 'rgba(239,68,68,0.18)' : 'rgba(108,59,255,0.15)',
      color: listening ? '#EF4444' : 'var(--primary-light)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: listening ? 'micPulse 1s infinite' : 'none', ...style
    }}>
      {listening ? <MicOff size={15} /> : <Mic size={15} />}
    </button>
  )
}

// ── Mini Calendar ──────────────────────────────────────────────────────────────
const DIAS = ['D','S','T','Q','Q','S','S']
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function MiniCalendar({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const today = new Date()
  const [cal, setCal] = useState(() => value ? new Date(value + 'T12:00') : today)

  const y = cal.getFullYear(), m = cal.getMonth()
  const firstDay = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()

  function fmt(d: number) {
    return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  }

  function prevMonth() { const d = new Date(y, m - 1, 1); setCal(d) }
  function nextMonth() { const d = new Date(y, m + 1, 1); setCal(d) }

  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 14, padding: '10px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '0 4px' }}>
        <button type="button" onClick={prevMonth} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4, borderRadius: 6 }}><ChevronLeft size={16} /></button>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{MESES[m]} {y}</span>
        <button type="button" onClick={nextMonth} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4, borderRadius: 6 }}><ChevronRight size={16} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {DIAS.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'var(--text3)', padding: '3px 0' }}>{d}</div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
          const ds = fmt(d)
          const isToday = ds === today.toISOString().slice(0, 10)
          const isSel = ds === value
          return (
            <button
              key={d}
              type="button"
              onClick={() => onChange(ds)}
              style={{
                width: '100%', aspectRatio: '1', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: isSel ? 800 : 500,
                background: isSel ? 'var(--primary-light)' : isToday ? 'rgba(108,59,255,0.2)' : 'transparent',
                color: isSel ? '#fff' : isToday ? 'var(--primary-light)' : 'var(--text2)',
                outline: isSel ? '2px solid var(--primary-light)' : 'none',
              }}
            >{d}</button>
          )
        })}
      </div>
    </div>
  )
}

// ── ModalNovaTarefa (específico p/ membro) ────────────────────────────────────
function ModalTarefaMembro({
  membro, onClose, onSaved
}: { membro: MembroEquipe; onClose: () => void; onSaved: () => void }) {
  const [titulo, setTitulo]       = useState('')
  const [descricao, setDescricao] = useState('')
  const [prazo, setPrazo]         = useState('')
  const [prioridade, setPrioridade] = useState<'baixa'|'media'|'alta'>('media')
  const [recorrencia, setRecorrencia] = useState<'nenhum'|'diario'|'semanal'|'mensal'>('nenhum')
  const [showCal, setShowCal]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [checklist, setChecklist] = useState<{id:string;texto:string;feito:boolean}[]>([])
  const [novoItem, setNovoItem]   = useState('')

  // Mic para título
  const { listening: micTit, toggle: toggleMicTit } = useSpeechToText(t => setTitulo(p => (p + ' ' + t).trim()))
  const { listening: micDesc, toggle: toggleMicDesc } = useSpeechToText(t => setDescricao(p => (p + ' ' + t).trim()))
  const { listening: micItem, toggle: toggleMicItem } = useSpeechToText(t => setNovoItem(p => (p + ' ' + t).trim()))

  function addItem() {
    if (!novoItem.trim()) return
    setChecklist(p => [...p, { id: nanoid(), texto: novoItem.trim(), feito: false }])
    setNovoItem('')
  }

  async function handleSave() {
    if (!titulo.trim()) { toast('Título é obrigatório', 'error'); return }
    setSaving(true)
    try {
      await tarefasApi.create({
        titulo: titulo.trim(),
        descricao: descricao || undefined,
        prazo: prazo || undefined,
        prioridade,
        responsavel_id: membro.id,
        checklist,
        obs: recorrencia !== 'nenhum' ? `Recorrência: ${recorrencia}` : undefined,
      })
      toast(`✅ Tarefa enviada para ${membro.nome}!`)
      // Reset form for another task
      setTitulo(''); setDescricao(''); setPrazo(''); setChecklist([]); setNovoItem(''); setRecorrencia('nenhum')
      onSaved()
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao criar tarefa', 'error') }
    finally { setSaving(false) }
  }

  const priColors = { baixa: '#10B981', media: '#F59E0B', alta: '#EF4444' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.70)', zIndex: 300, display: 'flex', alignItems: 'flex-end', backdropFilter: 'blur(6px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '22px 22px 0 0', padding: '0 0 24px', width: '100%', maxHeight: '92dvh', overflowY: 'auto', animation: 'slideUp 0.24s ease' }}>

        {/* Handle + Header */}
        <div style={{ position: 'sticky', top: 0, background: 'var(--bg2)', zIndex: 1, borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border2)', margin: '10px auto 14px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17, fontFamily: 'var(--font-heading)' }}>Nova Tarefa</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 18, height: 18, borderRadius: 6, background: 'linear-gradient(135deg,#6C3BFF,#06B6D4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff' }}>
                  {membro.nome.charAt(0).toUpperCase()}
                </div>
                Para: <strong style={{ color: 'var(--text)' }}>{membro.nome}</strong>
                <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: membro.role === 'gestor' ? 'rgba(108,59,255,0.15)' : 'rgba(6,182,212,0.12)', color: membro.role === 'gestor' ? 'var(--primary-light)' : 'var(--secondary)' }}>
                  {membro.role === 'gestor' ? 'Gestor' : 'Membro'}
                </span>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4 }}><X size={20} /></button>
          </div>
        </div>

        <div style={{ padding: '16px 18px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Título + Mic */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 6 }}>Título *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="form-input" placeholder="Descreva a tarefa..."
                value={titulo} onChange={e => setTitulo(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="button" onClick={toggleMicTit} title={micTit ? 'Parar' : 'Falar'} style={{
                width: 44, height: 44, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
                background: micTit ? 'rgba(239,68,68,0.18)' : 'rgba(108,59,255,0.15)',
                color: micTit ? '#EF4444' : 'var(--primary-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: micTit ? 'micPulse 1s infinite' : 'none',
              }}>
                {micTit ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
            </div>
          </div>

          {/* Prioridade */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 6 }}>Prioridade</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['baixa', 'media', 'alta'] as const).map(p => (
                <button key={p} type="button" onClick={() => setPrioridade(p)} style={{
                  flex: 1, padding: '8px 0', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  background: prioridade === p ? priColors[p] + '22' : 'var(--bg3)',
                  color: prioridade === p ? priColors[p] : 'var(--text3)',
                  outline: prioridade === p ? `2px solid ${priColors[p]}` : '2px solid transparent',
                  transition: 'all .15s',
                }}>
                  {p === 'alta' ? '🔴' : p === 'media' ? '🟡' : '🟢'} {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Prazo — calendário */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 6 }}>Prazo</label>
            <button type="button" onClick={() => setShowCal(!showCal)} style={{
              width: '100%', padding: '12px 14px', background: 'var(--bg3)', border: '1.5px solid var(--border2)', borderRadius: 12,
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: prazo ? 'var(--text)' : 'var(--text3)', fontSize: 14, fontWeight: prazo ? 600 : 400,
            }}>
              <Calendar size={16} color={prazo ? 'var(--primary-light)' : undefined} />
              {prazo ? new Date(prazo + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : 'Selecionar data…'}
              {prazo && <span onClick={e => { e.stopPropagation(); setPrazo(''); setShowCal(false) }} style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: 12 }}>✕ limpar</span>}
            </button>
            {showCal && (
              <div style={{ marginTop: 8 }}>
                <MiniCalendar value={prazo} onChange={d => { setPrazo(d); setShowCal(false) }} />
              </div>
            )}
          </div>

          {/* Recorrência */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 6 }}>Recorrência</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
              {([['nenhum','Uma vez'],['diario','Diário'],['semanal','Semanal'],['mensal','Mensal']] as const).map(([v, l]) => (
                <button key={v} type="button" onClick={() => setRecorrencia(v)} style={{
                  padding: '8px 4px', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                  background: recorrencia === v ? 'rgba(108,59,255,0.2)' : 'var(--bg3)',
                  color: recorrencia === v ? 'var(--primary-light)' : 'var(--text3)',
                  outline: recorrencia === v ? '2px solid var(--primary-light)' : '2px solid transparent',
                }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Descrição + Mic */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 6 }}>Descrição</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <textarea
                className="form-input" placeholder="Detalhes adicionais..." rows={2}
                value={descricao} onChange={e => setDescricao(e.target.value)}
                style={{ flex: 1, resize: 'vertical' }}
              />
              <button type="button" onClick={toggleMicDesc} style={{
                width: 44, height: 44, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0, marginTop: 0,
                background: micDesc ? 'rgba(239,68,68,0.18)' : 'rgba(108,59,255,0.15)',
                color: micDesc ? '#EF4444' : 'var(--primary-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: micDesc ? 'micPulse 1s infinite' : 'none',
              }}>
                {micDesc ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
            </div>
          </div>

          {/* Checklist */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 6 }}>Checklist</label>
            {checklist.map((item, i) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <CheckCircle2 size={14} color="var(--success)" />
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text2)' }}>{item.texto}</span>
                <button type="button" onClick={() => setChecklist(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 2 }}><X size={12} /></button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                className="form-input" placeholder="Adicionar item ao checklist..."
                value={novoItem} onChange={e => setNovoItem(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addItem()}
                style={{ flex: 1, padding: '9px 12px', fontSize: 13 }}
              />
              <button type="button" onClick={toggleMicItem} style={{
                width: 38, height: 38, borderRadius: 10, border: 'none', cursor: 'pointer',
                background: micItem ? 'rgba(239,68,68,0.18)' : 'rgba(108,59,255,0.15)',
                color: micItem ? '#EF4444' : 'var(--primary-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: micItem ? 'micPulse 1s infinite' : 'none',
              }}>
                {micItem ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
              <button type="button" onClick={addItem} style={{ width: 38, height: 38, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(16,185,129,0.15)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Ações */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4, paddingBottom: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 2, gap: 8 }}>
              {saving
                ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Enviando…</>
                : <><Send size={14} /> Enviar Tarefa</>}
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: -8 }}>
            Após enviar, você pode adicionar mais tarefas para {membro.nome.split(' ')[0]}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── PanelMembro: detalhe de um membro ─────────────────────────────────────────
function PanelMembro({ membro, onClose, onNewTask }: {
  membro: MembroEquipe
  onClose: () => void
  onNewTask: () => void
}) {
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    tarefasApi.list({ responsavel_id: membro.id })
      .then(setTarefas)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [membro.id])

  const pendentes  = tarefas.filter(t => t.status === 'pendente' || t.status === 'em_progresso')
  const concluidas = tarefas.filter(t => t.status === 'concluida')
  const pct = tarefas.length ? Math.round(concluidas.length / tarefas.length * 100) : 0

  function fmtDate(d?: string) {
    if (!d) return ''
    const dt = new Date(String(d).slice(0, 10) + 'T12:00')
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.70)', zIndex: 250, display: 'flex', alignItems: 'flex-end', backdropFilter: 'blur(6px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '22px 22px 0 0', width: '100%', maxHeight: '88dvh', overflowY: 'auto', animation: 'slideUp 0.24s ease' }}>
        <div style={{ position: 'sticky', top: 0, background: 'var(--bg2)', zIndex: 1, borderBottom: '1px solid var(--border)', padding: '12px 18px 14px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border2)', margin: '0 auto 14px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: membro.role === 'gestor' ? 'linear-gradient(135deg,#6C3BFF,#9B59B6)' : 'linear-gradient(135deg,#06B6D4,#0EA5E9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-heading)', flexShrink: 0 }}>
              {membro.nome.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 17, fontFamily: 'var(--font-heading)', color: 'var(--text)' }}>{membro.nome}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: membro.role === 'gestor' ? 'var(--primary-light)' : 'var(--secondary)', background: membro.role === 'gestor' ? 'rgba(108,59,255,0.15)' : 'rgba(6,182,212,0.12)', padding: '2px 8px', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 3 }}>
                  {membro.role === 'gestor' ? <Crown size={9} /> : null}
                  {membro.role === 'gestor' ? 'Gestor' : 'Membro'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Mail size={10} /> {membro.email}
                </span>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
          </div>
        </div>

        <div style={{ padding: '16px 18px' }}>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
            {[
              { label: 'Total', value: tarefas.length, color: 'var(--text)' },
              { label: 'Pendentes', value: pendentes.length, color: '#F59E0B' },
              { label: 'Concluídas', value: concluidas.length, color: '#10B981' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--bg3)', borderRadius: 12, padding: '12px 10px', textAlign: 'center', border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 800, fontSize: 22, color: s.color, fontFamily: 'var(--font-heading)', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Progress */}
          {tarefas.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: 'var(--text3)', fontWeight: 600 }}>Progresso geral</span>
                <span style={{ color: 'var(--primary-light)', fontWeight: 700 }}>{pct}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${pct}%`, background: 'linear-gradient(90deg,#6C3BFF,#06B6D4)', transition: 'width .5s' }} />
              </div>
            </div>
          )}

          {/* CTA */}
          <button className="btn btn-primary" onClick={onNewTask} style={{ width: '100%', marginBottom: 20, gap: 8 }}>
            <Plus size={16} /> Enviar Nova Tarefa para {membro.nome.split(' ')[0]}
          </button>

          {/* Tarefas pendentes */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--text3)' }}>
              <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : pendentes.length > 0 ? (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
                Tarefas pendentes ({pendentes.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pendentes.map(t => (
                  <div key={t.id} style={{ background: 'var(--bg3)', borderRadius: 12, padding: '11px 14px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Clock size={14} color={t.prioridade === 'alta' ? '#EF4444' : t.prioridade === 'media' ? '#F59E0B' : '#10B981'} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.titulo}</div>
                      {t.prazo && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Prazo: {fmtDate(t.prazo)}</div>}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: { baixa: 'rgba(16,185,129,0.12)', media: 'rgba(245,158,11,0.12)', alta: 'rgba(239,68,68,0.12)' }[t.prioridade], color: { baixa: '#10B981', media: '#F59E0B', alta: '#EF4444' }[t.prioridade] }}>
                      {t.prioridade}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 20px', color: 'var(--text3)' }}>
              <CheckCircle2 size={36} style={{ marginBottom: 8, opacity: .4 }} />
              <div style={{ fontSize: 13, fontWeight: 600 }}>Nenhuma tarefa pendente 🎉</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Modal cadastrar pessoa (com mic) ──────────────────────────────────────────
const TIPO_CONFIG = {
  funcionario: { label: 'Funcionário', color: '#6C3BFF', emoji: '👔' },
  prestador:   { label: 'Prestador',   color: '#06B6D4', emoji: '🔧' },
  credor:      { label: 'Credor',      color: '#EF4444', emoji: '💸' },
  devedor:     { label: 'Devedor',     color: '#F59E0B', emoji: '💰' },
  cliente:     { label: 'Cliente',     color: '#10B981', emoji: '🤝' },
}

function PessoaModal({ initial, onSave, onClose }: {
  initial?: Pessoa; onSave: (p: Pessoa) => void; onClose: () => void
}) {
  const [nome, setNome]     = useState(initial?.nome || '')
  const [tipo, setTipo]     = useState<keyof typeof TIPO_CONFIG>(initial?.tipo || 'funcionario')
  const [cargo, setCargo]   = useState(initial?.cargo || '')
  const [contato, setContato] = useState(initial?.contato || '')
  const [email, setEmail]   = useState(initial?.email || '')
  const [valor, setValor]   = useState(initial?.valor ? String(initial.valor) : '')
  const [obs, setObs]       = useState(initial?.obs || '')
  const [saving, setSaving] = useState(false)

  const { listening: micNome, toggle: toggleMicNome } = useSpeechToText(t => setNome(p => (p + ' ' + t).trim()))
  const { listening: micObs, toggle: toggleMicObs }   = useSpeechToText(t => setObs(p => (p + ' ' + t).trim()))

  async function handleSave() {
    if (!nome.trim()) { toast('Nome é obrigatório', 'error'); return }
    setSaving(true)
    try {
      const payload = { nome: nome.trim(), tipo, cargo: cargo || undefined, contato: contato || undefined, email: email || undefined, valor: valor ? parseFloat(valor) : undefined, obs: obs || undefined }
      const p = initial?.id ? await equipeApi.updatePessoa(initial.id, payload) : await equipeApi.createPessoa(payload)
      onSave(p); toast(initial?.id ? 'Pessoa atualizada!' : 'Pessoa adicionada!')
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'flex-end', backdropFilter: 'blur(5px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '22px 22px 0 0', padding: '0 0 28px', width: '100%', maxHeight: '92dvh', overflowY: 'auto', animation: 'slideUp 0.22s ease' }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border2)', margin: '10px auto 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17 }}>{initial?.id ? 'Editar Pessoa' : 'Nova Pessoa'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 6 }}>Nome *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" placeholder="Nome completo" value={nome} onChange={e => setNome(e.target.value)} style={{ flex: 1 }} />
              <MicButton onResult={t => setNome(p => (p+' '+t).trim())} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 6 }}>Tipo</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              {(Object.entries(TIPO_CONFIG) as [keyof typeof TIPO_CONFIG, typeof TIPO_CONFIG[keyof typeof TIPO_CONFIG]][]).map(([k, v]) => (
                <button key={k} type="button" onClick={() => setTipo(k)} style={{ padding: '8px 4px', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 11, fontWeight: 700, background: tipo === k ? v.color + '20' : 'var(--bg3)', color: tipo === k ? v.color : 'var(--text3)', outline: tipo === k ? `2px solid ${v.color}` : '2px solid transparent', textAlign: 'center' }}>
                  <div style={{ fontSize: 16 }}>{v.emoji}</div>{v.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 6 }}>Cargo</label><input className="form-input" placeholder="Ex: Vendedor" value={cargo} onChange={e => setCargo(e.target.value)} /></div>
            <div><label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 6 }}>Telefone</label><input className="form-input" type="tel" placeholder="(11) 99999-9999" value={contato} onChange={e => setContato(e.target.value)} /></div>
          </div>
          <div><label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 6 }}>E-mail</label><input className="form-input" type="email" placeholder="email@exemplo.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
          {(tipo === 'credor' || tipo === 'devedor') && (<div><label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 6 }}>Valor (R$)</label><input className="form-input" type="number" step="0.01" placeholder="0,00" value={valor} onChange={e => setValor(e.target.value)} /></div>)}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 6 }}>Observações</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <textarea className="form-input" rows={2} value={obs} onChange={e => setObs(e.target.value)} style={{ flex: 1, resize: 'vertical' }} placeholder="Informações adicionais..." />
              <MicButton onResult={t => setObs(p => (p+' '+t).trim())} style={{ marginTop: 0 }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 2 }}>
              {saving ? 'Salvando...' : <><Check size={14} /> Salvar</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Modal convidar membro ──────────────────────────────────────────────────────
function ConviteModal({ onSave, onClose }: { onSave: () => void; onClose: () => void }) {
  const [nome, setNome]   = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!nome.trim() || !email.trim() || !senha) { toast('Preencha todos os campos', 'error'); return }
    if (senha.length < 6) { toast('Senha deve ter ao menos 6 caracteres', 'error'); return }
    setSaving(true)
    try {
      await auth.invite({ nome: nome.trim(), email: email.trim(), senha })
      onSave(); toast('Membro convidado com sucesso! 🎉')
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'flex-end', backdropFilter: 'blur(5px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '22px 22px 0 0', padding: '0 0 28px', width: '100%', maxHeight: '90dvh', overflowY: 'auto', animation: 'slideUp 0.22s ease' }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border2)', margin: '10px auto 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17 }}>Convidar Membro</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Cria uma conta de acesso ao sistema</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 6 }}>Nome *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" placeholder="Nome do membro" value={nome} onChange={e => setNome(e.target.value)} style={{ flex: 1 }} />
              <MicButton onResult={t => setNome(p => (p+' '+t).trim())} />
            </div>
          </div>
          <div><label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 6 }}>E-mail *</label><input className="form-input" type="email" placeholder="email@empresa.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div><label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 6 }}>Senha inicial *</label><input className="form-input" type="password" placeholder="Mínimo 6 caracteres" value={senha} onChange={e => setSenha(e.target.value)} /></div>
          <div style={{ padding: '10px 12px', background: 'rgba(108,59,255,0.08)', borderRadius: 10, borderLeft: '3px solid var(--primary-light)', fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
            💡 O membro acessa com este e-mail e senha. Compartilhe as credenciais com segurança.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 2, gap: 8 }}>
              {saving ? 'Convidando...' : <><UserPlus size={14} /> Convidar</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── EQUIPE PAGE ────────────────────────────────────────────────────────────────
export default function Equipe() {
  const { user } = useAuth()
  const isGestor = user?.role === 'gestor' || user?.role === 'sub_gestor'

  const [tab, setTab]               = useState<'membros'|'pessoas'>('membros')
  const [pessoas, setPessoas]       = useState<Pessoa[]>([])
  const [membros, setMembros]       = useState<MembroEquipe[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [modalPessoa, setModalPessoa]   = useState(false)
  const [editPessoa, setEditPessoa]     = useState<Pessoa | null>(null)
  const [conviteOpen, setConviteOpen]   = useState(false)
  const [panelMembro, setPanelMembro]   = useState<MembroEquipe | null>(null)
  const [tarefaTarget, setTarefaTarget] = useState<MembroEquipe | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ps, ms] = await Promise.all([equipeApi.pessoas(), equipeApi.membros()])
      setPessoas(ps); setMembros(ms)
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { const h = () => setModalPessoa(true); window.addEventListener('nexus:open-new', h); return () => window.removeEventListener('nexus:open-new', h) }, [])

  async function handleDeletePessoa(id: string) {
    if (!confirm('Excluir esta pessoa?')) return
    try { await equipeApi.removePessoa(id); setPessoas(p => p.filter(x => x.id !== id)); toast('Removida') }
    catch (e) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
  }

  const filtradas = pessoas.filter(p => {
    if (filtroTipo !== 'todos' && p.tipo !== filtroTipo) return false
    if (search) { const q = search.toLowerCase(); return p.nome.toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q) }
    return true
  })
  const filtroMembros = membros.filter(m => !search || m.nome.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ padding: '0 0 20px', maxWidth: 720, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 0' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22 }}>Equipe</h1>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>
            {membros.length} membro{membros.length !== 1 ? 's' : ''} · {pessoas.length} pessoa{pessoas.length !== 1 ? 's' : ''}
          </p>
        </div>
        {isGestor && (
          <div style={{ display: 'flex', gap: 8 }}>
            {tab === 'membros' && (
              <button className="btn btn-secondary" onClick={() => setConviteOpen(true)} style={{ gap: 6, fontSize: 13 }}>
                <UserPlus size={14} /> Convidar
              </button>
            )}
            {tab === 'pessoas' && (
              <button className="btn btn-primary" onClick={() => setModalPessoa(true)} style={{ gap: 6 }}>
                <Plus size={16} /> Pessoa
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '14px 20px 0' }}>
        <button onClick={() => setTab('membros')} className={tab === 'membros' ? 'tab active' : 'tab'} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={14} /> Membros da equipe ({membros.length})
        </button>
        <button onClick={() => setTab('pessoas')} className={tab === 'pessoas' ? 'tab active' : 'tab'} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Briefcase size={14} /> Pessoas ({pessoas.length})
        </button>
      </div>

      {/* Busca */}
      <div style={{ position: 'relative', margin: '12px 20px' }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
        <input className="form-input" style={{ paddingLeft: 34, paddingRight: 44 }} placeholder="Buscar por nome ou e-mail..." value={search} onChange={e => setSearch(e.target.value)} />
        <MicButton onResult={t => setSearch(t)} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }} />
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: 'var(--text3)' }}>
          <Loader size={22} style={{ animation: 'spin 1s linear infinite', marginRight: 10 }} /> Carregando...
        </div>
      ) : (

        <>
          {/* ABA MEMBROS */}
          {tab === 'membros' && (
            <div style={{ padding: '0 20px' }}>
              {filtroMembros.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
                  <Users size={48} style={{ marginBottom: 12, opacity: .4 }} />
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    {search ? 'Nenhum resultado' : 'Nenhum membro cadastrado'}
                  </div>
                  {!search && isGestor && (
                    <div style={{ fontSize: 13 }}>
                      Use <strong>Convidar</strong> para adicionar membros da equipe
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {filtroMembros.map(m => (
                    <div
                      key={m.id}
                      onClick={() => setPanelMembro(m)}
                      style={{
                        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16,
                        padding: '14px 16px', cursor: 'pointer', transition: 'border-color .15s, background .15s',
                        display: 'flex', alignItems: 'center', gap: 12,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(108,59,255,0.4)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                        background: m.role === 'gestor' ? 'linear-gradient(135deg,#6C3BFF,#9B59B6)' : 'linear-gradient(135deg,#06B6D4,#0EA5E9)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 17, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-heading)',
                      }}>
                        {m.nome.charAt(0).toUpperCase()}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{m.nome}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 3, color: m.role === 'gestor' ? 'var(--primary-light)' : 'var(--secondary)', background: m.role === 'gestor' ? 'rgba(108,59,255,0.15)' : 'rgba(6,182,212,0.12)' }}>
                            {m.role === 'gestor' && <Crown size={9} />}
                            {m.role === 'gestor' ? 'Gestor' : 'Membro'}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Mail size={10} /> {m.email}
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 5 }}>
                          <span style={{ fontSize: 11, color: '#F59E0B', fontWeight: 600 }}>⏳ {m.tarefas_pendentes} pendente{m.tarefas_pendentes !== 1 ? 's' : ''}</span>
                          <span style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>✅ {m.tarefas_concluidas} concluída{m.tarefas_concluidas !== 1 ? 's' : ''}</span>
                        </div>
                      </div>

                      {/* CTA */}
                      {isGestor && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setTarefaTarget(m) }}
                          title="Enviar tarefa"
                          style={{ width: 36, height: 36, borderRadius: 11, border: 'none', cursor: 'pointer', background: 'rgba(108,59,255,0.15)', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background .15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(108,59,255,0.3)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(108,59,255,0.15)')}
                        >
                          <Send size={15} />
                        </button>
                      )}

                      <div style={{ color: 'var(--text3)', flexShrink: 0 }}>
                        <ChevronRight size={16} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ABA PESSOAS */}
          {tab === 'pessoas' && (
            <div style={{ padding: '0 20px' }}>
              {/* Filtro tipo */}
              <div className="tabs" style={{ marginBottom: 12, overflowX: 'auto', display: 'flex', gap: 6, scrollbarWidth: 'none' }}>
                <button className={`tab ${filtroTipo === 'todos' ? 'active' : ''}`} onClick={() => setFiltroTipo('todos')}>Todos</button>
                {Object.entries(TIPO_CONFIG).map(([k, v]) => (
                  <button key={k} className={`tab ${filtroTipo === k ? 'active' : ''}`} onClick={() => setFiltroTipo(k)}>{v.emoji} {v.label}</button>
                ))}
              </div>

              {filtradas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>👤</div>
                  <div style={{ fontWeight: 700 }}>
                    {search || filtroTipo !== 'todos' ? 'Nenhum resultado' : 'Nenhuma pessoa cadastrada'}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {filtradas.map(p => {
                    const tc = TIPO_CONFIG[p.tipo as keyof typeof TIPO_CONFIG] || TIPO_CONFIG.funcionario
                    return (
                      <div key={p.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ width: 42, height: 42, borderRadius: 13, background: tc.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18, flexShrink: 0, color: tc.color }}>{tc.emoji}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{p.nome}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: tc.color, background: tc.color + '18', padding: '2px 7px', borderRadius: 99 }}>{tc.emoji} {tc.label}</span>
                              {p.cargo && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{p.cargo}</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                              {p.contato && <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--text3)' }}><Phone size={10} /> {p.contato}</span>}
                              {p.email && <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--text3)' }}><Mail size={10} /> {p.email}</span>}
                            </div>
                          </div>
                          {isGestor && (
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              <button onClick={() => setEditPessoa(p)} style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Edit2 size={13} /></button>
                              <button onClick={() => handleDeletePessoa(p.id)} style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={13} /></button>
                            </div>
                          )}
                        </div>
                        {p.obs && <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>{p.obs}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modais */}
      {(modalPessoa || editPessoa) && (
        <PessoaModal
          initial={editPessoa || undefined}
          onSave={p => {
            if (editPessoa) setPessoas(prev => prev.map(x => x.id === p.id ? p : x))
            else setPessoas(prev => [p, ...prev])
            setModalPessoa(false); setEditPessoa(null)
          }}
          onClose={() => { setModalPessoa(false); setEditPessoa(null) }}
        />
      )}
      {conviteOpen && <ConviteModal onSave={() => { setConviteOpen(false); load() }} onClose={() => setConviteOpen(false)} />}
      {panelMembro && (
        <PanelMembro
          membro={panelMembro}
          onClose={() => setPanelMembro(null)}
          onNewTask={() => { setTarefaTarget(panelMembro); setPanelMembro(null) }}
        />
      )}
      {tarefaTarget && (
        <ModalTarefaMembro
          membro={tarefaTarget}
          onClose={() => setTarefaTarget(null)}
          onSaved={() => { load() }}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes micPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,.4) } 50% { box-shadow: 0 0 0 8px rgba(239,68,68,0) } }
      `}</style>
    </div>
  )
}
