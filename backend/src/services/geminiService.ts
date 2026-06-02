export interface GeminiInsightInput {
  score: number
  resumo: string
  metricas: Record<string, number>
  riscos: Array<{ titulo: string; detalhe: string; nivel: 'baixo' | 'medio' | 'alto' | 'critico' }>
  recomendacoes: Array<{ titulo: string; detalhe: string; acao: string }>
}

export interface GeminiInsightResult {
  enabled: boolean
  provider: string
  model: string
  texto: string
  erro?: string
}

function getGeminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || ''
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-pro'
  return { apiKey, model }
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
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
    const response = await (globalThis as any).fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.25,
          topP: 0.8,
          maxOutputTokens: 900,
        },
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      return {
        enabled: true,
        provider: 'gemini',
        model,
        texto: 'Não foi possível gerar a análise LLM agora. A análise local continua disponível normalmente.',
        erro: `Gemini HTTP ${response.status}: ${body.slice(0, 300)}`,
      }
    }

    const data = await response.json()
    const texto = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('\n').trim()

    return {
      enabled: true,
      provider: 'gemini',
      model,
      texto: texto || 'Gemini respondeu sem texto. A análise local continua disponível.',
    }
  } catch (err: any) {
    return {
      enabled: true,
      provider: 'gemini',
      model,
      texto: 'Não foi possível conectar ao Gemini neste momento. A análise local continua disponível normalmente.',
      erro: err?.message || String(err),
    }
  }
}
