from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(content: str, before: str, after: str, label: str) -> str:
    count = content.count(before)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1 trecho, encontrado {count}")
    return content.replace(before, after, 1)


def replace_between(content: str, start_marker: str, end_marker: str, replacement: str, label: str) -> str:
    start = content.find(start_marker)
    if start < 0:
        raise RuntimeError(f"{label}: marcador inicial não encontrado")
    end = content.find(end_marker, start)
    if end < 0:
        raise RuntimeError(f"{label}: marcador final não encontrado")
    return content[:start] + replacement + content[end:]


# ── Frontend: modal de tarefas ────────────────────────────────────────────────
tarefas_path = "src/pages/Tarefas.tsx"
tarefas = read(tarefas_path)

tarefas = replace_once(
    tarefas,
    "import { useCallback, useEffect, useMemo, useState } from 'react'",
    "import { useCallback, useEffect, useMemo, useRef, useState } from 'react'",
    "import useRef",
)

tarefas = replace_once(
    tarefas,
    "  Paperclip, Upload, Download, FileText, Copy, Trophy, Printer,\n",
    "  Paperclip, Upload, Download, FileText, Copy, Trophy, Printer, ChevronDown, Check,\n",
    "ícones do combobox",
)

assignee_block = """function assigneeOptions(membros: MembroEquipe[], user?: { id?: string; nome?: string; role?: string }) {
  const map = new Map<string, { id: string; nome: string; role?: string }>()
  if (user?.id) map.set(user.id, { id: user.id, nome: user.nome || 'Eu', role: user.role })
  membros.forEach(m => map.set(m.id, { id: m.id, nome: m.nome, role: m.role_na_equipe || m.role }))
  return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}
"""

search_helpers = assignee_block + """
function normalizeDestravaSearch(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9@.+-]+/g, ' ')
    .trim()
}

function destravaItemMatches(item: DestravaCatalogoItem, rawSearch: string) {
  const search = normalizeDestravaSearch(rawSearch)
  if (!search) return true

  const normalizedName = normalizeDestravaSearch(item.nome)
  const initials = normalizedName
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .join('')
  const searchable = normalizeDestravaSearch([
    item.nome,
    item.documento,
    item.email,
    item.telefone,
    item.status,
  ].filter(Boolean).join(' '))

  return search
    .split(/\s+/)
    .filter(Boolean)
    .every(term => searchable.includes(term) || initials.includes(term))
}
"""

tarefas = replace_once(tarefas, assignee_block, search_helpers, "helpers de busca do cliente")

tarefas = replace_once(
    tarefas,
    "  const [destravaTotalCatalogo, setDestravaTotalCatalogo] = useState(0)\n",
    "  const [destravaTotalCatalogo, setDestravaTotalCatalogo] = useState(0)\n"
    "  const [destravaSelectOpen, setDestravaSelectOpen] = useState(false)\n"
    "  const destravaSelectRef = useRef<HTMLDivElement | null>(null)\n"
    "  const destravaBuscaRef = useRef<HTMLInputElement | null>(null)\n"
    "  const destravaAutoSyncRef = useRef(false)\n",
    "estado do combobox",
)

