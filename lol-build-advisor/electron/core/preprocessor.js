// 前処理層: 生のgameDataから構造化GameStateを構築し、機能別の入力JSONを生成する
const { extractEnName } = require('../api/contextBuilder')
const { getItemById, getAllChampions, getSpells } = require('../api/patchData')
const { extractTraits, detectFlags } = require('./championAnalysis')
const { objectiveStatus, getAvailableObjectiveNames, getObjectiveTimers } = require('./objectiveTracker')
const { OBJECTIVES, classifyObjectiveEvents, COUNTER_ITEMS, isCompletedItem } = require('./config')
const { getGamePhase } = require('./knowledgeDb')

// ロール対面マッピング（同じレーンで対面する相手を特定）
const LANE_OPPONENT_MAP = {
  TOP: 'TOP', JUNGLE: 'JUNGLE', JG: 'JG',
  MIDDLE: 'MIDDLE', MID: 'MID',
  BOTTOM: 'BOTTOM', ADC: 'ADC',
  UTILITY: 'UTILITY', SUP: 'SUP', SUPPORT: 'SUPPORT'
}

// ポジション正規化
function normalizePosition(pos) {
  if (!pos) return ''
  const upper = pos.toUpperCase()
  const map = { TOP: 'TOP', JUNGLE: 'JG', JG: 'JG', MIDDLE: 'MID', MID: 'MID', BOTTOM: 'ADC', ADC: 'ADC', UTILITY: 'SUP', SUP: 'SUP', SUPPORT: 'SUP' }
  return map[upper] || upper
}

/**
 * 自分のプレイヤーオブジェクトを特定する（contextBuilder._findMe相当）
 */
function findMe(activePlayer, allPlayers) {
  return allPlayers.find(p =>
    p.summonerName === activePlayer?.summonerName ||
    p.riotId === activePlayer?.riotId ||
    p.riotIdGameName === activePlayer?.riotIdGameName
  ) || allPlayers[0]
}

/**
 * チームダメージプロファイルを計算する（contextBuilder._calcTeamDamage相当）
 */
function calcTeamDamage(players) {
  let ad = 0, ap = 0
  for (const p of players) {
    const items = (p.items || []).filter(i => i.itemID > 0)
    let playerAd = 0, playerAp = 0
    for (const item of items) {
      const data = getItemById(item.itemID)
      if (!data) continue
      playerAd += data.stats?.FlatPhysicalDamageMod || 0
      playerAp += data.stats?.FlatMagicDamageMod || 0
    }
    // アイテムがない序盤はチャンプ基本情報で補完
    if (playerAd === 0 && playerAp === 0) {
      const champMap = getAllChampions() || {}
      const enName = extractEnName(p)
      const champ = Object.values(champMap).find(c => c.enName === enName)
      playerAd = champ?.info?.attack || 5
      playerAp = champ?.info?.magic || 5
    }
    ad += playerAd
    ap += playerAp
  }
  const total = ad + ap || 1
  return { ad: Math.round(ad / total * 100), ap: Math.round(ap / total * 100) }
}

/**
 * プレイヤーのアイテム合計ゴールドを推定する
 */
function estimateGold(player) {
  const items = (player.items || []).filter(i => i.itemID > 0)
  let total = 0
  for (const item of items) {
    const data = getItemById(item.itemID)
    if (data) total += data.gold?.total || 0
  }
  return total
}

/**
 * プレイヤーのステータス判定（fed/behind/normal）
 * フェーズ補正あり: 序盤は閾値を下げ、終盤は上げる
 */
function judgeStatus(scores, gamePhase) {
  const kills = scores?.kills || 0
  const deaths = scores?.deaths || 0

  // フェーズ別閾値
  let fedKills, fedMaxDeaths, behindDeaths, behindMaxKills
  switch (gamePhase) {
    case 'early':
      fedKills = 3; fedMaxDeaths = 1; behindDeaths = 3; behindMaxKills = 0
      break
    case 'mid':
      fedKills = 4; fedMaxDeaths = 2; behindDeaths = 4; behindMaxKills = 1
      break
    default: // late
      fedKills = 5; fedMaxDeaths = 2; behindDeaths = 5; behindMaxKills = 1
      break
  }

  if (kills >= fedKills && deaths <= fedMaxDeaths) return 'fed'
  if (deaths >= behindDeaths && kills <= behindMaxKills) return 'behind'
  return 'normal'
}

/**
 * CC持ちスキル数をカウントしてレベルを返す
 */
function judgeCcLevel(enemies) {
  const CC_REGEX = /スタン|スネア|ノックアップ|ノックバック|サイレンス|フィアー|拘束|束縛|打ち上げ|引き寄せ|チャーム|魅了|挑発|スリープ|変身させ|サプレッション|エアボーン/
  let ccCount = 0
  for (const e of enemies) {
    const enName = extractEnName(e)
    const spells = getSpells(enName)
    if (!spells) continue
    for (const spell of spells.spells) {
      if (CC_REGEX.test(spell.desc)) ccCount++
    }
  }
  if (ccCount <= 1) return 'low'
  if (ccCount <= 3) return 'medium'
  return 'high'
}

