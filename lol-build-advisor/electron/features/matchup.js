// ── マッチアップ機能（Tip + アイテム）──────────────
// main.js から切り出した handleMatchupTip, handleMatchupItems,
// findLaneOpponent, injectCounterItems, buildFallbackSubstituteItems, useFallbackSubstituteItems

const { getItemById, getSpells } = require('../api/patchData')
const { fetchMatchupItems } = require('../api/opggClient')
const { COUNTER_ITEMS, isCompletedItem } = require('../core/config')

let state = null
let broadcast = null

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

// ── カウンターアイテム注入 ──
function injectCounterItems(items, enemies) {
  const enemyFlags = new Set()
  for (const e of enemies) {
    for (const f of (e.flags || [])) enemyFlags.add(f)
  }

  const existingIds = new Set(items.map(it => String(it.id)))
  const coreIds = new Set((state.currentCoreBuild?.ids || []).map(String))
  const toAdd = []

  for (const [flag, counterIds] of Object.entries(COUNTER_ITEMS)) {
    if (!enemyFlags.has(flag)) continue
    for (const id of counterIds) {
      if (existingIds.has(id) || coreIds.has(id)) continue
      const patchItem = getItemById(id)
      if (!patchItem) continue
      toAdd.push({ id, jaName: patchItem.jaName || id, desc: patchItem.fullDesc || patchItem.description || '' })
      existingIds.add(id)
    }
  }
  if (toAdd.length > 0) {
    console.log(`[CounterItems] Injected: ${toAdd.map(it => it.jaName).join(', ')}`)
  }
  return [...items, ...toAdd]
}

// ── フォールバック候補 ──
function buildFallbackSubstituteItems() {
  const analysis = state.currentAnalysis
  if (!analysis) return []

  const seen = new Set()
  const coreIds = new Set((state.currentCoreBuild?.ids || []).map(String))
  const items = []

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

function useFallbackSubstituteItems(enemies) {
  let fallback = buildFallbackSubstituteItems()
  if (enemies) fallback = injectCounterItems(fallback, enemies)
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
  fetchMatchupItems(me.enName, laneOpponent.enName, resolvedPosition).then(items => {
    if (items && items.length > 0) {
      const coreIds = new Set((state.currentCoreBuild?.ids || []).map(String))
      const completed = items.reduce((acc, it) => {
        if (acc.length >= 15 || coreIds.has(String(it.id))) return acc
        const patchItem = getItemById(it.id)
        if (!patchItem) { acc.push(it); return acc }
        if (isCompletedItem(patchItem)) {
          acc.push({ ...it, desc: patchItem.fullDesc || patchItem.description || '' })
        }
        return acc
      }, [])
      const withCounters = injectCounterItems(completed, enemies)
      state.aiClient.setSubstituteItems(withCounters)
      const candidatesForUI = withCounters.map(it => ({
        id: it.id, name: it.jaName, image: getItemById(it.id)?.image || null
      }))
      broadcast('substitute:items', candidatesForUI)
      console.log(`[MatchupItems] ${me.enName} vs ${laneOpponent.enName}: ${withCounters.length} items`)
    } else {
      console.warn('[MatchupItems] No data returned, using fallback')
      useFallbackSubstituteItems(enemies)
    }
  }).catch(err => {
    console.error('[MatchupItems] Error:', err.message)
    useFallbackSubstituteItems(enemies)
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

  state.aiClient.getMatchupTip(structuredInput).then(rawTip => {
    // 後処理
    const tip = state.postprocessor.processMatchupResult(rawTip, structuredInput.opponent)

    if (tip) {
      tip.opponent = laneOpponent.championName
      tip.opponentPartner = structuredInput.opponent_partner?.champion || null
      tip.myChampion = me.championName
      tip.mySkills = structuredInput.me?.skills || null
      tip.opponentSkills = structuredInput.opponent?.skills || null
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

module.exports = {
  init,
  handleMatchupTip,
  handleMatchupItems,
  useFallbackSubstituteItems,
}