new_functions = """  async function carregarCadastrosDestrava(tipo: 'empresa' | 'pessoa_fisica' = destravaTipo) {
    setDestravaLoading(true)
    setDestravaPesquisaExecutada(true)
    try {
      const pageSize = 250
      const itens: DestravaCatalogoItem[] = []
      let page = 1
      let total = 0
      let totalCatalogo = 0

      do {
        const data = await destravaApi.empresasSincronizadas({
          tipo,
          q: '',
          limit: pageSize,
          page,
        })
        const batch = Array.isArray(data.items) ? data.items : []
        itens.push(...batch)
        total = Number(data.total || itens.length)
        totalCatalogo = Number(data.total_catalogo || totalCatalogo || total)
        page += 1
        if (!batch.length) break
      } while (itens.length < total && page <= 200)

      const unicos = new Map<string, DestravaCatalogoItem>()
      itens.forEach(item => unicos.set(`${item.tipo}-${item.id}`, item))
      setDestravaItens(Array.from(unicos.values()))
      setDestravaTotalResultados(total)
      setDestravaTotalCatalogo(totalCatalogo)
    } catch (e) {
      setDestravaItens([])
      setDestravaTotalResultados(0)
      toast(e instanceof Error ? e.message : 'Erro ao carregar cadastros da Destrava.', 'error')
    } finally {
      setDestravaLoading(false)
    }
  }

  async function abrirSeletorDestrava() {
    setDestravaSelectOpen(true)
    if (!destravaPesquisaExecutada) {
      if (!destravaAutoSyncRef.current) {
        destravaAutoSyncRef.current = true
        setDestravaLoading(true)
        try {
          await destravaApi.sincronizarEmpresas()
        } catch (e) {
          destravaAutoSyncRef.current = false
          toast(
            e instanceof Error
              ? `${e.message} Exibindo o cache local disponível.`
              : 'Não foi possível atualizar o catálogo. Exibindo o cache local disponível.',
            'error',
          )
        }
      }
      await carregarCadastrosDestrava(destravaTipo)
    }
    window.setTimeout(() => destravaBuscaRef.current?.focus(), 0)
  }

  function selecionarTipoDestrava(tipo: 'empresa' | 'pessoa_fisica') {
    setDestravaTipo(tipo)
    setDestravaBusca('')
    setDestravaItens([])
    setDestravaPesquisaExecutada(false)
    setDestravaTotalResultados(0)
    if (destravaSelecionado && destravaSelecionado.tipo !== tipo) {
      setDestravaSelecionado(null)
    }
    setDestravaSelectOpen(true)
    void carregarCadastrosDestrava(tipo)
    window.setTimeout(() => destravaBuscaRef.current?.focus(), 0)
  }

  function limparPesquisaDestrava() {
    setDestravaBusca('')
    window.setTimeout(() => destravaBuscaRef.current?.focus(), 0)
  }

  useEffect(() => {
    if (!destravaSelectOpen) return

    const handleOutsideClick = (event: MouseEvent) => {
      if (!destravaSelectRef.current?.contains(event.target as Node)) {
        setDestravaSelectOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [destravaSelectOpen])

"""

tarefas = replace_between(
    tarefas,
    "  async function buscarCadastroDestrava() {",
    "  function changeTipoTarefa(next: 'pessoal' | 'equipe') {",
    new_functions,
    "funções do seletor de clientes",
)

new_memo = """  const destravaSelectOptions = useMemo(() => {
    const map = new Map<string, DestravaCatalogoItem>()
    if (destravaSelecionado) map.set(`${destravaSelecionado.tipo}-${destravaSelecionado.id}`, destravaSelecionado)
    destravaItens.forEach(item => map.set(`${item.tipo}-${item.id}`, item))
    return Array.from(map.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
  }, [destravaItens, destravaSelecionado])

  const destravaFilteredOptions = useMemo(
    () => destravaSelectOptions.filter(item => item.tipo === destravaTipo && destravaItemMatches(item, destravaBusca)),
    [destravaBusca, destravaSelectOptions, destravaTipo],
  )

"""

tarefas = replace_between(
    tarefas,
    "  const destravaSelectOptions = useMemo(() => {",
    "  async function salvar() {",
    new_memo,
    "filtro local do seletor",
)