/**
 * チーム構成タイプを推定する（engage/poke/split/scale）
 */
const TIER_NAMES = { P3: 'outer', P2: 'inner', P1: 'inhib', P4: 'nexus', P5: 'nexus' }
const LANE_NAMES = { L0: 'bot', L1: 'mid', L2: 'top' }

function buildTowerStatus(events, myTeam) {
  const allyLost = { top: [], mid: [], bot: [] }
  const enemyLost = { top: [], mid: [], bot: [] }
  for (const e of events) {
    if (e.EventName !== 'TurretKilled') continue
    const turret = e.TurretKilled || ''
    // レーン判定
    const laneMatch = turret.match(/_(L[012])_/)
    if (!laneMatch) continue
    const lane = LANE_NAMES[laneMatch[1]]
    if (!lane) continue
    // ティア判定
    const tierMatch = turret.match(/_(P[1-5])_/)
    if (!tierMatch) continue
    const tier = TIER_NAMES[tierMatch[1]]
    if (!tier) continue
    // どちら側のタワーか
    const isOrderTurret = turret.includes('TOrder')
    const isChaos = turret.includes('TChaos')
    if (!isOrderTurret && !isChaos) continue
    // Order側タワーが壊れた → Orderチームが失った
    const losingTeam = isOrderTurret ? 'ORDER' : 'CHAOS'
    const target = losingTeam === myTeam ? allyLost : enemyLost
    if (!target[lane].includes(tier)) target[lane].push(tier)
  }
  return { ally_lost: allyLost, enemy_lost: enemyLost }
}

function estimateComposition(players) {
  let engage = 0, poke = 0, split = 0, scale = 0
  for (const p of players) {
    const enName = extractEnName(p)
    const traits = extractTraits(enName)
    const traitStr = traits.join(',')
    if (/CC/.test(traitStr)) engage++
    const champMap = getAllChampions() || {}
    const champ = Object.values(champMap).find(c => c.enName === enName)
    const tags = champ?.tags || []
    if (tags.includes('Tank') || tags.includes('Fighter')) engage++
    if (tags.includes('Mage')) { poke++; scale++ }
    if (tags.includes('Assassin')) split++
    if (tags.includes('Marksman')) scale++
  }
  const scores = { engage, poke, split, scale }
  const max = Math.max(engage, poke, split, scale)
  if (max === 0) return 'balanced'
  return Object.keys(scores).find(k => scores[k] === max) || 'balanced'
}


class Preprocessor {
  constructor() {
    this.previousItemAdvice = null
    this.previousMacroAdvice = null
    this.gameLog = []
    this.lastSnapshotTime = 0
  }

  // === GameState構築 ===

