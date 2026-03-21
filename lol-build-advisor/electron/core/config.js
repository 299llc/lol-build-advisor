// 定数・設定値
module.exports = {
  // ポーリング間隔
  POLL_INTERVAL_MS: 3000,

  // AI呼び出しデバウンス
  AI_DEBOUNCE_MS: 10000,

  // マクロアドバイス（設計書9.6: デバウンス30-60秒）
  MACRO_INTERVAL_MS: 90000,
  MACRO_DEBOUNCE_MS: 30000,

  // オブジェクトスポーンタイム (秒) — Season 2024/2025
  OBJECTIVES: {
    dragon:    { firstSpawn: 300, respawn: 300 },
    baron:     { firstSpawn: 1200, respawn: 360 },
    voidgrub:  { firstSpawn: 480, end: 885 },                  // 8:00出現, 14:45終了, 1回のみ(Season2 patch25.09~)
    herald:    { firstSpawn: 900, end: 1200 }                 // 15:00出現, 20:00終了(バロン出現), リスポーンなし
  },

  // アイテム判定閾値
  ITEM_COMPLETE_GOLD: 2500,
  ITEM_BOOT_GOLD: 900,

  // カウンターアイテムマッピング
  COUNTER_ITEMS: {
    healer: ['3033', '3165', '3075', '6609'],
    cc:     ['3111', '3139', '3222'],
    shield: ['6035']
  },

  // ウィンドウデフォルト
  DEFAULT_WINDOW: { width: 960, height: 620 },
  COMPACT_WINDOW: { width: 380, height: 520 },

  // Data Dragon ベースURL
  DDRAGON_BASE: 'https://ddragon.leagueoflegends.com/cdn',

  // アイテム完成品判定
  isCompletedItem(patchItem) {
    if (!patchItem) return false
    const isComplete = patchItem.gold?.total >= 2500
    const isBoot = (patchItem.tags || []).includes('Boots') && patchItem.gold?.total >= 900
    return isComplete || isBoot
  },

  // オブジェクトイベント分類（重複フィルタ回避用）
  classifyObjectiveEvents(events) {
    const dragon = [], baron = [], herald = [], voidgrub = []
    for (const e of events) {
      switch (e.EventName) {
        case 'DragonKill': dragon.push(e); break
        case 'BaronKill': baron.push(e); break
        case 'HeraldKill': herald.push(e); break
        case 'HordeKill': voidgrub.push(e); break
      }
    }
    return { dragon, baron, herald, voidgrub }
  }
}
