// 起動時にData Dragonから最新パッチのチャンプ・アイテム情報を一括取得
// ローカルにキャッシュし、同一バージョンなら再取得しない
const https = require('https')
const fs = require('fs')
const path = require('path')

let latestVersion = null
let champMap = null   // { id(number): { enName, jaName, tags, stats } }
let itemMap = null    // { id(string): { name, jaName, description, gold, stats, from, into, tags } }
let cacheDir = null   // 外から設定されるキャッシュ保存先ディレクトリ

function setCacheDir(dir) {
  cacheDir = dir
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function readCache(filename) {
  if (!cacheDir) return null
  const filePath = path.join(cacheDir, filename)
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function writeCache(filename, data) {
  if (!cacheDir) return
  const filePath = path.join(cacheDir, filename)
  try {
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8')
  } catch (err) {
    console.error(`[PatchData] Cache write error (${filename}):`, err.message)
  }
}

function fetchJson(url) {
  return new Promise(resolve => {
    https.get(url, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch { resolve(null) } })
    }).on('error', () => resolve(null))
  })
}

// 最新バージョンを取得
async function fetchLatestVersion() {
  if (latestVersion) return latestVersion
  const versions = await fetchJson('https://ddragon.leagueoflegends.com/api/versions.json')
  if (Array.isArray(versions) && versions.length) {
    latestVersion = versions[0]
  }
  return latestVersion || '16.5.1'
}

