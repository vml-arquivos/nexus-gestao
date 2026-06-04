import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Activity, AlertTriangle, BrainCircuit, CalendarDays, CheckCircle2,
  DollarSign, ExternalLink, PlayCircle, RefreshCw, Route, ShieldCheck,
  Sparkles, Target, Users, Zap,
} from 'lucide-react'
import { inteligenciaApi, type AcaoInteligente, type InteligenciaPainel } from '../lib/api'

function dinheiro(value?: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
}

function numero(value?: number) {
  return new Intl.NumberFormat('pt-BR').format(value || 0)
}

function dataCurta(value?: string) {
  if (!value) return 'Sem data'
  const raw = String(value).slice(0, 10)
  const [y, m, d] = raw.split('-')
  if (y && m && d) return `${d}/${m}/${y}`
  return raw
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

function MetricaCard({ icon: Icon, label, value, hint, to }: { icon: any; label: string; value: string; hint: string; to?: string }) {
  const content = (
    <>
      <div className="metric-icon"><Icon size={18} /></div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
        <small>{hint}</small>
      </div>
    </>
  )
  if (to) return <Link to={to} className="intel-card metric-card metric-card-action">{content}<ExternalLink size={15} /></Link>
  return <div className="intel-card metric-card">{content}</div>
}

function AcaoCard({ acao, running, onExecute }: { acao: AcaoInteligente; running: boolean; onExecute: (acao: AcaoInteligente) => void }) {
  const prioridade = riscoClass(acao.prioridade || 'medio')
  const body = (
    <>
      <div className="action-card-main">
        <span className={`risk-pill ${prioridade}`}>{acao.prioridade || 'ação'}</span>
        <strong>{acao.titulo}</strong>
        <p>{acao.detalhe}</p>
      </div>
      <div className="action-card-footer">
        {acao.executavel ? (
          <button type="button" className="btn-primary btn-sm" disabled={running} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExecute(acao) }}>
            <PlayCircle size={14} /> {running ? 'Executando…' : 'Executar'}
          </button>
        ) : (
          <span className="action-open-label"><ExternalLink size={14} /> Abrir</span>
        )}
      </div>
    </>
  )

  if (acao.destino && !acao.executavel) {
    return <Link to={acao.destino} className="action-card">{body}</Link>
  }
  return <div className="action-card">{body}</div>
}

