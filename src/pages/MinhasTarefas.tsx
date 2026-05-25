import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle2, XCircle, Clock, AlertCircle, Loader,
  Calendar, ChevronDown, ChevronUp, MessageSquare,
  Check, Zap,
} from 'lucide-react'
import { tarefasApi, type Tarefa, type ChecklistItem } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

function parseDateSafe(d?: string) {
  if (!d) return null
  const s = String(d).trim().slice(0, 10)
  const p = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00`) : new Date(String(d))
  return isNaN(p.getTime()) ? null : p
}
function fmtDate(d?: string) {
  const p = parseDateSafe(d)
  return p ? p.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' }) : ''
}
function isOverdue(d?: string) {
  const p = parseDateSafe(d); if (!p) return false
  const e = new Date(p); e.setHours(23,59,59,999); return e < new Date()
}
function isToday(d?: string) {
  const p = parseDateSafe(d); if (!p) return false
  const n = new Date()
  return p.getFullYear()===n.getFullYear() && p.getMonth()===n.getMonth() && p.getDate()===n.getDate()
}
function toast(msg: string, type: 'success'|'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:88px;left:50%;transform:translateX(-50%);background:${type==='error'?'#EF4444':'#10B981'};color:#fff;padding:12px 22px;border-radius:12px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);pointer-events:none;white-space:nowrap;animation:toastIn 0.2s ease;`
  document.body.appendChild(el); setTimeout(() => el.remove(), 3000)
}

const SC = {
  pendente:     { label:'Pendente',     color:'#F59E0B', icon:Clock,        bg:'rgba(245,158,11,0.12)' },
  em_progresso: { label:'Em Progresso', color:'#06B6D4', icon:AlertCircle,  bg:'rgba(6,182,212,0.12)'  },
  concluida:    { label:'Concluída',    color:'#10B981', icon:CheckCircle2, bg:'rgba(16,185,129,0.12)' },
  cancelada:    { label:'Cancelada',    color:'#6B7280', icon:XCircle,      bg:'rgba(107,114,128,0.12)'},
} as const

const PC = {
  baixa: { label:'Baixa', color:'#10B981', bg:'rgba(16,185,129,0.1)' },
  media: { label:'Média', color:'#F59E0B', bg:'rgba(245,158,11,0.1)' },
  alta:  { label:'Alta',  color:'#EF4444', bg:'rgba(239,68,68,0.1)'  },
} as const

