import { useState } from 'react'
import {
  Link2, Copy, Trash2, Eye, Lock, Globe, Plus,
  CheckCircle2, Clock, Users, FileText, X, Share2,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Permissao = 'publico' | 'restrito'

interface LinkCompartilhado {
  id: string
  titulo: string
  tipo: 'documento' | 'relatorio' | 'pasta'
  permissao: Permissao
  url: string
  criadoEm: string
  expiraEm: string | null
  visualizacoes: number
  ativo: boolean
}

// ── Dados mockados ─────────────────────────────────────────────────────────────
const MOCK_LINKS: LinkCompartilhado[] = [
  {
    id: '1',
    titulo: 'Relatório Financeiro Q1 2026',
    tipo: 'relatorio',
    permissao: 'restrito',
    url: 'https://nexus.app/s/xK92mP',
    criadoEm: '2026-05-10',
    expiraEm: '2026-06-10',
    visualizacoes: 14,
    ativo: true,
  },
  {
    id: '2',
    titulo: 'Contrato - Fornecedor Alfa',
    tipo: 'documento',
    permissao: 'restrito',
    url: 'https://nexus.app/s/aB34cD',
    criadoEm: '2026-05-01',
    expiraEm: null,
    visualizacoes: 3,
    ativo: true,
  },
  {
    id: '3',
    titulo: 'Apresentação Institucional',
    tipo: 'documento',
    permissao: 'publico',
    url: 'https://nexus.app/s/pQ78rS',
    criadoEm: '2026-04-20',
    expiraEm: '2026-05-20',
    visualizacoes: 87,
    ativo: false,
  },
  {
    id: '4',
    titulo: 'Pasta Projetos 2026',
    tipo: 'pasta',
    permissao: 'restrito',
    url: 'https://nexus.app/s/lM56nO',
    criadoEm: '2026-05-18',
    expiraEm: null,
    visualizacoes: 6,
    ativo: true,
  },
]

// ── Utilitários ────────────────────────────────────────────────────────────────
function formatarData(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isExpirado(expiraEm: string | null) {
  if (!expiraEm) return false
  return new Date(expiraEm) < new Date()
}

// ── Sub-componentes ────────────────────────────────────────────────────────────
function BadgePermissao({ permissao }: { permissao: Permissao }) {
  const publico = permissao === 'publico'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
      background: publico ? 'color-mix(in srgb, var(--success, #22c55e) 12%, transparent)'
                          : 'color-mix(in srgb, var(--accent, #6366f1) 12%, transparent)',
      color: publico ? 'var(--success, #22c55e)' : 'var(--accent, #6366f1)',
    }}>
      {publico ? <Globe size={11} /> : <Lock size={11} />}
      {publico ? 'Público' : 'Restrito'}
    </span>
  )
}

function BadgeTipo({ tipo }: { tipo: LinkCompartilhado['tipo'] }) {
  const map = {
    documento: { label: 'Documento', color: 'var(--blue, #3b82f6)' },
    relatorio:  { label: 'Relatório',  color: 'var(--orange, #f97316)' },
    pasta:      { label: 'Pasta',      color: 'var(--yellow, #eab308)' },
  }
  const { label, color } = map[tipo]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
      background: `color-mix(in srgb, ${color} 12%, transparent)`,
      color,
    }}>
      <FileText size={11} />
      {label}
    </span>
  )
}

