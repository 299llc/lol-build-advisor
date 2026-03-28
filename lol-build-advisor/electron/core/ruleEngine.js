/**
 * ルールベースアラートエンジン
 * LLM を使わずに、ゲームデータからルールベースで即座にアラートを生成する
 * ローカルLLM が遅い場合のフォールバック＋補完として機能
 */
const { OBJECTIVES, classifyObjectiveEvents } = require('./config')

// CS 基準値 (分あたり): Bronze〜Gold帯の目安
const CS_BENCHMARKS = {
  TOP: 7.0, JG: 5.5, MID: 7.5, ADC: 8.0, SUP: 1.0,
}

// ワードスコア基準値 (分あたり)
const WARD_BENCHMARKS = {
  TOP: 0.5, JG: 0.7, MID: 0.5, ADC: 0.4, SUP: 1.2,
}

// リコール用アイテムコンポーネント金額の目安
const RECALL_GOLD_HINTS = [
  { gold: 3000, label: '完成アイテム' },
  { gold: 1300, label: 'ロングソード系コンポーネント' },
  { gold: 1100, label: 'コンポーネント' },
  { gold: 875, label: 'コンポーネント' },
]

class RuleEngine {
  constructor() {
    this.lastAlerts = []
    this.lastDeathTime = 0
    this.lastCSWarnTime = 0
    this.deathCount = 0
    this.csWarnCount = 0
    this.lastRecallHintTime = 0
    this.lastWardWarnTime = 0
    this.lastNumAdvantageTime = 0
    this.lastTeamfightKillCount = 0
    this.lastTeamfightAlertTime = 0
  }

  /**
   * ゲームデータからルールベースのアラートを生成
   * @param {object} gameData - Live Client Data API のレスポンス
   * @param {string} position - TOP/JG/MID/ADC/SUP
   * @returns {Array<{type: string, priority: number, title: string, desc: string, warning?: string}>}
   */
  evaluate(gameData, position) {
    const alerts = []
    const gameTime = gameData.gameData?.gameTime || 0
    const minutes = gameTime / 60

    const ap = gameData.activePlayer
    const allPlayers = gameData.allPlayers || []
    const me = allPlayers.find(p =>
      p.summonerName === ap?.summonerName ||
      p.riotIdGameName === ap?.riotIdGameName
    ) || allPlayers[0]

    if (!me) return alerts

    const myTeam = me.team
    const allies = allPlayers.filter(p => p.team === myTeam && p !== me)
    const enemies = allPlayers.filter(p => p.team !== myTeam)

    // 1. CS 監視
    const csAlert = this._checkCS(me, minutes, position)
    if (csAlert) alerts.push(csAlert)

    // 2. オブジェクトタイマーアラート
    const objAlerts = this._checkObjectives(gameData, gameTime)
    alerts.push(...objAlerts)

    // 3. デス後アドバイス
    const deathAlert = this._checkDeath(me, gameTime, enemies)
    if (deathAlert) alerts.push(deathAlert)

    // 4. 金差 / レベル差アラート
    const goldAlert = this._checkGoldAdvantage(me, enemies, gameTime)
    if (goldAlert) alerts.push(goldAlert)

    // 5. キルストリーク/シャットダウン警告
    const streakAlert = this._checkKillStreak(me, enemies)
    if (streakAlert) alerts.push(streakAlert)

    // 6. タワープレート終了警告 (14:00)
    const plateAlert = this._checkTowerPlates(gameTime)
    if (plateAlert) alerts.push(plateAlert)

    // 7. 数的有利アラート
    const numAlert = this._checkNumericalAdvantage(allies, enemies, gameTime)
    if (numAlert) alerts.push(numAlert)

    // 8. リコールタイミング
    const recallAlert = this._checkRecallTiming(gameData, gameTime)
    if (recallAlert) alerts.push(recallAlert)

    // 9. ワードスコア警告
    const wardAlert = this._checkWardScore(me, minutes, position)
    if (wardAlert) alerts.push(wardAlert)

    // 10. 集団戦勝利→プッシュ促し
    const teamfightAlert = this._checkTeamfightWin(gameData, allies, me, gameTime)
    if (teamfightAlert) alerts.push(teamfightAlert)

    // 優先度でソート (高い方が先)
    alerts.sort((a, b) => b.priority - a.priority)

    this.lastAlerts = alerts
    return alerts
  }

