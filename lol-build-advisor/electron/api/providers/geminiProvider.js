/**
 * Google Gemini API プロバイダー (BYOK)
 */

const DEFAULT_MODEL = 'gemini-2.5-flash'

class GeminiProvider {
  constructor(apiKey) {
    this.apiKey = apiKey
    this.type = 'gemini'
  }

  async sendMessage({ model, maxTokens, temperature = 0, system, messages, signal, jsonMode }) {
    const geminiModel = model || DEFAULT_MODEL
    const url = `https://generativelanguage.googleapis.com/v1alpha/models/${geminiModel}:generateContent?key=${this.apiKey}`

    // system → systemInstruction
    let systemText = ''
    if (Array.isArray(system)) {
      systemText = system.map(s => typeof s === 'string' ? s : s.text || '').join('\n')
    } else if (typeof system === 'string') {
      systemText = system
    }

    // messages 変換: role user→user, assistant→model
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
    }))

    const generationConfig = {
      maxOutputTokens: maxTokens,
      temperature,
      // 2.5-flash の思考トークンを無効化してコスト・速度を最適化
      thinkingConfig: { thinkingBudget: 0 },
    }
    if (jsonMode !== false) {
      generationConfig.responseMimeType = 'application/json'
    }

    const body = {
      contents,
      generationConfig,
    }
    if (systemText) {
      body.systemInstruction = { parts: [{ text: systemText }] }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${errBody.substring(0, 200)}`)
    }

    const data = await res.json()
    const candidate = data.candidates?.[0]
    const text = candidate?.content?.parts?.[0]?.text || ''
    const usage = data.usageMetadata ? {
      input: data.usageMetadata.promptTokenCount || 0,
      output: data.usageMetadata.candidatesTokenCount || 0,
      cache_read: data.usageMetadata.cachedContentTokenCount || 0,
      cache_creation: 0
    } : null
    const stopReason = candidate?.finishReason || null

    return { text, usage, stopReason }
  }

  async validate() {
    try {
      const url = `https://generativelanguage.googleapis.com/v1alpha/models/${DEFAULT_MODEL}:generateContent?key=${this.apiKey}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
          generationConfig: { maxOutputTokens: 10 }
        })
      })
      return res.ok
    } catch {
      return false
    }
  }
}

module.exports = { GeminiProvider }
