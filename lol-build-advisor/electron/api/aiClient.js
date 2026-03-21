/**
 * AI Client - 4種のAI分析
 *
 * OP.GG のコアビルドと入れ替え候補アイテム一覧を提示し、
 * この試合でおすすめのアイテムを候補の中から選ばせる。
 *
 * プロバイダー抽象化: AnthropicProvider (BYOK) / BedrockProvider (AWS) / OllamaProvider (ローカルLLM) を切り替え可能
 */
const { ITEM_PROMPT, MATCHUP_PROMPT, MACRO_PROMPT, COACHING_PROMPT } = require('../core/prompts')
const { buildFullGameKnowledgeText } = require('../core/knowledge/game')
const {
  LOCAL_ITEM_STEP1_PROMPT, LOCAL_ITEM_STEP2_PROMPT,
  LOCAL_MATCHUP_STEP1_PROMPT, LOCAL_MATCHUP_STEP2_PROMPT,
  LOCAL_MACRO_STEP1_PROMPT, LOCAL_MACRO_STEP2_PROMPT,
  LOCAL_COACHING_STEP1_PROMPT, LOCAL_COACHING_STEP2_PROMPT,
} = require('../core/localPrompts')
const { buildKnowledgeContext } = require('../core/knowledgeDb')
const { AnthropicProvider } = require('./providers/anthropicProvider')

const DEFAULT_MODELS = {
  gemini: 'gemini-2.5-flash',
  default: 'claude-haiku-4-5-20251001',
}

class AiClient {
  /**
   * @param {string|object} providerOrApiKey - API キー文字列 (後方互換) またはプロバイダーインスタンス
   * @param {object} [opts] - オプション
   * @param {string} [opts.model] - 高頻度呼び出し用モデル (macro/suggestion)
   * @param {string} [opts.qualityModel] - 品質重視呼び出し用モデル (matchup/coaching)
   */
  constructor(providerOrApiKey, opts = {}) {
    if (typeof providerOrApiKey === 'string') {
      // 後方互換: API キー文字列が渡された場合は AnthropicProvider を自動生成
      this.provider = new AnthropicProvider(providerOrApiKey)
    } else {
      this.provider = providerOrApiKey
    }
    const defaultModel = DEFAULT_MODELS[this.provider?.type] || DEFAULT_MODELS.default
    this.model = opts.model || defaultModel
    this.qualityModel = opts.qualityModel || defaultModel
    this.coreBuild = null
    this.substituteItems = []
    this.matchContext = null
    this.lastSuggestion = null
    this.logs = []
    this.recommendationHistory = {}
    this.totalCalls = 0
    // ローカルLLM用: ポジション情報
    this.position = null
    this.gameTimeSec = 0
    this.rank = null  // プレイヤーのランクティア（ランク別アドバイス用）
    // 試合開始時に生成する10体のチャンプ教科書（試合中キャッシュ）
    this.championKnowledge = null
    // 前回正常出力の保持（エラー時フォールバック用）
    this.lastMatchupTip = null
    this.lastMacroAdvice = null
    this.lastCoaching = null
  }

  setCoreBuild(coreBuild) { this.coreBuild = coreBuild }
  setSubstituteItems(items) { this.substituteItems = items || [] }
  setMatchContext(staticContext) { this.matchContext = staticContext }
  setChampionKnowledge(knowledge) { this.championKnowledge = knowledge }
  setPosition(position) { this.position = position }
  setGameTime(sec) { this.gameTimeSec = sec }
  setRank(rank) { this.rank = rank }
  getSubstituteItems() { return this.substituteItems }
  getLogs() { return this.logs }
  clearLogs() { this.logs = [] }
  getProviderType() { return this.provider?.type || 'unknown' }
  isLocalLLM() { return this.provider?.type === 'ollama' }

  /**
   * Prompt Caching 用 system 配列を構築
   * DOMAIN_KNOWLEDGE（不変） → taskPrompt → championKnowledge（試合中不変） → extraContext の順に配置し、
   * 共通プレフィックスが Haiku 4.5 のキャッシュ閾値 (4096トークン) を超えるようにする
   * @param {string} taskPrompt - タスク固有のプロンプト
   * @param {string} [extraContext] - 追加の静的コンテキスト（チーム構成等、試合中不変）
   */
  _buildSystem(taskPrompt, extraContext) {
    if (!this._gameKnowledgeText) {
      this._gameKnowledgeText = buildFullGameKnowledgeText()
    }
    const blocks = [
      { type: 'text', text: this._gameKnowledgeText, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: taskPrompt, cache_control: { type: 'ephemeral' } },
    ]
    if (this.championKnowledge) {
      blocks.push({ type: 'text', text: this.championKnowledge, cache_control: { type: 'ephemeral' } })
    }
    if (extraContext) {
      blocks.push({ type: 'text', text: extraContext, cache_control: { type: 'ephemeral' } })
    }
    return blocks
  }