  _checkCS(me, minutes, position) {
    if (position === 'SUP') return null // サポートはCS不要
    if (minutes < 3) return null // 序盤はスキップ
    // 60秒に1回まで
    const now = Date.now()
    if (now - this.lastCSWarnTime < 60000) return null

    const cs = me.scores?.creepScore || 0
    const benchmark = CS_BENCHMARKS[position] || 7.0
    const expectedCS = benchmark * minutes
    const ratio = cs / expectedCS

    if (ratio < 0.6) {
      this.lastCSWarnTime = now
      this.csWarnCount++
      return {
        type: 'cs_critical',
        priority: 7,
        title: 'CS改善が急務',
        desc: `CS ${cs} / ${Math.round(expectedCS)}目安 (${(ratio * 100).toFixed(0)}%)。ミニオンを逃さないよう意識しよう`,
        warning: 'CSが低いとアイテム差が開き、戦闘で不利になる',
      }
    }

    if (ratio < 0.75) {
      this.lastCSWarnTime = now
      return {
        type: 'cs_warning',
        priority: 4,
        title: 'CS意識',
        desc: `CS ${cs} / ${Math.round(expectedCS)}目安。サイドウェーブを回収しよう`,
      }
    }

    return null
  }

  _checkObjectives(gameData, gameTime) {
    const alerts = []
    const events = gameData.events?.Events || []
    const { dragon, baron, herald, voidgrub } = classifyObjectiveEvents(events)

    // ドラゴン
    const dragonAlert = this._objectiveAlert('ドラゴン', OBJECTIVES.dragon, dragon, gameTime, dragon.length)
    if (dragonAlert) alerts.push(dragonAlert)

    // バロン
    const baronAlert = this._objectiveAlert('バロン', OBJECTIVES.baron, baron, gameTime)
    if (baronAlert) alerts.push(baronAlert)

    // ヘラルド
    if (gameTime < (OBJECTIVES.herald.end || Infinity)) {
      const heraldAlert = this._objectiveAlert('ヘラルド', OBJECTIVES.herald, herald, gameTime)
      if (heraldAlert) alerts.push(heraldAlert)
    }

    // ヴォイドグラブ
    if (gameTime < (OBJECTIVES.voidgrub.end || Infinity)) {
      const vgAlert = this._objectiveAlert('ヴォイドグラブ', OBJECTIVES.voidgrub, voidgrub, gameTime)
      if (vgAlert) alerts.push(vgAlert)
    }

    return alerts
  }

  _objectiveAlert(name, config, kills, gameTime, dragonCount) {
    const { firstSpawn, respawn, end } = config

    // 終了済み
    if (end !== undefined && gameTime >= end) return null

    let nextSpawn
    if (kills.length > 0 && respawn) {
      nextSpawn = kills[kills.length - 1].EventTime + respawn
      if (end !== undefined && nextSpawn >= end) return null
    } else if (kills.length === 0) {
      nextSpawn = firstSpawn
    } else {
      return null // 1回限りで討伐済み
    }

    const remaining = nextSpawn - gameTime

    // ドラゴンソウルリーチ (3体討伐済み)
    const isSoulReach = name === 'ドラゴン' && dragonCount >= 3

    if (remaining <= 0) {
      // 取得可能
      const priority = name === 'バロン' ? 9 : isSoulReach ? 10 : 7
      const title = isSoulReach ? 'ドラゴンソウル確保！' : `${name}取得可能`
      return {
        type: `obj_available_${name}`,
        priority,
        title,
        desc: `${name}が取得可能。視界を確保してチームで確保しよう`,
        warning: isSoulReach ? 'ソウル獲得で試合が大きく有利になる' : undefined,
      }
    }

    if (remaining <= 90 && remaining > 60) {
      return {
        type: `obj_soon_${name}`,
        priority: 5,
        title: `${name}スポーン準備`,
        desc: `${name}まで${Math.ceil(remaining)}秒。ワード設置・ウェーブ管理を始めよう`,
      }
    }

    if (remaining <= 60 && remaining > 30) {
      return {
        type: `obj_imminent_${name}`,
        priority: 6,
        title: `${name}エリアへ移動`,
        desc: `${name}まで${Math.ceil(remaining)}秒。リコールが必要なら今がラストチャンス`,
      }
    }

    if (remaining <= 30) {
      const priority = name === 'バロン' ? 8 : isSoulReach ? 9 : 7
      return {
        type: `obj_now_${name}`,
        priority,
        title: `${name}周辺に集結`,
        desc: `${name}まで${Math.ceil(remaining)}秒。スイーパーで視界を除去しよう`,
      }
    }

    return null
  }

