/**
 * アイテムカテゴリ分類テーブル
 * evaluateCoaching() のルールベース評価で使用
 */

// 物理防御アイテム
const ARMOR_ITEMS = [
  'プレート スチールキャップ',
  'ゾーニャの砂時計',
  'フローズンハート',
  'ランデュイン オーメン',
  'ソーンメイル',
  'デッドマン プレート',
  'ガーディアン エンジェル',
  'アイスボーン ガントレット',
  'ブランブル ベスト',
  'ウォーデン メイル',
  'チェイン ベスト',
  'シーカー アームガード',
  'クロース アーマー',
]

// 魔法防御アイテム
const MR_ITEMS = [
  'マーキュリー ブーツ',
  'スピリット ビサージュ',
  'フォース オブ ネイチャー',
  'バンシー ヴェール',
  'ウィッツエンド',
  'マウ オブ マルモティウス',
  'アビサル マスク',
  'ミカエルの祝福',
  'バンドルパイプ',
  'スペクター カウル',
  'ヘクスドリンカー',
  'ネガトロン クローク',
  'ヌル マジック マント',
]

// 重傷アイテム
const GRIEVOUS_ITEMS = [
  'モレロノミコン',
  'ソーンメイル',
  'モータルリマインダー',
  'ケミパンク チェーンソード',
  'エクスキューショナー コーリング',
  '忘却のオーブ',
  'ブランブル ベスト',
]

// サポート必須アイテム（批判すべきでないもの）
const SUPPORT_CORE_ITEMS = [
  '至点のソリ',
  'ルーニック コンパス',
  'ワールド アトラス',
  'ブラッドソング',
  'ドリーム メーカー',
  'ゼケズ コンバージェンス',
  'セレスティアル オポジション',
  'ソラリのロケット',
  'ステルス ワード',
  'オラクル レンズ',
  'コントロール ワード',
  'ファーサイト オルタレーション',
]

// ブーツ
const BOOTS = [
  'プレート スチールキャップ',
  'マーキュリー ブーツ',
  'アイオニア ブーツ',
  '連呪使いのブーツ',
  'バーサーカー ブーツ',
  'ソーサラー シューズ',
  'スウィフトネス ブーツ',
  'モビリティ ブーツ',
  '真紅のアイオニア ブーツ',
  'シンビオティック ソール',
]

/**
 * アイテム名がカテゴリに含まれるかチェック
 * 部分一致で判定（スペースの揺れに対応）
 */
function matchesCategory(itemName, categoryItems) {
  const normalized = itemName.replace(/\s+/g, '')
  return categoryItems.some(cat => cat.replace(/\s+/g, '') === normalized)
}

function isArmorItem(name) { return matchesCategory(name, ARMOR_ITEMS) }
function isMrItem(name) { return matchesCategory(name, MR_ITEMS) }
function isGrievousItem(name) { return matchesCategory(name, GRIEVOUS_ITEMS) }
function isSupportCoreItem(name) { return matchesCategory(name, SUPPORT_CORE_ITEMS) }
function isBoots(name) { return matchesCategory(name, BOOTS) }

/**
 * テキスト内からアイテム名を検出
 * @param {string} text
 * @param {string[]} categoryItems
 * @returns {string[]} マッチしたアイテム名
 */
function findItemsInText(text, categoryItems) {
  if (!text) return []
  return categoryItems.filter(item => text.includes(item.replace(/\s+/g, ' ')))
}

/**
 * AI出力の指定フィールドからテキストを結合して返す
 */
function extractTextFromFields(actual, fields) {
  const texts = []
  for (const field of fields) {
    if (field === 'sections' && Array.isArray(actual.sections)) {
      for (const s of actual.sections) {
        if (s.title) texts.push(s.title)
        if (s.content) texts.push(s.content)
      }
    } else if (Array.isArray(actual[field])) {
      texts.push(...actual[field])
    } else if (typeof actual[field] === 'string') {
      texts.push(actual[field])
    }
  }
  return texts.join('\n')
}

module.exports = {
  ARMOR_ITEMS, MR_ITEMS, GRIEVOUS_ITEMS, SUPPORT_CORE_ITEMS, BOOTS,
  isArmorItem, isMrItem, isGrievousItem, isSupportCoreItem, isBoots,
  findItemsInText, extractTextFromFields, matchesCategory,
}