// ── Modal: Novo compartilhamento ───────────────────────────────────────────────
function ModalNovoLink({ onClose, onCriar }: {
  onClose: () => void
  onCriar: (link: LinkCompartilhado) => void
}) {
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState<LinkCompartilhado['tipo']>('documento')
  const [permissao, setPermissao] = useState<Permissao>('restrito')
  const [expira, setExpira] = useState('')

  function handleSubmit() {
    if (!titulo.trim()) return
    const novo: LinkCompartilhado = {
      id: Date.now().toString(),
      titulo: titulo.trim(),
      tipo,
      permissao,
      url: `https://nexus.app/s/${Math.random().toString(36).slice(2, 8)}`,
      criadoEm: new Date().toISOString().slice(0, 10),
      expiraEm: expira || null,
      visualizacoes: 0,
      ativo: true,
    }
    onCriar(novo)
    onClose()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '9px 12px', borderRadius: 8,
    border: '1px solid var(--border, #e5e7eb)',
    background: 'var(--surface, #fff)',
    color: 'var(--text1, #111)',
    fontSize: 14, outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600,
    color: 'var(--text3, #9ca3af)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg, #fff)', borderRadius: 16,
          width: '100%', maxWidth: 460,
          padding: 28, boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', gap: 20,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'var(--grad-primary, linear-gradient(135deg,#6366f1,#8b5cf6))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Share2 size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text1, #111)' }}>Novo link</div>
              <div style={{ fontSize: 12, color: 'var(--text3, #9ca3af)' }}>Preencha os dados abaixo</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={18} color="var(--text3, #9ca3af)" />
          </button>
        </div>

        {/* Título */}
        <div>
          <label style={labelStyle}>Título</label>
          <input
            style={inputStyle}
            placeholder="Ex: Relatório de Março"
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
          />
        </div>

        {/* Tipo + Permissão */}
        {/* Os campos de tipo e permissão agora usam uma grade responsiva
           para reorganizar os dois campos em telas menores sem perder legibilidade. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <div>
            <label style={labelStyle}>Tipo</label>
            <select style={{ ...inputStyle }} value={tipo} onChange={e => setTipo(e.target.value as LinkCompartilhado['tipo'])}>
              <option value="documento">Documento</option>
              <option value="relatorio">Relatório</option>
              <option value="pasta">Pasta</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Acesso</label>
            <select style={{ ...inputStyle }} value={permissao} onChange={e => setPermissao(e.target.value as Permissao)}>
              <option value="restrito">Restrito</option>
              <option value="publico">Público</option>
            </select>
          </div>
        </div>

        {/* Expiração */}
        <div>
          <label style={labelStyle}>Expiração (opcional)</label>
          <input
            type="date"
            style={inputStyle}
            value={expira}
            onChange={e => setExpira(e.target.value)}
          />
        </div>

        {/* Ações */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)',
              background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              color: 'var(--text2, #374151)',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!titulo.trim()}
            style={{
              padding: '9px 18px', borderRadius: 8, border: 'none',
              background: titulo.trim() ? 'var(--grad-primary, linear-gradient(135deg,#6366f1,#8b5cf6))' : 'var(--border, #e5e7eb)',
              color: titulo.trim() ? '#fff' : 'var(--text3, #9ca3af)',
              cursor: titulo.trim() ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 600,
              transition: 'opacity .15s',
            }}
          >
            Gerar link
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Linha da tabela ────────────────────────────────────────────────────────────
function LinhaLink({
  link,
  onCopiar,
  onRemover,
  copiado,
}: {
  link: LinkCompartilhado
  onCopiar: (id: string, url: string) => void
  onRemover: (id: string) => void
  copiado: string | null
}) {
  const expirado = isExpirado(link.expiraEm)
  const inativo = !link.ativo || expirado

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto auto auto auto',
      alignItems: 'center',
      gap: 16,
      padding: '14px 20px',
      borderRadius: 12,
      background: 'var(--surface, #fff)',
      border: '1px solid var(--border, #e5e7eb)',
      opacity: inativo ? 0.55 : 1,
      transition: 'box-shadow .15s',
    }}>
      {/* Info */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontWeight: 600, fontSize: 14, color: 'var(--text1, #111)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          marginBottom: 6,
        }}>
          {link.titulo}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <BadgeTipo tipo={link.tipo} />
          <BadgePermissao permissao={link.permissao} />
          {expirado && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
              background: 'color-mix(in srgb, #ef4444 12%, transparent)',
              color: '#ef4444',
            }}>
              <Clock size={11} /> Expirado
            </span>
          )}
        </div>
      </div>

      {/* Visualizações */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text3, #9ca3af)', fontSize: 13, whiteSpace: 'nowrap' }}>
        <Eye size={14} />
        {link.visualizacoes}
      </div>

      {/* Data criação */}
      <div style={{ fontSize: 12, color: 'var(--text3, #9ca3af)', whiteSpace: 'nowrap' }}>
        {formatarData(link.criadoEm)}
      </div>

      {/* Copiar */}
      <button
        onClick={() => onCopiar(link.id, link.url)}
        title="Copiar link"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)',
          background: copiado === link.id ? 'color-mix(in srgb, #22c55e 10%, transparent)' : 'none',
          color: copiado === link.id ? '#22c55e' : 'var(--text2, #374151)',
          cursor: inativo ? 'not-allowed' : 'pointer',
          fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
          transition: 'all .2s',
        }}
        disabled={inativo}
      >
        {copiado === link.id ? <CheckCircle2 size={14} /> : <Copy size={14} />}
        {copiado === link.id ? 'Copiado' : 'Copiar'}
      </button>

      {/* Remover */}
      <button
        onClick={() => onRemover(link.id)}
        title="Remover link"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 8,
          border: '1px solid var(--border, #e5e7eb)',
          background: 'none', cursor: 'pointer',
          color: 'var(--text3, #9ca3af)',
          transition: 'color .15s, background .15s',
        }}
        onMouseEnter={e => {
          ;(e.currentTarget as HTMLButtonElement).style.color = '#ef4444'
          ;(e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, #ef4444 8%, transparent)'
        }}
        onMouseLeave={e => {
          ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text3, #9ca3af)'
          ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
        }}
      >
        <Trash2 size={15} />
      </button>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function Compartilhar() {
  const [links, setLinks] = useState<LinkCompartilhado[]>(MOCK_LINKS)
  const [modalAberto, setModalAberto] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'todos' | 'ativos' | 'expirados'>('todos')

  function handleCopiar(id: string, url: string) {
    navigator.clipboard.writeText(url).catch(() => {})
    setCopiado(id)
    setTimeout(() => setCopiado(null), 2000)
  }

  function handleRemover(id: string) {
    setLinks(prev => prev.filter(l => l.id !== id))
  }

  function handleCriar(link: LinkCompartilhado) {
    setLinks(prev => [link, ...prev])
  }

  const linksFiltrados = links.filter(l => {
    if (filtro === 'ativos')    return l.ativo && !isExpirado(l.expiraEm)
    if (filtro === 'expirados') return !l.ativo || isExpirado(l.expiraEm)
    return true
  })

  const totalAtivos    = links.filter(l => l.ativo && !isExpirado(l.expiraEm)).length
  const totalExpirados = links.filter(l => !l.ativo || isExpirado(l.expiraEm)).length
  const totalViews     = links.reduce((acc, l) => acc + l.visualizacoes, 0)

  const statStyle = (cor: string): React.CSSProperties => ({
    flex: 1, minWidth: 0,
    padding: '16px 20px', borderRadius: 12,
    background: 'var(--surface, #fff)',
    border: '1px solid var(--border, #e5e7eb)',
    display: 'flex', flexDirection: 'column', gap: 4,
  })

  return (
    <div style={{ padding: '24px 28px', maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text1, #111)' }}>
            Compartilhar
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text3, #9ca3af)' }}>
            Gerencie links de acesso a documentos, relatórios e pastas.
          </p>
        </div>
        <button
          onClick={() => setModalAberto(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: 'var(--grad-primary, linear-gradient(135deg,#6366f1,#8b5cf6))',
            color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            boxShadow: '0 4px 12px rgba(99,102,241,.3)',
          }}
        >
          <Plus size={16} /> Novo link
        </button>
      </div>

      {/* Cards de resumo */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={statStyle('#6366f1')}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3, #9ca3af)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total de links</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text1, #111)' }}>{links.length}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text3, #9ca3af)' }}>
            <Link2 size={12} /> links criados
          </div>
        </div>
        <div style={statStyle('#22c55e')}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3, #9ca3af)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ativos</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text1, #111)' }}>{totalAtivos}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text3, #9ca3af)' }}>
            <CheckCircle2 size={12} /> disponíveis
          </div>
        </div>
        <div style={statStyle('#f97316')}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3, #9ca3af)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Visualizações</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text1, #111)' }}>{totalViews}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text3, #9ca3af)' }}>
            <Eye size={12} /> acessos totais
          </div>
        </div>
        <div style={statStyle('#ef4444')}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3, #9ca3af)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Expirados</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text1, #111)' }}>{totalExpirados}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text3, #9ca3af)' }}>
            <Clock size={12} /> inativos
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8 }}>
        {(['todos', 'ativos', 'expirados'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            style={{
              padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)',
              background: filtro === f ? 'var(--grad-primary, linear-gradient(135deg,#6366f1,#8b5cf6))' : 'none',
              color: filtro === f ? '#fff' : 'var(--text2, #374151)',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
              transition: 'all .15s',
            }}
          >
            {{ todos: 'Todos', ativos: 'Ativos', expirados: 'Expirados' }[f]}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {linksFiltrados.length === 0 ? (
          <div style={{
            padding: '48px 24px', textAlign: 'center',
            border: '1px dashed var(--border, #e5e7eb)', borderRadius: 12,
          }}>
            <Users size={32} color="var(--text3, #9ca3af)" style={{ marginBottom: 12 }} />
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text2, #374151)' }}>Nenhum link encontrado</div>
            <div style={{ fontSize: 13, color: 'var(--text3, #9ca3af)', marginTop: 4 }}>
              {filtro === 'todos' ? 'Crie seu primeiro link de compartilhamento.' : `Não há links ${filtro} no momento.`}
            </div>
          </div>
        ) : (
          linksFiltrados.map(link => (
            <LinhaLink
              key={link.id}
              link={link}
              copiado={copiado}
              onCopiar={handleCopiar}
              onRemover={handleRemover}
            />
          ))
        )}
      </div>

      {/* Modal */}
      {modalAberto && (
        <ModalNovoLink
          onClose={() => setModalAberto(false)}
          onCriar={handleCriar}
        />
      )}
    </div>
  )
}
