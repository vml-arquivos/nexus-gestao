import { useState, useEffect, useCallback } from 'react'
import {
  Plus, X, Users, Check, Trash2, UserMinus,
  ChevronDown, ChevronUp, Loader, Crown, UserRound,
  CheckCircle2, Clock
} from 'lucide-react'
import { teamsApi, equipeApi, type Equipe, type MembroEquipe } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

/* ── Toast ── */
function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `
    position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
    background:${type === 'error' ? '#EF4444' : '#10B981'};
    color:#fff;padding:10px 22px;border-radius:12px;font-size:14px;
    font-weight:600;z-index:9999;box-shadow:0 4px 24px rgba(0,0,0,0.4);
    animation:toastIn .2s ease;white-space:nowrap;
  `
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

/* ── Iniciais do nome ── */
function initials(nome: string) {
  return nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

/* ── Avatar colorido ── */
function Avatar({ nome, size = 36 }: { nome: string; size?: number }) {
  const colors = ['#6C3BFF','#06B6D4','#10B981','#F59E0B','#EF4444','#8B5CF6']
  const color = colors[nome.charCodeAt(0) % colors.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28,
      background: `linear-gradient(135deg, ${color}, ${color}aa)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-heading)', fontWeight: 700,
      fontSize: size * 0.35, color: '#fff', flexShrink: 0,
    }}>
      {initials(nome)}
    </div>
  )
}

/* ════════════════════════════════════════════
   MODAL — Criar Equipe
════════════════════════════════════════════ */
function CreateTeamModal({ onSave, onClose }: {
  onSave: (equipe: Equipe) => void
  onClose: () => void
}) {
  const [nome, setNome]      = useState('')
  const [descricao, setDesc] = useState('')
  const [saving, setSaving]  = useState(false)

  async function handleSave() {
    if (!nome.trim()) { toast('Nome é obrigatório', 'error'); return }
    setSaving(true)
    try {
      const equipe = await teamsApi.create({ nome: nome.trim(), descricao: descricao || undefined })
      onSave(equipe)
      toast('Equipe criada com sucesso!')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao criar equipe', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        backdropFilter: 'blur(6px)', padding: '0 0 0 0' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--bg2)', borderRadius: '20px 20px 0 0', padding: '0 20px 32px',
        width: '100%', maxWidth: 560, maxHeight: '90dvh', overflowY: 'auto' }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border2)', margin: '12px auto 20px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>Nova Equipe</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4 }}><X size={20} /></button>
        </div>
        <div className="form-group">
          <label className="form-label">Nome *</label>
          <input className="form-input" placeholder="Ex: Vendas, TI, Suporte..." value={nome}
            onChange={e => setNome(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Descrição</label>
          <textarea className="form-input" rows={3} placeholder="Opcional — descreva o propósito da equipe"
            value={descricao} onChange={e => setDesc(e.target.value)} style={{ resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 2 }}>
            {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Criando…</> : <><Check size={14} /> Criar Equipe</>}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════
   MODAL — Adicionar Membros
════════════════════════════════════════════ */
function AddMembersModal({ equipe, currentMemberIds, onAdded, onClose }: {
  equipe: Equipe
  currentMemberIds: string[]
  onAdded: () => void
  onClose: () => void
}) {
  const [allMembers, setAllMembers] = useState<MembroEquipe[]>([])
  const [selected, setSelected]     = useState<string[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [search, setSearch]         = useState('')

  useEffect(() => {
    equipeApi.membros()
      .then(ms => setAllMembers(ms.filter(m => !currentMemberIds.includes(m.id))))
      .catch(() => toast('Erro ao carregar membros', 'error'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = allMembers.filter(m =>
    m.nome.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase())
  )

  function toggle(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  async function handleAdd() {
    if (selected.length === 0) { toast('Selecione ao menos um membro', 'error'); return }
    setSaving(true)
    try {
      await teamsApi.addMembers(equipe.id, selected)
      toast(`${selected.length} membro(s) adicionado(s)!`)
      onAdded()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao adicionar membros', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        backdropFilter: 'blur(6px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--bg2)', borderRadius: '20px 20px 0 0', padding: '0 20px 32px',
        width: '100%', maxWidth: 560, maxHeight: '90dvh', overflowY: 'auto' }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border2)', margin: '12px auto 20px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>Adicionar Membros</h2>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{equipe.nome}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4 }}><X size={20} /></button>
        </div>

        {/* Search */}
        <div className="search-bar" style={{ marginBottom: 12 }}>
          <Users size={15} color="var(--text3)" />
          <input placeholder="Buscar por nome ou e-mail..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>
            <Loader size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} /><br />Carregando...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 32, fontSize: 13 }}>
            {allMembers.length === 0 ? 'Todos os membros já fazem parte desta equipe.' : 'Nenhum resultado encontrado.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
            {filtered.map(m => {
              const sel = selected.includes(m.id)
              return (
                <label key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                  background: sel ? 'rgba(108,59,255,0.12)' : 'var(--bg3)',
                  border: `1px solid ${sel ? 'rgba(108,59,255,0.35)' : 'var(--border)'}`,
                  transition: 'all 0.15s',
                }}>
                  <Avatar nome={m.nome} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{m.nome}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {m.role === 'gestor' ? <><Crown size={11} /> Gestor</> : <><UserRound size={11} /> Membro</>}
                      <span style={{ opacity: 0.5 }}>·</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</span>
                    </div>
                  </div>
                  <div style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    background: sel ? 'var(--primary)' : 'transparent',
                    border: `2px solid ${sel ? 'var(--primary)' : 'var(--border2)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}>
                    {sel && <Check size={12} color="#fff" />}
                  </div>
                  <input type="checkbox" checked={sel} onChange={() => toggle(m.id)} style={{ display: 'none' }} />
                </label>
              )
            })}
          </div>
        )}

        {selected.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--primary-light)', textAlign: 'center' }}>
            {selected.length} selecionado(s)
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleAdd} disabled={saving || selected.length === 0} style={{ flex: 2 }}>
            {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Adicionando…</> : <><Check size={14} /> Adicionar ({selected.length})</>}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════
   CARD de Equipe com membros expansíveis
