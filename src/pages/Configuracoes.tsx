import React, { useState } from 'react'
import { Settings, Save, Trash2, Download, Upload, Bell, Database, Palette } from 'lucide-react'
import { store, saveStore, requestPushPermission } from '../lib/store'
import { toast } from '../components/ui'

export default function Configuracoes() {
  const [nome, setNome] = useState(store.config.nome)
  const [sbUrl, setSbUrl] = useState(store.config.sbUrl ?? '')
  const [sbKey, setSbKey] = useState(store.config.sbKey ?? '')
  const [theme, setTheme] = useState(store.config.theme ?? 'dark')

  function salvarGeral() {
    if (!nome.trim()) { toast('Nome é obrigatório', 'error'); return }
    store.config = { ...store.config, nome: nome.trim(), theme }
    saveStore('config', store.config)
    // Apply theme
    document.documentElement.setAttribute('data-theme', theme)
    toast('Configurações salvas!')
  }

  function salvarSupabase() {
    store.config = { ...store.config, sbUrl: sbUrl.trim(), sbKey: sbKey.trim() }
    saveStore('config', store.config)
    toast('Supabase configurado! Recarregue para sincronizar.')
  }

  async function ativarNotificacoes() {
    const ok = await requestPushPermission()
    if (ok) {
      store.config = { ...store.config, pushEnabled: true }
      saveStore('config', store.config)
      toast('Notificações ativadas! ✅')
    } else {
      toast('Permissão negada. Ative nas configurações do navegador.', 'error')
    }
  }

  function exportarDados() {
    const dados = {
      config: { nome: store.config.nome },
      pessoas: store.pessoas,
      tarefas: store.tarefas,
      agenda: store.agenda,
      pagamentos: store.pagamentos.map(p => ({ ...p, comprovante_url: undefined })),
      documentos: store.documentos.map(d => ({ ...d, arquivo_url: '[arquivo não exportado]' })),
      exportado_em: new Date().toISOString()
    }
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nexus-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast('Dados exportados!')
  }

  function limparDados() {
    if (!confirm('ATENÇÃO: Isso apagará TODOS os dados locais. Tem certeza?')) return
    if (!confirm('Confirme novamente: todos os dados serão perdidos permanentemente.')) return
    localStorage.clear()
    window.location.reload()
  }

  const stats = {
    pessoas: store.pessoas.length,
    tarefas: store.tarefas.length,
    agenda: store.agenda.length,
    pagamentos: store.pagamentos.length,
    documentos: store.documentos.length,
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title"><Settings size={22} /> Configurações</div>
          <div className="page-subtitle">Personalize o Nexus para o seu uso</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Geral */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Palette size={16} color="var(--primary-light)" />
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>Geral</span>
          </div>
          <div className="form-group">
            <label className="form-label">Seu nome</label>
            <input className="form-input" value={nome} onChange={e => setNome(e.target.value)} placeholder="Como você quer ser chamado?" />
          </div>
          <div className="form-group">
            <label className="form-label">Tema</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {[{ k: 'dark', l: '🌙 Escuro' }, { k: 'light', l: '☀️ Claro' }].map(t => (
                <button
                  key={t.k}
                  onClick={() => setTheme(t.k as 'dark' | 'light')}
                  className={`btn ${theme === t.k ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                >
                  {t.l}
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={salvarGeral}>
            <Save size={15} /> Salvar
          </button>
        </div>

        {/* Notificações */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Bell size={16} color="var(--warning)" />
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>Notificações Push</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
            Receba alertas no celular para tarefas com prazo próximo, compromissos do dia e pagamentos vencidos.
          </p>
          <div style={{ padding: '10px 14px', background: 'var(--bg3)', borderRadius: 10, marginBottom: 12, fontSize: 13 }}>
            Status: {store.config.pushEnabled && Notification.permission === 'granted'
              ? <span style={{ color: 'var(--success)' }}>✅ Ativadas</span>
              : <span style={{ color: 'var(--text3)' }}>⭕ Não ativadas</span>
            }
          </div>
          <button className="btn btn-secondary" style={{ width: '100%' }} onClick={ativarNotificacoes}>
            <Bell size={15} /> Ativar Notificações Push
          </button>
        </div>

        {/* Supabase */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Database size={16} color="var(--secondary)" />
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>Supabase (Opcional)</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.6 }}>
            Conecte ao Supabase para sincronizar dados entre dispositivos e fazer backup na nuvem.
          </p>
          <div className="form-group">
            <label className="form-label">URL do Projeto</label>
            <input className="form-input" value={sbUrl} onChange={e => setSbUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
          </div>
          <div className="form-group">
            <label className="form-label">Chave Anon (anon key)</label>
            <input className="form-input" type="password" value={sbKey} onChange={e => setSbKey(e.target.value)} placeholder="eyJhbGciOiJIUzI1..." />
          </div>
          <button className="btn btn-secondary" style={{ width: '100%' }} onClick={salvarSupabase}>
            <Database size={15} /> Salvar Configuração Supabase
          </button>
        </div>

        {/* Dados */}
        <div className="card">
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Dados Armazenados</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
            {Object.entries(stats).map(([k, v]) => (
              <div key={k} style={{ textAlign: 'center', background: 'var(--bg3)', borderRadius: 10, padding: '10px 6px' }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18 }}>{v}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'capitalize' }}>{k}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={exportarDados}>
              <Download size={14} /> Exportar JSON
            </button>
            <button className="btn btn-danger" style={{ flex: 1 }} onClick={limparDados}>
              <Trash2 size={14} /> Limpar Tudo
            </button>
          </div>
        </div>

        {/* Versão */}
        <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-muted)', fontSize: 12 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 4 }}>⚡ Nexus</div>
          Gestão Inteligente · v3.0.0 · 100% gratuito
        </div>
      </div>
    </div>
  )
}
