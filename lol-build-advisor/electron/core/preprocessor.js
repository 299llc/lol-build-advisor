// 前処理層: 生のgameDataから構造化GameStateを構築し、機能別の入力JSONを生成する
const { extractEnName } = require('../api/contextBuilder')
const { getItemById, getAllChampions, getSpells } = require('../api/patchData')
const { extractTraits, detectFlags } = require('./championAnalysis')
const { objectiveStatus, getAvailableObjectiveNames, getObjectiveTimers } = require('./objectiveTracker')
const { OBJECTIVES, classifyObjectiveEvents, COUNTER_ITEMS } = require('./config')
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
 */
function judgeStatus(scores) {
  const kills = scores?.kills || 0
  const deaths = scores?.deaths || 0
  if (kills >= 5 && kills > deaths * 2) return 'fed'
  if (deaths >= 5 && deaths > kills * 2) return 'behind'
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
   * @returns {object} GameState
   */
  buildGameState(gameData, events) {
    const { activePlayer, allPlayers, gameData: gd } = gameData
    const gameTime = gd?.gameTime || 0
    events = events || []

    // プレイヤー分離
    const me = findMe(activePlayer, allPlayers)
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
    const fedPlayers = []
    const behindPlayers = []
    for (const e of enemies) {
      const status = judgeStatus(e.scores)
      const enName = extractEnName(e)
      const playerInfo = {
        champion: e.championName,
        enName,
        position: normalizePosition(e.position),
        level: e.level,
        kda: [e.scores?.kills || 0, e.scores?.deaths || 0, e.scores?.assists || 0]
      }
      if (status === 'fed') fedPlayers.push(playerInfo)
      if (status === 'behind') behindPlayers.push(playerInfo)
    }

    // threats: fedかつダメージタイプが明確な敵
    const threats = fedPlayers.map(fp => {
      const champMap = getAllChampions() || {}
      const champ = Object.values(champMap).find(c => c.enName === fp.enName)
      const tags = champ?.tags || []
      let damageType = 'mixed'
      if (tags.includes('Marksman') || tags.includes('Assassin')) damageType = 'AD'
      if (tags.includes('Mage')) damageType = 'AP'
      return { ...fp, damageType }
    })

    // 構成タイプ推定
    const allyComposition = estimateComposition([me, ...allies])
    const enemyComposition = estimateComposition(enemies)

    // オブジェクト情報
    const classified = classifyObjectiveEvents(events)
    const objectives = {
      dragon: {
        status: objectiveStatus('ドラゴン', OBJECTIVES.dragon, classified.dragon, gameTime),
        kills: classified.dragon.length
      },
      baron: {
        status: objectiveStatus('バロン', OBJECTIVES.baron, classified.baron, gameTime),
        kills: classified.baron.length
      },
      herald: {
        status: objectiveStatus('ヘラルド', OBJECTIVES.herald, classified.herald, gameTime),
        kills: classified.herald.length
      },
      voidgrub: {
        status: objectiveStatus('ヴォイドグラブ', OBJECTIVES.voidgrub, classified.voidgrub, gameTime),
        kills: classified.voidgrub.length
      },
      timers: getObjectiveTimers(events, gameTime),
      available: getAvailableObjectiveNames(events, gameTime)
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
      status: judgeStatus(p.scores),
      estimatedGold: estimateGold(p)
    })

    return {
      gameTime,
      gamePhase,
      situation,
      killDiff,
      allyKills,
      enemyKills,
      me: {
        champion: me.championName,
        enName: meEnName,
        position: myPosition,
        level: me.level,
        items: myItems.map(i => ({ id: i.itemID, name: i.displayName })),
        kda: [me.scores?.kills || 0, me.scores?.deaths || 0, me.scores?.assists || 0],
        cs: me.scores?.creepScore || 0,
        gold: activePlayer?.currentGold || 0,
        status: judgeStatus(me.scores),
        estimatedGold: estimateGold(me)
      },
      allies: allies.map(buildPlayerInfo),
      enemies: enemies.map(buildPlayerInfo),
      enemy: {
        damageProfile,
        healerCount,
        ccLevel,
        fedPlayers,
        behindPlayers,
        threats,
        composition: enemyComposition
      },
      ally: {
        composition: allyComposition
      },
      objectives,
      laneState: { top: 'unknown', mid: 'unknown', bot: 'unknown' }
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

    // AP比率60%以上 → MR系アイテム
    if (gameState.enemy.damageProfile.ap >= 60) {
      // MR系アイテムをCOUNTER_ITEMSから直接取得できないので、cc用のMRアイテムを流用
      // 3111=マーキュリーブーツ(MR), 3139=QSS系(MR)
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

    for (const id of counterCandidateIds) {
      if (counterCount >= 2) break
      // 既にcoreで追加済みなら除外
      if (candidates.some(c => c.id === id)) continue
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

    // enemy_healing判定
    let enemyHealing = 'none'
    if (gameState.enemy.healerCount >= 2) enemyHealing = 'required'
    else if (gameState.enemy.healerCount >= 1) enemyHealing = 'needed'

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
    const available = gameState.objectives.available

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

    // 3. 人数有利（最近のキルイベントで敵デス中）
    const gameTime = gameState.gameTime
    const recentKills = events.filter(e =>
      e.EventName === 'ChampionKill' && (gameTime - (e.EventTime || 0)) < 30
    )
    // 味方キル数 vs 敵キル数（直近30秒）
    const recentAllyKills = recentKills.filter(e => {
      // KillerNameがalliesかmeなら味方キル
      return true // イベントからチーム判定は難しいのでキル差から推定
    }).length
    if (gameState.killDiff > 0 && recentKills.length > 0) {
      actionCandidates.push({ action: 'push_tower', reason: '人数有利の可能性 - タワーを押す', priority: 3 })
      actionCandidates.push({ action: 'invade', reason: '人数有利の可能性 - インベイド', priority: 3 })
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

    return {
      me: {
        champion: gameState.me.champion,
        role: gameState.me.position,
        level: gameState.me.level,
        status: gameState.me.status
      },
      game_phase: gameState.gamePhase,
      situation: gameState.situation,
      kill_diff: gameState.killDiff,
      objectives: {
        dragon: gameState.objectives.dragon,
        baron: gameState.objectives.baron
      },
      lane_state: gameState.laneState,
      ally_composition: gameState.ally.composition,
      enemy_threats: gameState.enemy.threats,
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
        me: { champion: gameState.me.champion, role: gameState.me.position },
        opponent: null,
        matchup_difficulty: 'unknown'
      }
    }

    // スペルデータから危険スキル等を構造化
    const opponentEnName = opponent.enName
    const opSpells = spellData || getSpells(opponentEnName)
    const CC_REGEX = /スタン|スネア|ノックアップ|ノックバック|サイレンス|フィアー|拘束|束縛|打ち上げ|引き寄せ|チャーム|魅了|挑発|スリープ|変身させ|サプレッション|エアボーン/
    const BURST_REGEX = /ダメージ.*大|バースト|即死|一撃/

    const dangerSkills = []
    const counterTags = []

    if (opSpells) {
      for (const spell of opSpells.spells) {
        // CCやバーストを持つスキルを危険スキルとして収集
        if (CC_REGEX.test(spell.desc) || BURST_REGEX.test(spell.desc)) {
          dangerSkills.push({
            key: spell.key,
            name: spell.name,
            desc: (spell.desc || '').substring(0, 60)
          })
        }
      }
      // カウンタータグ推定
      const allText = [opSpells.passive.desc, ...opSpells.spells.map(s => s.desc)].join(' ')
      if (CC_REGEX.test(allText)) counterTags.push('CC')
      if (BURST_REGEX.test(allText)) counterTags.push('burst')
      if (/回復|ヒール|ライフスティール/.test(allText)) counterTags.push('sustain')
      if (/シールド/.test(allText)) counterTags.push('shield')
    }

    // パワースパイク推定
    const powerSpikes = []
    const champMap = getAllChampions() || {}
    const champ = Object.values(champMap).find(c => c.enName === opponentEnName)
    const tags = champ?.tags || []
    if (tags.includes('Assassin')) {
      powerSpikes.push('Lv2(EQ)', 'Lv6(R)', '1アイテム')
    } else if (tags.includes('Mage')) {
      powerSpikes.push('Lv3(QWE)', 'Lv6(R)', '2アイテム')
    } else if (tags.includes('Fighter')) {
      powerSpikes.push('Lv2', 'Lv6(R)', '1-2アイテム')
    } else if (tags.includes('Tank')) {
      powerSpikes.push('Lv3', 'Lv6(R)', '2アイテム')
    } else if (tags.includes('Marksman')) {
      powerSpikes.push('Lv2', '1アイテム', '3アイテム')
    } else {
      powerSpikes.push('Lv2', 'Lv6(R)', '2アイテム')
    }

    // トレードパターン推定
    let tradePattern = ''
    if (tags.includes('Assassin')) tradePattern = 'バーストコンボで一気にキル狙い'
    else if (tags.includes('Mage')) tradePattern = 'スキルでポークしつつCDを待ってトレード'
    else if (tags.includes('Fighter')) tradePattern = 'AA交えたショートトレードor長期戦'
    else if (tags.includes('Tank')) tradePattern = 'CCからのダメージ交換、長期戦有利'
    else if (tags.includes('Marksman')) tradePattern = 'AAメインでポジション管理重視'
    else tradePattern = 'スキルとAA組み合わせのトレード'

    // 弱点推定
    let weakness = ''
    if (tags.includes('Assassin')) weakness = 'CCに弱い、集団戦で不利、序盤しのげばスケール差'
    else if (tags.includes('Mage')) weakness = 'CDが長い、機動力低め、近距離に弱い'
    else if (tags.includes('Fighter')) weakness = 'カイトに弱い、レンジ差で不利'
    else if (tags.includes('Tank')) weakness = '火力が低い、ダメージを無視して他を狙える'
    else if (tags.includes('Marksman')) weakness = '防御が薄い、CCで簡単に倒せる'
    else weakness = '弱点はチャンピオン固有'

    return {
      me: { champion: gameState.me.champion, role: gameState.me.position },
      opponent: {
        champion: opponent.champion,
        role: opponent.position,
        danger_skills: dangerSkills,
        power_spikes: powerSpikes,
        trade_pattern: tradePattern,
        counter_tags: counterTags,
        weakness
      },
      matchup_difficulty: 'medium' // 統計データがないためデフォルト
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

    // ビルドパス復元（アイテム購入順序）
    const buildPath = []
    let prevItems = new Set()
    for (const snap of gameLog) {
      const currentItems = new Set(snap.items.map(i => String(i.id || i)))
      for (const item of currentItems) {
        if (!prevItems.has(item)) {
          const patchItem = getItemById(item)
          buildPath.push({
            time: snap.timestamp,
            id: item,
            name: patchItem?.jaName || item
          })
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
      snapshot_count: gameLog.length
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