new_ui = """            <div className="destrava-client-select-grid">
              <div className="form-group destrava-client-type">
                <label className="form-label" htmlFor="destrava-client-type">Tipo de cliente</label>
                <select
                  id="destrava-client-type"
                  className="form-input"
                  value={destravaTipo}
                  onChange={e => selecionarTipoDestrava(e.target.value as 'empresa' | 'pessoa_fisica')}
                >
                  <option value="empresa">Clientes PJ</option>
                  <option value="pessoa_fisica">Clientes PF</option>
                </select>
              </div>

              <div className="form-group destrava-client-picker">
                <label className="form-label">Empresa ou pessoa</label>
                <div className="destrava-search-select" ref={destravaSelectRef}>
                  <button
                    type="button"
                    className="form-input destrava-search-select__trigger"
                    aria-haspopup="listbox"
                    aria-expanded={destravaSelectOpen}
                    onClick={() => {
                      if (destravaSelectOpen) setDestravaSelectOpen(false)
                      else void abrirSeletorDestrava()
                    }}
                  >
                    {destravaSelecionado ? (
                      <>
                        <span className="destrava-search-select__badge">{destravaSelecionado.tipo === 'pessoa_fisica' ? 'PF' : 'PJ'}</span>
                        <span className="destrava-search-select__value">
                          {destravaSelecionado.nome}{destravaSelecionado.documento ? ` · ${destravaSelecionado.documento}` : ''}
                        </span>
                      </>
                    ) : (
                      <span className="destrava-search-select__placeholder">
                        Selecione um cliente {destravaTipo === 'pessoa_fisica' ? 'PF' : 'PJ'}
                      </span>
                    )}
                    {destravaLoading ? <Loader className="spin" size={17} /> : <ChevronDown size={17} />}
                  </button>

                  {destravaSelectOpen && (
                    <div className="destrava-search-select__panel">
                      <div className="destrava-search-select__search">
                        <Search size={16} />
                        <input
                          ref={destravaBuscaRef}
                          value={destravaBusca}
                          onChange={e => setDestravaBusca(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Escape') {
                              e.preventDefault()
                              setDestravaSelectOpen(false)
                            }
                            if (e.key === 'Enter' && destravaFilteredOptions[0]) {
                              e.preventDefault()
                              setDestravaSelecionado(destravaFilteredOptions[0])
                              setDestravaBusca('')
                              setDestravaSelectOpen(false)
                            }
                          }}
                          placeholder={destravaTipo === 'pessoa_fisica'
                            ? 'Digite nome, iniciais, CPF, e-mail ou telefone'
                            : 'Digite razão social, nome, iniciais, CNPJ, e-mail ou telefone'}
                          autoComplete="off"
                          aria-label={`Pesquisar cliente ${destravaTipo === 'pessoa_fisica' ? 'PF' : 'PJ'}`}
                        />
                        {destravaBusca && (
                          <button type="button" className="destrava-search-select__clear" onClick={limparPesquisaDestrava} aria-label="Limpar pesquisa">
                            <X size={15} />
                          </button>
                        )}
                      </div>

                      <div className="destrava-search-select__options" role="listbox" aria-label={`Clientes ${destravaTipo === 'pessoa_fisica' ? 'PF' : 'PJ'}`}>
                        {destravaLoading ? (
                          <div className="destrava-search-select__empty"><Loader className="spin" size={18} /> Carregando todos os cadastros...</div>
                        ) : destravaFilteredOptions.length ? (
                          destravaFilteredOptions.map(item => {
                            const isSelected = destravaSelecionado?.id === item.id && destravaSelecionado?.tipo === item.tipo
                            return (
                              <button
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                className={isSelected ? 'destrava-search-select__option is-selected' : 'destrava-search-select__option'}
                                key={`${item.tipo}-${item.id}`}
                                onClick={() => {
                                  setDestravaSelecionado(item)
                                  setDestravaBusca('')
                                  setDestravaSelectOpen(false)
                                }}
                              >
                                <span className="destrava-search-select__badge">{item.tipo === 'pessoa_fisica' ? 'PF' : 'PJ'}</span>
                                <span className="destrava-search-select__option-copy">
                                  <strong>{item.nome}</strong>
                                  <small>{[item.documento, item.email, item.telefone].filter(Boolean).join(' · ') || 'Cadastro sem documento ou contato informado'}</small>
                                </span>
                                {isSelected && <Check size={17} />}
                              </button>
                            )
                          })
                        ) : (
                          <div className="destrava-search-select__empty">
                            {destravaTotalCatalogo === 0
                              ? 'Nenhum cliente sincronizado. Use o botão Sincronizar PJ e PF.'
                              : 'Nenhum cliente corresponde ao texto digitado.'}
                          </div>
                        )}
                      </div>

                      <div className="destrava-search-select__footer">
                        <span>
                          {destravaBusca
                            ? `${destravaFilteredOptions.length} resultado(s) filtrado(s)`
                            : `${destravaTotalResultados || destravaFilteredOptions.length} cliente(s) disponível(is)`}
                        </span>
                        {destravaSelecionado && (
                          <button
                            type="button"
                            onClick={() => {
                              setDestravaSelecionado(null)
                              setDestravaBusca('')
                            }}
                          >
                            Remover seleção
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="muted destrava-client-select-help">
              Escolha PJ ou PF e abra o campo de cliente. Todos os cadastros desse tipo são carregados; digite parte do nome ou apenas as iniciais para filtrar dentro do próprio select.
            </div>

            <div className="destrava-client-select-actions">
              <button className="btn btn-secondary btn-sm" type="button" disabled={destravaLoading} onClick={async () => {
                setDestravaLoading(true)
                try {
                  const sync = await destravaApi.sincronizarEmpresas()
                  destravaAutoSyncRef.current = true
                  toast(`${sync.sincronizadas} cadastro(s) de PJ e PF sincronizado(s) com a Destrava.`)
                  setDestravaPesquisaExecutada(false)
                  await carregarCadastrosDestrava(destravaTipo)
                  setDestravaSelectOpen(true)
                  window.setTimeout(() => destravaBuscaRef.current?.focus(), 0)
                } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao sincronizar clientes da Destrava.', 'error') }
                finally { setDestravaLoading(false) }
              }}>{destravaLoading ? <Loader className="spin" size={13} /> : <RotateCcw size={13} />} Sincronizar PJ e PF</button>
              {destravaSelecionado && (
                <button className="btn btn-ghost btn-sm" type="button" disabled={destravaLoading} onClick={() => setDestravaSelecionado(null)}>
                  <X size={13} /> Limpar cliente
                </button>
              )}
            </div>

"""

