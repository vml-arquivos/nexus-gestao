import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, AlertTriangle, BellRing, BrainCircuit, CalendarDays, CheckCircle2,
  CreditCard, DollarSign, Megaphone, RefreshCw, Route, ShieldCheck, Sparkles,
  Target, Users, WalletCards,
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

  async function executarAcao(acao: NonNullable<InteligenciaPainel['acoes_inteligentes']>[number]) {
    const frase = acao.tipo === 'cobrar_devedor'
      ? 'Enviar cobrança interna e alerta sonoro sobre esse recebimento?'
      : acao.tipo === 'lembrar_pagamento'
        ? 'Enviar alerta interno e sonoro sobre esse pagamento?'
        : acao.tipo === 'criar_tarefa_cobranca'
          ? 'Criar uma tarefa operacional com checklist para resolver essa pendência financeira?'
          : 'Enviar cobrança inteligente para os responsáveis?'
    if (!confirm(`${frase}\n\n${acao.titulo}`)) return

    const chave = `${acao.tipo}-${acao.tarefa_id || acao.pagamento_id || acao.titulo}`
    try {
      setExecutando(chave)
      const result = await inteligenciaApi.executarAcao({ tipo: acao.tipo, tarefa_id: acao.tarefa_id, pagamento_id: acao.pagamento_id })
      const extra = result.tarefa_id ? `\nTarefa criada/identificada: ${result.tarefa_id}` : ''
      alert(`Ação executada. Notificações enviadas: ${result.enviados || 0}.${extra}`)
      await carregar()
    } catch (err: any) {
      alert(err?.message || 'Não foi possível executar a ação inteligente.')
    } finally {
      setExecutando(null)
    }
  }

  function acaoKey(acao: NonNullable<InteligenciaPainel['acoes_inteligentes']>[number]) {
    return `${acao.tipo}-${acao.tarefa_id || acao.pagamento_id || acao.titulo}`
  }

  const scoreStyle = useMemo(() => ({
    background: `conic-gradient(var(--primary) ${(painel?.score || 0) * 3.6}deg, var(--bg3) 0deg)`,
  }), [painel?.score])

  if (loading) {
    return (
      <div className="page-container inteligencia-page">
        <div className="page-header"><div><h1>Central inteligente</h1><p>Calculando riscos, prioridades, cobranças e recomendações…</p></div></div>
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

  return (
    <div className="page-container inteligencia-page">
      <div className="page-header inteligencia-header">
        <div>
          <span className="eyebrow"><BrainCircuit size={14} /> Copiloto de gestão</span>
          <h1>Central inteligente</h1>
          <p>Diagnóstico e ações reais para tarefas, cobranças, contas a pagar, agenda e notificações.</p>
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
            <Link to="/financeiro?status=pendente" className="btn-secondary"><DollarSign size={15} /> Ver pendências</Link>
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

      <section className="intel-card intel-command-center">
        <div className="section-title"><Sparkles size={18} /><div><h3>Ações inteligentes executáveis</h3><p>Aqui a IA deixa de ser só relatório: ela envia cobrança, cria tarefa financeira e dispara alerta em tempo real.</p></div></div>
        {acoes.length === 0 ? (
          <div className="soft-empty"><ShieldCheck size={20} /> Nenhuma ação urgente para executar agora.</div>
        ) : (
          <div className="intel-actions-grid">
            {acoes.map((acao) => {
              const key = acaoKey(acao)
              const isFinanceiro = acao.tipo === 'cobrar_devedor' || acao.tipo === 'lembrar_pagamento' || acao.tipo === 'criar_tarefa_cobranca' || acao.tipo === 'notificar_financeiro'
              return (
                <div className="intel-action-card" key={key}>
                  <div className={`action-icon ${isFinanceiro ? 'financeiro' : 'tarefa'}`}>{isFinanceiro ? <WalletCards size={18} /> : <Megaphone size={18} />}</div>
                  <div>
                    <span className={`risk-pill ${riscoClass(acao.nivel)}`}>{acao.nivel}</span>
                    <strong>{acao.titulo}</strong>
                    <p>{acao.detalhe}</p>
                    <button className="btn-primary" type="button" disabled={executando === key} onClick={() => executarAcao(acao)}>
                      {executando === key ? 'Executando…' : acao.tipo === 'criar_tarefa_cobranca' ? 'Criar tarefa' : 'Enviar aviso'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="intel-two-columns">
        <div className="intel-card">
          <div className="section-title"><AlertTriangle size={18} /><div><h3>Riscos detectados</h3><p>O que pode virar problema se não for tratado.</p></div></div>
          <div className="risk-list">
            {painel.riscos.map((risco, idx) => {
              const content = (
                <>
                  <span className={`risk-dot ${riscoClass(risco.nivel)}`} />
                  <div><strong>{risco.titulo}</strong><p>{risco.detalhe}</p></div>
                  <small className={`risk-pill ${riscoClass(risco.nivel)}`}>{risco.nivel}</small>
                </>
              )
              return risco.destino ? (
                <Link className="risk-row clickable-row" to={risco.destino} key={`${risco.titulo}-${idx}`}>{content}</Link>
              ) : (
                <div className="risk-row" key={`${risco.titulo}-${idx}`}>{content}</div>
              )
            })}
          </div>
        </div>

        <div className="intel-card">
          <div className="section-title"><Route size={18} /><div><h3>Plano recomendado</h3><p>Ações práticas para organizar a operação.</p></div></div>
          <div className="recommendation-list">
            {painel.recomendacoes.map((rec, idx) => {
              const row = <><span>{idx + 1}</span><div><strong>{rec.titulo}</strong><p>{rec.detalhe}</p><small>{rec.acao}</small></div></>
              return rec.destino ? <Link to={rec.destino} className="recommendation-row clickable-row" key={`${rec.titulo}-${idx}`}>{row}</Link> : <div className="recommendation-row" key={`${rec.titulo}-${idx}`}>{row}</div>
            })}
          </div>
        </div>
      </section>

      <section className="intel-two-columns">
        <div className="intel-card">
          <div className="section-title"><CreditCard size={18} /><div><h3>Comando financeiro inteligente</h3><p>Recebimentos vencidos, devedores e pagamentos que precisam de ação.</p></div></div>
          {financeiroCritico.length === 0 ? (
            <div className="soft-empty"><ShieldCheck size={20} /> Nenhuma pendência financeira crítica no período.</div>
          ) : (
            <div className="finance-command-list">
              {financeiroCritico.map((item) => (
                <div className="finance-command-row" key={item.id}>
                  <div>
                    <strong>{item.tipo === 'recebimento' ? 'A receber' : 'A pagar'} · {item.titulo}</strong>
                    <p>{item.pessoa_nome || 'Sem pessoa vinculada'} · {dinheiro(item.valor)} · {dataBR(item.vencimento)}</p>
                    <small>{item.sugestao}</small>
                  </div>
                  <Link className="btn-secondary" to={`/financeiro?tipo=${item.tipo}&status=pendente&vencidos=true`}>Abrir financeiro</Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="intel-card">
          <div className="section-title"><BellRing size={18} /><div><h3>Notificações inteligentes</h3><p>Alertas em tempo real com aviso visual e som quando o navegador permitir.</p></div></div>
          <div className="notify-intel-box">
            <div><strong>Tempo real</strong><span>{painel.notificacoes?.tempo_real ? 'Ativo' : 'Inativo'}</span></div>
            <div><strong>Som</strong><span>{painel.notificacoes?.som ? 'Ativo no navegador/PWA' : 'Inativo'}</span></div>
            <div><strong>Navegador</strong><span>{painel.notificacoes?.navegador ? 'Compatível com permissão' : 'Não disponível'}</span></div>
          </div>
          <p className="intel-note">Para receber som/notificação fora da aba, ative notificações nas configurações do sistema e permita notificações no navegador/PWA.</p>
          <div className="notify-types">
            {(painel.notificacoes?.tipos || []).map((tipo) => <span key={tipo}>{tipo}</span>)}
          </div>
        </div>
      </section>

      <section className="intel-two-columns">
        <div className="intel-card">
          <div className="section-title"><Sparkles size={18} /><div><h3>Análise Gemini</h3><p>LLM configurável por GEMINI_API_KEY e GEMINI_MODEL.</p></div></div>
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
        <div className="section-title"><Activity size={18} /><div><h3>Fila crítica inteligente</h3><p>Ordem sugerida para resolver primeiro.</p></div></div>
        <div className="critical-table">
          {painel.tarefas_criticas.map((tarefa) => {
            const acao = acoes.find(a => a.tipo === 'cobrar_tarefa' && a.tarefa_id === tarefa.id)
            const key = acao ? acaoKey(acao) : tarefa.id
            return (
              <div className="critical-row critical-row-action" key={tarefa.id}>
                <Link to={`/tarefas?task=${tarefa.id}`}>
                  <div><strong>{tarefa.titulo}</strong><p>{tarefa.responsavel_nome || 'Sem responsável'} · {tarefa.status}</p></div>
                  <span>{tarefa.prioridade}</span>
                  <small>{dataBR(tarefa.prazo || tarefa.data)}</small>
                </Link>
                {acao && (
                  <button className="btn-secondary" type="button" disabled={executando === key} onClick={() => executarAcao(acao)}>
                    {executando === key ? 'Enviando…' : 'Cobrar agora'}
                  </button>
                )}
              </div>
            )
          })}
          {painel.tarefas_criticas.length === 0 && <div className="soft-empty"><CheckCircle2 size={20} /> Nenhuma tarefa crítica aberta.</div>}
        </div>
      </section>
    </div>
  )
}
