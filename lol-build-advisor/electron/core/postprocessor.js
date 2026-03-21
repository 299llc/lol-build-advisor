/**
 * Postprocessor - LLM出力のバリデーション・フィルタ・整形
 *
 * LLMの生出力を受け取り、不正データの除外・文字数制限・confidence判定・
 * フォールバック生成を行い、UIに安全なデータを渡す後処理層。
 * 外部依存なし。純粋なバリデーション・整形ロジックのみ。
 */

// マクロアドバイスの禁止パターン（抽象的で意味のないアドバイス）
const BANNED_PATTERNS = ['マップを見', 'CSを取', 'CSを意識', '気をつけ', '注意しま']

// 敬語統一用のパターン（である調 → ですます調）
const KEIGO_REPLACEMENTS = [
  [/だ。/g, 'です。'],
  [/である。/g, 'です。'],
  [/する。$/gm, 'します。'],
  [/しろ。/g, 'してください。'],
  [/せよ。/g, 'してください。'],
]

class Postprocessor {
  constructor() {
    this.lastItemResult = null
    this.lastMacroResult = null
  }

  // === アイテム提案の後処理 ===
  processItemResult(raw, candidateIds, previousResult) {
    // 1. rawがnullまたはオブジェクトでない → previousResultを返す
    if (!raw || typeof raw !== 'object') return previousResult

    // 2. recommended が配列でない → previousResultを返す
    if (!Array.isArray(raw.recommended)) return previousResult

    // 3. recommended の各要素をフィルタ・整形
    const filtered = []
    for (const item of raw.recommended) {
      // id を文字列に正規化してから比較（LLMが数値で返すケース対策）
      const itemId = String(item.id)
      const normalizedCandidates = candidateIds ? candidateIds.map(String) : null
      if (!normalizedCandidates || !normalizedCandidates.includes(itemId)) continue

      filtered.push({
        id: itemId,
        reason: (typeof item.reason === 'string' && item.reason.length > 0)
          ? this._toOneSentence(item.reason)
          : '推奨'
      })
    }

    // 4. confidence フィルタ
    const confidence = raw.confidence
    if (confidence === 'low') return previousResult
    const lowConfidence = confidence === 'medium'

    // 5-6. action（reasoning）の整形
    const reasoning = (typeof raw.reasoning === 'string' && raw.reasoning.length > 0)
      ? this._truncate(raw.reasoning, 100)
      : ''

    // 7. 前回と同じ推薦ならスキップ（UI更新しない）
    if (previousResult && Array.isArray(previousResult.recommended)) {
      const prevIds = previousResult.recommended.map(r => r.id).sort().join(',')
      const currIds = filtered.map(r => r.id).sort().join(',')
      if (prevIds === currIds) return null // 変化なし → 呼び出し元でスキップ
    }

    // 8. 結果を組み立て、更新して返す
    const result = {
      recommended: filtered,
      reasoning,
      lowConfidence,
    }
    this.lastItemResult = result
    return result
  }

  // === マクロアドバイスの後処理 ===
  processMacroResult(raw, actionCandidates, previousResult) {
    // 1. rawがnull → previousResultを返す
    if (!raw || typeof raw !== 'object') return previousResult

    // 2. title が文字列でない or 空 → previousResultを返す
    if (typeof raw.title !== 'string' || raw.title.length === 0) return previousResult

    // 3-4. title/desc を切り詰め + 敬語統一
    const title = this._truncate(raw.title, 10)
    const desc = this._normalizeKeigo(raw.desc || '')

    // 5. warning の整形 + 敬語統一
    const warning = typeof raw.warning === 'string' ? this._normalizeKeigo(raw.warning) : ''

    // 6. confidence フィルタ: "low" → previousResultを返す
    if (raw.confidence === 'low') return previousResult

    // 7. action が actionCandidates に含まれない → actionCandidates[0] を使用
    let action = raw.action
    if (Array.isArray(actionCandidates) && actionCandidates.length > 0) {
      if (!actionCandidates.includes(action)) {
        action = actionCandidates[0]
      }
    }

    // 8. 禁止表現チェック: title/desc に抽象論が含まれていたら除去
    const combined = title + desc
    for (const pattern of BANNED_PATTERNS) {
      if (combined.includes(pattern)) return previousResult
    }

    // 9. 前回と同じactionの場合: title/desc/warningはpreviousResultを維持
    if (previousResult && previousResult.action === action) {
      const updated = {
        ...previousResult,
        updatedAt: Date.now(),
      }
      this.lastMacroResult = updated
      return updated
    }

    // 10-11. 結果を組み立て、更新して返す
    const result = {
      action,
      title,
      desc,
      warning,
      updatedAt: Date.now(),
    }
    this.lastMacroResult = result
    return result
  }