════════════════════════════════════════════ */
function TeamCard({ team, isGestor, onDelete, onAddMembers, onRefresh }: {
  team: Equipe
  isGestor: boolean
  onDelete: (id: string) => void
  onAddMembers: (team: Equipe) => void
  onRefresh: () => void
}) {
  const [expanded, setExpanded]     = useState(false)
  const [members, setMembers]       = useState<MembroEquipe[]>([])
  const [loadingM, setLoadingM]     = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)

  async function loadMembers() {
    if (members.length > 0) { setExpanded(e => !e); return }
    setExpanded(true)
    setLoadingM(true)
    try {
      const ms = await teamsApi.members(team.id)
      setMembers(ms)
    } catch {
      toast('Erro ao carregar membros', 'error')
    } finally {
      setLoadingM(false)
    }
  }

  async function removeMember(profileId: string, nome: string) {
    setRemovingId(profileId)
    try {
      // usa a rota DELETE /api/teams/:id/members/:profileId
      await fetch(`/api/teams/${team.id}/members/${profileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('nexus_token')}` },
      })
      setMembers(ms => ms.filter(m => m.id !== profileId))
      toast(`${nome} removido da equipe`)
      onRefresh()
    } catch {
      toast('Erro ao remover membro', 'error')
    } finally {
      setRemovingId(null)
    }
  }

  async function deleteTeam() {
    try {
      await fetch(`/api/teams/${team.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('nexus_token')}` },
      })
      toast('Equipe excluída')
      onDelete(team.id)
    } catch {
      toast('Erro ao excluir equipe', 'error')
    } finally {
      setConfirmDel(false)
    }
  }

  const count = team.members_count ?? members.length

  return (
    <div style={{ borderRadius: 14, background: 'var(--bg2)', border: '1px solid var(--border)', overflow: 'hidden' }}>
      {/* ── Cabeçalho ── */}
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Ícone */}
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--grad-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          boxShadow: '0 2px 10px rgba(108,59,255,0.35)' }}>
          <Users size={19} color="#fff" />
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{team.nome}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>
            {count} membro{count !== 1 ? 's' : ''}
            {team.descricao && <> · <span style={{ opacity: 0.8 }}>{team.descricao}</span></>}
          </div>
        </div>

        {/* Ações */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isGestor && (
            <>
              <button className="btn btn-secondary btn-sm"
                onClick={() => onAddMembers(team)}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Plus size={13} /> Adicionar
              </button>
              <button className="btn btn-ghost btn-icon"
                onClick={() => setConfirmDel(true)}
                style={{ color: 'var(--danger)', width: 32, height: 32 }}
                title="Excluir equipe">
                <Trash2 size={15} />
              </button>
            </>
          )}
          <button className="btn btn-ghost btn-icon"
            onClick={loadMembers}
            style={{ width: 32, height: 32 }}
            title={expanded ? 'Recolher' : 'Ver membros'}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* ── Lista de membros ── */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '8px 16px 14px' }}>
          {loadingM ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20, color: 'var(--text3)' }}>
              <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando membros...
            </div>
          ) : members.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '16px 0' }}>
              Nenhum membro nesta equipe ainda.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {members.map(m => (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 10,
                  background: 'var(--bg3)',
                  marginBottom: 4,
                }}>
                  <Avatar nome={m.nome} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 5 }}>
                      {m.nome}
                      {m.role === 'gestor' && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#F59E0B', background: 'rgba(245,158,11,0.12)', padding: '1px 6px', borderRadius: 99 }}>
                          Gestor
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 8, marginTop: 1 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Clock size={10} /> {m.tarefas_pendentes} pendente{m.tarefas_pendentes !== 1 ? 's' : ''}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <CheckCircle2 size={10} /> {m.tarefas_concluidas} concluída{m.tarefas_concluidas !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  {isGestor && (
                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={() => removeMember(m.id, m.nome)}
                      disabled={removingId === m.id}
                      style={{ color: 'var(--danger)', width: 28, height: 28, opacity: removingId === m.id ? 0.5 : 1 }}
                      title="Remover da equipe"
                    >
                      {removingId === m.id
                        ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
                        : <UserMinus size={13} />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Confirmar exclusão ── */}
      {confirmDel && (
        <div style={{ borderTop: '1px solid var(--danger)', padding: '12px 16px', background: 'rgba(239,68,68,0.06)' }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>
            Tem certeza que deseja excluir a equipe <strong>{team.nome}</strong>? Esta ação não pode ser desfeita.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(false)} style={{ flex: 1 }}>Cancelar</button>
            <button className="btn btn-danger btn-sm" onClick={deleteTeam} style={{ flex: 1 }}>
              <Trash2 size={13} /> Excluir
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════
   PÁGINA PRINCIPAL
════════════════════════════════════════════ */
export default function Equipes() {
  const { user } = useAuth()
  const isGestor = user?.role === 'gestor'

  const [teams, setTeams]       = useState<Equipe[]>([])
  const [loading, setLoading]   = useState(true)
  const [createOpen, setCreateOpen]     = useState(false)
  const [addMembersTeam, setAddMembersTeam] = useState<Equipe | null>(null)

  const loadTeams = useCallback(async () => {
    setLoading(true)
    try {
      const ts = await teamsApi.list()
      setTeams(ts)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar equipes', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTeams() }, [loadTeams])

  function handleCreated(equipe: Equipe) {
    setTeams(t => [...t, { ...equipe, members_count: 0 }])
  }

  function handleDeleted(id: string) {
    setTeams(t => t.filter(e => e.id !== id))
  }

  // IDs dos membros atuais da equipe selecionada para filtrar no modal
  const [currentMemberIds, setCurrentMemberIds] = useState<string[]>([])

  async function openAddMembers(team: Equipe) {
    try {
      const ms = await teamsApi.members(team.id)
      setCurrentMemberIds(ms.map(m => m.id))
    } catch {
      setCurrentMemberIds([])
    }
    setAddMembersTeam(team)
  }

  const totalMembros = teams.reduce((s, t) => s + (t.members_count ?? 0), 0)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* ── Cabeçalho ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22, letterSpacing: '-0.02em' }}>Equipes</h1>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 3 }}>
            {teams.length} equipe{teams.length !== 1 ? 's' : ''} · {totalMembros} membro{totalMembros !== 1 ? 's' : ''} no total
          </p>
        </div>
        {isGestor && (
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} /> Nova Equipe
          </button>
        )}
      </div>

      {/* ── Conteúdo ── */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: 80, color: 'var(--text3)' }}>
          <Loader size={28} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 13 }}>Carregando equipes...</span>
        </div>
      ) : teams.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👥</div>
          <div className="empty-title">Nenhuma equipe ainda</div>
          <div className="empty-text">
            {isGestor
              ? 'Crie sua primeira equipe e adicione membros para colaborar.'
              : 'Você ainda não foi adicionado a nenhuma equipe.'}
          </div>
          {isGestor && (
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)} style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={16} /> Criar primeira equipe
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {teams.map(team => (
            <TeamCard
              key={team.id}
              team={team}
              isGestor={isGestor}
              onDelete={handleDeleted}
              onAddMembers={openAddMembers}
              onRefresh={loadTeams}
            />
          ))}
        </div>
      )}

      {/* ── Modais ── */}
      {createOpen && (
        <CreateTeamModal onSave={handleCreated} onClose={() => setCreateOpen(false)} />
      )}
      {addMembersTeam && (
        <AddMembersModal
          equipe={addMembersTeam}
          currentMemberIds={currentMemberIds}
          onAdded={loadTeams}
          onClose={() => setAddMembersTeam(null)}
        />
      )}
    </div>
  )
}
