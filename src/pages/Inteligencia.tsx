import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, AlertTriangle, BrainCircuit, CalendarDays, CheckCircle2,
  DollarSign, RefreshCw, Route, ShieldCheck, Sparkles, Target, Users,
} from 'lucide-react'
import { inteligenciaApi, type InteligenciaPainel } from '../lib/api'

function dinheiro(value?: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
}

function numero(value?: number) {
  return new Intl.NumberFormat('pt-BR').format(value || 0)
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
    <div className="intel-card metric-card">
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

  return (
    <div className="page-container inteligencia-page">
      <div className="page-header inteligencia-header">
        <div>
          <span className="eyebrow"><BrainCircuit size={14} /> Copiloto de gestão</span>
          <h1>Central inteligente</h1>
          <p>Diagnóstico automático da operação, tarefas, agenda e financeiro.</p>
        </div>
        <button className="btn-secondary" onClick={carregar}><RefreshCw size={15} /> Atualizar análise</button>
      </div>

      <section className="intel-hero">
        <div className="health-score" style={scoreStyle}>
          <div>
            <strong>{painel.score}</strong>
            <span>/100</span>
          </div>
        </div>
        <div className="health-copy">
          <span className={`risk-pill ${riscoClass(painel.nivel)}`}>{nivelLabel(painel.nivel)}</span>
          <h2>Saúde da empresa agora</h2>
          <p>{painel.resumo}</p>
          <div className="hero-actions">
            <Link to="/tarefas" className="btn-primary"><Target size={15} /> Resolver tarefas</Link>
            <Link to="/financeiro" className="btn-secondary"><DollarSign size={15} /> Ver financeiro</Link>
            <Link to="/agenda" className="btn-secondary"><CalendarDays size={15} /> Ver agenda</Link>
          </div>
        </div>
      </section>

      <section className="intel-grid metrics-grid">
        <MetricaCard icon={CheckCircle2} label="Tarefas abertas" value={numero(painel.metricas.tarefas_abertas)} hint={`${numero(painel.metricas.tarefas_atrasadas)} atrasadas`} />
        <MetricaCard icon={Target} label="Alta prioridade" value={numero(painel.metricas.tarefas_alta_prioridade)} hint="Precisa de foco primeiro" />
        <MetricaCard icon={DollarSign} label="Saldo previsto" value={dinheiro(painel.metricas.saldo_previsto)} hint="Receitas previstas menos despesas" />
        <MetricaCard icon={CalendarDays} label="Agenda da semana" value={numero(painel.metricas.agenda_7_dias)} hint="Compromissos próximos" />
      </section>

      <section className="intel-two-columns">
        <div className="intel-card">
          <div className="section-title"><AlertTriangle size={18} /><div><h3>Riscos detectados</h3><p>O que pode virar problema se não for tratado.</p></div></div>
          <div className="risk-list">
            {painel.riscos.map((risco, idx) => (
              <div className="risk-row" key={`${risco.titulo}-${idx}`}>
                <span className={`risk-dot ${riscoClass(risco.nivel)}`} />
                <div><strong>{risco.titulo}</strong><p>{risco.detalhe}</p></div>
                <small className={`risk-pill ${riscoClass(risco.nivel)}`}>{risco.nivel}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="intel-card">
          <div className="section-title"><Route size={18} /><div><h3>Plano recomendado</h3><p>Ações práticas para organizar a operação.</p></div></div>
          <div className="recommendation-list">
            {painel.recomendacoes.map((rec, idx) => (
              <div className="recommendation-row" key={`${rec.titulo}-${idx}`}>
                <span>{idx + 1}</span>
                <div><strong>{rec.titulo}</strong><p>{rec.detalhe}</p><small>{rec.acao}</small></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="intel-two-columns">
        <div className="intel-card">
          <div className="section-title"><Sparkles size={18} /><div><h3>Análise Gemini</h3><p>LLM configurável por GEMINI_API_KEY.</p></div></div>
          <div className="gemini-box">
            <div className="gemini-status">
              <span className={painel.gemini.enabled ? 'online' : 'offline'} />
              {painel.gemini.enabled ? `Gemini ativo · ${painel.gemini.model}` : 'Análise local ativa'}
            </div>
            <p>{painel.gemini.texto}</p>
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
        <div className="section-title"><Activity size={18} /><div><h3>Fila crítica inteligente</h3><p>Ordem sugerida para resolver primeiro.</p></div></div>
        <div className="critical-table">
          {painel.tarefas_criticas.map((tarefa) => (
            <Link to="/tarefas" className="critical-row" key={tarefa.id}>
              <div><strong>{tarefa.titulo}</strong><p>{tarefa.responsavel_nome || 'Sem responsável'} · {tarefa.status}</p></div>
              <span>{tarefa.prioridade}</span>
              <small>{tarefa.prazo || tarefa.data || 'Sem data'}</small>
            </Link>
          ))}
          {painel.tarefas_criticas.length === 0 && <div className="soft-empty"><CheckCircle2 size={20} /> Nenhuma tarefa crítica aberta.</div>}
        </div>
      </section>
    </div>
  )
}
