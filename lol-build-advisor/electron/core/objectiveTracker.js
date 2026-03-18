// オブジェクトタイマー・マクロコンテキスト構築
// Riot Live Client Data API のオブジェクトキルイベント(DragonKill等)は
// 公式ドキュメントには記載があるが実際には返ってこないケースが多い(既知バグ)
// → イベントがあれば活用し、なければゲーム時間ベースにフォールバック
const { OBJECTIVES, classifyObjectiveEvents } = require('./config')

/**
 * オブジェクトの状態テキストを生成（ハイブリッド: イベント優先 + 時間フォールバック）
 */
function objectiveStatus(name, config, kills, gameTime) {
  const { firstSpawn, respawn, end } = config

  // 終了時間あり（ヴォイドグラブ/ヘラルド）
  if (end !== undefined && gameTime >= end) {
    const killInfo = kills.length > 0 ? ` (${kills.length}体討伐)` : ''
    return `${name}: 終了${killInfo}`
  }

  // キルイベントが取れている場合 → 正確な追跡
  if (kills.length > 0) {
    const lastKill = kills[kills.length - 1]
    if (!respawn) {
      return `${name}: 討伐済み`
    }
    const nextSpawn = lastKill.EventTime + respawn
    if (end !== undefined && nextSpawn >= end) {
      return `${name}: 終了 (${kills.length}体討伐)`
    }
    if (gameTime >= nextSpawn) {
      return `${name}: 取得可能 (${kills.length}体討伐済み)`
    }
    const rem = Math.ceil(nextSpawn - gameTime)
    return `${name}: リスポーン待ち（あと${formatTime(rem)}）→ 対象外 (${kills.length}体討伐済み)`
  }

  // キルイベントなし → ゲーム時間ベースのフォールバック
  if (gameTime >= firstSpawn) {
    return `${name}: 取得可能 (討伐状況不明)`
  }
  const rem = Math.ceil(firstSpawn - gameTime)
  return `${name}: 未出現（スポーンまで${formatTime(rem)}）→ 対象外`
}

function formatTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * マクロアドバイス用 静的コンテキスト構築（試合中変わらない情報 — キャッシュ対象）
 */
function buildMacroStaticContext(me, allies, enemies) {
  const formatChamp = (p) => `${p.championName} ${p.position || '?'}`
  const lines = [
    `【自分のチャンピオン】${me.championName} (${me.position || '?'})`,
    '',
    `【味方構成】`,
    ...allies.map(formatChamp),
    '',
    `【敵構成】`,
    ...enemies.map(formatChamp),
  ]
  return lines.join('\n')
}

/**
 * マクロアドバイス用 動的コンテキスト構築（毎回変わる情報）
 */
function buildMacroDynamicContext(gameData, me, allies, enemies) {
  const gameTime = gameData.gameData?.gameTime || 0
  const minutes = Math.floor(gameTime / 60)
  const phase = gameTime < 900 ? '序盤' : gameTime < 1500 ? '中盤' : '終盤'

  const allAllies = [me, ...allies]
  const allyKills = allAllies.reduce((s, p) => s + (p.scores?.kills || 0), 0)
  const enemyKills = enemies.reduce((s, p) => s + (p.scores?.kills || 0), 0)
  const diff = allyKills - enemyKills

  const events = gameData.events?.Events || []
  const { dragon, baron, herald, voidgrub } = classifyObjectiveEvents(events)

  const formatPlayer = (p) => {
    const items = (p.items || []).filter(i => i.itemID > 0).map(i => i.displayName).join(', ')
    return `${p.championName} Lv${p.level} ${p.scores?.kills}/${p.scores?.deaths}/${p.scores?.assists} ${items}`
  }

  const objectiveLines = [
    objectiveStatus('ドラゴン', OBJECTIVES.dragon, dragon, gameTime),
    objectiveStatus('バロン', OBJECTIVES.baron, baron, gameTime),
    objectiveStatus('ヴォイドグラブ', OBJECTIVES.voidgrub, voidgrub, gameTime),
    objectiveStatus('ヘラルド', OBJECTIVES.herald, herald, gameTime),
  ].filter(line => !line.includes('終了'))

  const lines = [
    `【時間】${minutes}分 (${phase})`,
    `【キル差】味方${allyKills} vs 敵${enemyKills} (${diff > 0 ? '+' + diff : diff})`,
    '',
    `【自分】${formatPlayer(me)}`,
    '',
    `【味方】`,
    ...allies.map(formatPlayer),
    '',
    `【敵】`,
    ...enemies.map(formatPlayer),
    '',
    `【オブジェクト状況】`,
    ...objectiveLines
  ]

  return lines.join('\n')
}

/**
 * オブジェクト状況サマリーを返す（UI表示用）
 */
function getObjectivesSummary(events, gameTime) {
  const { dragon, baron, herald, voidgrub } = classifyObjectiveEvents(events)

  return {
    dragon: objectiveStatus('ドラゴン', OBJECTIVES.dragon, dragon, gameTime),
    baron: objectiveStatus('バロン', OBJECTIVES.baron, baron, gameTime),
    voidgrub: objectiveStatus('ヴォイドグラブ', OBJECTIVES.voidgrub, voidgrub, gameTime),
    herald: objectiveStatus('ヘラルド', OBJECTIVES.herald, herald, gameTime),
    gameTime: Math.floor(gameTime)
  }
}

/**
 * 各オブジェクトのスポーンまでの残り秒数を返す（-1 = 取得可能 or 終了）
 */
function getObjectiveTimers(events, gameTime) {
  const { dragon, baron, herald } = classifyObjectiveEvents(events)

  function remainingSeconds(config, kills) {
    const { firstSpawn, respawn, end } = config
    // 終了済み
    if (end !== undefined && gameTime >= end) return Infinity
    // キルイベントあり
    if (kills.length > 0) {
      if (!respawn) return Infinity // 1回限り
      const nextSpawn = kills[kills.length - 1].EventTime + respawn
      if (end !== undefined && nextSpawn >= end) return Infinity
      return gameTime >= nextSpawn ? -1 : Math.ceil(nextSpawn - gameTime)
    }
    // ファーストスポーン前
    return gameTime >= firstSpawn ? -1 : Math.ceil(firstSpawn - gameTime)
  }

  return {
    dragon: remainingSeconds(OBJECTIVES.dragon, dragon),
    baron: remainingSeconds(OBJECTIVES.baron, baron),
    herald: remainingSeconds(OBJECTIVES.herald, herald),
  }
}

module.exports = { buildMacroStaticContext, buildMacroDynamicContext, objectiveStatus, getObjectivesSummary, getObjectiveTimers }
