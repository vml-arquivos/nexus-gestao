import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle2, Calendar, DollarSign, Users,
  TrendingUp, TrendingDown, Clock, AlertTriangle, ArrowRight, Plus
} from 'lucide-react'
import { store } from '../lib/store'
import { Avatar, Badge, ProgressBar } from '../components/ui'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(d: string) {
  return new Date(d + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export default function Dashboard() {
  const hoje = new Date().toISOString().slice(0, 10)
  const nome = store.config.nome || 'Usuário'
  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

  const metrics = useMemo(() => {
    const tarefasPendentes  = store.tarefas.filter(t => t.status === 'pendente').length
    const tarefasConcluidas = store.tarefas.filter(t => t.status === 'concluida').length
    const totalTarefas      = store.tarefas.length

    const eventosHoje = store.agenda.filter(e => e.data_inicio.startsWith(hoje))

    const recebimentos = store.pagamentos
      .filter(p => p.tipo === 'recebimento' && p.status === 'pago')
      .reduce((a, b) => a + Number(b.valor), 0)
    const pagamentos = store.pagamentos
      .filter(p => p.tipo === 'pagamento' && p.status === 'pago')
      .reduce((a, b) => a + Number(b.valor), 0)
    const saldo = recebimentos - pagamentos

    const vencidos = store.pagamentos.filter(p => {
      if (p.status !== 'pendente' || !p.vencimento) return false
      return new Date(p.vencimento + 'T12:00') < new Date()
    })

    const equipeAtiva = store.pessoas.filter(
      p => p.tipo === 'funcionario' || p.tipo === 'prestador'
    )

    return {
      tarefasPendentes, tarefasConcluidas, totalTarefas,
      eventosHoje, recebimentos, pagamentos, saldo, vencidos, equipeAtiva
    }
  }, [hoje])

  const proximosPagamentos = store.pagamentos
    .filter(p => p.status === 'pendente' && p.vencimento)
    .sort((a, b) => (a.vencimento ?? '').localeCompare(b.vencimento ?? ''))
    .slice(0, 4)

  const tarefasRecentes = store.tarefas
    .filter(t => t.status !== 'concluida' && t.status !== 'cancelada')
    .sort((a, b) => {
      const pri: Record<string, number> = { alta: 0, media: 1, baixa: 2 }
      return (pri[a.prioridade] ?? 1) - (pri[b.prioridade] ?? 1)
    })
    .slice(0, 5)

  // Verifica se o sistema está vazio (sem nenhum dado)
  const sistemaVazio =
    store.tarefas.length === 0 &&
    store.agenda.length === 0 &&
    store.pagamentos.length === 0 &&
    store.pessoas.length === 0

  const dataFormatada = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  return (
    <div style={{ paddingBottom: 24 }}>

      {/* ── Hero / saudação ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f2044 0%, #1a1230 50%, #0F0A1E 100%)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px 22px',
        marginBottom: 20,
        border: '1px solid var(--border)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', right: -20, top: -20,
          width: 120, height: 120,
          background: 'radial-gradient(circle, rgba(108,59,255,0.25), transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 2, fontWeight: 500 }}>
          {saudacao},
        </div>
        <div style={{
          fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 800,
          marginBottom: 4, letterSpacing: '-0.02em',
        }}>
          {nome} 👋
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: sistemaVazio ? 0 : 16 }}>
          {dataFormatada}
        </div>

        {/* Resumo rápido — só aparece se houver dados */}
        {!sistemaVazio && (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 12 }}>
            {metrics.tarefasPendentes > 0 && (
              <div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>
                  {metrics.tarefasPendentes}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>tarefas pendentes</div>
              </div>
            )}
            {metrics.eventosHoje.length > 0 && (
              <div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 800, color: 'var(--secondary)', lineHeight: 1 }}>
                  {metrics.eventosHoje.length}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>eventos hoje</div>
              </div>
            )}
            {(metrics.recebimentos > 0 || metrics.pagamentos > 0) && (
              <div>
                <div style={{
                  fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 800, lineHeight: 1,
                  color: metrics.saldo >= 0 ? 'var(--success)' : 'var(--danger)',
                }}>
                  {fmt(metrics.saldo)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>saldo</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Estado vazio — sistema recém configurado ── */}
      {sistemaVazio ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>🚀</div>
          <div style={{
            fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 800,
            marginBottom: 8, color: 'var(--text)',
          }}>
            Tudo pronto para começar!
          </div>
          <p style={{ color: 'var(--text3)', fontSize: 14, lineHeight: 1.8, marginBottom: 28, maxWidth: 340, margin: '0 auto 28px' }}>
            O Nexus está configurado e pronto. Adicione sua equipe, crie as primeiras tarefas ou registre um pagamento.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/equipe"     className="btn btn-primary btn-sm">👥 Adicionar Equipe</Link>
            <Link to="/tarefas"    className="btn btn-secondary btn-sm">✅ Criar Tarefa</Link>
            <Link to="/financeiro" className="btn btn-secondary btn-sm">💳 Financeiro</Link>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Cards de métricas ── */}
          <div className="grid-metrics" style={{ marginBottom: 4 }}>

            <Link to="/tarefas" style={{ textDecoration: 'none' }}>
              <div className="metric-card">
                <div className="metric-icon" style={{ background: 'rgba(108,59,255,0.2)' }}>
                  <CheckCircle2 size={20} color="var(--primary-light)" />
                </div>
                <div className="metric-value">{metrics.tarefasPendentes}</div>
                <div className="metric-label">Tarefas Pendentes</div>
                {metrics.tarefasConcluidas > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <ProgressBar value={metrics.tarefasConcluidas} max={metrics.totalTarefas} />
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                      {metrics.tarefasConcluidas}/{metrics.totalTarefas} concluídas
                    </div>
                  </div>
                )}
              </div>
            </Link>

            <Link to="/agenda" style={{ textDecoration: 'none' }}>
              <div className="metric-card">
                <div className="metric-icon" style={{ background: 'rgba(6,182,212,0.2)' }}>
                  <Calendar size={20} color="var(--secondary)" />
                </div>
                <div className="metric-value">{metrics.eventosHoje.length}</div>
                <div className="metric-label">Eventos Hoje</div>
                {metrics.eventosHoje[0] && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    📍 {metrics.eventosHoje[0].titulo}
                  </div>
                )}
              </div>
            </Link>

            <Link to="/financeiro" style={{ textDecoration: 'none' }}>
              <div className="metric-card">
                <div className="metric-icon" style={{ background: 'rgba(16,185,129,0.2)' }}>
                  <TrendingUp size={20} color="var(--success)" />
                </div>
                <div className="metric-value" style={{ fontSize: 18 }}>{fmt(metrics.recebimentos)}</div>
                <div className="metric-label">Recebimentos</div>
              </div>
            </Link>

            <Link to="/financeiro" style={{ textDecoration: 'none' }}>
              <div className="metric-card">
                <div className="metric-icon" style={{ background: 'rgba(239,68,68,0.2)' }}>
                  <TrendingDown size={20} color="var(--danger)" />
                </div>
                <div className="metric-value" style={{ fontSize: 18 }}>{fmt(metrics.pagamentos)}</div>
                <div className="metric-label">Pagamentos</div>
                {metrics.vencidos.length > 0 && (
                  <div style={{ fontSize: 11, color: '#F87171', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertTriangle size={10} /> {metrics.vencidos.length} vencido{metrics.vencidos.length > 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </Link>
          </div>

          {/* ── Equipe ativa ── */}
          {metrics.equipeAtiva.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div className="section-title" style={{ margin: 0 }}>Equipe Ativa</div>
                <Link to="/equipe" style={{ fontSize: 12, color: 'var(--primary-light)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                  Ver todos <ArrowRight size={12} />
                </Link>
              </div>
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                {metrics.equipeAtiva.slice(0, 6).map(p => (
                  <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 56 }}>
                    <Avatar name={p.nome} size={44} url={p.avatar_url} />
                    <span style={{ fontSize: 11, color: 'var(--text2)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 56 }}>
                      {p.nome.split(' ')[0]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tarefas prioritárias ── */}
          {tarefasRecentes.length > 0 && (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={16} color="var(--primary-light)" /> Tarefas Prioritárias
                </div>
                <Link to="/tarefas" style={{ fontSize: 12, color: 'var(--primary-light)', textDecoration: 'none' }}>Ver todas</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tarefasRecentes.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg3)', borderRadius: 8 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: 4, flexShrink: 0,
                      background: t.prioridade === 'alta' ? 'var(--danger)' : t.prioridade === 'media' ? 'var(--warning)' : 'var(--success)',
                    }} />
                    <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.titulo}
                    </span>
                    {t.prazo && (
                      <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                        <Clock size={10} /> {fmtDate(t.prazo)}
                      </span>
                    )}
                    {t.responsavel_nome && <Avatar name={t.responsavel_nome} size={22} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Próximos vencimentos ── */}
          {proximosPagamentos.length > 0 && (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <DollarSign size={16} color="var(--warning)" /> Próximos Vencimentos
                </div>
                <Link to="/financeiro" style={{ fontSize: 12, color: 'var(--primary-light)', textDecoration: 'none' }}>Ver todos</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {proximosPagamentos.map(p => {
                  const isVencido = p.vencimento && new Date(p.vencimento + 'T12:00') < new Date()
                  return (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                      background: isVencido ? 'rgba(239,68,68,0.08)' : 'var(--bg3)',
                      borderRadius: 8,
                    }}>
                      <span style={{ fontSize: 16 }}>{p.tipo === 'recebimento' ? '💰' : '💸'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descricao}</div>
                        {p.pessoa_nome && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{p.pessoa_nome}</div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: p.tipo === 'recebimento' ? 'var(--success)' : 'var(--text)' }}>
                          {fmt(Number(p.valor))}
                        </div>
                        <div style={{ fontSize: 11, color: isVencido ? 'var(--danger)' : 'var(--text3)' }}>
                          {p.vencimento ? fmtDate(p.vencimento) : '—'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