export default function Inteligencia() {
  const [painel, setPainel] = useState<InteligenciaPainel | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [executando, setExecutando] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const navigate = useNavigate()

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

  async function executarAcao(acao: AcaoInteligente) {
    const ok = window.confirm(acao.confirmacao || `Executar ação: ${acao.titulo}?`)
    if (!ok) return
    try {
      setExecutando(acao.id)
      setFeedback(null)
      const result = await inteligenciaApi.executarAcao({ tipo: acao.tipo, tarefa_id: acao.tarefa_id })
      setFeedback(result.mensagem || 'Ação executada com sucesso.')
      await carregar()
      if (result.destino) navigate(result.destino)
    } catch (err: any) {
      setFeedback(err?.message || 'Não foi possível executar a ação.')
    } finally {
      setExecutando(null)
    }
  }

  useEffect(() => { carregar() }, [])

  const scoreStyle = useMemo(() => ({
    background: `conic-gradient(var(--primary) ${(painel?.score || 0) * 3.6}deg, var(--bg3) 0deg)`,
  }), [painel?.score])

  if (loading) {
    return (
      <div className="page-container inteligencia-page">
        <div className="page-header"><div><h1>Central inteligente</h1><p>Calculando riscos, prioridades e recomendações…</p></div></div>
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
  const acoes = painel.acoes || []

  return (
    <div className="page-container inteligencia-page">
      <div className="page-header inteligencia-header">
        <div>
          <span className="eyebrow"><BrainCircuit size={14} /> Copiloto de ação</span>
          <h1>Central inteligente</h1>
          <p>Diagnóstico com ações clicáveis para resolver tarefas, financeiro e agenda.</p>
        </div>
        <button className="btn-secondary" onClick={carregar}><RefreshCw size={15} /> Atualizar análise</button>
      </div>

      {feedback && <div className="intel-feedback"><Zap size={16} /> {feedback}</div>}

      <section className="intel-hero action-hero">
        <div className="health-score" style={scoreStyle}>
          <div>
            <strong>{painel.score}</strong>
            <span>/100</span>
          </div>
        </div>
        <div className="health-copy">
          <span className={`risk-pill ${riscoClass(painel.nivel)}`}>{nivelLabel(painel.nivel)}</span>
          <h2>O que precisa de ação agora</h2>
          <p>{painel.resumo}</p>
          <div className="hero-actions">
            <Link to="/tarefas?filtro=criticas" className="btn-primary"><Target size={15} /> Abrir fila crítica</Link>
            <Link to="/financeiro" className="btn-secondary"><DollarSign size={15} /> Ver financeiro</Link>
            <Link to="/agenda" className="btn-secondary"><CalendarDays size={15} /> Ver agenda</Link>
          </div>
        </div>
      </section>

      <section className="intel-grid metrics-grid">
        <MetricaCard to="/tarefas?status=abertas" icon={CheckCircle2} label="Tarefas abertas" value={numero(painel.metricas.tarefas_abertas)} hint={`${numero(painel.metricas.tarefas_atrasadas)} atrasadas`} />
        <MetricaCard to="/tarefas?prioridade=alta" icon={Target} label="Alta prioridade" value={numero(painel.metricas.tarefas_alta_prioridade)} hint="Clique para focar primeiro" />
        <MetricaCard to="/financeiro" icon={DollarSign} label="Saldo previsto" value={dinheiro(painel.metricas.saldo_previsto)} hint="Receitas previstas menos despesas" />
        <MetricaCard to="/agenda" icon={CalendarDays} label="Agenda da semana" value={numero(painel.metricas.agenda_7_dias)} hint="Compromissos próximos" />
      </section>

      <section className="intel-card action-panel">
        <div className="section-title"><Zap size={18} /><div><h3>Ações inteligentes</h3><p>Clique para abrir a tela correta ou executar uma ação com confirmação.</p></div></div>
        {acoes.length === 0 ? (
          <div className="soft-empty"><ShieldCheck size={20} /> Nenhuma ação urgente sugerida agora.</div>
        ) : (
          <div className="action-grid">
            {acoes.map((acao) => <AcaoCard key={acao.id} acao={acao} running={executando === acao.id} onExecute={executarAcao} />)}
          </div>
        )}
      </section>

      <section className="intel-two-columns">
        <div className="intel-card">
          <div className="section-title"><AlertTriangle size={18} /><div><h3>Riscos detectados</h3><p>Cada risco agora leva para uma tela de resolução.</p></div></div>
          <div className="risk-list">
            {painel.riscos.map((risco, idx) => {
              const row = (
                <>
                  <span className={`risk-dot ${riscoClass(risco.nivel)}`} />
                  <div><strong>{risco.titulo}</strong><p>{risco.detalhe}</p></div>
                  <small className={`risk-pill ${riscoClass(risco.nivel)}`}>{risco.nivel}</small>
                </>
              )
              return risco.destino ? <Link to={risco.destino} className="risk-row risk-row-action" key={`${risco.titulo}-${idx}`}>{row}</Link> : <div className="risk-row" key={`${risco.titulo}-${idx}`}>{row}</div>
            })}
          </div>
        </div>

        <div className="intel-card">
          <div className="section-title"><Route size={18} /><div><h3>Plano recomendado</h3><p>Plano operacional com direcionamento claro.</p></div></div>
          <div className="recommendation-list">
            {painel.recomendacoes.map((rec, idx) => {
              const content = <><span>{idx + 1}</span><div><strong>{rec.titulo}</strong><p>{rec.detalhe}</p><small>{rec.acao}</small></div></>
              return rec.destino ? <Link to={rec.destino} className="recommendation-row recommendation-row-action" key={`${rec.titulo}-${idx}`}>{content}</Link> : <div className="recommendation-row" key={`${rec.titulo}-${idx}`}>{content}</div>
            })}
          </div>
        </div>
      </section>

      <section className="intel-two-columns">
        <div className="intel-card">
          <div className="section-title"><Sparkles size={18} /><div><h3>Análise Gemini</h3><p>Usada como copiloto de leitura; as ações vêm estruturadas pelo sistema.</p></div></div>
          <div className="gemini-box">
            <div className="gemini-status">
              <span className={painel.gemini.enabled ? 'online' : 'offline'} />
              {painel.gemini.enabled ? `Gemini ativo · ${painel.gemini.model}` : 'Análise local ativa'}
            </div>
            <p>{painel.gemini.texto}</p>
            {painel.gemini.erro && <div className="gemini-error"><strong>Detalhe técnico:</strong> {painel.gemini.erro}</div>}
          </div>
        </div>

        <div className="intel-card">
          <div className="section-title"><Users size={18} /><div><h3>Carga da equipe</h3><p>Quem concentra mais tarefas abertas.</p></div></div>
          {painel.sobrecarga.length === 0 ? (
            <div className="soft-empty"><ShieldCheck size={20} /> Sem sobrecarga relevante para exibir.</div>
          ) : (
            <div className="workload-list">
              {painel.sobrecarga.map((item) => (
                <div className="workload-row" key={item.nome}>
                  <div><strong>{item.nome}</strong><p>{item.abertas} aberta(s) · {item.atrasadas} atrasada(s)</p></div>
                  <div className="workload-bar"><span style={{ width: `${Math.min(100, item.abertas * 10)}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="intel-card">
        <div className="section-title"><Activity size={18} /><div><h3>Fila crítica inteligente</h3><p>Clique em qualquer linha para abrir a tarefa diretamente.</p></div></div>
        <div className="critical-table">
          {painel.tarefas_criticas.map((tarefa) => (
            <Link to={`/tarefas?task=${encodeURIComponent(tarefa.id)}`} className="critical-row" key={tarefa.id}>
              <div><strong>{tarefa.titulo}</strong><p>{tarefa.responsavel_nome || 'Sem responsável'} · {tarefa.status}</p></div>
              <span>{tarefa.prioridade}</span>
              <small>{dataCurta(tarefa.data_reabertura || tarefa.updated_at || tarefa.prazo || tarefa.data)}</small>
            </Link>
          ))}
          {painel.tarefas_criticas.length === 0 && <div className="soft-empty"><CheckCircle2 size={20} /> Nenhuma tarefa crítica aberta.</div>}
        </div>
      </section>
    </div>
  )
}
