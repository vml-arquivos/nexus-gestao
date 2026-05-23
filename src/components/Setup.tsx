import { useState } from 'react'
import { Zap, Database, ChevronRight, Eye, EyeOff, CheckCircle, XCircle, Loader } from 'lucide-react'
import { store, saveStore, testSupabaseConnection, syncFromSupabase } from '../lib/store'
import { toast } from './ui'

interface SetupProps { onDone: () => void }

export default function Setup({ onDone }: SetupProps) {
  const [step, setStep] = useState(1)
  const [nome, setNome] = useState('')
  const [sbUrl, setSbUrl] = useState('')
  const [sbKey, setSbKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [connectionError, setConnectionError] = useState('')

  const handleStep1 = () => {
    if (!nome.trim()) { toast('Digite seu nome', 'error'); return }
    store.config.nome = nome.trim()
    saveStore('config', store.config)
    setStep(2)
  }

  const handleSkipSupabase = () => {
    onDone()
  }

  const handleSaveSupabase = async () => {
    if (!sbUrl.trim() || !sbKey.trim()) {
      toast('Preencha URL e chave anônima', 'error')
      return
    }

    // Validação básica de formato
    if (!sbUrl.trim().startsWith('https://')) {
      toast('URL deve começar com https://', 'error')
      return
    }

    setTesting(true)
    setConnectionStatus('idle')
    setConnectionError('')

    const result = await testSupabaseConnection(sbUrl.trim(), sbKey.trim())

    if (result.ok) {
      setConnectionStatus('ok')
      toast('Supabase conectado! Sincronizando dados…', 'success')
      // Sincroniza dados existentes do banco
      await syncFromSupabase()
      setTimeout(onDone, 1000)
    } else {
      setConnectionStatus('fail')
      setConnectionError(result.error ?? 'Erro desconhecido')
      toast('Falha na conexão. Verifique as credenciais.', 'error')
    }

    setTesting(false)
  }

  return (
    <div className="setup-screen">
      {/* Logo */}
      <div className="setup-logo">Nexus</div>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 13, color: 'var(--text3)', marginBottom: 32, fontWeight: 500 }}>
        Gestão Inteligente
      </div>

      {step === 1 && (
        <div style={{ width: '100%', maxWidth: 380 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
            Bem-vindo! 👋
          </h2>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 28, lineHeight: 1.7 }}>
            Sua central de gestão de equipe, tarefas, agenda e financeiro. Vamos começar!
          </p>
          <div className="form-group">
            <label className="form-label">Seu nome</label>
            <input
              className="form-input"
              placeholder="Ex: João Silva"
              value={nome}
              onChange={e => setNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStep1()}
              autoFocus
            />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleStep1}>
            Continuar <ChevronRight size={16} />
          </button>
        </div>
      )}

      {step === 2 && (
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg,rgba(108,59,255,0.2),rgba(6,182,212,0.2))',
            border: '1px solid var(--border2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            <Database size={24} color="var(--primary-light)" />
          </div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
            Sincronização em Nuvem
          </h2>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 24, lineHeight: 1.7 }}>
            Conecte ao Supabase para sincronizar entre dispositivos. <strong style={{ color: 'var(--text)' }}>100% gratuito.</strong>
            <br />Ou pule e use apenas no dispositivo atual.
          </p>

          <div className="form-group">
            <label className="form-label">URL do Projeto Supabase</label>
            <input
              className="form-input"
              placeholder="https://xxxxxxxxxxx.supabase.co"
              value={sbUrl}
              onChange={e => { setSbUrl(e.target.value); setConnectionStatus('idle') }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Chave Anônima (anon key)</label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input"
                type={showKey ? 'text' : 'password'}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={sbKey}
                onChange={e => { setSbKey(e.target.value); setConnectionStatus('idle') }}
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Status da conexão */}
          {connectionStatus === 'ok' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(0,212,170,0.1)', border: '1px solid rgba(0,212,170,0.3)', borderRadius: 10, marginBottom: 16, fontSize: 13, color: '#00D4AA' }}>
              <CheckCircle size={15} />
              Conectado com sucesso! Sincronizando…
            </div>
          )}
          {connectionStatus === 'fail' && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#EF4444', marginBottom: connectionError ? 6 : 0 }}>
                <XCircle size={15} />
                Falha na conexão
              </div>
              {connectionError && (
                <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 4, wordBreak: 'break-all' }}>
                  {connectionError}
                </div>
              )}
            </div>
          )}

          <div style={{
            background: 'var(--bg3)', borderRadius: 'var(--radius-sm)',
            padding: '10px 12px', fontSize: 12, color: 'var(--text3)', lineHeight: 1.7, marginBottom: 20
          }}>
            💡 Acesse <strong style={{ color: 'var(--secondary)' }}>supabase.com</strong> → Settings → API para obter as credenciais.
            Execute o SQL do arquivo <code style={{ color: 'var(--primary-light)' }}>supabase-schema.sql</code> no SQL Editor do projeto.
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={handleSkipSupabase} disabled={testing}>
              Pular por agora
            </button>
            <button className="btn btn-primary" style={{ flex: 1, gap: 8 }} onClick={handleSaveSupabase} disabled={testing}>
              {testing ? (
                <>
                  <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} />
                  Testando…
                </>
              ) : 'Conectar'}
            </button>
          </div>
        </div>
      )}

      {/* Features preview */}
      <div style={{ marginTop: 40, display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 500 }}>
        {['👥 Equipe', '✅ Tarefas', '📅 Agenda', '💳 Financeiro', '🗂️ Documentos', '📊 Relatórios'].map(f => (
          <span key={f} style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{f}</span>
        ))}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
