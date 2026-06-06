import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, AlertTriangle, BellRing, BrainCircuit, CalendarDays, CheckCircle2,
  CreditCard, DollarSign, Megaphone, RefreshCw, Route, ShieldCheck, Sparkles,
  Target, Users, WalletCards, Zap,
} from 'lucide-react'
import { inteligenciaApi, type InteligenciaPainel } from '../lib/api'

function dinheiro(value?: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
}

function numero(value?: number) {
  return new Intl.NumberFormat('pt-BR').format(value || 0)
}

function dataBR(value?: string) {
  if (!value) return 'Sem data'
  const raw = String(value).slice(0, 10)
  const [y, m, d] = raw.split('-')
  return y && m && d ? `${d}/${m}/${y}` : raw
}

function nivelLabel(nivel: InteligenciaPainel['nivel']) {
  if (nivel === 'baixo') return 'Operação saudável'
  if (nivel === 'medio') return 'Atenção moderada'
  if (nivel === 'alto') return 'Risco alto'
  return 'Risco crítico'
}

function riscoClass(nivel: string) {
  if (nivel === 'critico') return 'danger'
  if (nivel === 'alto') return 'warning'
  if (nivel === 'medio') return 'info'
  return 'success'
}

function MetricaCard({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string; hint: string }) {
  return (
    <div className="intel-card metric-card compact">
      <div className="metric-icon"><Icon size={18} /></div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
        <small>{hint}</small>
      </div>
    </div>
  )
}

