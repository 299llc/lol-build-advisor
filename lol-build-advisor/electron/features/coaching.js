// ── 試合後コーチング機能 ─────────────────────────────
// main.js から切り出した requestCoaching

let state = null
let broadcast = null
let macroFeature = null
let saveLastGame = null

function init(stateRef, broadcastFn, deps = {}) {
  state = stateRef
  broadcast = broadcastFn
  macroFeature = deps.macroFeature || null
  saveLastGame = deps.saveLastGame || (() => {})
}

async function requestCoaching(snapshot, macroHistorySummary = null) {
  if (!state.aiClient || !snapshot || !state.currentMatchAiAllowed) return

  const { players, gameData: gd } = snapshot
  const { me } = players || {}
  if (!me) return

  console.log('[Pipeline] Requesting coaching evaluation...')
  broadcast('coaching:loading', true)

  try {
    // GameStateが残っていなければsnapshotから再構築
    const gameState = state.currentGameState || state.preprocessor.buildGameState(
      { activePlayer: snapshot.activePlayer, allPlayers: snapshot.allPlayers || [me, ...(players.allies || []), ...(players.enemies || [])], gameData: gd },
      gd?.events?.Events || [],
      { spectatorSelectedName: state.spectatorSelectedName || null }
    )

    const events = gd?.events?.Events || []
    const coreBuild = state.currentCoreBuild
      ? state.currentCoreBuild.ids.map((id, i) => ({ id, name: state.currentCoreBuild.names[i] }))
      : []

    // 前処理: 構造化入力を生成
    const structuredInput = state.preprocessor.buildCoachingInput(gameState, state.preprocessor.gameLog, coreBuild, events)
    structuredInput.macro_advice_history_summary = macroFeature
      ? (macroHistorySummary || macroFeature.summarizeMacroAdviceHistory())
      : []
    console.log(`[Pipeline] Coaching input: duration=${structuredInput.game_duration}s phase=${structuredInput.game_phase_final} snapshots=${structuredInput.snapshot_count}`)

    // 推論
    const rawResult = await state.aiClient.getCoaching(structuredInput)

    // 後処理
    const result = state.postprocessor.processCoachingResult(rawResult)

    if (result) {
      console.log(`[Pipeline] Coaching processed: score=${result.overall_score}/10 build=${result.build_score}/10`)
      if (result.sections) {
        for (const s of result.sections) {
          console.log(`[Pipeline] Coaching [${s.grade || '?'}] ${s.title}: ${(s.content || '').substring(0, 120)}`)
        }
      }
      if (result.good_points) {
        result.good_points.forEach((p, i) => console.log(`[Pipeline] Coaching Good${i+1}: ${p.substring(0, 120)}`))
      }
      if (result.improve_points) {
        result.improve_points.forEach((p, i) => console.log(`[Pipeline] Coaching Improve${i+1}: ${p.substring(0, 120)}`))
      }
      if (result.next_game_advice) {
        console.log(`[Pipeline] Coaching NextGame: ${result.next_game_advice.substring(0, 150)}`)
      }
      broadcast('coaching:result', result)
      saveLastGame(snapshot, result)
    } else {
      console.error('[Pipeline] Coaching postprocessor returned null')
      saveLastGame(snapshot, null)
    }
  } catch (err) {
    console.error('[Pipeline] Coaching error:', err.message)
    saveLastGame(snapshot, null)
  } finally {
    broadcast('coaching:loading', false)
  }
}

module.exports = {
  init,
  requestCoaching,
}