  _checkDeath(me, gameTime, enemies) {
    const deaths = me.scores?.deaths || 0
    if (deaths <= this.deathCount) return null

    this.deathCount = deaths
    this.lastDeathTime = gameTime

    // 最もfedな敵を特定
    const fedEnemy = enemies.reduce((best, e) => {
      const score = (e.scores?.kills || 0) - (e.scores?.deaths || 0)
      return score > (best?.score || 0) ? { name: e.championName, score } : best
    }, null)

    const warning = fedEnemy && fedEnemy.score >= 3
      ? `${fedEnemy.name}が育っている (${enemies.find(e => e.championName === fedEnemy.name)?.scores?.kills}キル)。単独で戦わないこと`
      : undefined

    return {
      type: 'death',
      priority: 6,
      title: 'デス後の立て直し',
      desc: deaths >= 4
        ? 'デスが多い。安全にファームしてアイテムスパイクを目指そう。無理な戦闘は避けること'
        : 'リスポーン後はウェーブ回収から。焦ってファイトに行かないこと',
      warning,
    }
  }

  _checkGoldAdvantage(me, enemies, gameTime) {
    if (gameTime < 180) return null // 3分未満はスキップ

    // レベル差チェック（対面推定: 同ポジションの敵）
    const myLevel = me.level || 1
    const avgEnemyLevel = enemies.reduce((s, e) => s + (e.level || 1), 0) / (enemies.length || 1)

    if (myLevel >= avgEnemyLevel + 2) {
      return {
        type: 'level_advantage',
        priority: 3,
        title: 'レベル有利を活かそう',
        desc: `Lv${myLevel} (敵平均Lv${Math.round(avgEnemyLevel)})。レベル差がある今、積極的に仕掛けよう`,
      }
    }

    if (myLevel <= avgEnemyLevel - 2) {
      return {
        type: 'level_disadvantage',
        priority: 5,
        title: 'レベル差に注意',
        desc: `Lv${myLevel} (敵平均Lv${Math.round(avgEnemyLevel)})。ファームでレベル差を縮めよう`,
        warning: 'レベル差がある状態での1v1は避けること',
      }
    }

    return null
  }

  _checkKillStreak(me, enemies) {
    const myKills = me.scores?.kills || 0
    const myDeaths = me.scores?.deaths || 0

    // 自分がfedしている時
    if (myKills >= 5 && myDeaths <= 2) {
      return {
        type: 'fed_warning',
        priority: 4,
        title: 'シャットダウンに注意',
        desc: `${myKills}キル中。デスするとシャットダウンゴールドを渡してしまう。無駄なリスクを避けよう`,
      }
    }

    // 敵にfedがいる
    const fedEnemies = enemies.filter(e => (e.scores?.kills || 0) >= 5 && (e.scores?.deaths || 0) <= 2)
    if (fedEnemies.length > 0) {
      const names = fedEnemies.map(e => `${e.championName}(${e.scores.kills}キル)`).join(', ')
      return {
        type: 'enemy_fed',
        priority: 5,
        title: '育った敵に警戒',
        desc: `${names}。集団で対処し、単独では戦わないこと`,
      }
    }

    return null
  }

  _checkTowerPlates(gameTime) {
    const PLATE_END = 840 // 14:00
    const remaining = PLATE_END - gameTime

    if (remaining <= 60 && remaining > 30) {
      return {
        type: 'plate_ending',
        priority: 5,
        title: 'プレート消滅まで約1分',
        desc: 'タワープレートが間もなく消滅。取れるプレートがあれば今のうちに割ろう',
      }
    }

    if (remaining <= 30 && remaining > 0) {
      return {
        type: 'plate_ending',
        priority: 6,
        title: 'プレート消滅間近！',
        desc: `あと${Math.ceil(remaining)}秒でプレート消滅。ラストチャンスを逃すな`,
      }
    }

    return null
  }

