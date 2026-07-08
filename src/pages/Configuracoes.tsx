import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Settings, Save, Bell, BellOff, Palette, User, Shield, Info, LogOut, Download, ExternalLink, Smartphone, CheckCircle2, Loader } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { isGestorLike, roleLabel } from '../lib/roles'
import { api } from '../lib/api'
import { useTheme } from '../lib/ThemeContext'
import { useVisualTexts } from '../hooks/useVisualTexts'
import {
  browserSupportsPush,
  enablePushNotifications,
  disablePushNotifications,
  getPushNotificationStatus,
  registerNexusServiceWorker,
} from '../lib/pushNotifications'

function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#EF4444' : '#10B981'};color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

export default function Configuracoes() {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const { t } = useVisualTexts()

  const [pontuacaoAberto, setPontuacaoAberto] = useState(false)
  const [pontuacaoLoading, setPontuacaoLoading] = useState(false)
  const [pontuacaoItens, setPontuacaoItens] = useState<Array<{ id: string; usuario_nome?: string; tarefa_titulo?: string; item_titulo_snapshot?: string; motivo?: string; pontos: number; aprovado_em?: string }>>([])
  const [pontuacaoEditId, setPontuacaoEditId] = useState<string | null>(null)
  const [pontuacaoEditValor, setPontuacaoEditValor] = useState('')

  const [nome, setNome]           = useState(user?.nome || '')
  const [email, setEmail]         = useState(user?.email || '')
  const [senhaAtual, setSenhaAtual]   = useState('')
  const [novaSenha, setNovaSenha]     = useState('')
  const [confirmSenha, setConfirmSenha] = useState('')
  const [savingPerfil, setSavingPerfil]   = useState(false)
  const [savingSenha, setSavingSenha]     = useState(false)
  const [gerandoBackup, setGerandoBackup] = useState(false)

  // Push notifications — estado completo
  const [pushStatus, setPushStatus] = useState<{
    supported: boolean
    configured: boolean
    permission: string
    subscriptions?: number
    error?: string
    instructions?: string
    platform?: string
    canRequest?: boolean
  } | null>(null)
  const [pushLoading, setPushLoading] = useState(false)
  const notifEnabled = pushStatus?.permission === 'granted' && (pushStatus?.subscriptions ?? 0) > 0

  useEffect(() => {
    // Registrar SW e carregar status push ao abrir configurações
    registerNexusServiceWorker().catch(() => {})
    getPushNotificationStatus().then(setPushStatus).catch(() => {})
  }, [])

  function aplicarTema(t: 'dark' | 'light') {
    setTheme(t)
  }

  async function salvarPerfil() {
    if (!nome.trim()) { toast('Nome é obrigatório', 'error'); return }
    setSavingPerfil(true)
    try {
      await api.patch('/auth/me', { nome: nome.trim() })
      toast('Perfil atualizado!')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar', 'error')
    } finally { setSavingPerfil(false) }
  }

  async function alterarSenha() {
    if (!senhaAtual || !novaSenha) { toast('Preencha todos os campos', 'error'); return }
    if (novaSenha.length < 6) { toast('Nova senha deve ter ao menos 6 caracteres', 'error'); return }
    if (novaSenha !== confirmSenha) { toast('As senhas não coincidem', 'error'); return }
    setSavingSenha(true)
    try {
      await api.patch('/auth/me/password', { senhaAtual, novaSenha })
      setSenhaAtual(''); setNovaSenha(''); setConfirmSenha('')
      toast('Senha alterada com sucesso!')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro ao alterar senha', 'error')
    } finally { setSavingSenha(false) }
  }

  async function ativarNotificacoes() {
    setPushLoading(true)
    try {
      const statusInicial = await getPushNotificationStatus()
      setPushStatus(statusInicial)

      if (!statusInicial.supported) {
        toast(statusInicial.error || statusInicial.instructions || 'Este navegador ainda não permite push neste modo.', 'error')
        return
      }
      if (!statusInicial.configured) {
        toast('Servidor de push não configurado. Confira WEB_PUSH_PUBLIC_KEY e WEB_PUSH_PRIVATE_KEY no Coolify.', 'error')
        return
      }

      const status = await enablePushNotifications()
      setPushStatus(status)
      if (status.permission === 'granted' && (status.subscriptions ?? 0) > 0) {
        toast('Notificações push ativadas! Você receberá alertas mesmo com o app fechado.')
      } else if (status.permission === 'denied') {
        toast('Permissão negada. Ative nas configurações do navegador/sistema.', 'error')
      } else if (status.error) {
        toast(status.error, 'error')
      } else {
        toast(status.instructions || 'Permissão não concluída. Verifique as configurações do navegador.', 'error')
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao ativar notificações', 'error')
    } finally { setPushLoading(false) }
  }

  async function desativarNotificacoes() {
    setPushLoading(true)
    try {
      await disablePushNotifications()
      const status = await getPushNotificationStatus()
      setPushStatus(status)
      toast('Notificações push desativadas neste dispositivo.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao desativar', 'error')
    } finally { setPushLoading(false) }
  }

  async function carregarPontuacao() {
    setPontuacaoLoading(true)
    try {
      const data = await api.get<{ items: typeof pontuacaoItens }>('/admin/pontuacao')
      setPontuacaoItens(data.items || [])
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar pontuação.', 'error')
    } finally {
      setPontuacaoLoading(false)
    }
  }

  async function salvarPontuacaoEditada(id: string) {
    const valor = Number(pontuacaoEditValor)
    if (!Number.isFinite(valor) || valor < 0 || valor > 999) {
      toast('Use um número entre 0 e 999.', 'error')
      return
    }
    try {
      await api.patch(`/admin/pontuacao/${id}`, { pontos: valor })
      setPontuacaoItens(prev => prev.map(item => item.id === id ? { ...item, pontos: valor } : item))
      setPontuacaoEditId(null)
      toast('Pontuação atualizada.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar pontuação.', 'error')
    }
  }

  async function apagarPontuacaoItem(id: string) {
    if (!confirm('Apagar este lançamento de pontuação? Essa ação não pode ser desfeita.')) return
    try {
      await api.delete(`/admin/pontuacao/${id}`)
      setPontuacaoItens(prev => prev.filter(item => item.id !== id))
      toast('Lançamento apagado.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao apagar lançamento.', 'error')
    }
  }

  async function limparRankingCompleto() {
    if (!confirm('Isso apaga TODO o histórico de pontuação e zera o ranking da organização inteira. Essa ação não pode ser desfeita. Confirma?')) return
    if (!confirm('Tem certeza mesmo? Todos os pontos de todos os membros serão perdidos, inclusive de trabalho real, não só de teste.')) return
    try {
      await api.delete('/admin/limpar/pontuacao')
      setPontuacaoItens([])
      toast('Ranking e histórico de pontuação apagados.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao apagar ranking.', 'error')
    }
  }

  async function gerarBackup() {
    if (!isGestorLike(user?.role)) {
      toast('Backup disponível apenas para gestor, admin ou dev.', 'error')
      return
    }
    setGerandoBackup(true)
    try {
      const { blob, filename } = await api.download('/admin/backup')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename || 'nexus-backup-completo.tar.gz'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast('Backup gerado com sucesso!')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Erro ao gerar backup', 'error')
    } finally {
      setGerandoBackup(false)
    }
  }

  const labelRole = roleLabel(user?.role)
  const roleColor = user?.role === 'admin' || user?.role === 'dev' || user?.role === 'gestor' ? '#2563EB' : user?.role === 'sub_gestor' ? '#3B82F6' : '#06B6D4'

  return (
    <div style={{ padding: '20px 20px calc(var(--bottom-nav-h, 62px) + env(safe-area-inset-bottom, 0px) + 24px)', maxWidth: 580, margin: '0 auto', boxSizing: 'border-box' as const }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 16 }}>{t('settings.pageTitle')}</h1>
        <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>Gerencie seu perfil e preferências</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Perfil */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <User size={16} color="#2563EB" />
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 15 }}>Meu Perfil</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 500, color: roleColor, background: roleColor + '18', padding: '3px 8px', borderRadius: 99 }}>{labelRole}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Nome</label>
              <input className="form-input" value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome" />
            </div>
            <div className="form-group">
              <label className="form-label">E-mail</label>
              <input className="form-input" value={email} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>O e-mail não pode ser alterado</span>
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={salvarPerfil} disabled={savingPerfil}>
            <Save size={14} /> {savingPerfil ? 'Salvando…' : 'Salvar Perfil'}
          </button>
        </div>

        {/* Segurança */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Shield size={16} color="#F59E0B" />
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 15 }}>Segurança</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Senha atual</label>
              <input className="form-input" type="password" value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)} placeholder="••••••••" />
            </div>
            <div className="form-group">
              <label className="form-label">Nova senha</label>
              <input className="form-input" type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />
            </div>
            <div className="form-group">
              <label className="form-label">Confirmar nova senha</label>
              <input className="form-input" type="password" value={confirmSenha} onChange={e => setConfirmSenha(e.target.value)} placeholder="Repita a nova senha" />
            </div>
          </div>
          <button className="btn btn-secondary" style={{ width: '100%', marginTop: 16 }} onClick={alterarSenha} disabled={savingSenha}>
            <Shield size={14} /> {savingSenha ? 'Alterando…' : 'Alterar Senha'}
          </button>
        </div>

        {/* Aparência */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Palette size={16} color="#EC4899" />
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 15 }}>{t('settings.visualTitle')}</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.6 }}>
            Escolha o modo claro/escuro ou personalize cores, fontes, bordas e espaçamentos do sistema.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {([['dark', '🌙 Escuro'], ['light', '☀️ Claro']] as const).map(([k, l]) => (
              <button key={k} onClick={() => aplicarTema(k)} style={{ padding: '12px 16px', borderRadius: 'var(--radius)', border: `2px solid ${theme === k ? '#2563EB' : 'var(--border)'}`, background: theme === k ? 'rgba(108,59,255,0.1)' : 'var(--bg3)', cursor: 'pointer', fontWeight: 500, fontSize: 14, color: theme === k ? '#2563EB' : 'var(--text3)' }}>
                {l}
              </button>
            ))}
          </div>

          {isGestorLike(user?.role) && (
            <Link className="btn btn-secondary" style={{ width: '100%', marginTop: 12, justifyContent: 'center', textDecoration: 'none' }} to="/design-editor">
              <Palette size={14} /> {t('settings.visualButton')}
            </Link>
          )}
        </div>

        {/* Notificações Push PWA */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Bell size={16} color="#F59E0B" />
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 15 }}>Notificações Push</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.6 }}>
            Alertas em tempo real no celular e no PC — mesmo com o app fechado. Tarefas vencendo, aprovações, cobranças e mais.
          </p>

          {/* Status detalhado */}
          <div style={{ padding: '10px 14px', background: 'var(--bg3)', borderRadius: 10, marginBottom: 14, fontSize: 13, display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text3)' }}>Suporte no navegador</span>
              <span style={{ fontWeight: 600, color: browserSupportsPush() ? '#10B981' : '#EF4444' }}>
                {browserSupportsPush() ? '✓ Suportado' : '✗ Não suportado'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text3)' }}>Permissão</span>
              <span style={{ fontWeight: 600, color: pushStatus?.permission === 'granted' ? '#10B981' : pushStatus?.permission === 'denied' ? '#EF4444' : 'var(--text3)' }}>
                {pushStatus?.permission === 'granted' ? '✓ Concedida' : pushStatus?.permission === 'denied' ? '✗ Bloqueada' : '⏳ Não solicitada'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text3)' }}>Servidor VAPID</span>
              <span style={{ fontWeight: 600, color: pushStatus?.configured ? '#10B981' : '#EF4444' }}>
                {pushStatus === null ? '...' : pushStatus.configured ? '✓ Configurado' : '✗ Não configurado'}
              </span>
            </div>
            {(pushStatus?.subscriptions ?? 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text3)' }}>Dispositivos inscritos</span>
                <span style={{ fontWeight: 600, color: '#10B981' }}>{pushStatus?.subscriptions} dispositivo(s)</span>
              </div>
            )}
          </div>

          {pushStatus?.instructions && pushStatus.permission !== 'granted' && (
            <div className="push-safari-help">
              <strong>{pushStatus.platform === 'ios-safari-browser' ? 'Safari no iPhone/iPad precisa do app instalado' : 'Como ativar neste dispositivo'}</strong>
              <span>{pushStatus.instructions}</span>
            </div>
          )}

          {pushStatus?.permission === 'denied' && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 10, marginBottom: 14, fontSize: 12, color: '#EF4444' }}>
              Permissão bloqueada no navegador. Para ativar: clique no cadeado/barra de endereço ou abra as configurações do app no sistema e permita notificações.
            </div>
          )}

          {!pushStatus?.configured && pushStatus !== null && (
            <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 10, marginBottom: 14, fontSize: 12, color: '#D97706' }}>
              Configure WEB_PUSH_PUBLIC_KEY e WEB_PUSH_PRIVATE_KEY no Coolify para ativar push.
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            {!notifEnabled ? (
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={ativarNotificacoes} disabled={pushLoading || pushStatus?.platform === 'ios-safari-browser'}>
                {pushLoading ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Ativando...</> : <><Bell size={14} /> {pushStatus?.platform === 'ios-safari-browser' ? 'Instale na Tela de Início' : 'Ativar notificações'}</>}
              </button>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, fontSize: 13, fontWeight: 600, color: '#10B981' }}>
                  <CheckCircle2 size={16} /> Push ativo neste dispositivo
                </div>
                <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={desativarNotificacoes} disabled={pushLoading}>
                  {pushLoading ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <BellOff size={13} />} Desativar
                </button>
              </>
            )}
          </div>
        </div>



        {/* Backup */}
        {isGestorLike(user?.role) && (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Download size={16} color="#5B7CFA" />
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 15 }}>{t('settings.backupTitle')}</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.6 }}>
              Baixe um pacote completo para restauração: banco PostgreSQL, arquivos enviados e variáveis do ambiente sem expor senhas ou tokens em texto puro.
            </p>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={gerarBackup} disabled={gerandoBackup}>
              <Download size={14} /> {gerandoBackup ? 'Gerando backup completo…' : t('settings.backupButton')}
            </button>
          </div>
        )}

        {/* Ranking / Pontuação (avançado) */}
        {isGestorLike(user?.role) && (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={16} color="#F59E0B" />
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 15 }}>Ranking e pontuação (avançado)</span>
              </div>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 12 }}
                onClick={() => {
                  const next = !pontuacaoAberto
                  setPontuacaoAberto(next)
                  if (next && !pontuacaoItens.length) void carregarPontuacao()
                }}
              >
                {pontuacaoAberto ? 'Recolher' : 'Abrir'}
              </button>
            </div>
            {pontuacaoAberto && (
              <>
                <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.6 }}>
                  Corrija ou remova lançamentos individuais de pontuação (útil para limpar pontos de teste), ou apague o ranking inteiro da organização. Apagar uma tarefa <strong>não</strong> apaga a pontuação automaticamente — use esta ferramenta quando precisar limpar de propósito.
                </p>
                {pontuacaoLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text3)' }}>
                    <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Carregando lançamentos...
                  </div>
                ) : pontuacaoItens.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text3)' }}>Nenhum lançamento de pontuação encontrado.</p>
                ) : (
                  <div style={{ display: 'grid', gap: 6, maxHeight: 360, overflowY: 'auto', marginBottom: 14 }}>
                    {pontuacaoItens.map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', borderRadius: 8, padding: '8px 10px', fontSize: 12.5 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.usuario_nome || 'Usuário removido'}</div>
                          <div style={{ color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.tarefa_titulo || '(tarefa removida)'}{item.item_titulo_snapshot ? ` · ${item.item_titulo_snapshot}` : ''}
                          </div>
                        </div>
                        {pontuacaoEditId === item.id ? (
                          <>
                            <input
                              className="form-input"
                              type="number"
                              min={0}
                              max={999}
                              value={pontuacaoEditValor}
                              onChange={e => setPontuacaoEditValor(e.target.value)}
                              style={{ width: 70, flexShrink: 0 }}
                            />
                            <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 8px', flexShrink: 0 }} onClick={() => salvarPontuacaoEditada(item.id)}>Salvar</button>
                            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px', flexShrink: 0 }} onClick={() => setPontuacaoEditId(null)}>Cancelar</button>
                          </>
                        ) : (
                          <>
                            <strong style={{ flexShrink: 0 }}>{item.pontos} pts</strong>
                            <button
                              className="btn btn-ghost"
                              style={{ fontSize: 11, padding: '4px 8px', flexShrink: 0 }}
                              onClick={() => { setPontuacaoEditId(item.id); setPontuacaoEditValor(String(item.pontos)) }}
                            >
                              Editar
                            </button>
                            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px', flexShrink: 0, color: '#EF4444' }} onClick={() => apagarPontuacaoItem(item.id)}>
                              Apagar
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={carregarPontuacao} disabled={pontuacaoLoading}>Recarregar lista</button>
                  <button className="btn btn-danger" style={{ fontSize: 12 }} onClick={limparRankingCompleto}>Apagar ranking inteiro</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Downloads */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Download size={16} color="#10B981" />
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 15 }}>{t('settings.downloadsTitle')}</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.6 }}>
            Baixe atalhos e arquivos do Nexus para instalar ou acessar o sistema rapidamente em outros dispositivos.
          </p>
          <div className="settings-download-grid">
            <a className="btn btn-secondary settings-download-btn" href="/" target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Abrir Nexus
            </a>
            <a className="btn btn-secondary settings-download-btn" href="/manifest.webmanifest" download>
              <Smartphone size={14} /> Manifesto PWA
            </a>
            <a className="btn btn-secondary settings-download-btn" href="/icon-192.png" download>
              <Download size={14} /> Ícone 192
            </a>
            <a className="btn btn-secondary settings-download-btn" href="/icon-512.png" download>
              <Download size={14} /> Ícone 512
            </a>
          </div>
        </div>

        {/* Sobre */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Info size={16} color="var(--text3)" />
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 15 }}>Sobre o Nexus</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[['Versão', '3.0.0'], ['Plataforma', 'PWA'], ['Backend', 'PostgreSQL 17'], ['Deploy', 'Coolify / VPS']].map(([k, v]) => (
              <div key={k} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>{k}</div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Sair */}
        <button className="btn btn-danger" style={{ width: '100%', gap: 8 }} onClick={logout}>
          <LogOut size={16} /> Sair da Conta
        </button>

        <div style={{ textAlign: 'center', padding: '8px 0', color: 'var(--text3)', fontSize: 11 }}>
          nexus.permupay.com.br · {new Date().getFullYear()}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
