import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Zap, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react'

interface ConviteInfo {
  valido: boolean
  email: string | null
  role: string
  cargo: string | null
  org_nome: string
}

export default function AceitarConvite() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()

  const [info, setInfo]         = useState<ConviteInfo | null>(null)
  const [erro, setErro]         = useState('')
  const [loading, setLoading]   = useState(true)
  const [nome, setNome]         = useState('')
  const [email, setEmail]       = useState('')
  const [senha, setSenha]       = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [showSenha, setShowSenha] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [sucesso, setSucesso]   = useState(false)

  useEffect(() => {
    if (!token) { setErro('Token inválido.'); setLoading(false); return }
    fetch(`/api/auth/invite/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setErro(data.error); return }
        const convite = data.convite || data
        setInfo({
          valido: true,
          email: convite.email || null,
          role: convite.role || 'membro',
          cargo: convite.cargo || null,
          org_nome: convite.org_nome || 'Nexus Gestão',
        })
        if (convite.email) setEmail(convite.email)
        if (convite.nome) setNome(convite.nome)
      })
      .catch(() => setErro('Erro ao verificar convite.'))
      .finally(() => setLoading(false))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) { setErro('Nome é obrigatório.'); return }
    if (!email.trim()) { setErro('E-mail é obrigatório.'); return }
    if (senha.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return }
    if (senha !== confirmar) { setErro('As senhas não coincidem.'); return }
    setErro(''); setEnviando(true)
    try {
      const res = await fetch(`/api/auth/accept-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, nome: nome.trim(), email: email.trim(), senha }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao criar conta.')
      setSucesso(true)
      setTimeout(() => navigate('/login'), 3000)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao criar conta.')
    } finally {
      setEnviando(false)
    }
  }

  const ROLE_LABELS: Record<string, string> = {
    gestor: 'Gestor', sub_gestor: 'Gerente', membro: 'Membro'
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text3)' }}>Verificando convite…</div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 420, background: 'var(--bg2)',
        borderRadius: 'var(--radius-lg)', padding: 32,
        border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: 'var(--grad-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px',
          }}>
            <Zap size={26} color="#fff" />
          </div>
          <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--text)' }}>NEXUS</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', letterSpacing: 2, marginTop: 2 }}>GESTÃO INTELIGENTE</div>
        </div>

        {/* Erro de convite inválido */}
        {(erro && !info) && (
          <div style={{
            background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 'var(--radius)', padding: 16, textAlign: 'center',
          }}>
            <AlertCircle size={32} color="var(--danger)" style={{ marginBottom: 8 }} />
            <div style={{ fontWeight: 700, color: 'var(--danger)', marginBottom: 4 }}>Convite inválido</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text3)' }}>{erro}</div>
          </div>
        )}

        {/* Sucesso */}
        {sucesso && (
          <div style={{
            background: 'var(--success-dim)', border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: 'var(--radius)', padding: 20, textAlign: 'center',
          }}>
            <CheckCircle2 size={40} color="var(--success)" style={{ marginBottom: 10 }} />
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--success)', marginBottom: 6 }}>Conta criada!</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text3)' }}>
              Bem-vindo(a) à equipe! Redirecionando para o login…
            </div>
          </div>
        )}

        {/* Formulário */}
        {info && !sucesso && (
          <>
            <div style={{
              background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '10px 14px',
              marginBottom: 20, fontSize: 'var(--text-sm)', color: 'var(--text2)',
            }}>
              Você foi convidado para a organização <strong>{info.org_nome}</strong> como{' '}
              <strong>{info.cargo || ROLE_LABELS[info.role] || info.role}</strong>.
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Seu nome completo *</label>
                <input className="form-input" placeholder="Nome Sobrenome" value={nome} onChange={e => setNome(e.target.value)} required />
              </div>

              <div className="form-group">
                <label className="form-label">E-mail *</label>
                <input
                  className="form-input" type="email" placeholder="seu@email.com"
                  value={email} onChange={e => setEmail(e.target.value)}
                  readOnly={!!info.email} required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Criar senha *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="form-input" type={showSenha ? 'text' : 'password'}
                    placeholder="Mínimo 6 caracteres" value={senha}
                    onChange={e => setSenha(e.target.value)} required
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSenha(p => !p)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}
                  >
                    {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Confirmar senha *</label>
                <input
                  className="form-input" type={showSenha ? 'text' : 'password'}
                  placeholder="Repita a senha" value={confirmar}
                  onChange={e => setConfirmar(e.target.value)} required
                />
              </div>

              {erro && (
                <div style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)', padding: '8px 12px', background: 'var(--danger-dim)', borderRadius: 'var(--radius-sm)' }}>
                  {erro}
                </div>
              )}

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 4 }} disabled={enviando}>
                {enviando ? 'Criando conta…' : 'Criar minha conta'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
