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


# Este patch roda imediatamente depois de apply_tarefas_client_select_patch.py.
# Ele corrige duas causas do catálogo aparecer limitado aos primeiros registros:
# 1) o modal consultava apenas o cache existente, que podia conter uma sincronização antiga de 50 itens;
# 2) a sincronização confiava exclusivamente em pagination.has_more.

# ── Frontend: atualiza o catálogo automaticamente antes da primeira abertura ──
tarefas_path = "src/pages/Tarefas.tsx"
tarefas = read(tarefas_path)

tarefas = replace_once(
    tarefas,
    "  const [destravaSelectOpen, setDestravaSelectOpen] = useState(false)\n"
    "  const destravaSelectRef = useRef<HTMLDivElement | null>(null)\n"
    "  const destravaBuscaRef = useRef<HTMLInputElement | null>(null)\n",
    "  const [destravaSelectOpen, setDestravaSelectOpen] = useState(false)\n"
    "  const destravaSelectRef = useRef<HTMLDivElement | null>(null)\n"
    "  const destravaBuscaRef = useRef<HTMLInputElement | null>(null)\n"
    "  const destravaAutoSyncRef = useRef(false)\n",
    "referência de sincronização automática do catálogo",
)

tarefas = replace_once(
    tarefas,
    "  async function abrirSeletorDestrava() {\n"
    "    setDestravaSelectOpen(true)\n"
    "    if (!destravaPesquisaExecutada) void carregarCadastrosDestrava(destravaTipo)\n"
    "    window.setTimeout(() => destravaBuscaRef.current?.focus(), 0)\n"
    "  }\n",
    "  async function abrirSeletorDestrava() {\n"
    "    setDestravaSelectOpen(true)\n"
    "    if (!destravaPesquisaExecutada) {\n"
    "      if (!destravaAutoSyncRef.current) {\n"
    "        destravaAutoSyncRef.current = true\n"
    "        setDestravaLoading(true)\n"
    "        try {\n"
    "          await destravaApi.sincronizarEmpresas()\n"
    "        } catch (e) {\n"
    "          destravaAutoSyncRef.current = false\n"
    "          toast(\n"
    "            e instanceof Error\n"
    "              ? `${e.message} Exibindo o cache local disponível.`\n"
    "              : 'Não foi possível atualizar o catálogo. Exibindo o cache local disponível.',\n"
    "            'error',\n"
    "          )\n"
    "        }\n"
    "      }\n"
    "      await carregarCadastrosDestrava(destravaTipo)\n"
    "    }\n"
    "    window.setTimeout(() => destravaBuscaRef.current?.focus(), 0)\n"
    "  }\n",
    "sincronização automática antes de abrir o seletor",
)

write(tarefas_path, tarefas)


# ── Backend: pagina todo o catálogo e valida que nenhuma página foi perdida ───
backend_path = "backend/src/routes/integracoes.ts"
backend = read(backend_path)

backend = replace_once(
    backend,
    "    const pageSize = 500\n"
    "    let page = 1\n"
    "    let hasMore = true\n"
    "    const items: any[] = []\n"
    "\n"
    "    while (hasMore) {\n"
    "      const data = await callDestrava(`/api/nexus/catalogo?tipo=todos&q=&limit=${pageSize}&page=${page}`)\n"
    "      const batch = Array.isArray(data?.items) ? data.items : []\n"
    "      items.push(...batch)\n"
    "      hasMore = Boolean(data?.pagination?.has_more)\n"
    "      page += 1\n"
    "      if (page > 10000) throw new Error('Sincronização interrompida por limite de segurança.')\n"
    "    }\n",
    "    const pageSize = 500\n"
    "    let page = 1\n"
    "    let fetchedPages = 0\n"
    "    let expectedTotal = 0\n"
    "    let previousFingerprint = ''\n"
    "    const itemsByKey = new Map<string, any>()\n"
    "\n"
    "    while (true) {\n"
    "      const data = await callDestrava(`/api/nexus/catalogo?tipo=todos&q=&limit=${pageSize}&page=${page}`)\n"
    "      fetchedPages += 1\n"
    "      const batch = Array.isArray(data?.items) ? data.items : []\n"
    "      const pagination = data?.pagination || {}\n"
    "      expectedTotal = Math.max(expectedTotal, Number(pagination?.total || data?.total || 0))\n"
    "\n"
    "      if (!batch.length) break\n"
    "\n"
    "      const fingerprint = batch.map((raw: any) => {\n"
    "        const rawId = String(raw?.id || raw?.external_id || '').trim()\n"
    "        const rawTipo = String(raw?.tipo || raw?.entidade_tipo || 'empresa').trim()\n"
    "        return `${rawTipo}:${rawId}`\n"
    "      }).join('|')\n"
    "      if (page > 1 && fingerprint && fingerprint === previousFingerprint) {\n"
    "        throw new Error('A API da Destrava repetiu a mesma página; a sincronização foi cancelada para não manter um catálogo incompleto.')\n"
    "      }\n"
    "      previousFingerprint = fingerprint\n"
    "\n"
    "      for (const raw of batch) {\n"
    "        const rawId = String(raw?.id || raw?.external_id || '').trim()\n"
    "        const rawTipo = String(raw?.tipo || raw?.entidade_tipo || 'empresa').trim()\n"
    "        if (rawId) itemsByKey.set(`${rawTipo}:${rawId}`, raw)\n"
    "      }\n"
    "\n"
    "      const explicitHasMore = pagination?.has_more ?? pagination?.hasMore ?? data?.has_more ?? data?.hasMore\n"
    "      const reportedPage = Math.max(1, Number(pagination?.page || page))\n"
    "      const reportedLimit = Math.max(1, Number(pagination?.limit || pageSize))\n"
    "      const totalPages = Math.max(0, Number(pagination?.total_pages ?? pagination?.totalPages ?? 0))\n"
    "      const moreByTotal = expectedTotal > itemsByKey.size\n"
    "      const moreByPages = totalPages > reportedPage\n"
    "      const moreByFullPage = batch.length >= reportedLimit\n"
    "      const shouldContinue = explicitHasMore === true || moreByTotal || moreByPages || moreByFullPage\n"
    "\n"
    "      if (!shouldContinue) break\n"
    "      page += 1\n"
    "      if (page > 10000) throw new Error('Sincronização interrompida por limite de segurança.')\n"
    "    }\n"
    "\n"
    "    const items = Array.from(itemsByKey.values())\n"
    "    if (expectedTotal > 0 && items.length < expectedTotal) {\n"
    "      throw new Error(`Catálogo incompleto recebido da Destrava: ${items.length} de ${expectedTotal} cadastro(s).`)\n"
    "    }\n",
    "paginação integral do catálogo Destrava",
)

backend = replace_once(
    backend,
    "    res.json({ ok:true, sincronizadas:validos, total_recebido:items.length, paginas:page - 1, sincronizado_em:new Date().toISOString() })\n",
    "    res.json({ ok:true, sincronizadas:validos, total_recebido:items.length, paginas:fetchedPages, sincronizado_em:new Date().toISOString() })\n",
    "quantidade correta de páginas sincronizadas",
)

write(backend_path, backend)

print("Patch de catálogo completo PJ/PF aplicado com sucesso.")