tarefas = replace_between(
    tarefas,
    "            <div className=\"task-type-selector\" role=\"radiogroup\" aria-label=\"Tipo de cliente da Destrava\" style={{ marginBottom: 10 }}>",
    "            {destravaSelecionado && (",
    new_ui,
    "interface do seletor de clientes",
)

write(tarefas_path, tarefas)


# ── Frontend: cliente de API com paginação ────────────────────────────────────
api_path = "src/lib/api.ts"
api = read(api_path)
new_api_method = """  async empresasSincronizadas(params?: { tipo?: 'empresa' | 'pessoa_fisica'; q?: string; limit?: number; page?: number }): Promise<{ items: DestravaCatalogoItem[]; total?: number; total_catalogo?: number; ultima_sincronizacao?: string; page?: number; limit?: number; has_more?: boolean }> {
    const qs = '?' + new URLSearchParams({
      tipo: params?.tipo || '',
      q: params?.q || '',
      limit: String(params?.limit || 50),
      page: String(params?.page || 1),
    }).toString()
    return apiJson(`/integracoes/destrava/empresas${qs}`)
  },
"""
api = replace_between(
    api,
    "  async empresasSincronizadas(",
    "  async sincronizarEmpresas()",
    new_api_method,
    "paginação no cliente da API",
)
write(api_path, api)


# ── Backend: paginação segura para carregar todos os clientes ─────────────────
backend_path = "backend/src/routes/integracoes.ts"
backend = read(backend_path)
new_backend_route = """router.get('/destrava/empresas', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureDestravaCacheSchema()
    const orgId = req.user!.orgId
    const q = String(req.query.q || '').trim()
    const tipoParam = String(req.query.tipo || '').trim().toLowerCase()
    const tipo = tipoParam === 'pessoa_fisica' || tipoParam === 'pf'
      ? 'pessoa_fisica'
      : tipoParam === 'empresa' || tipoParam === 'pj'
        ? 'empresa'
        : ''
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 50)))
    const page = Math.max(1, Math.floor(Number(req.query.page || 1)))
    const offset = (page - 1) * limit
    const params = [orgId, tipo, q, limit, offset]
    const filtro = `org_id=$1 AND ativo=TRUE
      AND ($2='' OR tipo=$2)
      AND ($3='' OR lower(
        COALESCE(nome,'') || ' ' || COALESCE(documento,'') || ' ' || COALESCE(email,'') || ' ' || COALESCE(telefone,'')
      ) LIKE '%' || lower($3) || '%')`
    const empresas = await query<any>(`SELECT external_id AS id, tipo, nome, documento, email, telefone, status, source_url AS url, metadata, sincronizado_em
      FROM destrava_empresas_cache
      WHERE ${filtro}
      ORDER BY lower(nome), external_id
      LIMIT $4 OFFSET $5`, params)
    const info = await queryOne<any>(`SELECT
        COUNT(*) FILTER (WHERE ($2='' OR tipo=$2) AND ($3='' OR lower(
          COALESCE(nome,'') || ' ' || COALESCE(documento,'') || ' ' || COALESCE(email,'') || ' ' || COALESCE(telefone,'')
        ) LIKE '%' || lower($3) || '%'))::int AS total,
        COUNT(*)::int AS total_catalogo,
        MAX(sincronizado_em) AS ultima_sincronizacao
      FROM destrava_empresas_cache
      WHERE org_id=$1 AND ativo=TRUE`, [orgId, tipo, q])
    const total = Number(info?.total || 0)
    const totalCatalogo = Number(info?.total_catalogo || 0)
    res.json({
      items: empresas.map(e => ({ ...e, tipo: e.tipo || 'empresa' })),
      total,
      total_catalogo: totalCatalogo,
      ultima_sincronizacao: info?.ultima_sincronizacao || null,
      page,
      limit,
      has_more: offset + empresas.length < total,
    })
  } catch(err) { console.error('[INTEGRACOES] Erro cache empresas:',err); res.status(500).json({error:'Erro ao pesquisar clientes sincronizados da Destrava.'}) }
})

"""
backend = replace_between(
    backend,
    "router.get('/destrava/empresas', authMiddleware",
    "// Rotas autenticadas para o próprio Nexus consultar o catálogo do Destrava sem expor a chave no navegador.",
    new_backend_route,
    "rota paginada de clientes",
)
write(backend_path, backend)