  // === マッチアップTipの後処理 ===
  processMatchupResult(raw, opponentData) {
    // 1. rawがnull → フォールバック生成
    if (!raw || typeof raw !== 'object') {
      return this._generateFallbackTip(opponentData)
    }

    // 2. tips が配列でない or 3つ未満 → フォールバック生成
    if (!Array.isArray(raw.tips) || raw.tips.length < 3) {
      return this._generateFallbackTip(opponentData)
    }

    // 3. 各フィールドの型チェック
    return {
      summary: typeof raw.summary === 'string' ? raw.summary : '',
      tips: raw.tips.map(t => typeof t === 'string' ? t : ''),
      playstyle: typeof raw.playstyle === 'string' ? raw.playstyle : '',
      danger: typeof raw.danger === 'string' ? raw.danger : '',
      power_spike: typeof raw.power_spike === 'string' ? raw.power_spike : '',
    }
  }

  // === コーチングの後処理 ===
  processCoachingResult(raw) {
    // 1. rawがnull → nullを返す（リトライに任せる）
    if (!raw || typeof raw !== 'object') return null

    // 2. overall_score: 数値でなければ5、範囲外(1-10)ならクランプ
    let overallScore = typeof raw.overall_score === 'number' ? raw.overall_score : 5
    overallScore = Math.max(1, Math.min(10, Math.round(overallScore)))

    // 3. build_score: 同上
    let buildScore = typeof raw.build_score === 'number' ? raw.build_score : 5
    buildScore = Math.max(1, Math.min(10, Math.round(buildScore)))

    // 4. sections: 配列でなければ空配列
    const validGrades = ['S', 'A', 'B', 'C', 'D']
    const sections = Array.isArray(raw.sections)
      ? raw.sections.map(s => ({
          title: s.title || '',
          content: s.content || '',
          grade: validGrades.includes(s.grade) ? s.grade : 'B',
        }))
      : []

    // 5. good_points: 配列でなければ空配列
    const goodPoints = Array.isArray(raw.good_points) ? raw.good_points : []

    // 6. improve_points: 配列でなければ空配列、10文字未満は具体性不足の可能性
    const improvePoints = Array.isArray(raw.improve_points)
      ? raw.improve_points.filter(p => typeof p === 'string' && p.length >= 10)
      : []

    // 7. next_game_advice: 文字列でなければ ""
    const nextGameAdvice = typeof raw.next_game_advice === 'string' ? raw.next_game_advice : ''

    // 8. 結果を返す
    return {
      overall_score: overallScore,
      build_score: buildScore,
      sections,
      good_points: goodPoints,
      improve_points: improvePoints,
      next_game_advice: nextGameAdvice,
    }
  }

  // === 内部ヘルパー ===

  _generateFallbackTip(opponentData) {
    if (!opponentData || !opponentData.champion) {
      return {
        summary: '対面情報なし',
        tips: ['敵のスキルを観察する', '無理なトレードを避ける', 'ワードを設置してガンクに備える'],
        playstyle: '慎重にファーム重視でプレイ',
        danger: '敵のオールインに注意',
        power_spike: 'Lv6が敵のスパイク',
      }
    }
    const champ = opponentData.champion
    const spells = opponentData.skills?.spells || []
    const spikes = opponentData.power_spikes || []

    const tips = spells.slice(0, 3).map(s => `${s.name}(${s.key})に注意`)
    while (tips.length < 3) tips.push('無理なトレードを避ける')

    return {
      summary: `${champ}との対面`,
      tips,
      playstyle: '慎重にファーム重視でプレイ',
      danger: spells[0] ? `${spells[0].name}(${spells[0].key})が脅威` : '敵のオールインに注意',
      power_spike: spikes[0] || 'Lv6が敵のスパイク',
    }
  }

  _truncate(str, maxLen) {
    if (typeof str !== 'string') return ''
    return str.length > maxLen ? str.substring(0, maxLen) : str
  }

  /** 1文に圧縮する（最初の句点で切る） */
  _toOneSentence(str) {
    if (typeof str !== 'string') return ''
    const match = str.match(/^[^。]+。?/)
    return match ? match[0] : str.substring(0, 50)
  }

  /** 敬語統一（ですます調） */
  _normalizeKeigo(str) {
    if (typeof str !== 'string') return ''
    let result = str
    for (const [pattern, replacement] of KEIGO_REPLACEMENTS) {
      result = result.replace(pattern, replacement)
    }
    return result
  }

  // === リセット ===
  reset() {
    this.lastItemResult = null
    this.lastMacroResult = null
  }
}

module.exports = { Postprocessor }
