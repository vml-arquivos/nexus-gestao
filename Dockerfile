/**
 * Backup.tsx — Página de Backup do Banco de Dados
 * Localização: src/pages/Backup.tsx
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Database, Download, RefreshCw, CheckCircle,
  XCircle, Clock, Table2, HardDrive, Activity, Info,
} from 'lucide-react'
import { api, getAccessToken } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TabelaInfo {
  tabela: string
  linhas: string
  tamanho: string
}

interface BancoStatus {
  tamanho: string
  versao: string
  tabelas: TabelaInfo[]
}

interface UltimoBackup {
  realizadoEm: string
  tamanhoBytes: number | null
  tipo: 'manual' | 'automatico'
  status: 'ok' | 'erro'
}

interface StatusData {
  banco: BancoStatus
  ultimoBackup: UltimoBackup | null
  totalBackups: number
}

interface HistoricoEntry {
  id: string
  realizadoEm: string
  tamanhoBytes: number | null
  tipo: 'manual' | 'automatico'
  status: 'ok' | 'erro'
  erro?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `
    position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
    background:${type === 'error' ? '#EF4444' : '#10B981'};
    color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;
    font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);
    white-space:nowrap;
  `
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3500)
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch { return iso }
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: '18px 20px',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Backup() {
  const { user } = useAuth()

  const [status, setStatus]       = useState<StatusData | null>(null)
  const [historico, setHistorico] = useState<HistoricoEntry[]>([])
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [downloading, setDownloading]     = useState(false)
  const [showTabelas, setShowTabelas]     = useState(false)

  const canBackup = ['admin', 'dev', 'gestor'].includes(user?.role ?? '')

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true)
    try {
      const data = await api.get('/admin/backup/status') as StatusData
      setStatus(data)
    } catch {
      toast('Erro ao buscar status do banco', 'error')
    } finally {
      setLoadingStatus(false)
    }
  }, [])

  const fetchHistorico = useCallback(async () => {
    try {
      const data = await api.get('/admin/backup/historico') as { historico: HistoricoEntry[] }
      setHistorico(data.historico)
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => {
    fetchStatus()
    fetchHistorico()
  }, [fetchStatus, fetchHistorico])

  async function handleDownload() {
    if (!canBackup) {
      toast('Sem permissão para realizar backup', 'error')
      return
    }
    setDownloading(true)
    toast('⏳ Preparando backup… aguarde', 'success')

    try {
      // Usa a chave correta do projeto: nx_access_token
      const token = getAccessToken() || ''
      const apiBase = import.meta.env.VITE_API_URL || '/api'

      const response = await fetch(`${apiBase}/admin/backup/download`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
        throw new Error(err.error || `HTTP ${response.status}`)
      }

      const disposition = response.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename = match?.[1] ?? `nexus-backup-${Date.now()}.sql.gz`

      const blob = await response.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      toast(`✅ Backup baixado: ${filename}`, 'success')
      setTimeout(fetchHistorico, 1500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar backup'
      toast(`❌ ${msg}`, 'error')
    } finally {
      setDownloading(false)
    }
  }

  const s = status

  return (
    <div style={{
      padding: '20px 20px calc(var(--bottom-nav-h, 62px) + env(safe-area-inset-bottom, 0px) + 24px)',
      maxWidth: 620,
      margin: '0 auto',
      boxSizing: 'border-box',
    }}>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Database size={22} />
          Backup do Banco de Dados
        </h1>
        <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
          Exporte uma cópia completa do PostgreSQL para o seu computador
        </p>
      </div>

      <Card style={{ marginBottom: 16, background: 'var(--info-bg, #1e3a5f22)', borderColor: 'var(--info, #3B82F6)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Info size={16} color="#3B82F6" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0, lineHeight: 1.55 }}>
            O backup gera um arquivo <strong>.sql.gz</strong> comprimido com todos os dados do banco.
            Para restaurar, descompacte e execute:{' '}
            <code style={{ background: 'var(--surface2, #ffffff18)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>
              psql -U postgres -d nexus {'<'} backup.sql
            </code>
          </p>
        </div>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Status do Banco */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15 }}>
              <Activity size={16} color="var(--accent)" />
              Status do Banco
            </div>
            <button
              onClick={fetchStatus}
              disabled={loadingStatus}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4 }}
            >
              <RefreshCw size={15} style={{ animation: loadingStatus ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>

          {loadingStatus ? (
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>Carregando…</p>
          ) : s ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, background: 'var(--surface2, #ffffff0a)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <HardDrive size={13} color="var(--text3)" />
                    <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tamanho</span>
                  </div>
                  <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{s.banco.tamanho}</span>
                </div>
                <div style={{ flex: 1, background: 'var(--surface2, #ffffff0a)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Table2 size={13} color="var(--text3)" />
                    <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tabelas</span>
                  </div>
                  <span style={{ fontSize: 20, fontWeight: 800 }}>{s.banco.tabelas.length}</span>
                </div>
              </div>

              <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>{s.banco.versao}</p>

              <button
                onClick={() => setShowTabelas(v => !v)}
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 8,
                  padding: '6px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--text2)',
                  textAlign: 'left',
                }}
              >
                {showTabelas ? '▲ Ocultar tabelas' : `▼ Ver ${s.banco.tabelas.length} tabelas`}
              </button>

              {showTabelas && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Tabela', 'Linhas', 'Tamanho'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text3)', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.banco.tabelas.map(t => (
                        <tr key={t.tabela} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: 'var(--text2)' }}>{t.tabela}</td>
                          <td style={{ padding: '5px 8px', color: 'var(--text3)' }}>{t.linhas}</td>
                          <td style={{ padding: '5px 8px', color: 'var(--text3)' }}>{t.tamanho}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>Não foi possível carregar o status.</p>
          )}
        </Card>

        {/* Último Backup */}
        {s?.ultimoBackup && (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 700, fontSize: 14 }}>
              <Clock size={15} color="var(--accent)" />
              Último Backup
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>📅 {formatDate(s.ultimoBackup.realizadoEm)}</span>
              <span style={{ fontSize: 13, color: 'var(--text3)' }}>💾 {formatBytes(s.ultimoBackup.tamanhoBytes)}</span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: s.ultimoBackup.status === 'ok' ? '#10B98120' : '#EF444420',
                color:      s.ultimoBackup.status === 'ok' ? '#10B981'   : '#EF4444',
              }}>
                {s.ultimoBackup.status === 'ok' ? '✓ Sucesso' : '✗ Erro'}
              </span>
            </div>
          </Card>
        )}

        {/* Botão de Backup Manual */}
        <Card>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>💾 Backup Manual</div>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.5 }}>
            Gera um dump completo do banco agora e faz o download direto para o seu computador.
            O arquivo fica salvo localmente — guarde em local seguro.
          </p>

          <button
            onClick={handleDownload}
            disabled={downloading || !canBackup}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '13px 20px', borderRadius: 12, border: 'none',
              background: downloading ? 'var(--surface2)' : 'var(--accent)',
              color: downloading ? 'var(--text3)' : '#fff',
              fontWeight: 700, fontSize: 15,
              cursor: downloading || !canBackup ? 'not-allowed' : 'pointer',
              opacity: !canBackup ? 0.5 : 1,
            }}
          >
            {downloading ? (
              <>
                <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
                Gerando backup…
              </>
            ) : (
              <>
                <Download size={18} />
                Baixar Backup Agora
              </>
            )}
          </button>
        </Card>

        {/* Histórico */}
        {historico.length > 0 && (
          <Card>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>📋 Histórico desta Sessão</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {historico.slice(0, 10).map(entry => (
                <div key={entry.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 10,
                  background: 'var(--surface2, #ffffff08)',
                  border: '1px solid var(--border)',
                }}>
                  {entry.status === 'ok'
                    ? <CheckCircle size={16} color="#10B981" style={{ flexShrink: 0 }} />
                    : <XCircle    size={16} color="#EF4444" style={{ flexShrink: 0 }} />
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{formatDate(entry.realizadoEm)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {entry.tipo === 'manual' ? 'Manual' : 'Automático'} · {formatBytes(entry.tamanhoBytes)}
                      {entry.erro && <span style={{ color: '#EF4444' }}> · {entry.erro}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Como Restaurar */}
        <Card style={{ borderColor: 'var(--warning, #F59E0B)', background: 'var(--warning-bg, #f59e0b11)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>🔄 Como Restaurar</div>
          <ol style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
            <li>Descompacte: <code style={{ background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4, fontSize: 12 }}>gunzip nexus-backup-*.sql.gz</code></li>
            <li>Crie um banco (se necessário): <code style={{ background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4, fontSize: 12 }}>createdb nexus_restore</code></li>
            <li>Restaure: <code style={{ background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4, fontSize: 12 }}>psql -U postgres -d nexus_restore {'<'} nexus-backup.sql</code></li>
          </ol>
        </Card>

      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
