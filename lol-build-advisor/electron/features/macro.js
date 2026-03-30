// ── マクロアドバイス機能（Phase 2）──────────────────
// config.js の FEATURE_MACRO_ENABLED: true で有効化される。
// main.js の init() で state 参照と broadcast 関数を受け取る。

const { MACRO_DEBOUNCE_MS, MACRO_FALLBACK_MS, RECALL_GOLD_THRESHOLDS, classifyObjectiveEvents } = require('../core/config')
const { buildMacroStaticContext, getObjectiveTimers } = require('../core/objectiveTracker')

// main.js から渡される参照
let state = null
let broadcast = null

// マクロ内部 state（main.js の state から分離）
const macroState = {
  lastMacroTime: 0,
  macroPending: false,
  lastObjectiveCount: 0,
  lastTurretCount: 0,
  lastChampionKillCount: 0,
  _lastMacroFingerprint: null,
  _prevMacroState: {},
  _lastObjTriggerKey: null,
}

function init(stateRef, broadcastFn) {
  state = stateRef
  broadcast = broadcastFn
}

function resetState() {
  macroState.lastMacroTime = 0
  macroState.macroPending = false
  macroState.lastObjectiveCount = 0
  macroState.lastTurretCount = 0
  macroState.lastChampionKillCount = 0
  macroState._lastMacroFingerprint = null
  macroState._prevMacroState = {}
  macroState._lastObjTriggerKey = null
}

// ── ログ ──
function macroLog(msg) {
  const provider = state.aiClient?.getProviderType?.() || '?'
  const model = state.aiClient?.provider?.defaultModel || '?'
  console.log(`[Macro:${provider}:${model}] ${msg}`)
}

// ── 履歴管理 ──
function appendMacroAdviceHistory(entry) {
  if (!state.matchSession) return
  const history = state.matchSession.macroAdviceHistory || []
  history.push(entry)
  state.matchSession.macroAdviceHistory = history.slice(-10)
  console.log(
    `[Session] Appended macro history ` +
    `count=${state.matchSession.macroAdviceHistory.length} ` +
    `action=${entry?.action || '-'} trigger=${entry?.trigger || '-'} time=${entry?.gameTime ?? '-'}`
  )
  state._saveRuntimeSession()
}

function summarizeMacroAdviceHistory() {
  const history = state.matchSession?.macroAdviceHistory || []
  return history.map(item => ({
    game_time: item.gameTime,
    action: item.action || '',
    title: item.title || '',
    desc: item.desc || '',
    trigger: item.trigger || '',
  }))
}

// ── ペイロード構築 ──
function buildMacroBroadcastPayload(advice, gameTime, trigger, source = 'ai') {
  return {
    ...advice,
    gameTime,
    _meta: {
      source,
      trigger: trigger || null,
      updatedAt: advice?.updatedAt || Date.now(),
    },
  }
}

function buildMacroFallbackPayload(alert, gameTime, trigger) {
  return buildMacroBroadcastPayload({
    title: alert.title,
    desc: alert.desc,
    warning: alert.warning || '',
    _fallback: true,
  }, gameTime, trigger, 'rule')
}

