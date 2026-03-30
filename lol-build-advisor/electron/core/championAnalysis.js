// チャンピオン特性分析 (detectFlags + extractTraits 統合)
const { getChampionById, getSpells } = require('../api/patchData')

const HEAL_REGEX = /回復|ヒール|体力を.*回復|ライフスティール/
const ANTI_HEAL_REGEX = /回復.*低下|回復.*減少|回復.*阻害|回復.*無効|自己回復.*低下|体力自動回復.*低下/
const CC_REGEX = /スタン|スネア|ノックアップ|ノックバック|サイレンス|フィアー|拘束|束縛|打ち上げ|引き寄せ|チャーム|魅了|挑発|スリープ|変身させ|サプレッション|エアボーン/
const SHIELD_REGEX = /シールド/

function hasHeal(text) {
  return HEAL_REGEX.test(text) && !ANTI_HEAL_REGEX.test(text)
}

// 静的フラグキャッシュ（チャンピオン特性は試合中変わらない）
const _staticFlagsCache = new Map()

/**
 * スキル説明からフラグを検出
 * @param {string} enName - チャンピオン英語名
 * @param {number} championId - チャンピオンID
 * @param {object} scores - { kills, deaths, assists }
 * @returns {string[]} フラグ配列 ('fed', 'tank', 'healer', 'cc', 'shield')
 */
function detectFlags(enName, championId, scores) {
  const flags = []
  if ((scores?.kills || 0) >= 5) flags.push('fed')

  // 静的フラグ（tank/healer/cc/shield）はキャッシュ
  const cacheKey = enName || String(championId)
  if (_staticFlagsCache.has(cacheKey)) {
    flags.push(..._staticFlagsCache.get(cacheKey))
  } else {
    const staticFlags = []
    const champInfo = getChampionById(championId || 0)
    if (champInfo.tags?.includes('Tank')) staticFlags.push('tank')

    const spells = getSpells(enName)
    if (spells) {
      // healer判定はスキルごとに個別チェック（全文結合だとANTI_HEAL_REGEXが誤マッチする）
      const texts = [spells.passive.desc, ...spells.spells.map(s => s.desc)]
      if (texts.some(t => hasHeal(t))) staticFlags.push('healer')
      const allText = texts.join(' ')
      if (CC_REGEX.test(allText)) staticFlags.push('cc')
      if (SHIELD_REGEX.test(allText)) staticFlags.push('shield')
    }
    _staticFlagsCache.set(cacheKey, staticFlags)
    flags.push(...staticFlags)
  }
  return flags
}

/**
 * スキル説明から特性を抽出 (ソース付き、AIプロンプト用)
 * @param {string} enName - チャンピオン英語名
 * @returns {string[]} 特性配列 ('回復(Q+W)', 'CC(E+R)', 'シールド(W)')
 */
function extractTraits(enName) {
  const spells = getSpells(enName)
  if (!spells) return []
  const allText = [spells.passive.desc, ...spells.spells.map(s => s.desc)].join(' ')
  const traits = []

  // 回復
  if (hasHeal(allText)) {
    const sources = []
    if (hasHeal(spells.passive.desc)) sources.push('パッシブ')
    spells.spells.forEach(s => {
      if (hasHeal(s.desc)) sources.push(s.key)
    })
    if (sources.length) traits.push(`回復(${sources.join('+')})`)
  }

  // CC
  if (CC_REGEX.test(allText)) {
    const sources = []
    spells.spells.forEach(s => {
      if (CC_REGEX.test(s.desc)) sources.push(s.key)
    })
    if (sources.length) traits.push(`CC(${sources.join('+')})`)
  }

  // シールド
  if (SHIELD_REGEX.test(allText)) {
    const sources = []
    spells.spells.forEach(s => {
      if (SHIELD_REGEX.test(s.desc)) sources.push(s.key)
    })
    if (sources.length) traits.push(`シールド(${sources.join('+')})`)
  }

  return traits
}

module.exports = { detectFlags, extractTraits }
