import { tarefasApi, type Tarefa, type UserProfile } from './api'

const DB_NAME = 'nexus-painel-offline'
const DB_VERSION = 1
const SNAPSHOTS = 'snapshots'
const OPERATIONS = 'operations'

export type OfflineOwner = { key: string; userId: string; orgId: string; nome: string }
export type OfflineOperation = {
  id: string
  ownerKey: string
  kind: 'checklist' | 'status'
  taskId: string
  itemId?: string
  feito?: boolean
  status?: 'em_progresso' | 'concluida' | 'nao_concluida'
  createdAt: string
}

type OfflineSnapshot = { ownerKey: string; owner: OfflineOwner; tasks: Tarefa[]; savedAt: string }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: 'ownerKey' })
      if (!db.objectStoreNames.contains(OPERATIONS)) {
        const store = db.createObjectStore(OPERATIONS, { keyPath: 'id' })
        store.createIndex('ownerKey', 'ownerKey', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function offlineOwner(user: UserProfile): OfflineOwner {
  return { key: `${user.orgId}:${user.id}`, userId: user.id, orgId: user.orgId, nome: user.nome || user.email || 'Usuário Nexus' }
}

export async function saveOfflineSnapshot(owner: OfflineOwner, tasks: Tarefa[]): Promise<void> {
  const db = await openDb()
  await requestValue(db.transaction(SNAPSHOTS, 'readwrite').objectStore(SNAPSHOTS).put({
    ownerKey: owner.key,
    owner,
    tasks,
    savedAt: new Date().toISOString(),
  } satisfies OfflineSnapshot))
  localStorage.setItem('nexus:offline-panel-owner', owner.key)
}

export async function loadOfflineSnapshot(ownerKey: string): Promise<OfflineSnapshot | null> {
  const db = await openDb()
  return (await requestValue(db.transaction(SNAPSHOTS).objectStore(SNAPSHOTS).get(ownerKey))) || null
}

export async function queueOfflineOperation(operation: OfflineOperation): Promise<void> {
  const db = await openDb()
  // IDs determinísticos fazem a última intenção substituir a anterior. Assim,
  // marcar/desmarcar o mesmo item offline não gera uma sequência contraditória.
  await requestValue(db.transaction(OPERATIONS, 'readwrite').objectStore(OPERATIONS).put(operation))
}

export async function listOfflineOperations(ownerKey: string): Promise<OfflineOperation[]> {
  const db = await openDb()
  const store = db.transaction(OPERATIONS).objectStore(OPERATIONS)
  const rows = await requestValue(store.index('ownerKey').getAll(ownerKey))
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

async function deleteOfflineOperation(id: string): Promise<void> {
  const db = await openDb()
  await requestValue(db.transaction(OPERATIONS, 'readwrite').objectStore(OPERATIONS).delete(id))
}

export async function syncPanelOperations(ownerKey: string): Promise<{ remaining: number; synced: number }> {
  const operations = await listOfflineOperations(ownerKey)
  let synced = 0
  for (const operation of operations) {
    try {
      if (operation.kind === 'checklist' && operation.itemId) {
        await tarefasApi.atualizarChecklistItem(operation.taskId, operation.itemId, Boolean(operation.feito))
      } else if (operation.kind === 'status' && operation.status) {
        await tarefasApi.updateStatus(operation.taskId, { status: operation.status })
      }
      await deleteOfflineOperation(operation.id)
      synced++
    } catch {
      break
    }
  }
  return { synced, remaining: (await listOfflineOperations(ownerKey)).length }
}

export function checklistOperation(ownerKey: string, taskId: string, itemId: string, feito: boolean): OfflineOperation {
  return {
    id: `${ownerKey}:checklist:${taskId}:${itemId}`,
    ownerKey,
    kind: 'checklist',
    taskId,
    itemId,
    feito,
    createdAt: new Date().toISOString(),
  }
}

export function statusOperation(ownerKey: string, taskId: string, status: OfflineOperation['status']): OfflineOperation {
  return {
    id: `${ownerKey}:status:${taskId}`,
    ownerKey,
    kind: 'status',
    taskId,
    status,
    createdAt: new Date().toISOString(),
  }
}
