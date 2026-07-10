import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, CheckCircle2, DollarSign, Users, FileText, Loader, CornerDownLeft } from 'lucide-react'
import { tarefasApi, pagamentosApi, equipeApi, documentosApi, type Tarefa, type Pagamento, type Pessoa, type Documento } from '../lib/api'

/**
 * Busca global do Nexus — um único campo que cobre Tarefas, Financeiro,
 * Pessoas e Documentos ao mesmo tempo, com navegação por teclado.
 *
 * Os dados são buscados uma vez (na abertura) e filtrados no cliente a
 * cada tecla — evita 1 requisição por letra digitada e mantém a busca
 * instantânea mesmo em conexão ruim.
 */

type Resultado = {
  id: string
  categoria: 'tarefa' | 'financeiro' | 'pessoa' | 'documento'
  titulo: string
  subtitulo: string
  to: string
}

const CATEGORIA_LABEL: Record<Resultado['categoria'], string> = {
  tarefa: 'Tarefas',
  financeiro: 'Financeiro',
  pessoa: 'Pessoas',
  documento: 'Documentos',
}
const CATEGORIA_ICON: Record<Resultado['categoria'], typeof CheckCircle2> = {
  tarefa: CheckCircle2,
  financeiro: DollarSign,
  pessoa: Users,
  documento: FileText,
}

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [termo, setTermo] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [carregado, setCarregado] = useState(false)
  const [indiceAtivo, setIndiceAtivo] = useState(0)
  const [dados, setDados] = useState<{ tarefas: Tarefa[]; pagamentos: Pagamento[]; pessoas: Pessoa[]; documentos: Documento[] }>({
    tarefas: [], pagamentos: [], pessoas: [], documentos: [],
  })
  const inputRef = useRef<HTMLInputElement>(null)

  // Carrega os dados uma única vez, na primeira abertura da busca.
  useEffect(() => {
    if (!open || carregado) return
    setCarregando(true)
    Promise.all([
      tarefasApi.list().catch(() => []),
      pagamentosApi.list().catch(() => []),
      equipeApi.pessoas().catch(() => []),
      documentosApi.list().catch(() => []),
    ]).then(([tarefas, pagamentos, pessoas, documentos]) => {
      setDados({ tarefas, pagamentos, pessoas, documentos })
      setCarregado(true)
    }).finally(() => setCarregando(false))
  }, [open, carregado])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30)
    else { setTermo(''); setIndiceAtivo(0) }
  }, [open])

  const resultados = useMemo<Resultado[]>(() => {
    const q = normalizar(termo.trim())
    if (q.length < 2) return []

    const out: Resultado[] = []

    dados.tarefas.forEach(t => {
      if (normalizar(t.titulo).includes(q) || normalizar(t.descricao || '').includes(q)) {
        out.push({
          id: `t-${t.id}`, categoria: 'tarefa', titulo: t.titulo,
          subtitulo: t.responsavel_nome || t.criado_por_nome || 'Sem responsável',
          to: `/tarefas?task=${t.id}`,
        })
      }
    })
    dados.pagamentos.forEach(p => {
      if (normalizar(p.titulo).includes(q) || normalizar(p.pessoa_nome || '').includes(q)) {
        out.push({
          id: `f-${p.id}`, categoria: 'financeiro', titulo: p.titulo,
          subtitulo: `${p.tipo === 'recebimento' ? 'A receber' : 'A pagar'} · ${Number(p.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
          to: `/financeiro?id=${p.id}`,
        })
      }
    })
    dados.pessoas.forEach(p => {
      if (normalizar(p.nome).includes(q) || normalizar(p.email || '').includes(q)) {
        out.push({
          id: `p-${p.id}`, categoria: 'pessoa', titulo: p.nome,
          subtitulo: p.cargo || p.email || p.tipo,
          to: `/pessoas?id=${p.id}`,
        })
      }
    })
    dados.documentos.forEach(d => {
      if (normalizar(d.titulo).includes(q) || normalizar(d.pessoa_nome || '').includes(q)) {
        out.push({
          id: `d-${d.id}`, categoria: 'documento', titulo: d.titulo,
          subtitulo: d.pessoa_nome ? `${d.tipo} · ${d.pessoa_nome}` : d.tipo,
          to: `/documentos?id=${d.id}`,
        })
      }
    })

    return out.slice(0, 30)
  }, [termo, dados])

  const irPara = useCallback((r: Resultado) => {
    navigate(r.to)
    onClose()
  }, [navigate, onClose])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndiceAtivo(i => Math.min(i + 1, resultados.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIndiceAtivo(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter' && resultados[indiceAtivo]) { irPara(resultados[indiceAtivo]); return }
  }

  if (!open) return null

  const agrupado = (['tarefa', 'financeiro', 'pessoa', 'documento'] as const)
    .map(cat => ({ cat, itens: resultados.filter(r => r.categoria === cat) }))
    .filter(g => g.itens.length > 0)

  let contadorGlobal = -1

  return (
    <div className="global-search-backdrop" onClick={onClose}>
      <div className="global-search-panel" onClick={e => e.stopPropagation()}>
        <div className="global-search-input-row">
          <Search size={18} color="var(--text3)" />
          <input
            ref={inputRef}
            value={termo}
            onChange={e => { setTermo(e.target.value); setIndiceAtivo(0) }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar em tarefas, financeiro, pessoas, documentos..."
            className="global-search-input"
          />
          {carregando && <Loader size={16} className="global-search-spinner" />}
          <button type="button" onClick={onClose} className="global-search-close" aria-label="Fechar busca">
            <X size={16} />
          </button>
        </div>

        <div className="global-search-results">
          {termo.trim().length < 2 ? (
            <div className="global-search-empty">Digite pelo menos 2 letras para buscar.</div>
          ) : resultados.length === 0 ? (
            <div className="global-search-empty">Nenhum resultado para "{termo}".</div>
          ) : (
            agrupado.map(grupo => {
              const Icon = CATEGORIA_ICON[grupo.cat]
              return (
                <div key={grupo.cat} className="global-search-group">
                  <div className="global-search-group-label">{CATEGORIA_LABEL[grupo.cat]}</div>
                  {grupo.itens.map(r => {
                    contadorGlobal++
                    const ativo = contadorGlobal === indiceAtivo
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={`global-search-result${ativo ? ' active' : ''}`}
                        onMouseEnter={() => setIndiceAtivo(contadorGlobal)}
                        onClick={() => irPara(r)}
                      >
                        <Icon size={15} />
                        <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                          <div className="global-search-result-title">{r.titulo}</div>
                          <div className="global-search-result-sub">{r.subtitulo}</div>
                        </div>
                        {ativo && <CornerDownLeft size={13} className="global-search-enter-hint" />}
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
