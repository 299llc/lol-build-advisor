/**
 * テスト評価ロジック
 * 期待出力と実際のAI出力を比較して合否を判定する
 */
const { ARMOR_ITEMS, MR_ITEMS, GRIEVOUS_ITEMS, SUPPORT_CORE_ITEMS, findItemsInText, extractTextFromFields } = require('./itemRules')

/**
 * アイテム提案の評価
 * @param {object} actual - AI出力
 * @param {object} expected - 期待出力
 * @returns {{ pass: boolean, details: string[] }}
 */
function evaluateItem(actual, expected) {
  const details = []
  let pass = true

  if (!actual || !actual.recommended) {
    return { pass: false, details: ['出力なし or recommended フィールドなし'] }
  }

  // recommended が配列であること
  if (!Array.isArray(actual.recommended)) {
    return { pass: false, details: ['recommended が配列でない'] }
  }

  // 推薦数チェック
  if (expected.max_items && actual.recommended.length > expected.max_items) {
    details.push(`推薦数超過: ${actual.recommended.length} > ${expected.max_items}`)
    pass = false
  }

  // ID比較は文字列に正規化して行う
  const actualIds = actual.recommended.map(r => String(r.id))

  // 必須アイテムチェック
  if (expected.must_include) {
    for (const requiredId of expected.must_include) {
      if (!actualIds.includes(String(requiredId))) {
        details.push(`必須アイテム ${requiredId} が推薦に含まれていない`)
        pass = false
      }
    }
  }

  // 禁止アイテムチェック
  if (expected.must_not_include) {
    for (const bannedId of expected.must_not_include) {
      if (actualIds.includes(String(bannedId))) {
        details.push(`禁止アイテム ${bannedId} が推薦に含まれている`)
        pass = false
      }
    }
  }

  // candidatesの範囲内チェック
  if (expected.valid_ids) {
    const validSet = new Set(expected.valid_ids.map(String))
    for (const id of actualIds) {
      if (!validSet.has(id)) {
        details.push(`候補外アイテム ${id} が推薦されている`)
        pass = false
      }
    }
  }

  // reasoning存在チェック
  if (!actual.reasoning || actual.reasoning.length < 5) {
    details.push('reasoning が短すぎる or 欠落')
    pass = false
  }

  if (pass) details.push('OK')
  return { pass, details }
}

/**
 * マッチアップTipの評価
 */
function evaluateMatchup(actual, expected) {
  const details = []
  let pass = true

  if (!actual) {
    return { pass: false, details: ['出力なし'] }
  }

  const requiredFields = ['summary', 'tips', 'playstyle', 'danger']
  for (const field of requiredFields) {
    if (!actual[field]) {
      details.push(`${field} フィールドが欠落`)
      pass = false
    }
  }

  if (actual.tips && !Array.isArray(actual.tips)) {
    details.push('tips が配列でない')
    pass = false
  }

  if (actual.tips && actual.tips.length < (expected.min_tips || 2)) {
    details.push(`tips が少なすぎる: ${actual.tips.length}`)
    pass = false
  }

  // キーワードチェック
  if (expected.must_mention) {
    const allText = JSON.stringify(actual).toLowerCase()
    for (const keyword of expected.must_mention) {
      if (!allText.includes(keyword.toLowerCase())) {
        details.push(`キーワード「${keyword}」が言及されていない`)
        pass = false
      }
    }
  }

  if (pass) details.push('OK')
  return { pass, details }
}

/**
 * マクロアドバイスの評価
 */
function evaluateMacro(actual, expected) {
  const details = []
  let pass = true

  if (!actual) {
    return { pass: false, details: ['出力なし'] }
  }

  const requiredFields = ['title', 'desc', 'warning']
  for (const field of requiredFields) {
    if (!actual[field]) {
      details.push(`${field} フィールドが欠落`)
      pass = false
    }
  }

  // title長さチェック
  if (actual.title && actual.title.length > 15) {
    details.push(`title が長すぎる: ${actual.title.length}文字`)
    pass = false
  }

  if (!actual.action || typeof actual.action !== 'string') {
    details.push('action フィールドが空 or 不正')
    pass = false
  }

  // キーワードチェック（title + desc + warning に含まれるか）
  if (expected.must_mention) {
    const allText = `${actual.title || ''} ${actual.desc || ''} ${actual.warning || ''}`.toLowerCase()
    for (const keyword of expected.must_mention) {
      if (!allText.includes(keyword.toLowerCase())) {
        details.push(`キーワード「${keyword}」が言及されていない`)
        pass = false
      }
    }
  }

  if (pass) details.push('OK')
  return { pass, details }
}