  /**
   * 生のgameDataとイベントからGameStateオブジェクトを構築する
   * @param {object} gameData - { activePlayer, allPlayers, gameData: { gameTime } }
   * @param {Array} events - gameData.events?.Events || []
   * @param {object} [options] - オプション
   * @param {string} [options.spectatorSelectedName] - 観戦モードで選択中のプレイヤー名
   * @returns {object} GameState
   */
  buildGameState(gameData, events, options = {}) {
    const { activePlayer, allPlayers, gameData: gd } = gameData
    const gameTime = gd?.gameTime || 0
    events = events || []

    // プレイヤー分離（観戦モードでは選択キャラを優先）
    let me
    if (options.spectatorSelectedName) {
      me = allPlayers.find(p => p.summonerName === options.spectatorSelectedName) || findMe(activePlayer, allPlayers)
    } else {
      me = findMe(activePlayer, allPlayers)
    }
    const myTeam = me.team
    const allies = allPlayers.filter(p => p.team === myTeam && p !== me)
    const enemies = allPlayers.filter(p => p.team !== myTeam)

    // ゲームフェーズ
    const gamePhase = getGamePhase(gameTime)

    // キル差と戦況
    const allyKills = allPlayers.filter(p => p.team === myTeam).reduce((s, p) => s + (p.scores?.kills || 0), 0)
    const enemyKills = enemies.reduce((s, p) => s + (p.scores?.kills || 0), 0)
    const killDiff = allyKills - enemyKills
    let situation
    if (killDiff >= 3) situation = 'ahead'
    else if (killDiff <= -3) situation = 'behind'
    else situation = 'even'

    // 自分の情報
    const meEnName = extractEnName(me)
    const myPosition = normalizePosition(me.position)
    const myItems = (me.items || []).filter(i => i.itemID > 0)

    // 敵チームのダメージプロファイル
    const damageProfile = calcTeamDamage(enemies)

    // 敵チームのhealerカウント
    let healerCount = 0
    for (const e of enemies) {
      const en = extractEnName(e)
      const flags = detectFlags(en, null, e.scores)
      if (flags.includes('healer')) healerCount++
    }

    // 敵チームのCCレベル
    const ccLevel = judgeCcLevel(enemies)

    // 敵のfed/behindプレイヤー
    const enemyFedPlayers = []
    const enemyBehindPlayers = []
    for (const e of enemies) {
      const status = judgeStatus(e.scores, gamePhase)
      const enName = extractEnName(e)
      const playerInfo = {
        champion: e.championName,
        enName,
        position: normalizePosition(e.position),
        level: e.level,
        kda: [e.scores?.kills || 0, e.scores?.deaths || 0, e.scores?.assists || 0]
      }
      if (status === 'fed') enemyFedPlayers.push(playerInfo)
      if (status === 'behind') enemyBehindPlayers.push(playerInfo)
    }

    // 味方のfedプレイヤー
    const allyFedPlayers = []
    for (const a of [me, ...allies]) {
      const status = judgeStatus(a.scores, gamePhase)
      if (status === 'fed') {
        allyFedPlayers.push(extractEnName(a))
      }
    }

    // threats: fedかつダメージタイプ・理由付き（設計書準拠）
    const threats = enemyFedPlayers.map(fp => {
      const champMap = getAllChampions() || {}
      const champ = Object.values(champMap).find(c => c.enName === fp.enName)
      const tags = champ?.tags || []
      let reason = 'fed'
      if (tags.includes('Marksman') || tags.includes('Assassin')) reason = 'fed_ad_carry'
      if (tags.includes('Mage')) reason = 'fed_ap_carry'
      const completedItems = (enemies.find(e => extractEnName(e) === fp.enName)?.items || [])
        .filter(i => i.itemID > 0 && isCompletedItem(getItemById(i.itemID))).length
      return { champion: fp.champion, reason, level: fp.level, items: completedItems }
    })

    // 構成タイプ推定
    const allyComposition = estimateComposition([me, ...allies])
    const enemyComposition = estimateComposition(enemies)

    // 味方チーム: hasEngager, hasFrontline, damageBalance
    const allyAllPlayers = [me, ...allies]
    let hasEngager = false
    let hasFrontline = false
    for (const p of allyAllPlayers) {
      const champMap = getAllChampions() || {}
      const champ = Object.values(champMap).find(c => c.enName === extractEnName(p))
      const tags = champ?.tags || []
      if (tags.includes('Tank')) { hasFrontline = true; hasEngager = true }
      if (tags.includes('Fighter')) hasFrontline = true
    }
    const allyDamageProfile = calcTeamDamage(allyAllPlayers)
    let damageBalance = 'mixed'
    if (allyDamageProfile.ad >= 70) damageBalance = 'ad_heavy'
    else if (allyDamageProfile.ap >= 70) damageBalance = 'ap_heavy'

    // 味方/敵のゴールド合計
    const allyEstimatedGold = allyAllPlayers.reduce((s, p) => s + estimateGold(p), 0)
      + (activePlayer?.currentGold || 0)
    const enemyEstimatedGold = enemies.reduce((s, p) => s + estimateGold(p), 0)

    // オブジェクト情報（設計書準拠: allyCount/enemyCount/nextSpawnSec/soulPoint）
    const classified = classifyObjectiveEvents(events)
    const timers = getObjectiveTimers(events, gameTime)
    const available = getAvailableObjectiveNames(events, gameTime)

    // ドラゴン取得チーム別カウント・属性追跡（KillerNameからチーム判定）
    let dragonAllyCount = 0, dragonEnemyCount = 0
    const DRAGON_TYPE_MAP = { Fire: '炎', Earth: '山', Water: '海', Air: '風', Chemtech: '化学', Hextech: '氷結', Elder: 'エルダー' }
    let lastDragonType = null
    for (const ev of classified.dragon) {
      const killerName = ev.KillerName || ''
      const isAlly = allyAllPlayers.some(p =>
        p.summonerName === killerName || p.riotIdGameName === killerName || p.championName === killerName
      )
      if (isAlly) dragonAllyCount++
      else dragonEnemyCount++
      if (ev.DragonType) lastDragonType = DRAGON_TYPE_MAP[ev.DragonType] || ev.DragonType
    }

    // バロン/エルダーバフ判定（取得後180秒間有効）
    const BARON_BUFF_DURATION = 180
    const ELDER_BUFF_DURATION = 150
    const lastBaronEvent = classified.baron[classified.baron.length - 1]
    const hasBaronBuff = lastBaronEvent && (gameTime - (lastBaronEvent.EventTime || 0)) < BARON_BUFF_DURATION
      && allyAllPlayers.some(p => p.summonerName === lastBaronEvent.KillerName || p.riotIdGameName === lastBaronEvent.KillerName || p.championName === lastBaronEvent.KillerName)
    const lastElderEvent = classified.dragon.filter(e => e.DragonType === 'Elder').pop()
    const hasElderBuff = lastElderEvent && (gameTime - (lastElderEvent.EventTime || 0)) < ELDER_BUFF_DURATION
      && allyAllPlayers.some(p => p.summonerName === lastElderEvent.KillerName || p.riotIdGameName === lastElderEvent.KillerName || p.championName === lastElderEvent.KillerName)

    const objectives = {
      dragon: {
        allyCount: dragonAllyCount,
        enemyCount: dragonEnemyCount,
        nextSpawnSec: timers.dragon > 0 ? timers.dragon : null,
        soulPoint: dragonAllyCount >= 3 || dragonEnemyCount >= 3,
        available: available.includes('ドラゴン'),
        type: lastDragonType
      },
      baron: {
        available: available.includes('バロン'),
        spawnSec: timers.baron > 0 ? timers.baron : null
      },
      herald: {
        available: available.includes('ヘラルド')
      },
      voidgrub: {
        available: available.includes('ヴォイドグラブ')
      },
      buffs: {
        baron: hasBaronBuff || false,
        elder: hasElderBuff || false
      },
      // 後方互換: 既存コードが使う形式も残す
      timers,
      _available: available
    }

    // レーン状態推定（直近イベントから）
    const laneState = { top: 'unknown', mid: 'unknown', bot: 'unknown' }
    const recentEvents = events.filter(e =>
      e.EventName === 'TurretKilled' && (gameTime - (e.EventTime || 0)) < 120
    )
    for (const ev of recentEvents) {
      const turretName = (ev.TurretKilled || '').toLowerCase()
      let lane = null
      if (turretName.includes('top') || turretName.includes('_01_')) lane = 'top'
      else if (turretName.includes('mid') || turretName.includes('_02_')) lane = 'mid'
      else if (turretName.includes('bot') || turretName.includes('_03_')) lane = 'bot'
      if (!lane) continue
      const killerName = ev.KillerName || ''
      const isAlly = allyAllPlayers.some(p =>
        p.summonerName === killerName || p.riotIdGameName === killerName || p.championName === killerName
      )
      laneState[lane] = isAlly ? 'ally_pushing' : 'enemy_pushing'
    }

    // 味方プレイヤー情報構築
    const buildPlayerInfo = (p) => ({
      champion: p.championName,
      enName: extractEnName(p),
      position: normalizePosition(p.position),
      level: p.level,
      items: (p.items || []).filter(i => i.itemID > 0).map(i => ({
        id: i.itemID,
        name: i.displayName
      })),
      kda: [p.scores?.kills || 0, p.scores?.deaths || 0, p.scores?.assists || 0],
      cs: p.scores?.creepScore || 0,
      status: judgeStatus(p.scores, gamePhase),
      estimatedGold: estimateGold(p),
      isDead: p.isDead || false,
      respawnTimer: p.respawnTimer || 0,
      hasTP: (p.summonerSpells?.summonerSpellOne?.displayName === 'テレポート' ||
              p.summonerSpells?.summonerSpellTwo?.displayName === 'テレポート' ||
              p.summonerSpells?.summonerSpellOne?.displayName === 'Teleport' ||
              p.summonerSpells?.summonerSpellTwo?.displayName === 'Teleport') || false
    })

    return {
      gameTime,
      gamePhase,
      situation,
      killDiff,
      me: {
        champion: me.championName,
        enName: meEnName,
        position: myPosition,
        level: me.level,
        items: myItems.map(i => ({ id: i.itemID, name: i.displayName })),
        kda: [me.scores?.kills || 0, me.scores?.deaths || 0, me.scores?.assists || 0],
        cs: me.scores?.creepScore || 0,
        gold: activePlayer?.currentGold || 0,
        status: judgeStatus(me.scores, gamePhase),
        estimatedGold: estimateGold(me),
        isDead: me.isDead || false,
        respawnTimer: me.respawnTimer || 0,
        hasTP: (me.summonerSpells?.summonerSpellOne?.displayName === 'テレポート' ||
                me.summonerSpells?.summonerSpellTwo?.displayName === 'テレポート' ||
                me.summonerSpells?.summonerSpellOne?.displayName === 'Teleport' ||
                me.summonerSpells?.summonerSpellTwo?.displayName === 'Teleport') || false,
        ultReady: (activePlayer?.abilities?.R?.abilityLevel || 0) > 0
      },
      allies: allies.map(buildPlayerInfo),
      enemies: enemies.map(buildPlayerInfo),
      enemy: {
        kills: enemyKills,
        estimatedGold: enemyEstimatedGold,
        damageProfile,
        healerCount,
        ccLevel,
        fedPlayers: enemyFedPlayers,
        behindPlayers: enemyBehindPlayers,
        threats,
        composition: enemyComposition
      },
      ally: {
        kills: allyKills,
        estimatedGold: allyEstimatedGold,
        composition: allyComposition,
        hasEngager,
        hasFrontline,
        damageBalance,
        fedPlayers: allyFedPlayers
      },
      objectives,
      laneState,
      towers: buildTowerStatus(events, myTeam)
    }
  }