// チャンピオンデータ読み込み
async function loadChampions(version) {
  const [enData, jaData] = await Promise.all([
    fetchJson(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`),
    fetchJson(`https://ddragon.leagueoflegends.com/cdn/${version}/data/ja_JP/champion.json`)
  ])
  if (!enData?.data) return null

  const map = {}
  for (const [enName, info] of Object.entries(enData.data)) {
    const ja = jaData?.data?.[enName]
    map[parseInt(info.key)] = {
      enName,
      jaName: ja?.name || enName,
      tags: info.tags || [],           // ["Fighter","Tank"] etc
      info: info.info || {},           // { attack, defense, magic, difficulty } (1-10)
      stats: info.stats || {},         // hp, armor, attackdamage, etc
      title: ja?.title || info.title
    }
  }
  return map
}

// アイテムデータ読み込み
async function loadItems(version) {
  const [enData, jaData] = await Promise.all([
    fetchJson(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`),
    fetchJson(`https://ddragon.leagueoflegends.com/cdn/${version}/data/ja_JP/item.json`)
  ])
  if (!enData?.data) return null

  const map = {}
  for (const [id, info] of Object.entries(enData.data)) {
    const ja = jaData?.data?.[id]
    const jaDesc = ja?.description || info.description || ''
    map[id] = {
      name: info.name,
      jaName: ja?.name || info.name,
      description: info.plaintext || '',
      fullDesc: stripTags(jaDesc),     // 日本語詳細説明（タグ除去済み）
      gold: info.gold || {},           // { base, total, sell, purchasable }
      stats: info.stats || {},         // FlatPhysicalDamageMod, FlatHPPoolMod, etc
      from: info.from || [],           // ビルドパス（素材アイテムID）
      into: info.into || [],           // 上位アイテムID
      tags: info.tags || [],
      maps: info.maps || {},           // { "11": true } = サモナーズリフト
      requiredChampion: info.requiredChampion || '',
      image: info.image?.full || ''
    }
  }
  return map
}

// 一括初期化（起動時に1回呼ぶ）
async function initPatchData() {
  const version = await fetchLatestVersion()
  console.log(`[PatchData] Loading Data Dragon v${version}...`)

  // キャッシュのバージョン確認
  const cachedMeta = readCache('patch-meta.json')
  if (cachedMeta && cachedMeta.version === version) {
    // 同一バージョン → キャッシュから読み込み
    const cachedChamps = readCache('champions.json')
    const cachedItems = readCache('items.json')
    if (cachedChamps && cachedItems) {
      // champMap のキーを number に復元
      champMap = {}
      for (const [k, v] of Object.entries(cachedChamps)) {
        champMap[parseInt(k)] = v
      }
      itemMap = cachedItems
      const champCount = Object.keys(champMap).length
      const itemCount = Object.keys(itemMap).length
      console.log(`[PatchData] Loaded from cache: ${champCount} champions, ${itemCount} items (v${version})`)
      return { version, champCount, itemCount }
    }
  }

  // キャッシュなし or バージョン変更 → ネットワークから取得
  const [champs, items] = await Promise.all([
    loadChampions(version),
    loadItems(version)
  ])

  champMap = champs
  itemMap = items

  // キャッシュに保存
  if (champMap) writeCache('champions.json', champMap)
  if (itemMap) writeCache('items.json', itemMap)
  writeCache('patch-meta.json', { version, updatedAt: new Date().toISOString() })

  const champCount = champMap ? Object.keys(champMap).length : 0
  const itemCount = itemMap ? Object.keys(itemMap).length : 0
  console.log(`[PatchData] Fetched & cached: ${champCount} champions, ${itemCount} items (v${version})`)

  return { version, champCount, itemCount }
}

function getVersion() { return latestVersion }
function getChampionById(id) {
  return champMap?.[id] || { enName: `Unknown(${id})`, jaName: `不明(${id})`, tags: [], stats: {} }
}
function getItemById(id) {
  return itemMap?.[String(id)] || null
}
// HTMLタグ除去
function stripTags(s) { return (s || '').replace(/<[^>]+>/g, '') }

// 試合中の10体のスキル情報を一括取得（チャンプ英語名の配列を渡す）
let spellCache = {} // { enName: { passive, spells: [Q,W,E,R] } }
let spellCacheLoaded = false

// 起動時にファイルキャッシュからスキル情報を復元
function loadSpellCacheFromDisk() {
  if (spellCacheLoaded) return
  spellCacheLoaded = true
  const cached = readCache('spells.json')
  if (cached && typeof cached === 'object') {
    // キャッシュのバージョンが現在と一致する場合のみ使用
    if (cached._version === latestVersion && cached._data) {
      spellCache = cached._data
      console.log(`[PatchData] Spell cache restored: ${Object.keys(spellCache).length} champions`)
    }
  }
}

function saveSpellCacheToDisk() {
  writeCache('spells.json', { _version: latestVersion, _data: spellCache })
}

async function loadSpellsForMatch(champNames) {
  const version = latestVersion || '16.5.1'
  loadSpellCacheFromDisk()
  const toFetch = champNames.filter(n => n && !spellCache[n])
  if (!toFetch.length) return spellCache

  console.log(`[PatchData] Loading spells for ${toFetch.length} champions...`)
  const results = await Promise.all(toFetch.map(name =>
    fetchJson(`https://ddragon.leagueoflegends.com/cdn/${version}/data/ja_JP/champion/${name}.json`)
  ))

  results.forEach((data, i) => {
    const name = toFetch[i]
    const info = data?.data?.[name]
    if (!info) return
    spellCache[name] = {
      passive: { name: info.passive.name, desc: stripTags(info.passive.description) },
      spells: info.spells.map((s, j) => ({
        key: ['Q', 'W', 'E', 'R'][j],
        name: s.name,
        desc: stripTags(s.description)
      })),
      // Riot公式のチャンプTips（強み/弱み）
      allyTips: (info.allytips || []).map(t => stripTags(t)),
      enemyTips: (info.enemytips || []).map(t => stripTags(t)),
      // 攻撃/防御/魔力/難易度（1-10）
      info: info.info || {},
    }
  })
  // 取得した分をディスクに保存
  saveSpellCacheToDisk()
  console.log(`[PatchData] Spells loaded for: ${toFetch.join(', ')}`)
  return spellCache
}

function getSpells(enName) { return spellCache[enName] || null }
function clearSpellCache() { spellCache = {} }

function getAllChampions() { return champMap }
function getAllItems() { return itemMap }

// 現パッチのSR完成品アイテム一覧を返す（靴含む）
// 返り値: [{ id: "3020", jaName: "ソーサラー シューズ", image: "3020.png" }, ...]
function getCompletedItems() {
  if (!itemMap) return []
  const seen = new Set()
  return Object.entries(itemMap)
    .filter(([id, it]) => {
      const isCompleted = it.gold?.total >= 2500 && (!it.into || it.into.length === 0)
      const isBoot = (it.tags || []).includes('Boots') && it.gold?.total >= 900 && (!it.into || it.into.length === 0)
      return (isCompleted || isBoot) &&
        it.gold?.purchasable !== false &&
        !it.requiredChampion &&
        parseInt(id) < 10000 &&
        it.maps?.['11'] === true
    })
    .filter(([, it]) => {
      if (seen.has(it.jaName)) return false
      seen.add(it.jaName)
      return true
    })
    .map(([id, it]) => ({ id, jaName: it.jaName, image: it.image }))
}


// キャッシュを削除して Data Dragon から強制再取得
async function refreshCache() {
  // patch-meta を消すと initPatchData がキャッシュをスキップする
  if (cacheDir) {
    for (const f of ['patch-meta.json', 'champions.json', 'items.json', 'spells.json']) {
      try { fs.unlinkSync(path.join(cacheDir, f)) } catch {}
    }
  }
  spellCache = {}
  spellCacheLoaded = false
  return initPatchData()
}

// アイテムのステータスを簡潔な文字列にフォーマット
const STAT_LABELS = {
  FlatPhysicalDamageMod: 'AD', FlatMagicDamageMod: 'AP',
  FlatHPPoolMod: 'HP', FlatMPPoolMod: 'マナ',
  FlatArmorMod: 'AR', FlatSpellBlockMod: 'MR',
  PercentAttackSpeedMod: 'AS', FlatMovementSpeedMod: 'MS',
  FlatCritChanceMod: 'クリティカル', PercentLifeStealMod: 'ライフスティール',
  PercentMovementSpeedMod: 'MS%'
}

function formatItemSummary(itemId) {
  const item = getItemById(itemId)
  if (!item) return null
  // ステータス部分
  const statParts = []
  for (const [key, label] of Object.entries(STAT_LABELS)) {
    const val = item.stats?.[key]
    if (val) {
      if (key.startsWith('Percent')) {
        statParts.push(`${label}${Math.round(val * 100)}%`)
      } else {
        statParts.push(`${label}${Math.round(val)}`)
      }
    }
  }
  const stats = statParts.length ? statParts.join(',') : ''
  // 説明文を60文字に切り詰め
  const desc = (item.fullDesc || item.description || '').substring(0, 60)
  return { name: item.jaName, stats, desc, gold: item.gold?.total || 0 }
}

module.exports = {
  setCacheDir, initPatchData, getVersion, getChampionById, getItemById,
  getAllChampions, getAllItems, getCompletedItems, formatItemSummary,
  loadSpellsForMatch, getSpells, clearSpellCache, refreshCache
}
