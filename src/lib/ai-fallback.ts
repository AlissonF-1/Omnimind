export async function callAIWithFallback(
  systemPrompt: string,
  userMessage: string,
  modelPreference: 'critical' | 'simple' = 'simple',
  jsonMode: boolean = false
) {
  const groqApiKey = process.env.GROQ_API_KEY
  const openRouterApiKey = process.env.OPENROUTER_API_KEY

  const groqModel = modelPreference === 'critical' 
    ? 'llama-3.3-70b-versatile' 
    : 'llama-3.1-8b-instant'

  // Modelos gratuitos estáveis e de alta performance no OpenRouter
  const openRouterModel = modelPreference === 'critical'
    ? 'google/gemma-2-9b-it:free'
    : 'meta-llama/llama-3-8b-instruct:free'

  // 1. Tentar Groq Primeiro
  try {
    const body: any = {
      model: groqModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3,
    }
    if (jsonMode) {
      body.response_format = { type: 'json_object' }
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    })

    if (response.ok) {
      const data = await response.json()
      return { success: true, content: data.choices[0]?.message?.content }
    }

    if (response.status === 429 || response.status >= 500) {
      throw new Error(`Groq falhou com status ${response.status}`)
    }

    const errorData = await response.json()
    return { success: false, error: errorData.error?.message || 'Erro Groq' }

  } catch (groqError: any) {
    // 2. Se a Groq falhou e não temos a chave do OpenRouter, repassa o erro
    if (!openRouterApiKey) {
      console.warn('⚠️ Groq falhou e OpenRouter não está configurado:', groqError.message)
      return { success: false, error: groqError.message }
    }

    console.warn('⚠️ Groq falhou, iniciando fallback para OpenRouter:', groqError.message)

    // 3. Tentar OpenRouter com Modelo Gratuito
    try {
      const body: any = {
        model: openRouterModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.3,
      }
      if (jsonMode) {
        body.response_format = { type: 'json_object' }
      }

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'OmniMind',
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenRouter falhou: ${errorText}`)
      }

      const data = await response.json()
      return { success: true, content: data.choices[0]?.message?.content }

    } catch (fallbackError: any) {
      console.error('❌ Todos os provedores de IA falharam:', fallbackError.message)
      return { success: false, error: 'Todos os servidores de IA estão indisponíveis.' }
    }
  }
}
