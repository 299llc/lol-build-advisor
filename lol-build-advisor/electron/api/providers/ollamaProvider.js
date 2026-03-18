/**
 * Ollama ローカル LLM プロバイダー
 * ollama の REST API を使ってローカルモデル (Qwen3 等) を呼び出す
 */

const OLLAMA_BASE = 'http://localhost:11434'

// Claude モデル名 → Ollama モデル名のマッピング
const MODEL_MAP = {
  'claude-haiku-4-5-20251001': 'qwen3.5:9b',
  'claude-sonnet-4-6': 'qwen3.5:9b',
  // ユーザーがカスタムモデルを指定した場合はそのまま使う
}

class OllamaProvider {
  /**
   * @param {object} opts
   * @param {string} [opts.baseUrl] - Ollama API ベースURL (デフォルト: http://localhost:11434)
   * @param {string} [opts.model] - デフォルトモデル名 (指定時は MODEL_MAP を無視)
   */
  constructor(opts = {}) {
    this.baseUrl = (opts.baseUrl || OLLAMA_BASE).replace(/\/+$/, '')
    this.defaultModel = opts.model || null
    this.type = 'ollama'
  }

  _resolveModel(model) {
    if (this.defaultModel) return this.defaultModel
    return MODEL_MAP[model] || model
  }

  async sendMessage({ model, maxTokens, temperature = 0.7, system, messages, signal }) {
    const ollamaModel = this._resolveModel(model)

    // system プロンプトを文字列に統一
    let systemText = ''
    if (typeof system === 'string') {
      systemText = system
    } else if (Array.isArray(system)) {
      systemText = system.map(s => s.text || '').join('\n')
    }

    // Anthropic メッセージ形式 → Ollama 形式に変換
    const ollamaMessages = []
    for (const msg of messages) {
      let content = ''
      if (typeof msg.content === 'string') {
        content = msg.content
      } else if (Array.isArray(msg.content)) {
        // [{type:'text', text:'...', cache_control:...}] → テキスト結合
        content = msg.content.map(c => c.text || '').join('\n')
      }
      // (no_think は Ollama API の think パラメータで制御)
      ollamaMessages.push({ role: msg.role, content })
    }

    const body = {
      model: ollamaModel,
      messages: ollamaMessages,
      stream: false,
      think: false,
      format: 'json',
      options: {
        temperature,
        num_predict: maxTokens || 2048,
      },
    }

    if (systemText) {
      body.messages = [{ role: 'system', content: systemText }, ...body.messages]
    }

    const startTime = Date.now()

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      throw new Error(`Ollama HTTP ${res.status}: ${errBody.substring(0, 200)}`)
    }

    const data = await res.json()
    const elapsed = Date.now() - startTime
    let content = data.message?.content || ''
    if (!content && data.message) {
      console.log(`[Ollama] Empty content. Keys: ${Object.keys(data.message).join(',')} think=${!!data.message.thinking_content}`)
    }
    if (content.length < 10) {
      console.log(`[Ollama] Short response (${content.length} chars): ${content}`)
    }

    // format:'json' 時のpretty-printed JSONをcompact化 (トークン節約 & 確実なパース)
    if (content) {
      try {
        const parsed = JSON.parse(content)
        content = JSON.stringify(parsed)
      } catch {
        // JSONパース失敗 → そのまま返す (claudeApi側でfallback)
      }
    }

    return {
      text: content,
      usage: {
        input: data.prompt_eval_count || 0,
        output: data.eval_count || 0,
        cache_read: 0,
        cache_creation: 0,
      },
      stopReason: data.done ? 'end_turn' : 'unknown',
      _meta: {
        model: data.model,
        elapsedMs: elapsed,
        totalDuration: data.total_duration,
        evalDuration: data.eval_duration,
      },
    }
  }

  async validate() {
    try {
      // Ollama が起動しているか確認
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) return false

      const data = await res.json()
      const models = (data.models || []).map(m => m.name)
      console.log(`[Ollama] Available models: ${models.join(', ')}`)
      return models.length > 0
    } catch {
      return false
    }
  }

  /**
   * 利用可能なモデル一覧を返す
   */
  async listModels() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) return []
      const data = await res.json()
      return (data.models || []).map(m => ({
        name: m.name,
        size: m.size,
        modifiedAt: m.modified_at,
      }))
    } catch {
      return []
    }
  }
}

module.exports = { OllamaProvider, MODEL_MAP }