// ── AI 呼び出し ──
async function requestMacroAdvice(gameData, me, allies, enemies, eventTrigger = null) {
  if (macroState.macroPending || !state.aiClient || !state.aiEnabled) return

  macroState.macroPending = true
  broadcast('macro:loading', true)

  try {
    const gameState = state.currentGameState
    const events = gameData.events?.Events || []
    const gameTime = gameData.gameData?.gameTime || 0

    // 前処理: 構造化入力を生成
    const structuredInput = state.preprocessor.buildMacroInput(gameState, events)

    // 状況未変化ならスキップ（コスト削減）
    const deadEnemies = (structuredInput.enemies || []).filter(e => e.isDead).map(e => e.champion).join(',')
    const obj = structuredInput.objectives || {}
    const objKey = `d${obj.dragon?.allyCount || 0}v${obj.dragon?.enemyCount || 0}_${obj.dragon?.available ? 'A' : ''}${obj.dragon?.soulPoint ? 'S' : ''}|b${obj.baron?.available ? 'A' : ''}`
    const goldDiffRounded = Math.round((structuredInput.gold_diff || 0) / 1000)
    const macroFingerprint = `${structuredInput.game_phase}|${structuredInput.situation}|${structuredInput.kill_diff}|${goldDiffRounded}|${structuredInput.action_candidates.map(c => c.action).join(',')}|${objKey}|${JSON.stringify(structuredInput.towers)}|${deadEnemies}`
    if (macroFingerprint === macroState._lastMacroFingerprint) {
      macroLog(`Skipped: situation unchanged`)
      macroState.macroPending = false
      broadcast('macro:loading', false)
      return
    }
    macroState._lastMacroFingerprint = macroFingerprint

    console.log(`[Pipeline] Macro input: phase=${structuredInput.game_phase} situation=${structuredInput.situation} actions=${structuredInput.action_candidates.map(c => c.action).join(',')}`)

    // staticContextはcache_control用に引き続き使う
    const staticCtx = buildMacroStaticContext(me, allies, enemies)

    // 推論
    let rawResult = await state.aiClient.getMacroAdvice(staticCtx, structuredInput, {
      trigger: eventTrigger || null,
    })
    state._syncInteractionSessionsFromClient()
    macroLog(`[Pipeline] Raw: ${JSON.stringify(rawResult).substring(0, 300)}`)

    // 後処理
    const actionCandidates = structuredInput.action_candidates.map(c => c.action)
    const previousResult = state.postprocessor.lastMacroResult
    const advice = state.postprocessor.processMacroResult(rawResult, actionCandidates, previousResult)

    if (advice) {
      // 次回フィードバック用に保存
      state.preprocessor.setMacroAdvice(advice)
      appendMacroAdviceHistory({
        gameTime,
        action: advice.action || '',
        title: advice.title || '',
        desc: advice.desc || '',
        trigger: eventTrigger,
      })

      macroLog(`[Pipeline] Processed: ${JSON.stringify(advice).substring(0, 300)}`)
      const payload = buildMacroBroadcastPayload(advice, gameTime, eventTrigger, 'ai')
      broadcast('macro:advice', payload)
      macroLog(`Sent: ${payload.title}`)
    } else {
      // フォールバック: ruleEngineのアラートを使用
      const position = state.aiClient?.position || 'MID'
      const ruleAlerts = state.ruleEngine ? state.ruleEngine.evaluate(gameData, position, state.aiClient?.rank) : []
      if (ruleAlerts.length > 0) {
        const top = ruleAlerts[0]
        const fallback = buildMacroFallbackPayload(top, gameTime, eventTrigger)
        broadcast('macro:advice', fallback)
        macroLog(`[Pipeline] Fallback to ruleEngine: ${top.title}`)
      } else {
        macroLog('[Pipeline] Postprocessor returned null, no ruleEngine fallback available')
      }
    }
  } catch (err) {
    if (err.authError) {
      macroLog('Auth error - stopping. Check provider settings.')
      state.aiEnabled = false
      broadcast('ai:error', { type: 'auth', message: 'APIキーが無効またはプロバイダー未設定です。' })
    } else {
      macroLog(`Error: ${err.message}`)
      broadcast('macro:advice', {
        error: err.message,
        _meta: {
          source: 'error',
          trigger: eventTrigger || null,
          updatedAt: Date.now(),
        }
      })
    }
  } finally {
    macroState.macroPending = false
    broadcast('macro:loading', false)
  }
}

