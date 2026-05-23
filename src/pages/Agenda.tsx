import React, { useState, useCallback, useMemo } from 'react'
import { Plus, ChevronLeft, ChevronRight, Calendar, Clock, MapPin, Trash2, Edit2, Users } from 'lucide-react'
import { nanoid, fmtTime, today } from '../lib/utils'
import { store, saveStore } from '../lib/store'
import type { Evento } from '../lib/supabase'
import { Avatar, Badge, Modal, ConfirmDialog, EmptyState, MicBtn, toast } from '../components/ui'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const TIPO_CORES: Record<string, string> = {
  reuniao: '#6C3BFF', compromisso: '#06B6D4', prazo: '#EF4444', outro: '#F59E0B'
}

export default function Agenda() {
  const [eventos, setEventos] = useState<Evento[]>(store.agenda)
  const [viewDate, setViewDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(today())
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Evento | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const [form, setForm] = useState({
    titulo: '', descricao: '', data_inicio: today() + 'T09:00',
    data_fim: '', local: '', tipo: 'compromisso' as Evento['tipo'],
    lembrete_minutos: 15, participantes_ids: [] as string[]
  })

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevDays = new Date(year, month, 0).getDate()

  const eventsByDate = useMemo(() => {
    const map: Record<string, Evento[]> = {}
    eventos.forEach(e => {
      const d = e.data_inicio.slice(0, 10)
      if (!map[d]) map[d] = []
      map[d].push(e)
    })
    return map
  }, [eventos])

  const selectedEvents = useMemo(() =>
    (eventsByDate[selectedDate] ?? []).sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))
  , [eventsByDate, selectedDate])

  const upcomingEvents = useMemo(() =>
    eventos
      .filter(e => e.data_inicio >= new Date().toISOString())
      .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))
      .slice(0, 5)
  , [eventos])

  function openNew(date?: string) {
    setEditando(null)
    const d = date ?? selectedDate
    setForm({ titulo: '', descricao: '', data_inicio: d + 'T09:00', data_fim: '', local: '', tipo: 'compromisso', lembrete_minutos: 15, participantes_ids: [] })
    setModalOpen(true)
  }

  function openEdit(e: Evento) {
    setEditando(e)
    setForm({
      titulo: e.titulo, descricao: e.descricao ?? '',
      data_inicio: e.data_inicio.slice(0, 16),
      data_fim: e.data_fim ? e.data_fim.slice(0, 16) : '',
      local: e.local ?? '', tipo: e.tipo,
      lembrete_minutos: e.lembrete_minutos ?? 15,
      participantes_ids: (e.participantes ?? []).map(p => p.id)
    })
    setModalOpen(true)
  }

  function salvar() {
    if (!form.titulo.trim()) { toast('Título é obrigatório', 'error'); return }
    const participantes = store.pessoas
      .filter(p => form.participantes_ids.includes(p.id))
      .map(p => ({ id: p.id, nome: p.nome }))

    if (editando) {
      const updated = store.agenda.map(e => e.id === editando.id ? {
        ...e, titulo: form.titulo, descricao: form.descricao || undefined,
        data_inicio: form.data_inicio, data_fim: form.data_fim || undefined,
        local: form.local || undefined, tipo: form.tipo,
        lembrete_minutos: form.lembrete_minutos, participantes
      } : e)
      store.agenda = updated
      saveStore('agenda', updated)
      setEventos([...updated])
      toast('Evento atualizado!')
    } else {
      const novo: Evento = {
        id: nanoid(), user_id: store.config.userId || 'local',
        titulo: form.titulo.trim(), descricao: form.descricao || undefined,
        data_inicio: form.data_inicio, data_fim: form.data_fim || undefined,
        local: form.local || undefined, tipo: form.tipo,
        participantes, lembrete_minutos: form.lembrete_minutos,
        lembrete_enviado: false, cor: TIPO_CORES[form.tipo],
        created_at: new Date().toISOString()
      }
      store.agenda = [...store.agenda, novo]
      saveStore('agenda', store.agenda)
      setEventos([...store.agenda])
      toast('Evento criado!')
    }
    setModalOpen(false)
  }

  function excluir(id: string) {
    store.agenda = store.agenda.filter(e => e.id !== id)
    saveStore('agenda', store.agenda)
    setEventos([...store.agenda])
    toast('Evento removido')
  }

  const handleMicTitulo = useCallback((t: string) => setForm(f => ({ ...f, titulo: f.titulo ? f.titulo + ' ' + t : t })), [])
  const handleMicDesc = useCallback((t: string) => setForm(f => ({ ...f, descricao: f.descricao ? f.descricao + ' ' + t : t })), [])
  const handleMicLocal = useCallback((t: string) => setForm(f => ({ ...f, local: t })), [])

  const equipe = store.pessoas.filter(p => p.tipo === 'funcionario' || p.tipo === 'prestador' || p.tipo === 'cliente')

  function toggleParticipante(id: string) {
    setForm(f => ({
      ...f,
      participantes_ids: f.participantes_ids.includes(id)
        ? f.participantes_ids.filter(i => i !== id)
        : [...f.participantes_ids, id]
    }))
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title"><Calendar size={22} /> Agenda</div>
          <div className="page-subtitle">{eventos.length} evento{eventos.length !== 1 ? 's' : ''} registrado{eventos.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-primary" onClick={() => openNew()}><Plus size={16} /> Novo Evento</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        {/* Calendar */}
        <div className="card">
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <button className="btn btn-ghost btn-icon" onClick={() => setViewDate(new Date(year, month - 1, 1))}><ChevronLeft size={16} /></button>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>
              {MESES[month]} {year}
            </span>
            <button className="btn btn-ghost btn-icon" onClick={() => setViewDate(new Date(year, month + 1, 1))}><ChevronRight size={16} /></button>
          </div>

          {/* Day headers */}
          <div className="calendar-grid" style={{ marginBottom: 4 }}>
            {DIAS_SEMANA.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', fontWeight: 600, paddingBottom: 4 }}>{d}</div>
            ))}
          </div>

          {/* Days */}
          <div className="calendar-grid">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`prev-${i}`} className="cal-day other-month" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {prevDays - firstDay + i + 1}
              </div>
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const isToday = dateStr === today()
              const isSelected = dateStr === selectedDate
              const hasEvent = !!eventsByDate[dateStr]?.length
              return (
                <div
                  key={day}
                  className={`cal-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${hasEvent ? 'has-event' : ''}`}
                  onClick={() => setSelectedDate(dateStr)}
                  style={{ fontSize: 13 }}
                >
                  {day}
                </div>
              )
            })}
          </div>
        </div>

        {/* Selected day events */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14 }}>
              {new Date(selectedDate + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => openNew(selectedDate)}><Plus size={13} /></button>
          </div>

          {selectedEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 13 }}>
              Nenhum evento neste dia
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedEvents.map(e => (
                <div key={e.id} style={{
                  padding: '10px 12px',
                  background: 'var(--bg3)',
                  borderRadius: 10,
                  borderLeft: `3px solid ${TIPO_CORES[e.tipo] ?? 'var(--primary)'}`,
                  display: 'flex', alignItems: 'flex-start', gap: 10
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{e.titulo}</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Clock size={10} /> {fmtTime(e.data_inicio)}
                        {e.data_fim && ` — ${fmtTime(e.data_fim)}`}
                      </span>
                      {e.local && (
                        <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <MapPin size={10} /> {e.local}
                        </span>
                      )}
                    </div>
                    {(e.participantes ?? []).length > 0 && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
                        <Users size={10} color="var(--text3)" />
                        {(e.participantes ?? []).map(p => (
                          <Avatar key={p.id} name={p.nome} size={20} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} onClick={() => openEdit(e)}><Edit2 size={12} /></button>
                    <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28, color: 'var(--danger)' }} onClick={() => setConfirmId(e.id)}><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming */}
        {upcomingEvents.length > 0 && (
          <div className="card">
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Próximos Eventos</div>
            {upcomingEvents.map(e => (
              <div key={e.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 4, borderRadius: 2, background: TIPO_CORES[e.tipo] ?? 'var(--primary)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{e.titulo}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                    {new Date(e.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {fmtTime(e.data_inicio)}
                  </div>
                </div>
                <Badge type={e.tipo} />
              </div>
            ))}
          </div>
        )}
      </div>

      <button className="fab" onClick={() => openNew()}><Plus size={22} /></button>

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar Evento' : 'Novo Evento'}>
        <div className="form-group">
          <label className="form-label">Título *</label>
          <div className="input-mic-group">
            <input className="form-input" placeholder="Nome do evento" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
            <MicBtn onResult={handleMicTitulo} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Tipo</label>
          <select className="form-select" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as Evento['tipo'] }))}>
            <option value="compromisso">Compromisso</option>
            <option value="reuniao">Reunião</option>
            <option value="prazo">Prazo</option>
            <option value="outro">Outro</option>
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-group">
            <label className="form-label">Início *</label>
            <input className="form-input" type="datetime-local" value={form.data_inicio} onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Fim</label>
            <input className="form-input" type="datetime-local" value={form.data_fim} onChange={e => setForm(f => ({ ...f, data_fim: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Local</label>
          <div className="input-mic-group">
            <input className="form-input" placeholder="Endereço ou link" value={form.local} onChange={e => setForm(f => ({ ...f, local: e.target.value }))} />
            <MicBtn onResult={handleMicLocal} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Descrição</label>
          <div className="input-mic-group">
            <textarea className="form-textarea" placeholder="Detalhes do evento..." value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={2} />
            <MicBtn onResult={handleMicDesc} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Lembrete</label>
          <select className="form-select" value={form.lembrete_minutos} onChange={e => setForm(f => ({ ...f, lembrete_minutos: Number(e.target.value) }))}>
            <option value={5}>5 minutos antes</option>
            <option value={15}>15 minutos antes</option>
            <option value={30}>30 minutos antes</option>
            <option value={60}>1 hora antes</option>
            <option value={1440}>1 dia antes</option>
          </select>
        </div>
        {equipe.length > 0 && (
          <div className="form-group">
            <label className="form-label">Participantes</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {equipe.map(p => (
                <div
                  key={p.id}
                  onClick={() => toggleParticipante(p.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px', borderRadius: 20, cursor: 'pointer',
                    background: form.participantes_ids.includes(p.id) ? 'rgba(108,59,255,0.2)' : 'var(--bg3)',
                    border: `1px solid ${form.participantes_ids.includes(p.id) ? 'var(--primary)' : 'var(--border)'}`,
                    fontSize: 12, transition: 'all 0.15s'
                  }}
                >
                  <Avatar name={p.nome} size={20} />
                  {p.nome.split(' ')[0]}
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={salvar}>{editando ? 'Salvar' : 'Criar Evento'}</button>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmId} onClose={() => setConfirmId(null)} onConfirm={() => confirmId && excluir(confirmId)} title="Excluir Evento" message="Deseja excluir este evento?" />
    </div>
  )
}
