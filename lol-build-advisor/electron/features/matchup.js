// ── マッチアップ機能（Tip + アイテム）──────────────
// main.js から切り出した handleMatchupTip, handleMatchupItems,
// findLaneOpponent, injectCounterItems, buildFallbackSubstituteItems, useFallbackSubstituteItems

const { getItemById, getSpells } = require('../api/patchData')
const { fetchMatchupItems, fetchMatchupWinRate } = require('../api/opggClient')
const { isCompletedItem } = require('../core/config')

let state = null
let broadcast = null

/**
 * game_lengths データからパワーカーブを分析
 * @param {Array} gameLengths - OP.GG の game_lengths 配列
 * @returns {object|null} { best_phase, trend, win_rates: { early, mid, late } }
 */
function analyzeGameLengths(gameLengths) {
  if (!Array.isArray(gameLengths) || gameLengths.length === 0) return null

  const byTime = {}
  for (const g of gameLengths) byTime[g.game_length] = g.rate

  const phases = {
    early: byTime[25] ?? byTime[0] ?? null,
    mid: byTime[30] ?? null,
    late: byTime[40] ?? byTime[35] ?? null,
  }

  const entries = Object.entries(phases).filter(([, v]) => v !== null)
  if (entries.length === 0) return null

  entries.sort((a, b) => b[1] - a[1])
  const bestPhase = entries[0][0]

  let trend = 'stable'
  if (phases.early !== null && phases.late !== null) {
    const diff = phases.late - phases.early
    if (diff > 0.03) trend = 'scaling'
    else if (diff < -0.03) trend = 'early_dominant'
  }

  return {
    best_phase: bestPhase,
    trend,
    win_rates: {
      early: phases.early !== null ? Math.round(phases.early * 100) : null,
      mid: phases.mid !== null ? Math.round(phases.mid * 100) : null,
      late: phases.late !== null ? Math.round(phases.late * 100) : null,
    },
  }
}

function init(stateRef, broadcastFn) {
  state = stateRef
  broadcast = broadcastFn
}

// ── 対面チャンプ検索 ──
function findLaneOpponent(enemies, position, logTag) {
  let opponent = enemies.find(e => e.position === position)
  if (!opponent?.enName) {
    opponent = enemies.find(e => e.enName)
    if (opponent) {
      console.log(`[${logTag}] No exact lane match for ${position}, using ${opponent.enName} as fallback`)
    }
  }
  return opponent?.enName ? opponent : null
}

// ── ブーツ候補抽出 ──
function extractBootsCandidates(analysis, coreIds, seen) {
  const boots = []
  for (const entry of (analysis?.boots || [])) {
    for (const id of (entry.ids || [])) {
      const idStr = String(id)
      if (seen.has(idStr) || coreIds.has(idStr)) continue
      seen.add(idStr)
      const patchItem = getItemById(idStr)
      if (!patchItem) continue
      boots.push({ id: idStr, jaName: patchItem.jaName || idStr, desc: patchItem.fullDesc || patchItem.description || '' })
    }
  }
  return boots
}

// ── フォールバック候補 ──
function buildFallbackSubstituteItems() {
  const analysis = state.currentAnalysis
  if (!analysis) return []

  const seen = new Set()
  const coreIds = new Set((state.currentCoreBuild?.ids || []).map(String))
  const items = extractBootsCandidates(analysis, coreIds, seen)

  const sources = [
    ...(analysis.fourthItems || []),
    ...(analysis.fifthItems || []),
    ...(analysis.sixthItems || []),
    ...(analysis.lastItems || [])
  ]

  for (const entry of sources) {
    for (const id of (entry.ids || [])) {
      const idStr = String(id)
      if (seen.has(idStr) || coreIds.has(idStr)) continue
      seen.add(idStr)
      const patchItem = getItemById(idStr)
      if (!isCompletedItem(patchItem)) continue
      items.push({ id: idStr, jaName: patchItem.jaName || idStr, desc: patchItem.fullDesc || patchItem.description || '' })
    }
  }
  return items.slice(0, 15)
}

