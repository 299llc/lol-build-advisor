const { isCompletedItem } = require('../core/config')
const { getItemById } = require('./patchData')
const { getGamePhase } = require('../core/knowledgeDb')

class DiffDetector {
  constructor() {
    this.lastData = null
    this.lastCallTime = 0
    this.debounceMs = 90000 // 90秒デバウンス
  }

  check(gameData) {
    const now = Date.now()

    // デバウンス: 前回呼び出しから90秒以内はスキップ
    if (now - this.lastCallTime < this.debounceMs) return false

    if (!this.lastData) {
      // 初回 → トリガー発火
      this.lastData = this._snapshot(gameData)
      this.lastCallTime = now
      return true
    }

    const prev = this.lastData
    const curr = this._snapshot(gameData)

    const reasons = []

    // アイテム変化（完成品のみ — 設計書準拠）
    if (curr.completedItemHash !== prev.completedItemHash) reasons.push('item_change')

    // キル/デス変化
    if (curr.kills !== prev.kills) reasons.push(`kills:${prev.kills}->${curr.kills}`)
    if (curr.deaths !== prev.deaths) reasons.push(`deaths:${prev.deaths}->${curr.deaths}`)

    // ゲームフェーズ遷移（設計書9.6）
    if (curr.gamePhase !== prev.gamePhase) reasons.push(`phase:${prev.gamePhase}->${curr.gamePhase}`)

    // 90秒定期更新（設計書9.6: コスト最適化のため60→90秒に延長）
    if (now - this.lastCallTime >= 90000) reasons.push('periodic_90s')

    if (reasons.length > 0) {
      console.log(`[DiffDetector] Triggered: ${reasons.join(', ')}`)
      this.lastData = curr
      this.lastCallTime = now
    }

    return reasons.length > 0
  }

  _snapshot(gameData) {
    const ap = gameData.activePlayer
    const me = gameData.allPlayers?.find(p =>
      p.summonerName === ap?.summonerName ||
      p.riotIdGameName === ap?.riotIdGameName
    ) || gameData.allPlayers?.[0]

    // 完成品のみのハッシュ（設計書: 素材購入は無視）
    const completedItems = (me?.items || [])
      .filter(i => {
        if (i.itemID <= 0) return false
        const patchItem = getItemById(i.itemID)
        return isCompletedItem(patchItem)
      })
      .map(i => i.itemID)
      .sort()
      .join(',')

    // ゲームフェーズ
    const gameTime = gameData.gameData?.gameTime || 0
    const gamePhase = getGamePhase(gameTime)

    return {
      completedItemHash: completedItems,
      kills: me?.scores?.kills || 0,
      deaths: me?.scores?.deaths || 0,
      gamePhase,
    }
  }
}

module.exports = { DiffDetector }
