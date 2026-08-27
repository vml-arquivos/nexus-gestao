export interface GeminiInsightInput {
  score: number
  resumo: string
  metricas: Record<string, number>
  riscos: Array<{ titulo: string; detalhe: string; nivel: 'baixo' | 'medio' | 'alto' | 'critico'; destino?: string; acao_tipo?: string }>
  recomendacoes: Array<{ titulo: string; detalhe: string; acao: string; destino?: string; acao_tipo?: string }>
  financeiroCritico?: Array<Record<string, unknown>>
  acoesInteligentes?: Array<Record<string, unknown>>
}

export interface GeminiInsightResult {
  enabled: boolean
  provider: string
  model: string
  texto: string
  erro?: string
}

export interface ChecklistSuggestionItem {
  texto: string
  descricao?: string
}

export interface ChecklistSuggestionResult {
  enabled: boolean
  provider: string
  model: string
  itens: ChecklistSuggestionItem[]
  fallback?: boolean
  erro?: string
}

function gerarSugestaoLocal(titulo: string, descricao: string): ChecklistSuggestionItem[] {
  const objetivo = titulo.replace(/[.!?]+$/, '').trim()
  const itens: ChecklistSuggestionItem[] = [
    { texto: `Definir o resultado esperado para: ${objetivo}`, descricao: 'Alinhar o objetivo e o critério de conclusão antes de iniciar.' },
    { texto: 'Reunir os dados, documentos e acessos necessários', descricao: 'Confirmar que os insumos estão disponíveis e registrar eventuais pendências.' },
    { texto: `Executar a atividade principal de ${objetivo}`, descricao: 'Realizar a operação conforme as orientações da lista e registrar evidências.' },
    { texto: 'Revisar o resultado e corrigir pendências', descricao: 'Conferir os critérios de conclusão e ajustar qualquer inconsistência encontrada.' },
    { texto: 'Registrar evidências e comunicar a conclusão', descricao: 'Anexar comprovantes relevantes e informar os envolvidos sobre o resultado.' },
  ]
  if (descricao && /document|comprov|anex|contrat|certid|nota|arquivo/i.test(descricao)) {
    itens.splice(2, 0, { texto: 'Anexar os documentos e comprovantes relacionados', descricao: 'Guardar os arquivos na tarefa para manter o histórico auditável.' })
  }
  return itens.slice(0, 8)
}

function normalizeGeminiModel(modelValue?: string) {
  const raw = (modelValue || '').trim()
  if (!raw) return 'gemini-3.5-flash'

  const lower = raw.toLowerCase()

  // Facilita configuração no Coolify: aceita nomes escritos de forma humana.
  if (lower === '3.5 flash' || lower === 'gemini 3.5 flash' || lower === 'gemini-35-flash') {
    return 'gemini-3.5-flash'
  }
  if (lower === '3 flash' || lower === 'gemini 3 flash') return 'gemini-3-flash-preview'
  if (lower === '2.5 flash' || lower === 'gemini 2.5 flash') return 'gemini-2.5-flash'
  if (lower === '2.5 pro' || lower === 'gemini 2.5 pro') return 'gemini-2.5-pro'

  // Se alguém colar "models/gemini-3.5-flash", normaliza para o ID aceito no endpoint.
  return raw.replace(/^models\//i, '')
}

function getGeminiConfig() {
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ''
  ).trim()
  const model = normalizeGeminiModel(process.env.GEMINI_MODEL || 'gemini-3.5-flash')
  return { apiKey, model }
}

function sanitizeGeminiError(status: number, body: string) {
  try {
    const parsed = JSON.parse(body)
    const message = parsed?.error?.message || body
    const statusText = parsed?.error?.status ? ` (${parsed.error.status})` : ''
    return `Gemini HTTP ${status}${statusText}: ${String(message).slice(0, 500)}`
  } catch {
    return `Gemini HTTP ${status}: ${body.slice(0, 500)}`
  }
}