  _checkNumericalAdvantage(allies, enemies, gameTime) {
    if (gameTime < 180) return null

    // 90秒に1回まで
    const now = Date.now()
    if (now - this.lastNumAdvantageTime < 90000) return null

    const deadEnemies = enemies.filter(e => e.isDead)
    const deadAllies = allies.filter(a => a.isDead)
    const advantage = deadEnemies.length - deadAllies.length

    if (deadEnemies.length >= 2 && advantage >= 1) {
      this.lastNumAdvantageTime = now
      const names = deadEnemies.map(e => e.championName).join('・')
      return {
        type: 'numerical_advantage',
        priority: 8,
        title: `数的有利！ (${5 - deadEnemies.length}v5)`,
        desc: `${names}が落ちている。オブジェクトやタワーを狙おう`,
      }
    }

    return null
  }

  _checkRecallTiming(gameData, gameTime) {
    if (gameTime < 180) return null

    // 90秒に1回まで
    const now = Date.now()
    if (now - this.lastRecallHintTime < 90000) return null

    const currentGold = gameData.activePlayer?.currentGold || 0
    if (currentGold < 875) return null

    // 最も高い買えるコンポーネントを判定
    const hint = RECALL_GOLD_HINTS.find(h => currentGold >= h.gold)
    if (!hint) return null

    this.lastRecallHintTime = now
    return {
      type: 'recall_timing',
      priority: 4,
      title: 'リコールタイミング',
      desc: `所持ゴールド${currentGold}G — ${hint.label}が購入可能。ウェーブを押してからリコールしよう`,
    }
  }

  _checkWardScore(me, minutes, position) {
    if (minutes < 5) return null

    // 120秒に1回まで
    const now = Date.now()
    if (now - this.lastWardWarnTime < 120000) return null

    const wardScore = me.scores?.wardScore || 0
    const benchmark = WARD_BENCHMARKS[position] || 0.5
    const expected = benchmark * minutes
    const ratio = wardScore / expected

    if (ratio < 0.4) {
      this.lastWardWarnTime = now
      return {
        type: 'ward_critical',
        priority: 5,
        title: '視界管理が不足',
        desc: `ワードスコア ${Math.round(wardScore)} (目安: ${Math.round(expected)})。ワードを置いて視界を確保しよう`,
        warning: '視界がないとガンクや奇襲を防げない',
      }
    }

    if (ratio < 0.6) {
      this.lastWardWarnTime = now
      return {
        type: 'ward_warning',
        priority: 3,
        title: 'ワードを意識しよう',
        desc: `ワードスコア ${Math.round(wardScore)} (目安: ${Math.round(expected)})。リコール時やオブジェクト前にワード設置を忘れずに`,
      }
    }

    return null
  }

  _checkTeamfightWin(gameData, allies, me, gameTime) {
    const events = gameData.events?.Events || []
    if (events.length === 0) return null

    // 直近30秒以内の味方によるキルを数える
    const recentWindow = 30
    const myTeamNames = new Set()
    if (me) myTeamNames.add(me.summonerName)
    if (me?.riotIdGameName) myTeamNames.add(me.riotIdGameName)
    for (const a of allies) {
      if (a.summonerName) myTeamNames.add(a.summonerName)
      if (a.riotIdGameName) myTeamNames.add(a.riotIdGameName)
    }

    const recentAllyKills = events.filter(e =>
      e.EventName === 'ChampionKill' &&
      e.EventTime >= gameTime - recentWindow &&
      myTeamNames.has(e.KillerName)
    ).length

    // 新たに2キル以上増えた場合にアラート（60秒に1回まで）
    const now = Date.now()
    if (recentAllyKills >= 2 && now - this.lastTeamfightAlertTime > 60000) {
      this.lastTeamfightAlertTime = now
      return {
        type: 'teamfight_push',
        priority: 8,
        title: '集団戦勝利！タワー/オブジェクトを狙え',
        desc: `直近${recentWindow}秒で${recentAllyKills}キル獲得。この有利を活かしてタワーかオブジェクトを確保しよう`,
        warning: 'ジャングルに散らばらず、チームで同じ目標を攻めること',
      }
    }

    return null
  }

  reset() {
    this.lastAlerts = []
    this.lastDeathTime = 0
    this.lastCSWarnTime = 0
    this.deathCount = 0
    this.csWarnCount = 0
    this.lastRecallHintTime = 0
    this.lastWardWarnTime = 0
    this.lastNumAdvantageTime = 0
    this.lastTeamfightKillCount = 0
    this.lastTeamfightAlertTime = 0
  }
}

module.exports = { RuleEngine }