/**
 * コーチングの評価
 * @param {object} actual - AI出力
 * @param {object} expected - 期待出力（score_range, rules等）
 * @param {object} [input] - コーチング入力データ（ルールベース評価に使用）
 */
function evaluateCoaching(actual, expected, input) {
  const details = []
  let pass = true

  if (!actual) {
    return { pass: false, details: ['出力なし'] }
  }

  // === 構造チェック ===

  if (typeof actual.overall_score !== 'number' || actual.overall_score < 1 || actual.overall_score > 10) {
    details.push(`overall_score が不正: ${actual.overall_score}`)
    pass = false
  }

  if (typeof actual.build_score !== 'number' || actual.build_score < 1 || actual.build_score > 10) {
    details.push(`build_score が不正: ${actual.build_score}`)
    pass = false
  }

  if (!Array.isArray(actual.sections) || actual.sections.length === 0) {
    details.push('sections が空 or 配列でない')
    pass = false
  }

  if (!Array.isArray(actual.good_points) || actual.good_points.length === 0) {
    details.push('good_points が空')
    pass = false
  }

  if (!Array.isArray(actual.improve_points) || actual.improve_points.length === 0) {
    details.push('improve_points が空')
    pass = false
  }

  if (!actual.next_game_advice) {
    details.push('next_game_advice が欠落')
    pass = false
  }

  // === スコア範囲チェック ===

  if (expected.score_range) {
    const [min, max] = expected.score_range
    if (actual.overall_score < min || actual.overall_score > max) {
      details.push(`overall_score ${actual.overall_score} が期待範囲 [${min}, ${max}] 外`)
      pass = false
    }
  }

  if (expected.build_score_range) {
    const [min, max] = expected.build_score_range
    if (actual.build_score < min || actual.build_score > max) {
      details.push(`build_score ${actual.build_score} が期待範囲 [${min}, ${max}] 外`)
      pass = false
    }
  }

  // === ルールベース内容チェック ===

  if (expected.rules && Array.isArray(expected.rules)) {
    for (const rule of expected.rules) {
      const result = _evaluateRule(rule, actual, input)
      if (!result.pass) {
        details.push(`[RULE:${rule.type}] ${result.message}`)
        pass = false
      }
    }
  }

  if (pass) details.push('OK')
  return { pass, details }
}

/**
 * 個別ルールの評価
 */