  // === 機能別入力構築 ===

  /**
   * アイテム推薦AI用の入力JSONを構築する
   * @param {object} gameState - buildGameStateの戻り値
   * @param {Array} coreBuild - コアビルドアイテムリスト [{ id, name, ... }]
   * @param {Array} substituteItems - 入れ替え候補アイテム [{ id, name, ... }]
   * @returns {object} アイテム推薦用入力JSON
   */
  buildItemInput(gameState, coreBuild, substituteItems) {
    coreBuild = coreBuild || []
    substituteItems = substituteItems || []

    const ownedItemIds = new Set(gameState.me.items.map(i => String(i.id)))
    const candidates = []

    // 1. コアビルド未購入品（最大2個、tag: "core"）
    let coreCount = 0
    for (const item of coreBuild) {
      if (coreCount >= 2) break
      const itemId = String(item.id || item.itemId)
      if (ownedItemIds.has(itemId)) continue
      const patchItem = getItemById(itemId)
      const effect = patchItem
        ? (patchItem.fullDesc || patchItem.description || '').substring(0, 80)
        : ''
      candidates.push({ id: itemId, name: patchItem?.jaName || item.name || itemId, effect, tag: 'core' })
      coreCount++
    }

    // 2. カウンターアイテム（敵構成に対する対策品、最大2個、tag: "counter"）
    let counterCount = 0
    const counterCandidateIds = new Set()

    // AP比率30%以上 → MR系アイテムを候補に追加
    if (gameState.enemy.damageProfile.ap >= 30) {
      // 3111=マーキュリーブーツ(MR), 3139=QSS系(MR), 3156=マウ=モータス(MR)
      for (const id of ['3111', '3139', '3156']) {
        if (!ownedItemIds.has(id)) counterCandidateIds.add(id)
      }
    }
    // ヒーラー2体以上 → 重傷アイテム
    if (gameState.enemy.healerCount >= 2) {
      for (const id of (COUNTER_ITEMS.healer || [])) {
        if (!ownedItemIds.has(id)) counterCandidateIds.add(id)
      }
    }
    // CCレベルhigh → QSS/マーキュリー
    if (gameState.enemy.ccLevel === 'high') {
      for (const id of (COUNTER_ITEMS.cc || [])) {
        if (!ownedItemIds.has(id)) counterCandidateIds.add(id)
      }
    }

    // AP<30% → MRアイテムを候補から除外、AD<30% → アーマーアイテムを候補から除外
    const MR_ITEM_IDS = new Set(['3111', '3139', '3156', '3065', '3190', '3222', '3105'])
    const ARMOR_ITEM_IDS = new Set(['3075', '3143', '3742', '3047', '3110', '3082'])
    const apPct = gameState.enemy.damageProfile.ap
    const adPct = gameState.enemy.damageProfile.ad

    for (const id of counterCandidateIds) {
      if (counterCount >= 2) break
      // 既にcoreで追加済みなら除外
      if (candidates.some(c => c.id === id)) continue
      // ダメージプロファイルに基づくフィルタ
      if (apPct < 30 && MR_ITEM_IDS.has(id)) continue
      if (adPct < 30 && ARMOR_ITEM_IDS.has(id)) continue
      const patchItem = getItemById(id)
      if (!patchItem) continue
      const effect = (patchItem.fullDesc || patchItem.description || '').substring(0, 80)
      candidates.push({ id, name: patchItem.jaName || id, effect, tag: 'counter' })
      counterCount++
    }

    // 3. 残りからsituational（最大1個、tag: "situational"）
    if (candidates.length < 5) {
      for (const item of substituteItems) {
        const itemId = String(item.id || item.itemId)
        if (ownedItemIds.has(itemId)) continue
        if (candidates.some(c => c.id === itemId)) continue
        const patchItem = getItemById(itemId)
        if (!patchItem) continue
        const effect = (patchItem.fullDesc || patchItem.description || '').substring(0, 80)
        candidates.push({ id: itemId, name: patchItem.jaName || item.name || itemId, effect, tag: 'situational' })
        break
      }
    }

    // 最大5個に制限
    const finalCandidates = candidates.slice(0, 5)

    // enemy_healing判定（設計書: 2=needed, 3=required）
    let enemyHealing = 'none'
    if (gameState.enemy.healerCount >= 3) enemyHealing = 'required'
    else if (gameState.enemy.healerCount >= 2) enemyHealing = 'needed'

    return {
      me: {
        champion: gameState.me.champion,
        role: gameState.me.position,
        level: gameState.me.level,
        items: gameState.me.items,
        gold: gameState.me.gold,
        status: gameState.me.status
      },
      enemy_damage_profile: gameState.enemy.damageProfile,
      enemy_healing: enemyHealing,
      enemy_threats: gameState.enemy.threats,
      situation: gameState.situation,
      candidates: finalCandidates,
      core_build: coreBuild.map(item => ({
        id: String(item.id || item.itemId),
        name: item.name || item.jaName || ''
      })),
      previous_advice: this.previousItemAdvice
    }
  }