export async function gerarSugestaoChecklist(input: { titulo: string; descricao?: string }): Promise<ChecklistSuggestionResult> {
  const { apiKey, model } = getGeminiConfig()
  const titulo = String(input.titulo || '').trim().slice(0, 240)
  const descricao = String(input.descricao || '').trim().slice(0, 1800)

  if (!titulo) {
    return { enabled: Boolean(apiKey), provider: 'gemini', model, itens: [], erro: 'Informe um título para sugerir o checklist.' }
  }
  if (!apiKey) {
    return {
      enabled: true,
      provider: 'nexus-local',
      model: 'heuristic-checklist-v1',
      fallback: true,
      itens: gerarSugestaoLocal(titulo, descricao),
    }
  }

  const prompt = `Você é um assistente de operações empresariais. Gere uma sugestão de checklist em português do Brasil para uma tarefa, sem inventar nomes, documentos, prazos ou regras específicas que não estejam no texto. Retorne SOMENTE JSON válido no formato {"itens":[{"texto":"...","descricao":"..."}]}. Crie de 3 a 8 itens concretos, ordenados pela sequência natural de execução. Cada texto deve ter no máximo 140 caracteres e cada descrição no máximo 240 caracteres. Não inclua numeração, checkbox, pontuação, responsável ou prazo.\n\nTÍTULO:\n${titulo}\n\nDESCRIÇÃO:\n${descricao || '(não informada)'}`

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
    const response = await (globalThis as any).fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          maxOutputTokens: 900,
          responseMimeType: 'application/json',
        },
      }),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      const erro = sanitizeGeminiError(response.status, body)
      console.error('[Gemini] Falha ao sugerir checklist:', { model, erro })
      return { enabled: true, provider: 'gemini', model, itens: [], erro }
    }

    const data = await response.json()
    const texto = data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || '').join('').trim() || ''
    const parsed = JSON.parse(texto.replace(/^```json\\s*/i, '').replace(/\\s*```$/i, ''))
    const itens = Array.isArray(parsed?.itens)
      ? parsed.itens.map((item: any) => ({
          texto: String(item?.texto || '').trim().slice(0, 140),
          descricao: String(item?.descricao || '').trim().slice(0, 240) || undefined,
        })).filter((item: ChecklistSuggestionItem) => item.texto).slice(0, 8)
      : []
    if (!itens.length) return { enabled: true, provider: 'gemini', model, itens: [], erro: 'Gemini não retornou itens utilizáveis.' }
    return { enabled: true, provider: 'gemini', model, itens }
  } catch (err: any) {
    const erro = err?.message || String(err)
    console.error('[Gemini] Erro ao sugerir checklist:', { model, erro })
    return { enabled: true, provider: 'gemini', model, itens: [], erro: 'Não foi possível interpretar a sugestão do Gemini.' }
  }
}

export async function gerarAnaliseGemini(input: GeminiInsightInput): Promise<GeminiInsightResult> {
  const { apiKey, model } = getGeminiConfig()

  if (!apiKey) {
    return {
      enabled: false,
      provider: 'gemini',
      model,
      texto: 'Gemini ainda não está configurado. O painel inteligente está usando análise local segura com base nos dados do PostgreSQL. Para ativar a análise LLM, configure GEMINI_API_KEY e, opcionalmente, GEMINI_MODEL no ambiente da VPS/Coolify.',
    }
  }

  const prompt = `Você é um copiloto de gestão empresarial. Analise os dados abaixo e gere um diagnóstico curto, direto e acionável em português do Brasil. Não invente dados. Use linguagem simples para gestor não técnico. Responda em até 7 tópicos, com foco no que resolver primeiro.\n\nDADOS DO SISTEMA:\n${JSON.stringify(input, null, 2)}`

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
    const response = await (globalThis as any).fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: model.startsWith('gemini-3')
          ? {
              maxOutputTokens: 900,
              thinkingConfig: { thinkingLevel: 'LOW' },
            }
          : {
              temperature: 0.25,
              topP: 0.8,
              maxOutputTokens: 900,
            },
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      const erro = sanitizeGeminiError(response.status, body)
      console.error('[Gemini] Falha ao gerar análise:', { model, erro })
      return {
        enabled: true,
        provider: 'gemini',
        model,
        texto: 'Não foi possível gerar a análise LLM agora. A análise local continua disponível normalmente.',
        erro,
      }
    }

    const data = await response.json()
    const texto = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('\n').trim()

    if (!texto) {
      const finishReason = data?.candidates?.[0]?.finishReason
      const erro = finishReason ? `Gemini respondeu sem texto. finishReason=${finishReason}` : 'Gemini respondeu sem texto.'
      console.warn('[Gemini] Resposta sem texto:', { model, finishReason })
      return {
        enabled: true,
        provider: 'gemini',
        model,
        texto: 'Gemini respondeu, mas não retornou texto. A análise local continua disponível.',
        erro,
      }
    }

    return {
      enabled: true,
      provider: 'gemini',
      model,
      texto,
    }
  } catch (err: any) {
    const erro = err?.message || String(err)
    console.error('[Gemini] Erro de conexão:', { model, erro })
    return {
      enabled: true,
      provider: 'gemini',
      model,
      texto: 'Não foi possível conectar ao Gemini neste momento. A análise local continua disponível normalmente.',
      erro,
    }
  }
}

