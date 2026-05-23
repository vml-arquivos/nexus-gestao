import { useState } from 'react'
import { Eye, EyeOff, Loader, Mail, Lock, User, Building2, Zap } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'

type Mode = 'login' | 'register'

function toast(msg: string, type: 'error' | 'success' = 'error') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;
    padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;
    z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);
    animation:toastIn 0.2s ease;
  `
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3500)
}

export default function Login() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode]               = useState<Mode>('login')
  const [email, setEmail]             = useState('')
  const [senha, setSenha]             = useState('')
  const [nome, setNome]               = useState('')
  const [orgNome, setOrgNome]         = useState('')
  const [tipoReg, setTipoReg]         = useState<'gestor' | 'membro'>('gestor')
  const [showPass, setShowPass]       = useState(false)
  const [loading, setLoading]         = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !senha.trim()) { toast('Preencha e-mail e senha'); return }
    if (mode === 'register') {
      if (!nome.trim()) { toast('Digite seu nome completo'); return }
      if (tipoReg === 'gestor' && !orgNome.trim()) { toast('Digite o nome da empresa/equipe'); return }
      if (senha.length < 6) { toast('Senha deve ter no mínimo 6 caracteres'); return }
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await signIn(email.trim(), senha)
        if (error) toast(
          error.toLowerCase().includes('incorretos') || error.toLowerCase().includes('invalid')
            ? 'E-mail ou senha incorretos.'
            : error
        )
      } else {
        const { error } = await signUp({
          nome: nome.trim(),
          email: email.trim(),
          senha,
          role: tipoReg,
          orgNome: tipoReg === 'gestor' ? orgNome.trim() : undefined,
        })
        if (error) {
          toast(error)
        } else {
          toast('Conta criada com sucesso! Bem-vindo ao Nexus.', 'success')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 20px',
      background: 'var(--bg)',
      gap: 24,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 14,
          background: 'var(--grad-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 28px rgba(108,59,255,0.45)',
        }}>
          <Zap size={22} color="#fff" />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 24, letterSpacing: '-0.04em' }}
               className="text-gradient">NEXUS</div>
          <div style={{ fontSize: 10, color: 'var(--text3)', letterSpacing: '0.12em', fontWeight: 600 }}>
            GESTÃO INTELIGENTE
          </div>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Tabs */}
        <div className="tabs" style={{ marginBottom: 24 }}>
          <button className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>
            Entrar
          </button>
          <button className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>
            Criar Conta
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {mode === 'register' && (
            <>
              {/* Nome */}
              <div className="form-group">
                <label className="form-label">Nome completo</label>
                <div style={{ position: 'relative' }}>
                  <User size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
                  <input className="form-input" style={{ paddingLeft: 36 }} placeholder="Seu nome"
                    value={nome} onChange={e => setNome(e.target.value)} autoComplete="name" />
                </div>
              </div>

              {/* Tipo */}
              <div className="form-group">
                <label className="form-label">Tipo de acesso</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(['gestor', 'membro'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setTipoReg(t)} style={{
                      padding: '10px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      border: tipoReg === t ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: tipoReg === t ? 'var(--primary-dim)' : 'var(--bg3)',
                      color: tipoReg === t ? 'var(--primary-light)' : 'var(--text3)',
                      fontSize: 13, fontWeight: 600, textAlign: 'center', lineHeight: 1.4,
                    }}>
                      {t === 'gestor' ? '👑 Gestor' : '👤 Membro'}<br />
                      <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.7 }}>
                        {t === 'gestor' ? 'Cria e delega tarefas' : 'Executa tarefas'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Org (somente gestor) */}
              {tipoReg === 'gestor' && (
                <div className="form-group">
                  <label className="form-label">Nome da empresa / equipe</label>
                  <div style={{ position: 'relative' }}>
                    <Building2 size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
                    <input className="form-input" style={{ paddingLeft: 36 }} placeholder="Ex: Minha Empresa Ltda"
                      value={orgNome} onChange={e => setOrgNome(e.target.value)} />
                  </div>
                </div>
              )}

              {tipoReg === 'membro' && (
                <div style={{
                  background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)',
                  borderRadius: 'var(--radius-sm)', padding: '10px 14px',
                  fontSize: 12, color: 'var(--text3)', lineHeight: 1.6,
                }}>
                  💡 Após criar sua conta, o gestor da sua equipe precisará te adicionar à organização via convite.
                </div>
              )}
            </>
          )}

          {/* E-mail */}
          <div className="form-group">
            <label className="form-label">E-mail</label>
            <div style={{ position: 'relative' }}>
              <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
              <input className="form-input" style={{ paddingLeft: 36 }} type="email" placeholder="seu@email.com"
                value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
            </div>
          </div>

          {/* Senha */}
          <div className="form-group">
            <label className="form-label">Senha</label>
            <div style={{ position: 'relative' }}>
              <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
              <input className="form-input" style={{ paddingLeft: 36, paddingRight: 44 }}
                type={showPass ? 'text' : 'password'}
                placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : 'Sua senha'}
                value={senha} onChange={e => setSenha(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              <button type="button" onClick={() => setShowPass(!showPass)} style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4,
              }}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 4, gap: 8 }} disabled={loading}>
            {loading
              ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Aguarde…</>
              : mode === 'login' ? 'Entrar' : 'Criar Conta'
            }
          </button>
        </form>

        {mode === 'login' && (
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text3)' }}>
            Não tem conta?{' '}
            <button onClick={() => setMode('register')} style={{
              background: 'none', border: 'none', color: 'var(--primary-light)',
              cursor: 'pointer', fontWeight: 600, fontSize: 13,
            }}>
              Criar conta grátis
            </button>
          </p>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
      `}</style>
    </div>
  )
}
