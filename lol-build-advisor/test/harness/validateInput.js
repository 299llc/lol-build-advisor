/**
 * コーチング入力データの品質バリデーター
 * fixture生成時・テスト実行時の両方で使用
 *
 * @param {object} input - buildCoachingInput() の出力
 * @returns {{ valid: boolean, warnings: string[], errors: string[] }}
 */
function validateCoachingInput(input) {
  const warnings = []
  const errors = []

  if (!input) {
    return { valid: false, warnings, errors: ['入力データが null/undefined'] }
  }

  // === 必須フィールド (error) ===

  if (!input.me?.champion) {
    errors.push('me.champion が空')
  }

  const validRoles = ['TOP', 'JG', 'MID', 'ADC', 'SUP']
  if (!input.me?.role || !validRoles.includes(input.me.role)) {
    errors.push(`me.role が不正: ${input.me?.role} (期待: ${validRoles.join('/')})`)
  }

  if (!input.game_duration || input.game_duration < 300) {
    errors.push(`game_duration が短すぎる: ${input.game_duration || 0}秒 (最低300秒)`)
  }

  if (input.snapshot_count === 0) {
    errors.push('snapshot_count が 0 — スナップショットが記録されていない')
  }

  const minutes = (input.game_duration || 0) / 60

  // me.items チェック
  if (minutes > 5 && (!input.me?.items || input.me.items.length === 0)) {
    errors.push('me.items が空 (5分超の試合)')
  }

  // === 品質警告 (warning) ===

  if (input.snapshot_count > 0 && input.snapshot_count < 5) {
    warnings.push(`snapshot_count が少ない: ${input.snapshot_count} (推奨: 5以上)`)
  }

  // build_path
  if (minutes > 10 && (!input.build_path || input.build_path.length === 0)) {
    warnings.push('build_path が空 (10分超の試合でビルド順序不明)')
  }

  // kda_per_phase
  if (input.kda_per_phase) {
    if (!input.kda_per_phase.early) {
      warnings.push('kda_per_phase.early が null — 序盤KDA推移なし')
    }
  } else {
    warnings.push('kda_per_phase が未定義')
  }

  // cs_per_phase
  if (input.cs_per_phase) {
    const hasAny = Object.values(input.cs_per_phase).some(v => v > 0)
    if (!hasAny && input.me?.role !== 'SUP') {
      warnings.push('cs_per_phase が全フェーズ0 (SUP以外)')
    }
  }

  // enemy_builds
  if (!input.enemy_builds || input.enemy_builds.length < 5) {
    warnings.push(`enemy_builds が${input.enemy_builds?.length || 0}件 (期待: 5件)`)
  }

  // ally_stats
  if (!input.ally_stats || input.ally_stats.length === 0) {
    warnings.push('ally_stats が空')
  }

  // enemy_damage_profile
  if (input.enemy_damage_profile) {
    const sum = (input.enemy_damage_profile.ad || 0) + (input.enemy_damage_profile.ap || 0)
    if (sum < 90 || sum > 110) {
      warnings.push(`enemy_damage_profile の合計が不正: AD${input.enemy_damage_profile.ad}+AP${input.enemy_damage_profile.ap}=${sum}`)
    }
  } else {
    warnings.push('enemy_damage_profile が未定義')
  }

  // gold_timeline
  if (minutes > 10 && (!input.gold_timeline || input.gold_timeline.length < 3)) {
    warnings.push(`gold_timeline が少ない: ${input.gold_timeline?.length || 0}点 (10分超の試合)`)
  }

  // lane_comparison (レーンロールのみ)
  const laneRoles = ['TOP', 'MID', 'ADC']
  if (laneRoles.includes(input.me?.role) && (!input.lane_comparison || input.lane_comparison.length === 0)) {
    warnings.push(`lane_comparison が空 (${input.me.role}ロール)`)
  }

  // lane_opponent
  const laneOpponentRoles = ['TOP', 'MID', 'ADC', 'SUP']
  if (laneOpponentRoles.includes(input.me?.role) && !input.lane_opponent) {
    warnings.push(`lane_opponent が未定義 (${input.me.role}ロール)`)
  }

  // enemy_healer_count
  if (input.enemy_healer_count !== undefined && (input.enemy_healer_count < 0 || input.enemy_healer_count > 5)) {
    warnings.push(`enemy_healer_count が不正: ${input.enemy_healer_count}`)
  }

  // objective_participation (全0は怪しい — 長い試合で)
  if (minutes > 15 && input.objective_participation) {
    const total = Object.values(input.objective_participation).reduce((s, v) => s + v, 0)
    if (total === 0) {
      warnings.push('objective_participation が全て0 (15分超の試合 — データ不足の可能性)')
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  }
}

/**
 * バリデーション結果をコンソールに表示
 */
function printValidation(name, result) {
  const icon = result.valid ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
  console.log(`  ${icon} ${name}`)
  for (const e of result.errors) {
    console.log(`    \x1b[31m[ERROR] ${e}\x1b[0m`)
  }
  for (const w of result.warnings) {
    console.log(`    \x1b[33m[WARN]  ${w}\x1b[0m`)
  }
}

module.exports = { validateCoachingInput, printValidation }
