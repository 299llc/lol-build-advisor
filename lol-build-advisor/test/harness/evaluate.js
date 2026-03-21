/**
 * テスト評価ロジック
 * 期待出力と実際のAI出力を比較して合否を判定する
 */

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

  // 必須アイテムチェック
  if (expected.must_include) {
    const actualIds = actual.recommended.map(r => r.id)
    for (const requiredId of expected.must_include) {
      if (!actualIds.includes(requiredId)) {
        details.push(`必須アイテム ${requiredId} が推薦に含まれていない`)
        pass = false
      }
    }
  }

  // 禁止アイテムチェック
  if (expected.must_not_include) {
    const actualIds = actual.recommended.map(r => r.id)
    for (const bannedId of expected.must_not_include) {
      if (actualIds.includes(bannedId)) {
        details.push(`禁止アイテム ${bannedId} が推薦に含まれている`)
        pass = false
      }
    }
  }

  // candidatesの範囲内チェック
  if (expected.valid_ids) {
    for (const r of actual.recommended) {
      if (!expected.valid_ids.includes(r.id)) {
        details.push(`候補外アイテム ${r.id} が推薦されている`)
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

  // action が action_candidates に含まれるかチェック
  if (expected.valid_actions && actual.action) {
    if (!expected.valid_actions.includes(actual.action)) {
      details.push(`action "${actual.action}" が候補外`)
      pass = false
    }
  }

  // preferred_action チェック（推奨だが不一致でもfailにしない、詳細に記録）
  if (expected.preferred_action && actual.action) {
    if (actual.action !== expected.preferred_action) {
      details.push(`⚠ preferred_action "${expected.preferred_action}" ではなく "${actual.action}" を選択`)
    }
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
 */
function evaluateCoaching(actual, expected) {
  const details = []
  let pass = true

  if (!actual) {
    return { pass: false, details: ['出力なし'] }
  }

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

  // スコア範囲チェック
  if (expected.score_range) {
    const [min, max] = expected.score_range
    if (actual.overall_score < min || actual.overall_score > max) {
      details.push(`overall_score ${actual.overall_score} が期待範囲 [${min}, ${max}] 外`)
      pass = false
    }
  }

  if (pass) details.push('OK')
  return { pass, details }
}

module.exports = { evaluateItem, evaluateMatchup, evaluateMacro, evaluateCoaching }