  clearMatch() {
    this.matchContext = null
    this.lastSuggestion = null
    this.coreBuild = null
    this.substituteItems = []
    this.recommendationHistory = {}
    this.totalCalls = 0
    this.position = null
    this.gameTimeSec = 0
    // rank は試合間で維持（clearMatchでリセットしない）
    this.championKnowledge = null
    this._step1Cache = {}  // Step1キャッシュクリア
    this.lastMatchupTip = null
    this.lastMacroAdvice = null
    this.lastCoaching = null
  }

  // 共通API呼び出し (プロバイダー経由)
  async _callApi({ model, maxTokens, temperature = 0, system, messages, timeoutMs, logType, rawText = false, sessionInfo = null }) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const startTime = Date.now()
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: logType,
      provider: this.getProviderType(),
      system: typeof system === 'string' ? system : system?.[0]?.text || '',
      userMessage: messages[messages.length - 1]?.content || '',
      response: null,
      error: null,
      durationMs: 0,
      sessionInfo: sessionInfo || null,
    }

    try {
      const result = await this.provider.sendMessage({
        model, maxTokens, temperature, system, messages,
        signal: controller.signal,
        jsonMode: !rawText  // Step1(自由文)ではJSON制約を外す
      })

      clearTimeout(timeout)
      logEntry.durationMs = Date.now() - startTime

      // ローカルLLM (qwen3等) の <think>...</think> タグを除去
      const responseText = result.text
      const text = responseText.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim()
      logEntry.response = responseText
      if (responseText !== text && responseText.includes('<think>')) {
        console.log(`[AI:${logType}] Stripped <think> tag (${responseText.length} -> ${text.length} chars)`)
      }

      if (result.usage) {
        logEntry.tokens = result.usage
        const modelTag = result._meta?.model || model || ''
        console.log(`[AI:${logType}:${this.getProviderType()}:${modelTag}] tokens: in=${result.usage.input} out=${result.usage.output} cache_read=${result.usage.cache_read} cache_create=${result.usage.cache_creation}`)
      }

      if (result.stopReason === 'max_tokens') {
        console.warn(`[AI:${logType}] Output truncated (max_tokens reached)`)
      }

      // rawTextモード: JSON解析せずテキストをそのまま返す（2段階コーチング用）
      if (rawText) {
        this._pushLog(logEntry)
        return text
      }

      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.error(`[AI:${logType}] No JSON found in response: ${text.substring(0, 200)}`)
        this._pushLog(logEntry)
        return null
      }

      try {
        let parsed = JSON.parse(jsonMatch[0])
        // Ollama が JSON を文字列として二重エンコードするケース対策（最大3段階）
        for (let i = 0; i < 3 && typeof parsed === 'string'; i++) {
          try { parsed = JSON.parse(parsed) } catch { break }
        }
        console.log(`[AI:${logType}] Parsed type: ${typeof parsed}, keys: ${typeof parsed === 'object' && parsed ? Object.keys(parsed).join(',') : 'N/A'}`)
        this._pushLog(logEntry)
        return parsed
      } catch (parseErr) {
        console.error(`[AI:${logType}] JSON parse failed: ${jsonMatch[0].substring(0, 200)}`)
        logEntry.error = `JSON parse: ${parseErr.message}`
        this._pushLog(logEntry)
        return null
      }
    } catch (err) {
      clearTimeout(timeout)
      logEntry.durationMs = Date.now() - startTime
      logEntry.error = err.message || String(err)
      console.error(`[AI:${logType}:${this.getProviderType()}] Error: ${logEntry.error}`)
      this._pushLog(logEntry)
      // 認証エラーをマーク (リトライ制御用)
      if (/HTTP (401|403)/.test(logEntry.error)) {
        const authErr = new Error(logEntry.error)
        authErr.authError = true
        throw authErr
      }
      return null
    }
  }

  /**
   * ローカルLLM 2段階呼び出しヘルパー（Step1キャッシュ付き）
   * Step1: 自由文で分析（format制約なし）→ Step2: JSON化（format:'json'）
   * ゲーム状態が大きく変わっていなければStep1をスキップしてStep2のみ実行
   */
  async _twoStepLocal({ step1System, step2System, messages, step1MaxTokens = 500, step2MaxTokens = 300, logPrefix, timeoutMs = 60000 }) {
    // Step1キャッシュ: userMessageのハッシュ的な短縮キーで判定
    const userMsg = messages[messages.length - 1]?.content || ''
    // キル差・レベル・オブジェクト状態を含む短いキーを生成
    const cacheKey = `${logPrefix}:${userMsg.length}:${typeof userMsg === 'string' ? userMsg.substring(0, 200) : JSON.stringify(userMsg).substring(0, 200)}`
    const cached = this._step1Cache?.[logPrefix]

    let analysis
    if (cached && cached.key === cacheKey) {
      // 状態変化なし → Step1スキップ
      analysis = cached.result
      console.log(`[AI:${logPrefix}] Step1 cache hit (skipping Step1)`)
    } else {
      // Step1実行
      analysis = await this._callApi({
        model: this.model, maxTokens: step1MaxTokens, temperature: 0.7,
        system: step1System, messages,
        timeoutMs, logType: `${logPrefix}-step1`, rawText: true
      })
      if (!analysis) return null
      // キャッシュ保存
      if (!this._step1Cache) this._step1Cache = {}
      this._step1Cache[logPrefix] = { key: cacheKey, result: analysis }
    }

    return this._callApi({
      model: this.model, maxTokens: step2MaxTokens, temperature: 0.3,
      system: step2System,
      messages: [{ role: 'user', content: analysis }],
      timeoutMs: 30000, logType: `${logPrefix}-step2`
    })
  }

  _buildUserMessage(dynamicContext) {
    const lines = []

    if (this.coreBuild) {
      lines.push(`【コアビルド(統計)】`)
      this.coreBuild.ids.forEach((id, i) => {
        const name = this.coreBuild.names[i] || id
        const raw = this.coreBuild.descs?.[i] || ''
        const desc = raw ? ` (${raw.substring(0, 80)})` : ''
        lines.push(`${id}:${name}${desc}`)
      })
    }

    if (this.substituteItems.length) {
      lines.push(`【入れ替え候補アイテム】`)
      for (const it of this.substituteItems) {
        const raw = it.desc || ''
        const desc = raw ? ` (${raw.substring(0, 80)})` : ''
        lines.push(`${it.id}:${it.jaName}${desc}`)
      }
    }

    lines.push('')
    lines.push(dynamicContext)
    return lines.join('\n')
  }

  async validate() {
    return this.provider.validate()
  }

  async getSuggestion(structuredInput) {
    // 後方互換: string引数の場合は従来通りテキストとして扱う
    const userMessage = typeof structuredInput === 'string'
      ? this._buildUserMessage(structuredInput)
      : JSON.stringify(structuredInput, null, 2)
    const isLocal = this.isLocalLLM()

    let aiResult
    if (isLocal) {
      // ローカルLLM: マルチターンを避け、1メッセージにまとめる
      const parts = []
      if (this.matchContext) parts.push(this.matchContext)
      parts.push(userMessage)
      aiResult = await this._twoStepLocal({
        step1System: LOCAL_ITEM_STEP1_PROMPT, step2System: LOCAL_ITEM_STEP2_PROMPT,
        messages: [{ role: 'user', content: parts.join('\n\n') }],
        step1MaxTokens: 500, step2MaxTokens: 300, logPrefix: 'suggestion'
      })
    } else {
      aiResult = await this._callApi({
        model: this.model, maxTokens: 600, temperature: 0,
        system: this._buildSystem(ITEM_PROMPT, this.matchContext),
        messages: [{ role: 'user', content: userMessage }],
        timeoutMs: 30000, logType: 'suggestion'
      })
    }

    if (!aiResult) return this.lastSuggestion

    // 推薦蓄積
    const recommended = aiResult.recommended || []
    this.totalCalls++
    for (const r of recommended) {
      const key = String(r.id)
      if (!this.recommendationHistory[key]) {
        this.recommendationHistory[key] = { count: 0, lastReason: '' }
      }
      this.recommendationHistory[key].count++
      this.recommendationHistory[key].lastReason = r.reason || ''
    }

    const suggestion = {
      recommended,
      reasoning: aiResult.reasoning || '',
      history: { ...this.recommendationHistory },
      totalCalls: this.totalCalls
    }
    this.lastSuggestion = suggestion
    return suggestion
  }

  async getMatchupTip(structuredInput) {
    // 後方互換: string引数の場合は従来通りテキストとして扱う
    const userContent = typeof structuredInput === 'string'
      ? structuredInput
      : JSON.stringify(structuredInput, null, 2)
    const isLocal = this.isLocalLLM()

    let result
    if (isLocal) {
      result = await this._twoStepLocal({
        step1System: LOCAL_MATCHUP_STEP1_PROMPT, step2System: LOCAL_MATCHUP_STEP2_PROMPT,
        messages: [{ role: 'user', content: userContent }],
        step1MaxTokens: 600, step2MaxTokens: 400, logPrefix: 'matchup'
      })
    } else {
      result = await this._callApi({
        model: this.qualityModel, maxTokens: 700, temperature: 0,
        system: this._buildSystem(MATCHUP_PROMPT),
        messages: [{ role: 'user', content: userContent }],
        timeoutMs: 20000, logType: 'matchup'
      })
    }

    if (result) {
      this.lastMatchupTip = result
      return result
    }
    // API失敗時: 前回の正常出力にエラーフラグを付与して返す
    if (this.lastMatchupTip) {
      return { error: 'うまく取得できませんでした', ...this.lastMatchupTip }
    }
    return null
  }

  async getMacroAdvice(staticContext, structuredInput) {
    // 後方互換: 第3引数がある場合は旧シグネチャ (staticContext, dynamicContext, availableObjectives)
    let dynamicContent
    if (arguments.length >= 3) {
      // 旧シグネチャ: (staticContext, dynamicContext, availableObjectives)
      dynamicContent = typeof structuredInput === 'string'
        ? structuredInput
        : JSON.stringify(structuredInput, null, 2)
    } else {
      // 新シグネチャ: (staticContext, structuredInput)
      dynamicContent = typeof structuredInput === 'string'
        ? structuredInput
        : JSON.stringify(structuredInput, null, 2)
    }
    const isLocal = this.isLocalLLM()

    let result
    if (isLocal) {
      result = await this._twoStepLocal({
        step1System: LOCAL_MACRO_STEP1_PROMPT,
        step2System: LOCAL_MACRO_STEP2_PROMPT,
        messages: [{ role: 'user', content: dynamicContent }],
        step1MaxTokens: 500, step2MaxTokens: 300,
        logPrefix: 'macro', timeoutMs: 60000
      })
    } else {
      result = await this._callApi({
        model: this.model, maxTokens: 500, temperature: 0,
        system: this._buildSystem(MACRO_PROMPT, staticContext),
        messages: [{ role: 'user', content: dynamicContent }],
        timeoutMs: 20000, logType: 'macro'
      })
    }

    if (result) {
      this.lastMacroAdvice = result
      return result
    }
    if (this.lastMacroAdvice) {
      return { error: 'うまく取得できませんでした', ...this.lastMacroAdvice }
    }
    return null
  }

  // セッション関連メソッド撤去済み（Ollama KVキャッシュ不在のため）

  async getCoaching(structuredInput) {
    // 後方互換: string引数の場合は従来通りテキストとして扱う
    const userContent = typeof structuredInput === 'string'
      ? structuredInput
      : JSON.stringify(structuredInput, null, 2)
    const isLocal = this.isLocalLLM()

    let result
    if (isLocal) {
      result = await this._twoStepLocal({
        step1System: LOCAL_COACHING_STEP1_PROMPT, step2System: LOCAL_COACHING_STEP2_PROMPT,
        messages: [{ role: 'user', content: userContent }],
        step1MaxTokens: 1500, step2MaxTokens: 800, logPrefix: 'coaching', timeoutMs: 120000
      })
    } else {
      result = await this._callApi({
        model: this.qualityModel,
        maxTokens: 4000,
        temperature: 0.3,
        system: this._buildSystem(COACHING_PROMPT),
        messages: [{ role: 'user', content: userContent }],
        timeoutMs: 60000,
        logType: 'coaching'
      })
    }

    if (result) {
      this.lastCoaching = result
      return result
    }
    if (this.lastCoaching) {
      return { error: 'うまく取得できませんでした', ...this.lastCoaching }
    }
    return null
  }

  _pushLog(entry) {
    this.logs.push(entry)
    if (this.logs.length > 20) this.logs.shift()
  }
}

module.exports = { AiClient, ClaudeApiClient: AiClient }