function useFallbackSubstituteItems() {
  const fallback = buildFallbackSubstituteItems()
  if (fallback.length > 0) {
    if (state.aiClient) state.aiClient.setSubstituteItems(fallback)
    const candidatesForUI = fallback.map(it => {
      const patchItem = getItemById(it.id)
      return { id: it.id, name: it.jaName, image: patchItem?.image || null }
    })
    broadcast('substitute:items', candidatesForUI)
    console.log(`[MatchupItems] Fallback: ${fallback.length} items from OP.GG analysis`)
  } else {
    broadcast('substitute:error', 'マッチアップデータを取得できませんでした')
  }
}

// ── マッチアップアイテム ──
function handleMatchupItems(me, resolvedPosition, enemies) {
  if (state.matchupItemsLoaded || !me.enName || !resolvedPosition || !state.aiClient || !state.currentCoreBuild) return

  const laneOpponent = findLaneOpponent(enemies, resolvedPosition, 'MatchupItems')
  if (!laneOpponent) return

  state.matchupItemsLoaded = true
  const matchupPromise = fetchMatchupItems(me.enName, laneOpponent.enName, resolvedPosition)
  state.matchupItemsPromise = matchupPromise
  matchupPromise.then(result => {
    const items = result?.items
    state.matchupGameLengths = result?.gameLengths || null
    if (items && items.length > 0) {
      const coreIds = new Set((state.currentCoreBuild?.ids || []).map(String))
      const seen = new Set()
      const bootsItems = extractBootsCandidates(state.currentAnalysis, coreIds, seen)

      const completed = items.reduce((acc, it) => {
        if (acc.length >= 15 || coreIds.has(String(it.id)) || seen.has(String(it.id))) return acc
        seen.add(String(it.id))
        const patchItem = getItemById(it.id)
        if (!patchItem) { acc.push(it); return acc }
        if (isCompletedItem(patchItem)) {
          acc.push({ ...it, desc: patchItem.fullDesc || patchItem.description || '' })
        }
        return acc
      }, [])
      const allItems = [...bootsItems, ...completed]
      state.aiClient.setSubstituteItems(allItems)
      const candidatesForUI = allItems.map(it => ({
        id: it.id, name: it.jaName, image: getItemById(it.id)?.image || null
      }))
      broadcast('substitute:items', candidatesForUI)
      console.log(`[MatchupItems] ${me.enName} vs ${laneOpponent.enName}: ${allItems.length} items (boots: ${bootsItems.length})`)
    } else {
      console.warn('[MatchupItems] No data returned, using fallback')
      useFallbackSubstituteItems()
    }
  }).catch(err => {
    console.error('[MatchupItems] Error:', err.message)
    useFallbackSubstituteItems()
  })
}

