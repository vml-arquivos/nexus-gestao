import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, Download, HardDrive, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { tarefasApi, type ChecklistItem, type Tarefa } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import {
  checklistOperation,
  listOfflineOperations,
  loadOfflineSnapshot,
  offlineOwner,
  queueOfflineOperation,
  saveOfflineSnapshot,
  statusOperation,
  syncPanelOperations,
} from '../lib/offlineTaskPanel'

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

function isClosed(task: Tarefa) {
  return task.status === 'cancelada' || task.status === 'aprovada' || (task.status === 'concluida' && task.status_gestor === 'aprovada')
}

export default function PainelOffline() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const owner = user ? offlineOwner(user) : null
  const [tasks, setTasks] = useState<Tarefa[]>([])
  const [savedAt, setSavedAt] = useState('')
  const [pending, setPending] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)

  const openTasks = useMemo(() => tasks.filter(task => !isClosed(task)), [tasks])

  async function persist(next: Tarefa[]) {
    if (!owner) return
    await saveOfflineSnapshot(owner, next)
    setSavedAt(new Date().toISOString())
  }

  async function refreshFromServer() {
    if (!owner || !navigator.onLine) return
    setLoading(true)
    try {
      await syncPanelOperations(owner.key)
      const fresh = await tarefasApi.list()
      setTasks(fresh)
      await persist(fresh)
      setPending((await listOfflineOperations(owner.key)).length)
      setMessage('Carga diária atualizada e pronta para uso offline.')
    } catch {
      setMessage('Servidor indisponível. A carga local continua disponível.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!owner) { setLoading(false); return }
    let active = true
    void (async () => {
      const snapshot = await loadOfflineSnapshot(owner.key)
      if (!active) return
      if (snapshot) {
        setTasks(snapshot.tasks || [])
        setSavedAt(snapshot.savedAt)
      }
      setPending((await listOfflineOperations(owner.key)).length)
      setLoading(false)
      if (navigator.onLine) void refreshFromServer()
    })()
    return () => { active = false }
  }, [owner?.key])

  useEffect(() => {
    const handleOnline = () => { setOnline(true); void refreshFromServer() }
    const handleOffline = () => setOnline(false)
    const handleInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent) }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('beforeinstallprompt', handleInstall)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/painel-offline-sw.js', { scope: '/painel-offline/' }).catch(() => undefined)
    }
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    const previousManifest = manifest?.getAttribute('href') || ''
    if (manifest) manifest.href = '/painel-offline.webmanifest'
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('beforeinstallprompt', handleInstall)
      if (manifest && previousManifest) manifest.href = previousManifest
    }
  }, [owner?.key])

  async function toggleChecklist(task: Tarefa, item: ChecklistItem, feito: boolean) {
    if (!owner || !item.id) return
    const next = tasks.map(current => current.id === task.id
      ? { ...current, checklist: (current.checklist || []).map(entry => entry.id === item.id ? { ...entry, feito } : entry) }
      : current)
    setTasks(next)
    await persist(next)
    if (!navigator.onLine) {
      await queueOfflineOperation(checklistOperation(owner.key, task.id, item.id, feito))
    } else {
      try {
        const updated = await tarefasApi.atualizarChecklistItem(task.id, item.id, feito)
        if (!updated) throw new Error('Sincronização adiada')
        const synced = next.map(current => current.id === task.id ? updated : current)
        setTasks(synced)
        await persist(synced)
      } catch {
        await queueOfflineOperation(checklistOperation(owner.key, task.id, item.id, feito))
      }
    }
    setPending((await listOfflineOperations(owner.key)).length)
  }

  async function finishTask(task: Tarefa) {
    if (!owner) return
    const next = tasks.map(current => current.id === task.id ? { ...current, status: 'concluida' as const, status_gestor: 'aguardando' as const } : current)
    setTasks(next)
    await persist(next)
    if (!navigator.onLine) {
      await queueOfflineOperation(statusOperation(owner.key, task.id, 'concluida'))
    } else {
      try {
        const updated = await tarefasApi.updateStatus(task.id, { status: 'concluida' })
        if (!updated) throw new Error('Sincronização adiada')
      } catch {
        await queueOfflineOperation(statusOperation(owner.key, task.id, 'concluida'))
      }
    }
    setPending((await listOfflineOperations(owner.key)).length)
  }

  function exportLoad() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), owner: owner?.nome, tasks: openTasks }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `nexus-carga-diaria-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (!owner) {
    return <div className="page"><h1>Painel offline</h1><p>Faça login ao menos uma vez neste dispositivo para liberar sua carga protegida.</p></div>
  }

  return (
    <div className="page" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => navigate('/tarefas')}><ArrowLeft size={15} /> Tarefas</button>
          <h1 style={{ margin: '10px 0 4px' }}>Central de continuidade</h1>
          <p className="muted" style={{ margin: 0 }}>Carga local de {owner.nome}. Funciona durante indisponibilidade de internet ou servidor.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {installPrompt && <button className="btn btn-secondary" type="button" onClick={async () => { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null) }}><HardDrive size={16} /> Instalar no PC</button>}
          <button className="btn btn-secondary" type="button" onClick={exportLoad}><Download size={16} /> Exportar carga</button>
          <button className="btn btn-primary" type="button" onClick={() => void refreshFromServer()} disabled={!online || loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /> Sincronizar</button>
        </div>
      </header>

      <div className="offline-sync-banner" style={{ marginBottom: 18 }}>
        <strong style={{ display: 'flex', alignItems: 'center', gap: 7 }}>{online ? <Wifi size={16} /> : <WifiOff size={16} />}{online ? 'Online' : 'Offline'} · {pending} alteração(ões) aguardando envio</strong>
        <span>{savedAt ? `Última carga local: ${new Date(savedAt).toLocaleString('pt-BR')}.` : 'Prepare a primeira carga enquanto estiver conectado.'} {message}</span>
      </div>

      {loading && !tasks.length ? <p>Preparando carga…</p> : openTasks.length === 0 ? <p>Nenhuma lista aberta na carga local.</p> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {openTasks.map(task => (
            <article key={task.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 5 }}>
                    {task.lembrete_diario_ate_aprovacao && <span className="badge">🔁 Diária · mesma lista</span>}
                    {task.origem_nome && <span className="badge">{task.contexto_tipo === 'pessoa_fisica' ? 'PF' : 'Empresa'} · {task.origem_nome}</span>}
                  </div>
                  <strong>{task.titulo}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>{task.responsavel_nome || 'Equipe'}{task.prazo ? ` · prazo ${new Date(task.prazo).toLocaleDateString('pt-BR')}` : ''}</div>
                </div>
                <button className="btn btn-primary btn-sm" type="button" onClick={() => void finishTask(task)} disabled={task.status === 'concluida'}><CheckCircle2 size={15} /> {task.status === 'concluida' ? 'Aguardando aprovação' : 'Finalizar'}</button>
              </div>
              <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
                {(task.checklist || []).map(item => (
                  <label key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 10, border: '1px solid var(--border)', borderRadius: 10 }}>
                    <input type="checkbox" checked={Boolean(item.feito)} onChange={event => void toggleChecklist(task, item, event.target.checked)} />
                    <span><strong style={{ textDecoration: item.feito ? 'line-through' : undefined }}>{item.texto}</strong><br /><small className="muted">{[item.responsavel_nome, item.data ? new Date(item.data).toLocaleDateString('pt-BR') : ''].filter(Boolean).join(' · ') || 'Sem responsável/data específica'}</small></span>
                  </label>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
