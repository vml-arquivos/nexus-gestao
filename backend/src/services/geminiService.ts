export interface GeminiInsightInput {
  score: number
  resumo: string
  metricas: Record<string, number>
  riscos: Array<{ titulo: string; detalhe: string; nivel: 'baixo' | 'medio' | 'alto' | 'critico'; destino?: string }>
  recomendacoes: Array<{ titulo: string; detalhe: string; acao: string; destino?: string }>
  acoes?: Array<{ titulo: string; detalhe: string; tipo?: string; destino?: string; executavel?: boolean }>
}

export interface GeminiInsightResult {
  enabled: boolean
  provider: string
  model: string
  texto: string
  erro?: string
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