// ── トリガー判定 ──
function handleMacroAdvice(gameData, me, allies, enemies) {
  if (!state.currentMatchAiAllowed) return
  const now = Date.now()
  const events = gameData.events?.Events || []
  const objEvents = classifyObjectiveEvents(events)
  const objectiveCount = objEvents.dragon.length + objEvents.baron.length + objEvents.herald.length + objEvents.voidgrub.length
  const turretCount = events.filter(e => e.EventName === 'TurretKilled').length
  const objectiveTaken = objectiveCount > macroState.lastObjectiveCount || turretCount > (macroState.lastTurretCount || 0)
  if (objectiveCount > macroState.lastObjectiveCount) macroState.lastObjectiveCount = objectiveCount
  if (turretCount > (macroState.lastTurretCount || 0)) macroState.lastTurretCount = turretCount

  // キル/デス検出トリガー
  const championKillCount = events.filter(e => e.EventName === 'ChampionKill').length
  const killDeathOccurred = championKillCount > (macroState.lastChampionKillCount || 0)
  if (championKillCount > (macroState.lastChampionKillCount || 0)) macroState.lastChampionKillCount = championKillCount

  const timeSinceLastMacro = now - macroState.lastMacroTime

  // オブジェクトスポーン90秒前トリガー
  const gt = gameData.gameData?.gameTime || 0
  const timers = getObjectiveTimers(events, gt)
  const OBJ_PRE_TRIGGER_SEC = 90
  const OBJ_PRE_TRIGGER_MIN_SEC = 30
  let objectivePreTrigger = false
  const approachingObjs = []
  for (const [name, remaining] of Object.entries(timers)) {
    if (remaining > OBJ_PRE_TRIGGER_MIN_SEC && remaining <= OBJ_PRE_TRIGGER_SEC) {
      approachingObjs.push(`${name}:${remaining}s`)
    }
  }
  if (approachingObjs.length > 0) {
    const triggerKey = approachingObjs.map(o => o.split(':')[0]).join(',')
    if (triggerKey !== macroState._lastObjTriggerKey && timeSinceLastMacro >= MACRO_DEBOUNCE_MS) {
      objectivePreTrigger = true
      macroState._lastObjTriggerKey = triggerKey
    }
  }

  // イベント駆動トリガー
  const gameState = state.currentGameState
  const prevMacroState = macroState._prevMacroState || {}
  let eventTrigger = null

  if (!eventTrigger && objectiveTaken) {
    eventTrigger = 'objective_taken'
  }
  if (!eventTrigger && objectivePreTrigger) {
    eventTrigger = `objective_approaching: ${approachingObjs.join(', ')}`
  }
  if (!eventTrigger && killDeathOccurred && timeSinceLastMacro >= MACRO_DEBOUNCE_MS) {
    eventTrigger = 'kill_death'
  }

  // ゴールド閾値超え
  if (!eventTrigger && gameState?.me && timeSinceLastMacro >= MACRO_DEBOUNCE_MS) {
    const currGold = gameState.me.gold || 0
    const prevGold = prevMacroState.gold || 0
    const thresholds = RECALL_GOLD_THRESHOLDS
    for (const t of thresholds) {
      if (prevGold < t && currGold >= t) {
        eventTrigger = `gold_threshold_${t}`
        break
      }
    }
  }

  // バフ切れ
  if (!eventTrigger && gameState?.objectives && timeSinceLastMacro >= MACRO_DEBOUNCE_MS) {
    const currBuffs = gameState.objectives.buffs || {}
    const prevBuffs = prevMacroState.buffs || {}
    if (prevBuffs.baron && !currBuffs.baron) eventTrigger = 'baron_buff_expired'
    if (prevBuffs.elder && !currBuffs.elder) eventTrigger = 'elder_buff_expired'
  }

  // 5分フォールバック
  if (!eventTrigger && timeSinceLastMacro >= MACRO_FALLBACK_MS) {
    eventTrigger = 'fallback_300s'
  }

  if (state.aiClient && state.aiEnabled && !macroState.macroPending && eventTrigger) {
    macroState.lastMacroTime = now
    if (gameState?.me) {
      macroState._prevMacroState = {
        gold: gameState.me.gold || 0,
        buffs: { ...(gameState.objectives?.buffs || {}) },
      }
    }
    macroLog(`Triggering macro advice (${eventTrigger})`)
    requestMacroAdvice(gameData, me, allies, enemies, eventTrigger)
  }
}

module.exports = {
  init,
  resetState,
  handleMacroAdvice,
  summarizeMacroAdviceHistory,
}