  /**
   * マクロアドバイスAI用の入力JSONを構築する
   * @param {object} gameState - buildGameStateの戻り値
   * @param {Array} events - ゲームイベント配列
   * @returns {object} マクロアドバイス用入力JSON
   */
  buildMacroInput(gameState, events) {
    events = events || []
    const actionCandidates = []

    const timers = gameState.objectives.timers
    const available = gameState.objectives._available

    // 1. オブジェクト取得可能
    if (available.includes('ドラゴン')) {
      actionCandidates.push({ action: 'dragon_secure', reason: 'ドラゴンが取得可能', priority: 1 })
    }
    if (available.includes('バロン')) {
      actionCandidates.push({ action: 'baron_secure', reason: 'バロンが取得可能', priority: 1 })
    }

    // 2. オブジェクト準備中（90秒以内にスポーン）
    if (timers.dragon > 0 && timers.dragon <= 90) {
      actionCandidates.push({ action: 'dragon_prep', reason: `ドラゴンまであと${timers.dragon}秒`, priority: 2 })
    }
    if (timers.baron > 0 && timers.baron <= 90) {
      actionCandidates.push({ action: 'baron_prep', reason: `バロンまであと${timers.baron}秒`, priority: 2 })
    }

    // 3. 人数有利（敵の死亡状態から判定）
    const gameTime = gameState.gameTime
    const deadEnemyCount = gameState.enemies.filter(e => e.isDead).length
    const deadAllyCount = gameState.allies.filter(a => a.isDead).length + (gameState.me.isDead ? 1 : 0)
    const numberAdvantage = deadEnemyCount - deadAllyCount
    if (numberAdvantage >= 1 && !gameState.me.isDead) {
      actionCandidates.push({ action: 'push_tower', reason: `敵${deadEnemyCount}人デス中 - タワーを押す`, priority: 3 })
      if (numberAdvantage >= 2) {
        actionCandidates.push({ action: 'invade', reason: `敵${deadEnemyCount}人デス中 - インベイド`, priority: 3 })
      }
    }

    // 4. デフォルトアクション（戦況に応じて）
    if (actionCandidates.length === 0) {
      if (gameState.situation === 'behind') {
        actionCandidates.push({ action: 'farm', reason: '劣勢時はファームで追いつく', priority: 4 })
        actionCandidates.push({ action: 'ward', reason: '視界を確保して安全にプレイ', priority: 4 })
      } else if (gameState.situation === 'ahead') {
        actionCandidates.push({ action: 'push_tower', reason: '優勢を活かしてタワーを押す', priority: 4 })
        actionCandidates.push({ action: 'split_push', reason: 'サイドレーン圧力をかける', priority: 4 })
      } else {
        actionCandidates.push({ action: 'farm', reason: 'CSを稼いでアイテム差をつける', priority: 4 })
        actionCandidates.push({ action: 'ward', reason: '視界確保で情報有利を作る', priority: 4 })
        actionCandidates.push({ action: 'recall', reason: 'アイテムを完成させる', priority: 4 })
      }
    }

    // 優先度順にソートし最大3個
    actionCandidates.sort((a, b) => a.priority - b.priority)
    const topActions = actionCandidates.slice(0, 3)

    // 味方/敵のプレイヤー概要（マクロ判断用にコンパクトに）
    const buildMacroPlayer = (p) => {
      const info = { champion: p.champion, role: p.position, level: p.level, status: p.status }
      if (p.isDead) {
        info.isDead = true
        if (p.respawnTimer > 0) info.respawnIn = Math.ceil(p.respawnTimer)
      }
      if (p.hasTP) info.hasTP = true
      return info
    }

    // 敵のbehindプレイヤー名一覧
    const enemyBehind = gameState.enemy.behindPlayers
      ?.map(p => p.champion || p.enName)
      .filter(Boolean) || []

    return {
      game_time: gameState.gameTime,
      me: {
        champion: gameState.me.champion,
        role: gameState.me.position,
        level: gameState.me.level,
        kda: gameState.me.kda,
        cs: gameState.me.cs,
        gold: gameState.me.gold,
        status: gameState.me.status,
        isDead: gameState.me.isDead,
        hasTP: gameState.me.hasTP,
        ultReady: gameState.me.ultReady
      },
      game_phase: gameState.gamePhase,
      situation: gameState.situation,
      kill_diff: gameState.killDiff,
      gold_diff: gameState.ally.estimatedGold - gameState.enemy.estimatedGold,
      allies: gameState.allies.map(buildMacroPlayer),
      enemies: gameState.enemies.map(buildMacroPlayer),
      objectives: {
        dragon: gameState.objectives.dragon,
        baron: gameState.objectives.baron,
        herald: gameState.objectives.herald,
        voidgrub: gameState.objectives.voidgrub,
        buffs: gameState.objectives.buffs
      },
      towers: gameState.towers,
      lane_state: gameState.laneState,
      ally_composition: gameState.ally.composition,
      ally_has_engager: gameState.ally.hasEngager,
      ally_has_frontline: gameState.ally.hasFrontline,
      enemy_composition: gameState.enemy.composition,
      enemy_threats: gameState.enemy.threats,
      enemy_behind: enemyBehind.length > 0 ? enemyBehind : undefined,
      ally_fed: gameState.ally.fedPlayers?.length > 0
        ? gameState.ally.fedPlayers.map(p => p.champion || p.enName || p).filter(Boolean)
        : undefined,
      action_candidates: topActions,
      previous_advice: this.previousMacroAdvice
    }
  }