function _evaluateRule(rule, actual, input) {
  switch (rule.type) {

    // 指定アイテムが言及されているか
    case 'must_mention_item': {
      const fields = rule.in || ['sections', 'good_points', 'improve_points']
      const text = extractTextFromFields(actual, fields)
      if (!text.includes(rule.item)) {
        return { pass: false, message: `「${rule.item}」が言及されていない${rule.reason ? ` (${rule.reason})` : ''}` }
      }
      return { pass: true }
    }

    // 指定アイテムがimprove_pointsで推奨されていないか
    case 'must_not_recommend': {
      const fields = rule.in || ['improve_points']
      const text = extractTextFromFields(actual, fields)
      if (text.includes(rule.item)) {
        return { pass: false, message: `「${rule.item}」が不適切に推奨されている${rule.reason ? ` (${rule.reason})` : ''}` }
      }
      return { pass: true }
    }

    // サポートアイテム等を批判していないか
    case 'must_not_criticize_role_item': {
      const improveText = extractTextFromFields(actual, ['improve_points'])
      const items = rule.items || SUPPORT_CORE_ITEMS
      // 「〜以降は」「〜の後に」等の文脈ではアイテム名が出ても批判ではない
      const nonCriticalPatterns = /以降|の後に|を積んだ後|完成後|よりも先に|と合わせて|はシナジー|は適切|は有効/
      for (const item of items) {
        if (!improveText.includes(item)) continue
        // アイテムが含まれる文を取得して批判文脈かチェック
        const sentences = improveText.split(/[。\n]/).filter(s => s.includes(item))
        const isCritical = sentences.some(s => !nonCriticalPatterns.test(s))
        if (isCritical) {
          return { pass: false, message: `${rule.role || 'SUP'}の必須アイテム「${item}」を改善点で批判している` }
        }
      }
      return { pass: true }
    }

    // 敵AD/AP比率に矛盾するMR/AR推奨がないか
    case 'must_respect_damage_profile': {
      if (!input?.enemy_damage_profile) return { pass: true }
      const improveText = extractTextFromFields(actual, ['improve_points', 'next_game_advice'])
      const { ad, ap } = input.enemy_damage_profile

      // 否定文脈（「効果が薄い」「不要」「無駄」等）で言及されている場合は推奨ではないのでスキップ
      const negativePatterns = /効果が薄|不要|無駄|意味が[なない]|過剰|よりも|ではなく|代わりに/

      // AP比率30%未満なのにMR推奨
      if (ap < 30) {
        const mrFound = findItemsInText(improveText, MR_ITEMS)
        for (const item of mrFound) {
          // そのアイテムが言及されている文を取得して否定文脈かチェック
          const sentences = improveText.split(/[。\n]/).filter(s => s.includes(item))
          const isNegative = sentences.every(s => negativePatterns.test(s))
          if (!isNegative) {
            return { pass: false, message: `敵AP${ap}%なのにMRアイテム「${item}」を推奨している` }
          }
        }
      }
      // AD比率30%未満なのにAR推奨
      if (ad < 30) {
        const arFound = findItemsInText(improveText, ARMOR_ITEMS)
        for (const item of arFound) {
          const sentences = improveText.split(/[。\n]/).filter(s => s.includes(item))
          const isNegative = sentences.every(s => negativePatterns.test(s))
          if (!isNegative) {
            return { pass: false, message: `敵AD${ad}%なのにARアイテム「${item}」を推奨している` }
          }
        }
      }
      return { pass: true }
    }

    // healer_count<2で重傷アイテム推奨がないか
    case 'must_not_recommend_grievous_when_no_healers': {
      if (!input || input.enemy_healer_count >= 2) return { pass: true }
      const improveText = extractTextFromFields(actual, ['improve_points', 'next_game_advice'])
      const gwFound = findItemsInText(improveText, GRIEVOUS_ITEMS)
      if (gwFound.length > 0) {
        return { pass: false, message: `敵ヒーラー${input.enemy_healer_count}人なのに重傷アイテム「${gwFound[0]}」を推奨している` }
      }
      return { pass: true }
    }

    // 短い試合で非現実的なアイテム数を要求していないか
    case 'game_duration_aware': {
      if (!input?.game_duration) return { pass: true }
      const minutes = input.game_duration / 60
      const maxItems = rule.max_items || Math.floor(minutes / 6) + 1
      const improveText = extractTextFromFields(actual, ['improve_points'])
      // 「6アイテム」「フルビルド」等の表現をチェック
      if (minutes < 20 && /フルビルド|6[つ個]|完成品[56]/.test(improveText)) {
        return { pass: false, message: `${Math.round(minutes)}分の試合でフルビルドを要求している` }
      }
      return { pass: true }
    }

    // 特定キーワードが言及されているか
    case 'must_mention_keyword': {
      const fields = rule.in || ['sections', 'good_points', 'improve_points']
      const text = extractTextFromFields(actual, fields)
      for (const kw of (rule.keywords || [])) {
        if (!text.includes(kw)) {
          return { pass: false, message: `キーワード「${kw}」が言及されていない${rule.reason ? ` (${rule.reason})` : ''}` }
        }
      }
      return { pass: true }
    }

    // KDA/状況とスコアの矛盾チェック
    case 'score_consistency': {
      if (!input?.me?.kda || !actual.overall_score) return { pass: true }
      const [k, d, a] = input.me.kda
      const kdaRatio = d > 0 ? (k + a) / d : k + a

      // KDA比率が非常に低い（<1.0）のにスコア8以上は矛盾
      if (kdaRatio < 1.0 && actual.overall_score >= 8) {
        return { pass: false, message: `KDA ${k}/${d}/${a} (比率${kdaRatio.toFixed(1)}) なのにスコア${actual.overall_score}は高すぎる` }
      }
      // KDA比率が非常に高い（>5.0）のにスコア3以下は矛盾
      if (kdaRatio > 5.0 && actual.overall_score <= 3) {
        return { pass: false, message: `KDA ${k}/${d}/${a} (比率${kdaRatio.toFixed(1)}) なのにスコア${actual.overall_score}は低すぎる` }
      }
      return { pass: true }
    }

    default:
      return { pass: true }
  }
}

module.exports = { evaluateItem, evaluateMatchup, evaluateMacro, evaluateCoaching }
