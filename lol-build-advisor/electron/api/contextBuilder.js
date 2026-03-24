const { getAllChampions, getItemById } = require('./patchData')
const { extractTraits } = require('../core/championAnalysis')

// rawChampionName → 英語キー抽出
function extractEnName(player) {
  const raw = player.rawChampionName || ''
  if (raw.startsWith('game_character_displayname_')) {
    return raw.replace('game_character_displayname_', '')
  }
  const m = raw.match(/^Character_(\w+)_Name$/)
  if (m) return m[1]
  return raw
}


class ContextBuilder {
  // 静的情報（試合中変わらない）: 構成・ロール・スキル特性
  buildStatic(gameData) {
    const { activePlayer, allPlayers } = gameData

    const me = this._findMe(activePlayer, allPlayers)
    const myTeam = me.team
    const allies = allPlayers.filter(p => p.team === myTeam && p !== me)
    const enemies = allPlayers.filter(p => p.team !== myTeam)

    const lines = [
      `【自チャンプ】${me.championName} ${me.position || '?'}`,
      '',
      `【敵構成】`,
      ...enemies.map((e, i) => {
        const en = extractEnName(e)
        const traits = extractTraits(en)
        const parts = [`${i + 1}. ${e.championName} ${e.position || '?'}`]
        if (traits.length) parts.push(`特性:${traits.join(',')}`)
        return parts.join(' ')
      }),
      '',
      `【味方構成】`,
      allies.map(a => `${a.championName} ${a.position || '?'}`).join(' / ')
    ]
    return lines.join('\n')
  }

  // 動的情報（毎回変わる）: Lv・アイテム・キル差・時間
  buildDynamic(gameData) {
    const { activePlayer, allPlayers, gameData: gd } = gameData
    const gameTime = gd?.gameTime || 0

    const me = this._findMe(activePlayer, allPlayers)
    const myTeam = me.team
    const allies = allPlayers.filter(p => p.team === myTeam && p !== me)
    const enemies = allPlayers.filter(p => p.team !== myTeam)

    const enemyDamage = this._calcTeamDamage(enemies)
    const phase = gameTime < 900 ? '序盤' : gameTime < 1500 ? '中盤' : '終盤'
    const minutes = Math.floor(gameTime / 60)
    const myItems = me.items?.filter(i => i.itemID > 0) || []

    const allyKills = allPlayers.filter(p => p.team === myTeam).reduce((s, p) => s + (p.scores?.kills || 0), 0)
    const enemyKills = enemies.reduce((s, p) => s + (p.scores?.kills || 0), 0)
    const diff = allyKills - enemyKills
    const situation = diff > 5 ? '優勢' : diff < -5 ? '劣勢' : '拮抗'

    const lines = [
      `Lv${me.level} アイテム:${myItems.map(i => i.displayName).join(',') || 'なし'}`,
      `敵AD${enemyDamage.adPct}%/AP${enemyDamage.apPct}%`,
      ...enemies.map((e, i) => {
        const items = (e.items || []).filter(x => x.itemID > 0).map(x => x.displayName).join(',')
        const kda = e.scores ? ` ${e.scores.kills}/${e.scores.deaths}/${e.scores.assists}` : ''
        return `${e.championName} Lv${e.level}${kda}${items ? ' ' + items : ''}`
      }),
      `${minutes}分(${phase}) ${situation}`
    ]
    return lines.join('\n')
  }

  // 全部まとめて返す
  build(gameData) {
    return this.buildStatic(gameData) + '\n\n' + this.buildDynamic(gameData)
  }

  _findMe(activePlayer, allPlayers) {
    return allPlayers.find(p =>
      p.summonerName === activePlayer?.summonerName ||
      p.riotId === activePlayer?.riotId ||
      p.riotIdGameName === activePlayer?.riotIdGameName
    ) || allPlayers[0]
  }

  _calcTeamDamage(players) {
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
      // アイテムがない序盤はタグベースで補完（info.magic はダメージタイプ指標ではないため使わない）
      if (playerAd === 0 && playerAp === 0) {
        const champMap = getAllChampions() || {}
        const enName = extractEnName(p)
        const champ = Object.values(champMap).find(c => c.enName === enName)
        const tags = champ?.tags || []
        const isAp = tags.includes('Mage') && !tags.includes('Marksman') && !tags.includes('Assassin') && !tags.includes('Fighter')
        playerAd = isAp ? 2 : 8
        playerAp = isAp ? 8 : 2
      }
      ad += playerAd
      ap += playerAp
    }
    const total = ad + ap || 1
    return { adPct: Math.round(ad / total * 100), apPct: Math.round(ap / total * 100) }
  }
}

module.exports = { ContextBuilder, extractEnName }