export default function Inteligencia() {
  const [painel, setPainel] = useState<InteligenciaPainel | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [executando, setExecutando] = useState<string | null>(null)

  async function carregar() {
    try {
      setLoading(true)
      setErro(null)
      const data = await inteligenciaApi.painel()
      setPainel(data)
    } catch (err: any) {
      setErro(err?.message || 'Erro ao carregar inteligência operacional.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [])

  function acaoKey(acao: NonNullable<InteligenciaPainel['acoes_inteligentes']>[number]) {
    return `${acao.tipo}-${acao.tarefa_id || acao.pagamento_id || acao.titulo}`
  }

  function acaoTexto(acao: NonNullable<InteligenciaPainel['acoes_inteligentes']>[number]) {
    if (acao.tipo === 'sincronizar_agenda') return 'Sincronizar agenda'
    if (acao.tipo === 'criar_tarefa_cobranca') return 'Criar tarefa'
    if (acao.tipo === 'cobrar_devedor') return 'Cobrar devedor'
    if (acao.tipo === 'lembrar_pagamento') return 'Avisar pagamento'
    return 'Cobrar tarefa'
  }

  function acaoConfirmacao(acao: NonNullable<InteligenciaPainel['acoes_inteligentes']>[number]) {
    if (acao.tipo === 'sincronizar_agenda') return 'Sincronizar tarefas, pagamentos e recebimentos pendentes com a agenda sem duplicar eventos já criados?'
    if (acao.tipo === 'cobrar_devedor') return 'Enviar cobrança interna ou abrir WhatsApp com mensagem pronta para esse devedor?'
    if (acao.tipo === 'lembrar_pagamento') return 'Enviar alerta interno e sonoro sobre esse pagamento?'
    if (acao.tipo === 'criar_tarefa_cobranca') return 'Criar uma tarefa operacional com checklist para resolver essa pendência financeira?'
    return 'Enviar cobrança inteligente para responsáveis ou equipe dessa tarefa?'
  }

  async function executarAcao(acao: NonNullable<InteligenciaPainel['acoes_inteligentes']>[number]) {
    if (!confirm(`${acaoConfirmacao(acao)}\n\n${acao.titulo}`)) return
    const chave = acaoKey(acao)
    try {
      setExecutando(chave)
      const result = await inteligenciaApi.executarAcao({ tipo: acao.tipo, tarefa_id: acao.tarefa_id, pagamento_id: acao.pagamento_id })
      if (result.whatsapp_url) {
        window.open(result.whatsapp_url, '_blank', 'noopener,noreferrer')
        alert(`Ação executada. WhatsApp aberto com mensagem pronta. Notificações internas: ${result.enviados || 0}.`)
      } else if (result.agenda) {
        alert(`Agenda sincronizada. Internos: ${result.agenda.locaisCriados ?? result.agenda.criados ?? 0} criados, ${result.agenda.locaisAtualizados ?? 0} atualizados, ${result.agenda.locaisExistentes ?? result.agenda.existentes ?? 0} já existentes. Google Agenda: ${result.agenda.googleCriados ?? 0} criados, ${result.agenda.googleAtualizados ?? 0} atualizados, ${result.agenda.googleFalhas ?? 0} falhas.`)
      } else {
        const extra = result.tarefa_id ? `\nTarefa criada/identificada: ${result.tarefa_id}` : ''
        alert(`Ação executada. Notificações enviadas: ${result.enviados || 0}.${extra}`)
      }
      await carregar()
    } catch (err: any) {
      alert(err?.message || 'Não foi possível executar a ação inteligente.')
    } finally {
      setExecutando(null)
    }
  }

  const scoreStyle = useMemo(() => ({
    background: `conic-gradient(var(--primary) ${(painel?.score || 0) * 3.6}deg, var(--bg3) 0deg)`,
  }), [painel?.score])

  if (loading) {
    return (
      <div className="page-container inteligencia-page">
        <div className="page-header"><div><h1>Central inteligente</h1><p>Calculando riscos, cobranças, agenda e ações…</p></div></div>
        <div className="intel-loading"><RefreshCw className="spin" size={22} /> Analisando dados do sistema</div>
      </div>
    )
  }

  if (erro) {
    return (
      <div className="page-container inteligencia-page">
        <div className="page-header"><div><h1>Central inteligente</h1><p>Não foi possível montar o diagnóstico agora.</p></div></div>
        <div className="empty-state"><AlertTriangle size={26} /><strong>{erro}</strong><button className="btn-primary" onClick={carregar}>Tentar novamente</button></div>
      </div>
    )
  }

  if (!painel) return null

  const financeiroCritico = painel.financeiro_critico || []
  const acoes = painel.acoes_inteligentes || []
  const acoesAgenda = acoes.filter(a => a.tipo === 'sincronizar_agenda')
  const acoesTarefa = acoes.filter(a => a.tipo === 'cobrar_tarefa')
  const acoesFinanceiras = acoes.filter(a => a.tipo !== 'cobrar_tarefa' && a.tipo !== 'sincronizar_agenda')
  const principaisAcoes = [...acoesAgenda, ...acoesFinanceiras.slice(0, 5), ...acoesTarefa.slice(0, 3)]

  return (
    <div className="page-container inteligencia-page compact-intelligence">
      <div className="page-header inteligencia-header">
        <div>
          <span className="eyebrow"><BrainCircuit size={14} /> Copiloto de gestão</span>
          <h1>Central inteligente</h1>
          <p>Menos relatório parado. Mais ação: cobrar, sincronizar agenda, criar tarefa e resolver pendências.</p>
        </div>
        <button className="btn-secondary" onClick={carregar}><RefreshCw size={15} /> Atualizar</button>
      </div>

      <section className="intel-hero compact">
        <div className="health-score" style={scoreStyle}><div><strong>{painel.score}</strong><span>/100</span></div></div>
        <div className="health-copy">
          <span className={`risk-pill ${riscoClass(painel.nivel)}`}>{nivelLabel(painel.nivel)}</span>
          <h2>Comando da empresa agora</h2>
          <p>{painel.resumo}</p>
          <div className="hero-actions">
            <Link to="/tarefas" className="btn-primary"><Target size={15} /> Tarefas</Link>
            <Link to="/financeiro?status=pendente" className="btn-secondary"><DollarSign size={15} /> Financeiro</Link>
            <Link to="/agenda" className="btn-secondary"><CalendarDays size={15} /> Agenda</Link>
          </div>
        </div>
      </section>

      <section className="intel-grid metrics-grid compact">
        <MetricaCard icon={CheckCircle2} label="Tarefas abertas" value={numero(painel.metricas.tarefas_abertas)} hint={`${numero(painel.metricas.tarefas_atrasadas)} atrasadas`} />
        <MetricaCard icon={WalletCards} label="Receber vencido" value={dinheiro(painel.metricas.recebimentos_vencidos)} hint="Cobrança externa/interna" />
        <MetricaCard icon={CreditCard} label="Pagar vencido" value={dinheiro(painel.metricas.pagamentos_vencidos)} hint="Regularização financeira" />
        <MetricaCard icon={CalendarDays} label="Agenda 7 dias" value={numero(painel.metricas.agenda_7_dias)} hint="Compromissos próximos" />
      </section>

      <section className="intel-card intel-command-center compact">
        <div className="section-title"><Sparkles size={18} /><div><h3>Ações diretas</h3><p>Sem informações repetidas: execute somente o que resolve.</p></div></div>
        {principaisAcoes.length === 0 ? (
          <div className="soft-empty"><ShieldCheck size={20} /> Nenhuma ação urgente para executar agora.</div>
        ) : (
          <div className="intel-actions-grid compact">
            {principaisAcoes.map((acao) => {
              const key = acaoKey(acao)
              const isFinanceiro = acao.tipo === 'cobrar_devedor' || acao.tipo === 'lembrar_pagamento' || acao.tipo === 'criar_tarefa_cobranca' || acao.tipo === 'notificar_financeiro'
              const isAgenda = acao.tipo === 'sincronizar_agenda'
              return (
                <div className="intel-action-card compact" key={key}>
                  <div className={`action-icon ${isAgenda ? 'agenda' : isFinanceiro ? 'financeiro' : 'tarefa'}`}>{isAgenda ? <CalendarDays size={18} /> : isFinanceiro ? <WalletCards size={18} /> : <Megaphone size={18} />}</div>
                  <div>
                    <span className={`risk-pill ${riscoClass(acao.nivel)}`}>{acao.nivel}</span>
                    <strong>{acao.titulo}</strong>
                    <p>{acao.detalhe}</p>
                    <button className="btn-primary" type="button" disabled={executando === key} onClick={() => executarAcao(acao)}>
                      {executando === key ? 'Executando…' : acaoTexto(acao)}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="intel-two-columns compact">
        <div className="intel-card compact-list-card">
          <div className="section-title"><CreditCard size={18} /><div><h3>Financeiro que pede ação</h3><p>Recebimentos, devedores e pagamentos no prazo crítico.</p></div></div>
          {financeiroCritico.length === 0 ? (
            <div className="soft-empty"><ShieldCheck size={20} /> Nenhuma pendência financeira crítica.</div>
          ) : (
            <div className="finance-command-list compact">
              {financeiroCritico.slice(0, 6).map((item) => (
                <div className="finance-command-row compact" key={item.id}>
                  <div>
                    <strong>{item.tipo === 'recebimento' ? 'Receber' : 'Pagar'} · {item.titulo}</strong>
                    <p>{item.pessoa_nome || 'Sem pessoa'} · {dinheiro(item.valor)} · {dataBR(item.vencimento)}</p>
                    {item.canal && <em className={`finance-channel ${item.canal}`}>{item.canal === 'whatsapp' ? 'WhatsApp externo' : item.canal === 'interno' ? 'Notificação interna' : 'Sem telefone'}</em>}
                  </div>
                  <Link className="btn-secondary" to={`/financeiro?tipo=${item.tipo}&status=pendente&vencidos=true`}>Abrir</Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="intel-card compact-list-card">
          <div className="section-title"><Activity size={18} /><div><h3>Fila crítica</h3><p>Principais tarefas para resolver primeiro.</p></div></div>
          <div className="critical-table compact">
            {painel.tarefas_criticas.slice(0, 6).map((tarefa) => {
              const acao = acoes.find(a => a.tipo === 'cobrar_tarefa' && a.tarefa_id === tarefa.id)
              const key = acao ? acaoKey(acao) : tarefa.id
              return (
                <div className="critical-row critical-row-action compact" key={tarefa.id}>
                  <Link to={`/tarefas?task=${tarefa.id}`}>
                    <div><strong>{tarefa.titulo}</strong><p>{tarefa.responsavel_nome || 'Sem responsável'} · {tarefa.status} · {dataBR(tarefa.prazo || tarefa.data)}</p></div>
                  </Link>
                  {acao && <button className="btn-secondary" type="button" disabled={executando === key} onClick={() => executarAcao(acao)}>{executando === key ? '...' : 'Cobrar'}</button>}
                </div>
              )
            })}
            {painel.tarefas_criticas.length === 0 && <div className="soft-empty"><CheckCircle2 size={20} /> Nenhuma tarefa crítica aberta.</div>}
          </div>
        </div>
      </section>

      <section className="intel-two-columns compact">
        <details className="intel-card compact-details" open>
          <summary><Route size={18} /> Riscos e plano recomendado</summary>
          <div className="compact-plan-grid">
            <div>
              {(painel.riscos || []).slice(0, 5).map((risco, idx) => (
                risco.destino ? <Link className="risk-row clickable-row compact" to={risco.destino} key={`${risco.titulo}-${idx}`}><span className={`risk-dot ${riscoClass(risco.nivel)}`} /><div><strong>{risco.titulo}</strong><p>{risco.detalhe}</p></div></Link>
                  : <div className="risk-row compact" key={`${risco.titulo}-${idx}`}><span className={`risk-dot ${riscoClass(risco.nivel)}`} /><div><strong>{risco.titulo}</strong><p>{risco.detalhe}</p></div></div>
              ))}
            </div>
            <div>
              {(painel.recomendacoes || []).slice(0, 5).map((rec, idx) => (
                rec.destino ? <Link to={rec.destino} className="recommendation-row clickable-row compact" key={`${rec.titulo}-${idx}`}><span>{idx + 1}</span><div><strong>{rec.titulo}</strong><p>{rec.detalhe}</p></div></Link>
                  : <div className="recommendation-row compact" key={`${rec.titulo}-${idx}`}><span>{idx + 1}</span><div><strong>{rec.titulo}</strong><p>{rec.detalhe}</p></div></div>
              ))}
            </div>
          </div>
        </details>

        <details className="intel-card compact-details">
          <summary><BellRing size={18} /> Notificações e análise Gemini</summary>
          <div className="notify-intel-box compact">
            <div><strong>Tempo real</strong><span>{painel.notificacoes?.tempo_real ? 'Ativo' : 'Inativo'}</span></div>
            <div><strong>Som</strong><span>{painel.notificacoes?.som ? 'Ativo' : 'Inativo'}</span></div>
            <div><strong>PWA/Navegador</strong><span>{painel.notificacoes?.navegador ? 'Compatível' : 'Não disponível'}</span></div>
          </div>
          <div className="gemini-box compact">
            <div className="gemini-status"><span className={painel.gemini.enabled ? 'online' : 'offline'} />{painel.gemini.enabled ? `Gemini · ${painel.gemini.model}` : 'Análise local ativa'}</div>
            <p>{painel.gemini.texto}</p>
            {painel.gemini.erro && <div className="gemini-error"><strong>Detalhe técnico:</strong> {painel.gemini.erro}</div>}
          </div>
        </details>
      </section>

      <section className="intel-card compact-list-card">
        <div className="section-title"><Users size={18} /><div><h3>Carga da equipe</h3><p>Visão resumida para redistribuir demanda.</p></div></div>
        {painel.sobrecarga.length === 0 ? (
          <div className="soft-empty"><ShieldCheck size={20} /> Sem sobrecarga relevante detectada.</div>
        ) : (
          <div className="workload-list compact">
            {painel.sobrecarga.map((item) => {
              const pct = Math.min(100, item.abertas * 10)
              const critico = item.atrasadas >= 3 || item.abertas >= 8
              return (
                <div className="workload-row compact" key={item.nome} style={{ borderLeft: critico ? '3px solid #EF4444' : '3px solid transparent', paddingLeft: 8 }}>
                  <div style={{ flex: 1 }}>
                    <strong>{item.nome}</strong>
                    <p style={{ color: item.atrasadas > 0 ? '#EF4444' : 'var(--text3)' }}>
                      {item.abertas} aberta(s) · {item.atrasadas > 0 ? <span style={{ fontWeight: 700 }}>{item.atrasadas} atrasada(s) ⚠️</span> : '0 atrasadas'}
                    </p>
                  </div>
                  <div className="workload-bar" style={{ flex: 1 }}>
                    <span style={{ width: `${pct}%`, background: critico ? '#EF4444' : 'var(--primary)' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Score de saúde operacional visual */}
      <section className="intel-card" style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: 8 }}>
          <strong style={{ fontSize: 14 }}>Saúde operacional geral</strong>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Score calculado com base em tarefas, finanças e agenda.</p>
        </div>
        <div style={{ position: 'relative', width: 100, height: 100, margin: '0 auto 8px' }}>
          <svg viewBox="0 0 100 100" style={{ width: 100, height: 100, transform: 'rotate(-90deg)' }}>
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="10" />
            <circle cx="50" cy="50" r="42" fill="none"
              stroke={painel.score >= 80 ? '#10B981' : painel.score >= 60 ? '#F59E0B' : '#EF4444'}
              strokeWidth="10"
              strokeDasharray={`${(painel.score / 100) * 264} 264`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray .6s ease' }}
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <strong style={{ fontSize: 22, lineHeight: 1, color: painel.score >= 80 ? '#10B981' : painel.score >= 60 ? '#F59E0B' : '#EF4444' }}>{painel.score}</strong>
            <span style={{ fontSize: 10, color: 'var(--text3)' }}>/ 100</span>
          </div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: painel.score >= 80 ? '#10B981' : painel.score >= 60 ? '#F59E0B' : '#EF4444' }}>
          {nivelLabel(painel.nivel)}
        </span>
      </section>
    </div>
  )
}
