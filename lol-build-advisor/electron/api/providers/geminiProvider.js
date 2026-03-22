/**
 * Google Gemini API プロバイダー (BYOK)
 * 明示的キャッシュ (CachedContent API) でシステムプロンプトの再処理コストを削減
 */

const DEFAULT_MODEL = 'gemini-2.5-flash'
const API_VERSION = 'v1beta'
const CACHE_TTL = '3600s'        // 1時間（試合時間 + バッファ）
const MIN_CACHE_CHARS = 4000     // キャッシュ対象の最小文字数（Gemini最低4096トークン、日本語は1文字≈0.5tokなので余裕を持つ）

class GeminiProvider {
  constructor(apiKey) {
    this.apiKey = apiKey
    this.type = 'gemini'
    this._cacheMap = new Map()      // systemHash → { name, expiresAt }
    this._cacheInFlight = new Map() // systemHash → Promise<name|null>
  }

  /**
   * システムテキストの簡易ハッシュ（キャッシュキー用）
   */
  _hashSystem(text) {
    let h = 0x811c9dc5
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    return (h >>> 0).toString(36)
  }

  /**
   * 明示的キャッシュの取得 or 作成
   * @returns {Promise<string|null>} キャッシュリソース名 or null（フォールバック用）
   */
  async _getOrCreateCache(model, systemText) {
    if (systemText.length < MIN_CACHE_CHARS) return null

    const hash = this._hashSystem(systemText)

    // 既存キャッシュチェック
    const existing = this._cacheMap.get(hash)
    if (existing && existing.expiresAt > Date.now()) {
      return existing.name
    }

    // 作成中の重複防止
    if (this._cacheInFlight.has(hash)) {
      return this._cacheInFlight.get(hash)
    }

    const promise = this._createCache(model, systemText, hash)
    this._cacheInFlight.set(hash, promise)
    try {
      return await promise
    } finally {
      this._cacheInFlight.delete(hash)
    }
  }

  async _createCache(model, systemText, hash) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${this.apiKey}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${model}`,
          systemInstruction: { parts: [{ text: systemText }] },
          ttl: CACHE_TTL,
        })
      })

      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        console.warn(`[Gemini] Cache creation failed: HTTP ${res.status} ${errBody.substring(0, 150)}`)
        return null
      }

      const data = await res.json()
      const name = data.name
      const expiresAt = Date.now() + 3500 * 1000 // TTL - 100s のマージン
      this._cacheMap.set(hash, { name, expiresAt })
      console.log(`[Gemini] Created cache: ${name} (hash=${hash}, tokens≈${Math.round(systemText.length / 2)})`)
      return name
    } catch (err) {
      console.warn(`[Gemini] Cache creation error: ${err.message}`)
      return null
    }
  }

  /**
   * 全キャッシュ削除（試合終了時に呼ぶ）
   */
  async clearCaches() {
    const entries = [...this._cacheMap.values()]
    this._cacheMap.clear()
    await Promise.allSettled(entries.map(cache =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/${cache.name}?key=${this.apiKey}`, { method: 'DELETE' })
        .then(() => console.log(`[Gemini] Deleted cache: ${cache.name}`))
        .catch(err => console.warn(`[Gemini] Cache delete failed: ${err.message}`))
    ))
  }

  async sendMessage({ model, maxTokens, temperature = 0, system, messages, signal, jsonMode }) {
    const geminiModel = model || DEFAULT_MODEL
    const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${geminiModel}:generateContent?key=${this.apiKey}`

    // system → systemInstruction テキスト化
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

    // 明示的キャッシュ: システムプロンプトをキャッシュして再利用
    const body = {}
    let cacheName = null
    if (systemText) {
      cacheName = await this._getOrCreateCache(geminiModel, systemText)
      if (cacheName) {
        body.cachedContent = cacheName
      } else {
        body.systemInstruction = { parts: [{ text: systemText }] }
      }
    }
    body.generationConfig = generationConfig
    body.contents = contents

    try {
      return await this._doFetch(url, body, signal)
    } catch (err) {
      // キャッシュ参照エラー → キャッシュ破棄してリトライ
      if (cacheName && /HTTP (400|404)/.test(err.message)) {
        console.warn(`[Gemini] Cached content error, retrying without cache`)
        this._invalidateCache(cacheName)
        const fallbackBody = { generationConfig, contents }
        if (systemText) {
          fallbackBody.systemInstruction = { parts: [{ text: systemText }] }
        }
        return this._doFetch(url, fallbackBody, signal)
      }
      throw err
    }
  }

  async sendInteraction({ model, maxTokens, temperature = 0, system, messages, previousInteractionId = null, signal, store = true, jsonSchema = null }) {
    const geminiModel = model || DEFAULT_MODEL
    const url = `https://generativelanguage.googleapis.com/${API_VERSION}/interactions`

    let systemText = ''
    if (Array.isArray(system)) {
      systemText = system.map(s => typeof s === 'string' ? s : s.text || '').join('\n')
    } else if (typeof system === 'string') {
      systemText = system
    }

    const lastMessage = messages[messages.length - 1]
    const input = typeof lastMessage?.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage?.content ?? '')

    const generationConfig = {
      max_output_tokens: maxTokens,
      temperature,
    }

    const body = {
      model: `models/${geminiModel}`,
      input,
      store,
      generation_config: generationConfig,
    }
    if (jsonSchema) {
      body.response_mime_type = 'application/json'
      body.response_format = jsonSchema
    }
    if (previousInteractionId) body.previous_interaction_id = previousInteractionId
    if (systemText) body.system_instruction = systemText

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
      signal
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${errBody.substring(0, 200)}`)
    }
    return this._parseInteractionResponse(await res.json())
  }

  async _doFetch(url, body, signal) {
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
    return this._parseResponse(await res.json())
  }

  _parseResponse(data) {
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

  _parseInteractionResponse(data) {
    const outputs = Array.isArray(data.outputs) ? data.outputs : []
    let text = ''
    for (const output of outputs) {
      if (typeof output?.text === 'string' && output.text) {
        text = output.text
        break
      }
    }

    const usage = data.usage ? {
      input: data.usage.total_input_tokens || 0,
      output: data.usage.total_output_tokens || 0,
      cache_read: data.usage.total_cached_tokens || 0,
      cache_creation: 0
    } : null

    return {
      text,
      usage,
      stopReason: data.stopReason || null,
      interactionId: data.id || null,
    }
  }

  _invalidateCache(cacheName) {
    for (const [hash, entry] of this._cacheMap) {
      if (entry.name === cacheName) {
        this._cacheMap.delete(hash)
        break
      }
    }
  }

  async validate() {
    try {
      const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${DEFAULT_MODEL}:generateContent?key=${this.apiKey}`
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
