// ── AI ビルド提案機能 ───────────────────────────────
// main.js から切り出した handleAiSuggestion

const { getItemById } = require('../api/patchData')

let state = null
let broadcast = null
let syncInteractionSessionsFromClient = null

function init(stateRef, broadcastFn) {
  state = stateRef
  broadcast = broadcastFn
  syncInteractionSessionsFromClient = stateRef._syncInteractionSessionsFromClient
}

function handleAiSuggestion(gameData) {
  if (!state.currentMatchAiAllowed) return
  const triggered = state.diffDetector.check(gameData)

  // 15分未満はAI提案しない
  const gameTime = gameData.gameData?.gameTime || 0
  if (gameTime < 900) return

  if ((triggered || !state.lastSuggestion) && !state.aiPending && state.aiClient && state.aiEnabled && state.currentCoreBuild) {
    const gameState = state.currentGameState
    if (!gameState) return

    // 前処理: 構造化入力を生成
    const coreBuild = state.currentCoreBuild.ids.map((id, i) => ({ id, name: state.currentCoreBuild.names[i] }))
    const substituteItems = state.aiClient.getSubstituteItems() || []
    const structuredInput = state.preprocessor.buildItemInput(gameState, coreBuild, substituteItems)
    const candidateIds = structuredInput.candidates.map(c => c.id)

    // 重複スキップ: 候補リスト+状況が前回と同じならAPI呼び出しを省略
    const suggFingerprint = `${candidateIds.join(',')}|${structuredInput.situation}|${structuredInput.me?.level || 0}|${(structuredInput.me?.items || []).map(i => i.id).join(',')}`
    if (suggFingerprint === state._lastSuggFingerprint && state.lastSuggestion) {
      return // 候補もアイテム構成も変わっていない → スキップ
    }
    state._lastSuggFingerprint = suggFingerprint

    console.log(`[Pipeline] Item input: candidates=[${candidateIds.join(',')}] situation=${structuredInput.situation}`)

    state.aiPending = true
    broadcast('ai:loading', true)
    state.aiClient.getSuggestion(structuredInput).then(rawResult => {
      syncInteractionSessionsFromClient()
      // 後処理
      const previousResult = state.postprocessor.lastItemResult
      const processedResult = state.postprocessor.processItemResult(rawResult, candidateIds, previousResult)

      if (processedResult) {
        // 次回フィードバック用に保存
        state.preprocessor.setItemAdvice(processedResult)

        // UIに送るデータを整形
        const s = { ...processedResult }
        if (s.recommended) {
          s.recommended = s.recommended.map(r => {
            const item = getItemById(String(r.id))
            return { ...r, name: item?.jaName || r.id, image: item?.image || '' }
          })
        }
        s.gameTime = gameData.gameData?.gameTime || 0
        // 推薦蓄積（既存互換）
        s.history = rawResult?.history || {}
        s.totalCalls = rawResult?.totalCalls || 0
        state.lastSuggestion = s
        const recNames = (s.recommended || []).map(r => r.name || r.id).join(', ')
        console.log(`[Pipeline] Item processed: t=${Math.floor(s.gameTime)}s recommended=[${recNames}] reason=${(s.reasoning || '').substring(0, 80)}`)
        broadcast('ai:suggestion', s)
      }
      state.aiPending = false
      broadcast('ai:loading', false)
    }).catch(err => {
      state.aiPending = false
      broadcast('ai:loading', false)
      if (err.authError) {
        console.error('[AiSuggestion] Auth error - stopping. Check provider settings.')
        state.aiEnabled = false
        broadcast('ai:error', { type: 'auth', message: 'APIキーが無効またはプロバイダー未設定です。' })
      } else {
        broadcast('ai:suggestion', { error: err.message })
      }
    })
  }
}

module.exports = {
  init,
  handleAiSuggestion,
}