  /**
   * マッチアップTip AI用の入力JSONを構築する
   * @param {object} gameState - buildGameStateの戻り値
   * @param {object} spellData - getSpells()から取得したスペルデータ（opponent用）
   * @returns {object} マッチアップ用入力JSON
   */
  buildMatchupInput(gameState, spellData) {
    // 対面チャンプ（同じロールの敵）を特定
    const myPosition = gameState.me.position
    let opponent = null
    for (const e of gameState.enemies) {
      if (normalizePosition(e.position) === myPosition) {
        opponent = e
        break
      }
    }

    // 対面が見つからなければ最初の敵を使う
    if (!opponent && gameState.enemies.length > 0) {
      opponent = gameState.enemies[0]
    }

    if (!opponent) {
      return {
        me: { champion: gameState.me.champion, role: gameState.me.position, skills: null },
        opponent: null,
        matchup_difficulty: 'unknown'
      }
    }

    // 両チャンプのスキルデータを取得
    const mySpells = getSpells(gameState.me.enName)
    const opponentEnName = opponent.enName
    const opSpells = spellData || getSpells(opponentEnName)

    // スキルを整形するヘルパー
    const formatSkills = (spells) => {
      if (!spells) return null
      return {
        passive: { name: spells.passive.name, desc: spells.passive.desc },
        spells: spells.spells.map(s => ({ key: s.key, name: s.name, desc: s.desc }))
      }
    }

    // 対面スキルからカウンタータグを抽出
    const CC_REGEX = /スタン|スネア|ノックアップ|ノックバック|サイレンス|フィアー|拘束|束縛|打ち上げ|引き寄せ|チャーム|魅了|挑発|スリープ|変身させ|サプレッション|エアボーン/
    const counterTags = []
    if (opSpells) {
      const allText = [opSpells.passive.desc, ...opSpells.spells.map(s => s.desc)].join(' ')
      if (CC_REGEX.test(allText)) counterTags.push('CC')
      if (/ダメージ.*大|バースト|即死|一撃/.test(allText)) counterTags.push('burst')
      if (/回復|ヒール|ライフスティール/.test(allText)) counterTags.push('sustain')
      if (/シールド/.test(allText)) counterTags.push('shield')
    }

    // パワースパイク推定（タグベース）
    const champMap = getAllChampions() || {}
    const champ = Object.values(champMap).find(c => c.enName === opponentEnName)
    const tags = champ?.tags || []
    const powerSpikes = []
    if (tags.includes('Assassin')) powerSpikes.push('Lv2(EQ)', 'Lv6(R)', '1アイテム')
    else if (tags.includes('Mage')) powerSpikes.push('Lv3(QWE)', 'Lv6(R)', '2アイテム')
    else if (tags.includes('Fighter')) powerSpikes.push('Lv2', 'Lv6(R)', '1-2アイテム')
    else if (tags.includes('Tank')) powerSpikes.push('Lv3', 'Lv6(R)', '2アイテム')
    else if (tags.includes('Marksman')) powerSpikes.push('Lv2', '1アイテム', '3アイテム')
    else powerSpikes.push('Lv2', 'Lv6(R)', '2アイテム')

    return {
      me: {
        champion: gameState.me.champion,
        role: gameState.me.position,
        skills: formatSkills(mySpells)
      },
      opponent: {
        champion: opponent.champion,
        role: opponent.position,
        skills: formatSkills(opSpells),
        power_spikes: powerSpikes,
        counter_tags: counterTags,
      },
      matchup_difficulty: 'medium'
    }
  }

