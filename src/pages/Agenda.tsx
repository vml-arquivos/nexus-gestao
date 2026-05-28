import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, ChevronLeft, ChevronRight, Calendar, Clock, MapPin, Trash2, Edit2, X, Loader } from 'lucide-react'
import { agendaApi, type Evento } from '../lib/api'

function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
const MESES = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const TIPO_CORES: Record<string, string> = {
  reuniao: '#2563EB', compromisso: '#06B6D4', prazo: '#EF4444', outro: '#F59E0B'
}

function today() { return new Date().toISOString().slice(0, 10) }
function fmtTime(iso: string) { return iso.slice(11, 16) }

type FormState = {
  titulo: string; descricao: string; data_inicio: string; data_fim: string;
  local: string; tipo: string; lembrete_minutos: number
}

function EventoModal({ initial, onSave, onClose }: {
  initial?: Evento; onSave: (e: Evento) => void; onClose: () => void
}) {
  const [form, setForm] = useState<FormState>({
    titulo: initial?.titulo || '',
    descricao: initial?.descricao || '',
    data_inicio: initial?.data_inicio ? initial.data_inicio.slice(0, 16) : today() + 'T09:00',
    data_fim: initial?.data_fim ? initial.data_fim.slice(0, 16) : '',
    local: initial?.local || '',
    tipo: initial?.tipo || 'compromisso',
    lembrete_minutos: initial?.lembrete_minutos ?? 15,
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.titulo.trim()) { toast('Titulo e obrigatorio', 'error'); return }
    setSaving(true)
    try {
      const payload = {
        titulo: form.titulo.trim(),
        descricao: form.descricao || undefined,
        data_inicio: form.data_inicio,
        data_fim: form.data_fim || undefined,
        local: form.local || undefined,
        tipo: form.tipo as Evento['tipo'],
        lembrete_minutos: form.lembrete_minutos,
      }
      const e = initial?.id
        ? await agendaApi.update(initial.id, payload)
        : await agendaApi.create(payload)
      onSave(e)
      toast(initial?.id ? 'Evento atualizado!' : 'Evento criado!')
    } catch (err) { toast(err instanceof Error ? err.message : 'Erro', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto', zIndex: 200 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg2)', borderRadius: '24px', padding: '28px 24px', width: '100%', maxWidth: 540, overflowY: 'visible', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>{initial?.id ? 'Editar Evento' : 'Novo Evento'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group"><label className="form-label">Titulo *</label><input className="form-input" placeholder="Nome do evento" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Tipo</label>
            <select className="form-input" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
              <option value="compromisso">Compromisso</option>
              <option value="reuniao">Reuniao</option>
              <option value="prazo">Prazo</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group"><label className="form-label">Inicio *</label><input className="form-input" type="datetime-local" value={form.data_inicio} onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Fim</label><input className="form-input" type="datetime-local" value={form.data_fim} onChange={e => setForm(f => ({ ...f, data_fim: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label className="form-label">Local</label><input className="form-input" placeholder="Endereco ou link" value={form.local} onChange={e => setForm(f => ({ ...f, local: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Descricao</label><textarea className="form-input" rows={2} placeholder="Detalhes..." value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} style={{ resize: 'vertical' }} /></div>
          <div className="form-group"><label className="form-label">Lembrete</label>
            <select className="form-input" value={form.lembrete_minutos} onChange={e => setForm(f => ({ ...f, lembrete_minutos: Number(e.target.value) }))}>
              <option value={5}>5 minutos antes</option>
              <option value={15}>15 minutos antes</option>
              <option value={30}>30 minutos antes</option>
              <option value={60}>1 hora antes</option>
              <option value={1440}>1 dia antes</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 2 }}>
            {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Salvando...</> : 'Salvar Evento'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Agenda() {
  const [eventos, setEventos]       = useState<Evento[]>([])
  const [loading, setLoading]       = useState(true)
  const [viewDate, setViewDate]     = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(today())
  const [modalOpen, setModalOpen]   = useState(false)
  const [editando, setEditando]     = useState<Evento | null>(null)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevDays = new Date(year, month, 0).getDate()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await agendaApi.list(month + 1, year)
      setEventos(data)
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
    finally { setLoading(false) }
  }, [month, year])

  useEffect(() => { load() }, [load])
  useEffect(() => { const h = () => { setEditando(null); setModalOpen(true) }; window.addEventListener('nexus:open-new', h); return () => window.removeEventListener('nexus:open-new', h) }, [])

  const eventsByDate = useMemo(() => {
    const map: Record<string, Evento[]> = {}
    eventos.forEach(e => { const d = e.data_inicio.slice(0, 10); if (!map[d]) map[d] = []; map[d].push(e) })
    return map
  }, [eventos])

  const selectedEvents = useMemo(() =>
    (eventsByDate[selectedDate] ?? []).sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))
  , [eventsByDate, selectedDate])

  const upcomingEvents = useMemo(() =>
    eventos.filter(e => e.data_inicio >= new Date().toISOString()).sort((a, b) => a.data_inicio.localeCompare(b.data_inicio)).slice(0, 5)
  , [eventos])

  async function handleDelete(id: string) {
    if (!confirm('Excluir este evento?')) return
    try { await agendaApi.remove(id); setEventos(prev => prev.filter(e => e.id !== id)); toast('Evento removido') }
    catch (e) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
  }

  return (
    <div style={{ padding: '20px 20px calc(var(--bottom-nav-h, 62px) + env(safe-area-inset-bottom, 0px) + 24px)', maxWidth: 760, margin: '0 auto', boxSizing: 'border-box' as const }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22 }}>Agenda</h1>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>{eventos.length} evento{eventos.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditando(null); setModalOpen(true) }} style={{ gap: 6 }}><Plus size={16} /> Novo</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: 'var(--text3)' }}><Loader size={22} style={{ animation: 'spin 1s linear infinite', marginRight: 10 }} /> Carregando...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Calendario */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <button className="btn btn-ghost btn-icon" onClick={() => setViewDate(new Date(year, month - 1, 1))}><ChevronLeft size={16} /></button>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>{MESES[month]} {year}</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setViewDate(new Date(year, month + 1, 1))}><ChevronRight size={16} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
              {DIAS_SEMANA.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', fontWeight: 600, paddingBottom: 4 }}>{d}</div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`p${i}`} style={{ textAlign: 'center', padding: '6px 2px', fontSize: 12, color: 'var(--text-muted)', opacity: 0.4 }}>{prevDays - firstDay + i + 1}</div>
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const isToday = dateStr === today()
                const isSelected = dateStr === selectedDate
                const hasEvent = !!eventsByDate[dateStr]?.length
                return (
                  <div key={day} onClick={() => setSelectedDate(dateStr)} style={{
                    textAlign: 'center', padding: '6px 2px', fontSize: 13, cursor: 'pointer', borderRadius: 8, position: 'relative',
                    background: isSelected ? 'var(--primary)' : isToday ? 'rgba(37,99,235,0.15)' : 'transparent',
                    color: isSelected ? '#fff' : isToday ? 'var(--primary-light)' : 'var(--text)',
                    fontWeight: isToday || isSelected ? 700 : 400,
                  }}>
                    {day}
                    {hasEvent && <div style={{ width: 4, height: 4, borderRadius: '50%', background: isSelected ? '#fff' : 'var(--primary-light)', margin: '2px auto 0' }} />}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Eventos do dia selecionado */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14 }}>
                <Calendar size={14} style={{ display: 'inline', marginRight: 6 }} />
                {new Date(selectedDate + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
              </div>
              <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => { setEditando(null); setModalOpen(true) }}><Plus size={13} /></button>
            </div>
            {selectedEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 13 }}>Nenhum evento neste dia</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedEvents.map(e => (
                  <div key={e.id} style={{ padding: '10px 12px', background: 'var(--bg3)', borderRadius: 10, borderLeft: `3px solid ${TIPO_CORES[e.tipo] ?? 'var(--primary)'}`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{e.titulo}</div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={10} /> {fmtTime(e.data_inicio)}{e.data_fim && ` - ${fmtTime(e.data_fim)}`}</span>
                        {e.local && <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 3 }}><MapPin size={10} /> {e.local}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => { setEditando(e); setModalOpen(true) }} style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Edit2 size={12} /></button>
                      <button onClick={() => handleDelete(e.id)} style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Proximos eventos */}
          {upcomingEvents.length > 0 && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Proximos Eventos</div>
              {upcomingEvents.map(e => (
                <div key={e.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 4, borderRadius: 2, background: TIPO_CORES[e.tipo] ?? 'var(--primary)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{e.titulo}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                      {new Date(e.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - {fmtTime(e.data_inicio)}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: TIPO_CORES[e.tipo], background: TIPO_CORES[e.tipo] + '18', padding: '2px 8px', borderRadius: 99, alignSelf: 'center' }}>{e.tipo}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <EventoModal
          initial={editando || undefined}
          onSave={e => {
            if (editando) setEventos(prev => prev.map(x => x.id === e.id ? e : x))
            else setEventos(prev => [e, ...prev])
            setModalOpen(false); setEditando(null)
          }}
          onClose={() => { setModalOpen(false); setEditando(null) }}
        />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