# ── CSS do combobox pesquisável ───────────────────────────────────────────────
css_path = "src/app-styles.css"
css = read(css_path)
css_marker = "/* ── SELECT PESQUISÁVEL DE CLIENTES DESTRAVA ── */"
if css_marker not in css:
    css += """

/* ── SELECT PESQUISÁVEL DE CLIENTES DESTRAVA ── */
.destrava-client-select-grid {
  display: grid;
  grid-template-columns: minmax(180px, .42fr) minmax(0, 1.58fr);
  gap: 12px;
  align-items: end;
}

.destrava-client-select-grid .form-group {
  margin-bottom: 0;
}

.destrava-search-select {
  position: relative;
  width: 100%;
}

.destrava-search-select__trigger {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 9px;
  text-align: left;
  cursor: pointer;
  color: var(--text);
  background: var(--bg2);
}

.destrava-search-select__trigger > svg:last-child {
  margin-left: auto;
  flex: 0 0 auto;
  color: var(--text3);
}

.destrava-search-select__placeholder {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text3);
}

.destrava-search-select__value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.destrava-search-select__badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 31px;
  height: 23px;
  padding: 0 7px;
  border-radius: var(--radius-full);
  background: var(--primary-dim);
  color: var(--primary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .04em;
}

.destrava-search-select__panel {
  position: absolute;
  z-index: calc(var(--z-modal) + 20);
  top: calc(100% + 7px);
  left: 0;
  right: 0;
  min-width: min(680px, calc(96vw - 48px));
  overflow: hidden;
  border: 1px solid var(--border2);
  border-radius: var(--radius-lg);
  background: var(--bg2);
  box-shadow: var(--shadow-xl);
}

.destrava-search-select__search {
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 11px;
  border-bottom: 1px solid var(--border);
  color: var(--text3);
}

.destrava-search-select__search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
}

.destrava-search-select__search input::placeholder {
  color: var(--text3);
}

.destrava-search-select__clear {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text3);
  cursor: pointer;
}

.destrava-search-select__clear:hover {
  background: var(--bg3);
  color: var(--text);
}

.destrava-search-select__options {
  max-height: 310px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px;
}

.destrava-search-select__option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.destrava-search-select__option:hover,
.destrava-search-select__option.is-selected {
  background: var(--primary-dim2);
}

.destrava-search-select__option.is-selected {
  outline: 1px solid var(--primary-dim);
}

.destrava-search-select__option > svg:last-child {
  margin-left: auto;
  flex: 0 0 auto;
  color: var(--success);
}

.destrava-search-select__option-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.destrava-search-select__option-copy strong,
.destrava-search-select__option-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.destrava-search-select__option-copy strong {
  font-size: 14px;
}

.destrava-search-select__option-copy small {
  color: var(--text2);
  font-size: 12px;
}

.destrava-search-select__empty {
  min-height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 18px;
  color: var(--text2);
  text-align: center;
}

.destrava-search-select__footer {
  min-height: 39px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 11px;
  border-top: 1px solid var(--border);
  background: var(--bg3);
  color: var(--text2);
  font-size: 12px;
}

.destrava-search-select__footer button {
  border: 0;
  background: transparent;
  color: var(--primary);
  font-weight: 700;
  cursor: pointer;
}

.destrava-client-select-help {
  margin-top: 7px;
}

.destrava-client-select-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 9px;
}

@media (max-width: 720px) {
  .destrava-client-select-grid {
    grid-template-columns: 1fr;
  }

  .destrava-search-select__panel {
    min-width: 100%;
  }
}
"""
write(css_path, css)

print("Patch do select pesquisável de PJ/PF aplicado com sucesso.")