  /**
   * 試合後コーチングAI用の入力JSONを構築する
   * @param {object} gameState - buildGameStateの戻り値
   * @param {Array} gameLog - recordSnapshotで蓄積されたスナップショット
   * @param {Array} coreBuild - コアビルド
   * @param {Array} events - ゲームイベント配列
   * @returns {object} コーチング用入力JSON
   */
  buildCoachingInput(gameState, gameLog, coreBuild, events) {
    gameLog = gameLog || this.gameLog
    coreBuild = coreBuild || []
    events = events || []

    // フェーズ別CS/min推移
    const csPerPhase = { early: 0, mid: 0, late: 0 }
    const phaseSnapshots = { early: [], mid: [], late: [] }
    for (const snap of gameLog) {
      const phase = getGamePhase(snap.timestamp)
      phaseSnapshots[phase].push(snap)
    }
    for (const phase of ['early', 'mid', 'late']) {
      const snaps = phaseSnapshots[phase]
      if (snaps.length >= 2) {
        const first = snaps[0]
        const last = snaps[snaps.length - 1]
        const timeDiff = (last.timestamp - first.timestamp) / 60
        if (timeDiff > 0) {
          csPerPhase[phase] = Math.round((last.cs - first.cs) / timeDiff * 10) / 10
        }
      }
    }

    // KDA推移（フェーズ別）
    const kdaPerPhase = { early: null, mid: null, late: null }
    for (const phase of ['early', 'mid', 'late']) {
      const snaps = phaseSnapshots[phase]
      if (snaps.length > 0) {
        const last = snaps[snaps.length - 1]
        kdaPerPhase[phase] = [...last.kda]
      }
    }

    // ビルドパス復元（完成品のみ — コンポーネントは除外してトークン節約）
    const buildPath = []
    let prevItems = new Set()
    for (const snap of gameLog) {
      const currentItems = new Set(snap.items.map(i => String(i.id || i)))
      for (const item of currentItems) {
        if (!prevItems.has(item)) {
          const patchItem = getItemById(item)
          // 完成品のみ記録（コンポーネント・消耗品を除外）
          if (patchItem && isCompletedItem(patchItem)) {
            buildPath.push({
              time: snap.timestamp,
              name: patchItem.jaName || item
            })
          }
        }
      }
      prevItems = currentItems
    }

    // コアビルド一致率
    const coreBuildIds = coreBuild.map(item => String(item.id || item.itemId))
    const ownedIds = gameState.me.items.map(i => String(i.id))
    const matchCount = coreBuildIds.filter(id => ownedIds.includes(id)).length
    const coreMatchRate = coreBuildIds.length > 0
      ? Math.round(matchCount / coreBuildIds.length * 100)
      : 0

    // オブジェクト参加推定（イベントログから）
    const objectiveEvents = classifyObjectiveEvents(events)
    const objectiveParticipation = {
      dragon: objectiveEvents.dragon.length,
      baron: objectiveEvents.baron.length,
      herald: objectiveEvents.herald.length,
      voidgrub: objectiveEvents.voidgrub.length
    }

    return {
      me: {
        champion: gameState.me.champion,
        role: gameState.me.position,
        level: gameState.me.level,
        kda: gameState.me.kda,
        cs: gameState.me.cs,
        items: gameState.me.items,
        status: gameState.me.status
      },
      game_duration: gameState.gameTime,
      game_phase_final: gameState.gamePhase,
      situation_final: gameState.situation,
      cs_per_phase: csPerPhase,
      kda_per_phase: kdaPerPhase,
      build_path: buildPath,
      core_match_rate: coreMatchRate,
      objective_participation: objectiveParticipation,
      kill_diff_final: gameState.killDiff,
      snapshot_count: gameLog.length,
      // 設計書9.2.3: コーチングに必要なフィールド (○)
      enemy_damage_profile: gameState.enemy.damageProfile,
      enemy_threats: gameState.enemy.threats,
      enemy_healer_count: gameState.enemy.healerCount,
      ally_composition: gameState.ally.composition,
      enemy_composition: gameState.enemy.composition,
      // 対面チャンプ（同ロールの敵）
      lane_opponent: (() => {
        const myPos = gameState.me.position
        const opp = gameState.enemies.find(e => normalizePosition(e.position) === myPos)
        return opp ? { champion: opp.champion, kda: opp.kda, level: opp.level } : null
      })()
    }
  }

  // === 試合ログ蓄積 ===

  /**
   * 60秒間隔でゲーム状態のスナップショットを蓄積する
   * @param {object} gameState - buildGameStateの戻り値
   * @param {number} gameTimeSec - ゲーム経過秒数
   */
  recordSnapshot(gameState, gameTimeSec) {
    if (gameTimeSec - this.lastSnapshotTime < 60) return
    this.lastSnapshotTime = gameTimeSec
    this.gameLog.push({
      timestamp: gameTimeSec,
      kda: [...gameState.me.kda],
      cs: gameState.me.cs,
      items: gameState.me.items.map(i => ({ id: i.id, name: i.name })),
      level: gameState.me.level
    })
  }

  // === 前回出力の保存 ===

  setItemAdvice(advice) { this.previousItemAdvice = advice }
  setMacroAdvice(advice) { this.previousMacroAdvice = advice }

  // === リセット ===

  reset() {
    this.previousItemAdvice = null
    this.previousMacroAdvice = null
    this.gameLog = []
    this.lastSnapshotTime = 0
  }
}

module.exports = { Preprocessor }