// ── Modal de resposta ──────────────────────────────────────────────────────────
function RespostaModal({ tarefa, onSave, onClose }: { tarefa:Tarefa; onSave:(t:Tarefa)=>void; onClose:()=>void }) {
  const [status, setStatus] = useState<'concluida'|'nao_concluida'>(tarefa.resposta_status || 'concluida')
  const [obs, setObs]       = useState(tarefa.resposta_obs || '')
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    if (status === 'nao_concluida' && !obs.trim()) { toast('Informe o motivo', 'error'); return }
    setLoading(true)
    try {
      const u = await tarefasApi.responder(tarefa.id, { resposta_status: status, resposta_obs: obs || undefined })
      onSave(u); toast(status === 'concluida' ? '✅ Tarefa confirmada como concluída!' : '⚠️ Resposta registrada!')
    } catch (e: unknown) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:300, display:'flex', alignItems:'flex-end', justifyContent:'center', backdropFilter:'blur(6px)' }} onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'var(--bg2)', borderRadius:'24px 24px 0 0', padding:'8px 20px calc(32px + env(safe-area-inset-bottom,0px))', width:'100%', maxWidth:520, animation:'slideUp 0.25s ease' }}>
        <div style={{ width:40, height:4, borderRadius:99, background:'var(--border2)', margin:'0 auto 20px' }} />
        <div style={{ fontFamily:'var(--font-heading)', fontWeight:800, fontSize:18, marginBottom:6 }}>Resposta de Execução</div>
        <p style={{ fontSize:13, color:'var(--text2)', marginBottom:20, lineHeight:1.5 }}><strong style={{ color:'var(--text)' }}>{tarefa.titulo}</strong></p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:18 }}>
          {(['concluida','nao_concluida'] as const).map(s => (
            <button key={s} onClick={() => setStatus(s)} style={{ padding:'16px 8px', borderRadius:14, cursor:'pointer', fontWeight:700, fontSize:13, background:status===s?(s==='concluida'?'rgba(16,185,129,0.15)':'rgba(239,68,68,0.15)'):'var(--bg3)', border:status===s?`2.5px solid ${s==='concluida'?'#10B981':'#EF4444'}`:'2px solid var(--border)', color:status===s?(s==='concluida'?'#10B981':'#EF4444'):'var(--text2)', display:'flex', flexDirection:'column', alignItems:'center', gap:8, transition:'all 0.15s' }}>
              {s === 'concluida' ? <CheckCircle2 size={26} /> : <XCircle size={26} />}
              {s === 'concluida' ? '✓ Concluída' : '✗ Não Concluída'}
            </button>
          ))}
        </div>
        <div className="form-group" style={{ marginBottom:18 }}>
          <label className="form-label">{status==='nao_concluida' ? 'Motivo *' : 'Observação (opcional)'}</label>
          <textarea className="form-input" rows={3} placeholder={status==='nao_concluida' ? 'Explique o motivo…' : 'Algum comentário…'} value={obs} onChange={e => setObs(e.target.value)} style={{ resize:'none' }} />
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex:1 }}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading} style={{ flex:2 }}>
            {loading ? <><Loader size={14} style={{ animation:'spin 1s linear infinite' }} /> Enviando…</> : 'Enviar Resposta'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Card individual de tarefa ──────────────────────────────────────────────────
function TarefaCard({ tarefa, userId, onStatus, onChecklist, onResponder }: {
  tarefa: Tarefa; userId: string
  onStatus:    (id:string, s:Tarefa['status']) => void
  onChecklist: (t:Tarefa, id:string) => void
  onResponder: (t:Tarefa) => void
}) {
  const [expanded, setExpanded]   = useState(false)
  const [btnLoad, setBtnLoad]     = useState<string|null>(null)
  const pri      = PC[tarefa.prioridade]
  const sc       = SC[tarefa.status]
  const Icon     = sc.icon
  const total    = tarefa.checklist?.length || 0
  const done     = tarefa.checklist?.filter(i=>i.feito).length || 0
  const overdue  = isOverdue(tarefa.prazo) && tarefa.status !== 'concluida' && tarefa.status !== 'cancelada'
  const resp     = !!tarefa.resposta_status
  const isMine   = tarefa.responsavel_id === userId
  const isCancel = tarefa.status === 'cancelada'
  const isConc   = tarefa.status === 'concluida'

  async function quickStatus(s: Tarefa['status']) {
    if (btnLoad) return; setBtnLoad(s)
    try { await onStatus(tarefa.id, s) } finally { setBtnLoad(null) }
  }

  return (
    <div style={{ background:'var(--bg2)', border:`1px solid ${isConc?'rgba(16,185,129,0.3)':overdue?'rgba(239,68,68,0.3)':'var(--border)'}`, borderRadius:'var(--radius)', overflow:'hidden' }}>
      {/* Faixa de prioridade */}
      <div style={{ height:3, background:isConc?'#10B981':pri.color, opacity:0.7 }} />

      {/* Cabeçalho */}
      <div style={{ padding:'13px 14px 10px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
          <Icon size={18} color={sc.color} style={{ flexShrink:0, marginTop:2 }} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:4 }}>
              <span style={{ fontWeight:700, fontSize:14.5, color:isConc?'var(--text3)':'var(--text)', textDecoration:isConc?'line-through':'none' }}>{tarefa.titulo}</span>
              <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, background:pri.bg, color:pri.color }}>{pri.label}</span>
              {resp && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, background:tarefa.resposta_status==='concluida'?'rgba(16,185,129,0.15)':'rgba(239,68,68,0.15)', color:tarefa.resposta_status==='concluida'?'#10B981':'#EF4444' }}>{tarefa.resposta_status==='concluida'?'✓ Respondida':'✗ Pendente'}</span>}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              {tarefa.prazo && <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, fontWeight:overdue?700:400, color:overdue?'#EF4444':isToday(tarefa.prazo)?'#F59E0B':'var(--text3)' }}><Calendar size={11} />{fmtDate(tarefa.prazo)}{isToday(tarefa.prazo)&&!overdue?' · hoje':''}{overdue?' · vencida':''}</span>}
              {total > 0 && <span style={{ fontSize:12, color:'var(--text3)' }}>{done}/{total} itens</span>}
            </div>
          </div>
          <button onClick={() => setExpanded(v=>!v)} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', padding:4, flexShrink:0 }}>
            {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
        </div>
      </div>

      {/* Botões de ação rápida */}
      {isMine && !isCancel && (
        <div style={{ padding:'0 12px 12px', display:'flex', gap:7 }}>
          {/* Concluída */}
          <button onClick={() => quickStatus('concluida')} disabled={!!btnLoad}
            style={{ flex:1, padding:'9px 6px', borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:12.5, background:isConc?'rgba(16,185,129,0.2)':'var(--bg3)', border:isConc?'2px solid #10B981':'2px solid var(--border)', color:isConc?'#10B981':'var(--text2)', display:'flex', alignItems:'center', justifyContent:'center', gap:5, transition:'all 0.15s' }}>
            {btnLoad==='concluida' ? <Loader size={13} style={{ animation:'spin 1s linear infinite' }} /> : <Check size={14} />}
            Concluída
          </button>
          {/* Em progresso */}
          <button onClick={() => quickStatus('em_progresso')} disabled={!!btnLoad}
            style={{ flex:1, padding:'9px 6px', borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:12.5, background:tarefa.status==='em_progresso'?'rgba(6,182,212,0.2)':'var(--bg3)', border:tarefa.status==='em_progresso'?'2px solid #06B6D4':'2px solid var(--border)', color:tarefa.status==='em_progresso'?'#06B6D4':'var(--text2)', display:'flex', alignItems:'center', justifyContent:'center', gap:5, transition:'all 0.15s' }}>
            {btnLoad==='em_progresso' ? <Loader size={13} style={{ animation:'spin 1s linear infinite' }} /> : <AlertCircle size={14} />}
            Em Progresso
          </button>
          {/* Responder */}
          <button onClick={() => onResponder(tarefa)} title="Registrar resposta"
            style={{ padding:'9px 11px', borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:12.5, background:resp?'rgba(108,59,255,0.15)':'var(--bg3)', border:resp?'2px solid var(--primary-light)':'2px solid var(--border)', color:resp?'var(--primary-light)':'var(--text3)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s' }}>
            <MessageSquare size={14} />
          </button>
        </div>
      )}

      {/* Expandido */}
      {expanded && (
        <div style={{ borderTop:'1px solid var(--border)', padding:'13px 14px 14px', background:'rgba(0,0,0,0.03)' }}>
          {tarefa.descricao && <p style={{ fontSize:13, color:'var(--text2)', lineHeight:1.6, marginBottom:total>0?12:0 }}>{tarefa.descricao}</p>}
          {total > 0 && (
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.07em' }}>Checklist — {done}/{total}</div>
              {tarefa.checklist!.map((item:ChecklistItem) => (
                <div key={item.id} style={{ display:'flex', alignItems:'center', gap:9, padding:'7px 0', borderBottom:'1px solid var(--border)' }}>
                  <button onClick={() => onChecklist(tarefa, item.id)} style={{ width:19, height:19, borderRadius:5, flexShrink:0, cursor:'pointer', background:item.feito?'#10B981':'transparent', border:`2px solid ${item.feito?'#10B981':'var(--border)'}`, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}>
                    {item.feito && <Check size={11} color="#fff" />}
                  </button>
                  <span style={{ flex:1, fontSize:13, textDecoration:item.feito?'line-through':'none', color:item.feito?'var(--text3)':'var(--text)' }}>{item.texto}</span>
                </div>
              ))}
              <div style={{ marginTop:9, height:4, background:'var(--bg3)', borderRadius:99, overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:99, background:'#10B981', width:`${total>0?(done/total)*100:0}%`, transition:'width 0.3s' }} />
              </div>
            </div>
          )}
          {resp && (
            <div style={{ marginTop:12, padding:'10px 12px', borderRadius:10, background:tarefa.resposta_status==='concluida'?'rgba(16,185,129,0.08)':'rgba(239,68,68,0.08)', border:`1px solid ${tarefa.resposta_status==='concluida'?'#10B98130':'#EF444430'}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:tarefa.resposta_obs?5:0 }}>
                <MessageSquare size={13} color={tarefa.resposta_status==='concluida'?'#10B981':'#EF4444'} />
                <span style={{ fontSize:12, fontWeight:700, color:tarefa.resposta_status==='concluida'?'#10B981':'#EF4444' }}>{tarefa.resposta_status==='concluida'?'Você confirmou a conclusão':'Você informou não conclusão'}</span>
              </div>
              {tarefa.resposta_obs && <p style={{ fontSize:12, color:'var(--text2)', margin:0, lineHeight:1.5 }}>{tarefa.resposta_obs}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function MinhasTarefas() {
  const { user }    = useAuth()
  const userId      = user?.id || ''
  const firstName   = user?.nome?.split(' ')[0] || 'Usuário'

  const [tarefas,       setTarefas]       = useState<Tarefa[]>([])
  const [loading,       setLoading]       = useState(true)
  const [respostaTarefa,setRespostaTarefa]= useState<Tarefa|null>(null)
  const [filtro,        setFiltro]        = useState<'todas'|'pendente'|'em_progresso'|'concluida'>('todas')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await tarefasApi.list()
      setTarefas(all.filter(t => t.responsavel_id === userId))
    } catch (e:unknown) { toast(e instanceof Error ? e.message : 'Erro ao carregar', 'error') }
    finally { setLoading(false) }
  }, [userId])

  useEffect(() => { load() }, [load])

  async function handleStatus(id: string, status: Tarefa['status']) {
    try {
      const u = await tarefasApi.update(id, { status })
      setTarefas(p => p.map(t => t.id===id ? u : t))
    } catch (e:unknown) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
  }

  async function handleChecklist(tarefa: Tarefa, itemId: string) {
    const cl = (tarefa.checklist||[]).map(i => i.id===itemId ? {...i,feito:!i.feito} : i)
    try {
      const u = await tarefasApi.update(tarefa.id, { checklist: cl })
      setTarefas(p => p.map(t => t.id===tarefa.id ? u : t))
    } catch (e:unknown) { toast(e instanceof Error ? e.message : 'Erro', 'error') }
  }

  function handleRespostaSaved(u: Tarefa) {
    setTarefas(p => p.map(t => t.id===u.id ? u : t))
    setRespostaTarefa(null)
  }

  const total     = tarefas.length
  const pendentes = tarefas.filter(t => t.status==='pendente').length
  const progresso = tarefas.filter(t => t.status==='em_progresso').length
  const concluidas= tarefas.filter(t => t.status==='concluida').length
  const urgentes  = tarefas.filter(t => t.prioridade==='alta' && t.status!=='concluida').length

  const lista = filtro==='todas' ? tarefas : tarefas.filter(t => t.status===filtro)

  return (
    <div style={{ width:'100%' }}>
      {/* Header hero */}
      <div style={{ padding:'20px 16px 0', background:'linear-gradient(180deg,var(--bg3) 0%,transparent 100%)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
          <div style={{ width:36, height:36, borderRadius:11, background:'var(--grad-primary)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Zap size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize:12, color:'var(--text3)', fontWeight:500 }}>Olá, {firstName} 👋</div>
            <h1 style={{ fontFamily:'var(--font-heading)', fontWeight:900, fontSize:20, margin:0, letterSpacing:'-0.03em' }}>Minhas Tarefas</h1>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, margin:'14px 0 0' }}>
          {[
            { label:'Total',     value:total,     color:'var(--text)',  bg:'var(--bg2)' },
            { label:'Pendentes', value:pendentes, color:'#F59E0B',     bg:'rgba(245,158,11,0.1)' },
            { label:'Andamento', value:progresso, color:'#06B6D4',     bg:'rgba(6,182,212,0.1)'  },
            { label:'Concluídas',value:concluidas,color:'#10B981',     bg:'rgba(16,185,129,0.1)' },
          ].map(s => (
            <div key={s.label} style={{ background:s.bg, borderRadius:12, padding:'10px 6px', textAlign:'center', border:'1px solid var(--border)' }}>
              <div style={{ fontSize:20, fontWeight:900, color:s.color, fontFamily:'var(--font-heading)', lineHeight:1 }}>{s.value}</div>
              <div style={{ fontSize:9, color:'var(--text3)', fontWeight:600, marginTop:3, textTransform:'uppercase', letterSpacing:'0.04em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Alerta urgentes */}
        {urgentes > 0 && (
          <div style={{ margin:'10px 0 0', padding:'9px 12px', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:10, display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:600, color:'#EF4444' }}>
            <Zap size={14} />{urgentes} tarefa{urgentes>1?'s':''} de alta prioridade pendente{urgentes>1?'s':''}
          </div>
        )}

        {/* Filtros */}
        <div style={{ display:'flex', gap:6, margin:'12px 0 0', overflowX:'auto', paddingBottom:2 }}>
          {([
            { key:'todas',        label:'Todas'        },
            { key:'pendente',     label:'Pendentes'    },
            { key:'em_progresso', label:'Em andamento' },
            { key:'concluida',    label:'Concluídas'   },
          ] as const).map(f => (
            <button key={f.key} onClick={() => setFiltro(f.key)}
              style={{ padding:'6px 14px', borderRadius:99, border:'none', cursor:'pointer', fontWeight:600, fontSize:12, fontFamily:'var(--font-body)', whiteSpace:'nowrap', background:filtro===f.key?'var(--primary)':'var(--bg3)', color:filtro===f.key?'#fff':'var(--text3)', transition:'all 0.15s' }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div style={{ padding:'12px 14px calc(var(--bottom-nav-h, 62px) + env(safe-area-inset-bottom, 0px) + 24px)' }}>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:60, color:'var(--text3)' }}>
            <Loader size={22} style={{ animation:'spin 1s linear infinite', marginRight:10 }} />Carregando…
          </div>
        ) : lista.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--text3)' }}>
            <CheckCircle2 size={52} style={{ marginBottom:14, opacity:0.4 }} />
            <div style={{ fontFamily:'var(--font-heading)', fontWeight:700, fontSize:16, marginBottom:6 }}>
              {filtro==='todas' ? 'Nenhuma tarefa atribuída' : 'Nada aqui ainda'}
            </div>
            <div style={{ fontSize:13 }}>
              {filtro==='todas' ? 'Quando seu gestor atribuir tarefas a você, elas aparecerão aqui' : 'Tente outro filtro'}
            </div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {lista.map(t => (
              <TarefaCard key={t.id} tarefa={t} userId={userId} onStatus={handleStatus} onChecklist={handleChecklist} onResponder={t => setRespostaTarefa(t)} />
            ))}
          </div>
        )}
      </div>

      {respostaTarefa && <RespostaModal tarefa={respostaTarefa} onSave={handleRespostaSaved} onClose={() => setRespostaTarefa(null)} />}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
      `}</style>
    </div>
  )
}