// ── マッチアップTip ──
function handleMatchupTip(me, resolvedPosition, enemies) {
  if (!state.currentMatchAiAllowed) return
  if (state.matchupTipLoaded || !me.enName || !resolvedPosition || !state.aiClient || !state.aiEnabled || !state.currentCoreBuild) {
    if (!state.matchupTipLoaded && me.enName && resolvedPosition) {
      console.log(`[MatchupTip] Waiting... claude=${!!state.aiClient} ai=${state.aiEnabled} coreBuild=${!!state.currentCoreBuild}`)
    }
    return
  }

  const laneOpponent = findLaneOpponent(enemies, resolvedPosition, 'MatchupTip')
  if (!laneOpponent) return

  state.matchupTipLoaded = true

  const gameState = state.currentGameState
  if (!gameState) {
    console.warn('[Pipeline] MatchupTip: no gameState available, will retry')
    state.matchupTipLoaded = false
    return
  }

  // 前処理: 構造化入力を生成
  const spellData = getSpells(laneOpponent.enName)
  const structuredInput = state.preprocessor.buildMatchupInput(gameState, spellData)
  console.log(`[Pipeline] MatchupTip input: ${me.enName} vs ${structuredInput.opponent?.champion || '?'} (${resolvedPosition})`)

  broadcast('matchup:loading', { loading: true, opponent: laneOpponent.championName, opponentPartner: structuredInput.opponent_partner?.champion || null })

  // マッチアップ勝率 + gameLengths を待ってからAI呼び出し
  Promise.all([
    fetchMatchupWinRate(me.enName, laneOpponent.enName, resolvedPosition).catch(() => null),
    (state.matchupItemsPromise || Promise.resolve(null)).catch(() => null),
  ]).then(([winRate]) => {
    if (winRate !== null) {
      structuredInput.matchup_winrate = Math.round(winRate * 1000) / 10 // パーセント（小数点1桁）
    }
    // gameLengths から power_curve を生成
    if (state.matchupGameLengths) {
      structuredInput.power_curve = analyzeGameLengths(state.matchupGameLengths)
    }
    return state.aiClient.getMatchupTip(structuredInput)
  }).then(rawTip => {
    // 後処理
    const tip = state.postprocessor.processMatchupResult(rawTip, structuredInput.opponent)

    if (tip) {
      tip.opponent = laneOpponent.championName
      tip.opponentPartner = structuredInput.opponent_partner?.champion || null
      tip.myChampion = me.championName
      tip.mySkills = structuredInput.me?.skills || null
      tip.opponentSkills = structuredInput.opponent?.skills || null
      // power_curve をUIに渡す
      if (structuredInput.power_curve) {
        tip.power_curve = structuredInput.power_curve
      }
      broadcast('matchup:loading', false)
      broadcast('matchup:tip', tip)
      console.log(`[Pipeline] MatchupTip processed: ${me.enName} vs ${laneOpponent.enName}: ${tip.summary}`)
    } else {
      broadcast('matchup:loading', false)
      console.warn('[Pipeline] MatchupTip postprocessor returned null, will retry')
      state.matchupTipLoaded = false
    }
  }).catch(err => {
    broadcast('matchup:loading', false)
    if (err.authError) {
      console.error('[MatchupTip] Auth error - stopping retries. Check provider settings.')
      state.aiEnabled = false
      broadcast('ai:error', { type: 'auth', message: 'APIキーが無効またはプロバイダー未設定です。' })
    } else {
      console.error('[MatchupTip] Error:', err.message, '- will retry')
      state.matchupTipLoaded = false
    }
  })
}

/**
 * チーム戦略アドバイス（中盤15分 / 終盤25分 の2回）
 */
function handleTeamStrategy(gameData, me, allies, enemies) {
  const gameTime = gameData.gameData?.gameTime || 0

  // 終盤チェック（25分）
  if (gameTime >= 1500 && !state.lateStrategyLoaded) {
    state.lateStrategyLoaded = true
    _fetchStrategy(gameData, me, allies, enemies, 'late')
    return
  }

  // 中盤チェック（15分）
  if (gameTime >= 900 && !state.midStrategyLoaded) {
    state.midStrategyLoaded = true
    _fetchStrategy(gameData, me, allies, enemies, 'mid')
    return
  }
}

function _fetchStrategy(gameData, me, allies, enemies, phase) {
  if (!state.aiClient || !state.aiEnabled || !state.currentMatchAiAllowed) return
  if (!state.preprocessor || !state.currentGameState) return

  const input = state.preprocessor.buildStrategyInput(state.currentGameState, phase)
  if (!input) return

  console.log(`[Strategy] Fetching ${phase} strategy (t=${input.game_time}s, ${input.situation})`)
  broadcast('strategy:loading', true)

  state.aiClient.getTeamStrategy(input, phase).then(result => {
    broadcast('strategy:loading', false)
    if (result) {
      result._phase = phase
      console.log(`[Strategy] ${phase} strategy received`)
      broadcast('strategy:team', result)
    }
  }).catch(err => {
    broadcast('strategy:loading', false)
    console.error(`[Strategy] ${phase} error: ${err.message}`)
  })
}

module.exports = {
  init,
  handleMatchupTip,
  handleMatchupItems,
  handleTeamStrategy,
  useFallbackSubstituteItems,
}
