/**
 * ドメイン知識データベース — ロジック部分
 * 知識データは knowledge/ フォルダに分離
 */

const { ROLE_DEEP_KNOWLEDGE, CLASS_DEEP_KNOWLEDGE } = require('./knowledge/deepKnowledge')
const { ROLE_KNOWLEDGE, CLASS_KNOWLEDGE, PHASE_KNOWLEDGE, MACRO_TEXTBOOK, TAG_TRAITS } = require('./knowledge/game')
const { RANK_COACHING, RANK_BENCHMARKS } = require('./knowledge/rank')

/**
 * ゲーム時間からフェーズを判定
 */
function getGamePhase(gameTimeSec) {
  if (gameTimeSec < 840) return 'early'   // 14分未満
  if (gameTimeSec < 1500) return 'mid'    // 25分未満
  return 'late'
}

/**
 * ローカルLLM用のコンパクトな知識コンテキストを構築
 * 小型モデルのコンテキスト長制限に配慮して最小限の情報に絞る
 *
 * @param {string} position - TOP/JG/MID/ADC/SUP
 * @param {number} gameTimeSec - ゲーム時間（秒）
 * @param {object} [opts] - 追加オプション
 * @param {string} [opts.championClass] - チャンプクラス (tank, fighter, assassin, mage, marksman, support_enchanter, support_engage)
 * @returns {string} コンテキスト文字列
 */
function buildKnowledgeContext(position, gameTimeSec, opts = {}) {
  const lines = []
  const phase = getGamePhase(gameTimeSec)
  const role = ROLE_KNOWLEDGE[position]
  const phaseInfo = PHASE_KNOWLEDGE[phase]

  if (role) {
    lines.push(`【${position}の役割】`)
    lines.push(`優先事項: ${role.priorities.join('、')}`)
    const phaseAdvice = phase === 'early' ? role.earlyGame : phase === 'mid' ? role.midGame : role.lateGame
    lines.push(`現フェーズ(${phase === 'early' ? '序盤' : phase === 'mid' ? '中盤' : '終盤'}): ${phaseAdvice}`)
    lines.push(`CS目安: ${role.csTarget}/分`)
  }

  if (phaseInfo) {
    lines.push('')
    lines.push(`【${phase === 'early' ? '序盤' : phase === 'mid' ? '中盤' : '終盤'}の重点】`)
    lines.push(`注目: ${phaseInfo.focus}`)
    lines.push(`オブジェクト: ${phaseInfo.objectives}`)
    for (const tip of phaseInfo.tips) {
      lines.push(`- ${tip}`)
    }
  }

  if (opts.championClass && CLASS_KNOWLEDGE[opts.championClass]) {
    const cls = CLASS_KNOWLEDGE[opts.championClass]
    lines.push('')
    lines.push(`【チャンプタイプ: ${opts.championClass}】`)
    lines.push(`プレイスタイル: ${cls.playstyle}`)
    lines.push(`アイテム優先: ${cls.itemPriority}`)
    lines.push(`チーム戦: ${cls.teamfight}`)
  }

  return lines.join('\n')
}

/**
 * マクロアドバイス用の戦略知識を構築
 * キル差・フェーズに応じて関連する教科書の章を選択して注入
 *
 * @param {string} position - TOP/JG/MID/ADC/SUP
 * @param {number} gameTimeSec - ゲーム時間（秒）
 * @param {number} killDiff - キル差（味方-敵、正=優勢、負=劣勢）
 * @returns {string} 戦略知識コンテキスト
 */
/**
 * @param {string} position - TOP/JG/MID/ADC/SUP
 * @param {number} gameTimeSec
 * @param {number} killDiff
 * @param {string} rank
 * @param {string[]} [availableObjectives] - 利用可能オブジェクト名一覧 (例: ['ドラゴン', 'バロン'])
 *   指定された場合、一覧に含まれないオブジェクトの知識セクションは注入しない
 */
function buildMacroKnowledge(position, gameTimeSec, killDiff, rank, availableObjectives) {
  const lines = []
  const phase = getGamePhase(gameTimeSec)
  const phaseName = phase === 'early' ? '序盤' : phase === 'mid' ? '中盤' : '終盤'

  // ランク別知識を最初に注入
  if (rank) {
    lines.push(buildRankKnowledge(rank, position))
    lines.push('')
  }
  const role = ROLE_KNOWLEDGE[position]

  // ヘルパー: セクション追加
  const addSection = (title, tips) => {
    lines.push('')
    lines.push(`【${title}】`)
    for (const tip of tips) lines.push(`- ${tip}`)
  }

  // オブジェクト関連知識のフィルタ: 利用可能オブジェクト一覧が渡されていれば、
  // 存在しないオブジェクトの知識セクションは注入しない（LLMが言及しないようにする）
  const hasObjective = (name) => !availableObjectives || availableObjectives.includes(name)

  // ── ロール別の現フェーズ戦略（1行で十分） ──
  if (role) {
    const phaseAdvice = phase === 'early' ? role.earlyGame : phase === 'mid' ? role.midGame : role.lateGame
    lines.push(`【${position}の${phaseName}戦略】${phaseAdvice}`)
  }

  // ── 状況に応じた戦略（最大1セクション） ──
  if (killDiff <= -10) {
    lines.push('')
    lines.push('【大幅劣勢】デスしないことが最優先。集団戦を避け、タワー下でファーム。キャッチ（敵の孤立した1人を捕まえる）が唯一の勝ち筋')
  } else if (killDiff <= -3) {
    addSection('劣勢時の戦い方', MACRO_TEXTBOOK.playingFromBehind.slice(0, 4))
  } else if (killDiff >= 5) {
    addSection('優勢時の畳み方', MACRO_TEXTBOOK.closingOutGames.slice(0, 4))
  }

  // ── フェーズ×状況に応じて最大3-4セクションのみ注入 ──
  // 9Bモデルにはコンパクトなコンテキストが必要（目標: 3000-4000トークン以内）
  if (phase === 'early') {
    // 序盤: ウェーブ管理 + オブジェクト + ロール別1つ
    addSection('序盤のウェーブ管理', MACRO_TEXTBOOK.earlyWaveManagement.slice(0, 3))
    if (hasObjective('ヴォイドグラブ')) {
      addSection('ヴォイドグラブ', MACRO_TEXTBOOK.voidgrub)
    }
    if (hasObjective('ヘラルド')) {
      addSection('ヘラルド', MACRO_TEXTBOOK.herald.slice(0, 2))
    }
    if (position === 'JG') {
      addSection('ジャングル', MACRO_TEXTBOOK.jungleTracking.slice(0, 3))
    } else if (position === 'MID' || position === 'SUP') {
      addSection('ローム', MACRO_TEXTBOOK.roaming.slice(0, 3))
    }
  } else if (phase === 'mid') {
    // 中盤: オブジェクト判断 + ウェーブ + チーム戦/ロール別
    addSection('オブジェクト優先度', MACRO_TEXTBOOK.objectivePriority)
    addSection('オブジェクト準備', MACRO_TEXTBOOK.objectivePrep)
    if (position !== 'SUP') {
      addSection('ウェーブ管理', MACRO_TEXTBOOK.waveManagement.slice(0, 4))
    }
    // ロール別チーム戦（1行）
    if (MACRO_TEXTBOOK.teamfightByRole[position]) {
      lines.push(`【${position}のチーム戦】${MACRO_TEXTBOOK.teamfightByRole[position]}`)
    }
    if (position === 'TOP') {
      addSection('スプリットプッシュ', MACRO_TEXTBOOK.splitPush.slice(0, 3))
    }
  } else {
    // 終盤: オブジェクト + チーム戦判断
    addSection('オブジェクト優先度', MACRO_TEXTBOOK.objectivePriority)
    if (hasObjective('ドラゴン')) {
      addSection('エルダードラゴン', MACRO_TEXTBOOK.elderDragon.slice(0, 3))
    }
    if (hasObjective('バロン')) {
      addSection('バロン戦略', MACRO_TEXTBOOK.baronBait.slice(0, 3))
    }
    addSection('チーム戦判断', MACRO_TEXTBOOK.fightOrFlight.slice(0, 4))
    if (MACRO_TEXTBOOK.teamfightByRole[position]) {
      lines.push(`【${position}のチーム戦】${MACRO_TEXTBOOK.teamfightByRole[position]}`)
    }
  }

  return lines.join('\n')
}

// ── タグから戦い方の特徴を推定 ──

/**
 * 試合開始時に10体のチャンプ情報を教科書形式で構築
 * 1回生成して試合中キャッシュする（チャンプは変わらない）
 *
 * @param {Array} allies - 味方プレイヤー [{championName, enName, position, tags, stats}]
 * @param {Array} enemies - 敵プレイヤー [{championName, enName, position, tags, stats}]
 * @param {object} [spellData] - スキル情報 { enName: { passive, spells } }
 * @returns {string} 教科書テキスト
 */
function buildMatchChampionKnowledge(allies, enemies, spellData = {}) {
  const lines = []

  const formatChamp = (p) => {
    const tags = p.tags || []
    const primaryTag = tags[0] || 'Unknown'
    const trait = TAG_TRAITS[primaryTag] || {}
    const parts = []

    // 基本情報
    parts.push(`${p.championName || p.jaName || p.enName} (${p.position || '?'})`)
    parts.push(`  タイプ: ${tags.map(t => TAG_TRAITS[t]?.style || t).join(' / ')}`)
    if (trait.teamfight) parts.push(`  集団戦: ${trait.teamfight}`)
    if (trait.scaling) parts.push(`  パワースパイク: ${trait.scaling}`)

    // 基礎ステータスのハイライト（HP/ARが高い=タンキー、ADが高い=物理主体）
    const stats = p.stats || {}
    if (stats.hp && stats.hp > 600) parts.push(`  基礎HP: ${Math.round(stats.hp)}（高い）`)
    if (stats.armor && stats.armor > 35) parts.push(`  基礎AR: ${Math.round(stats.armor)}（硬い）`)

    // Riot公式の攻撃/防御/魔力指標
    const spells = spellData[p.enName]
    if (spells?.info) {
      const info = spells.info
      const ratings = []
      if (info.attack >= 7) ratings.push('攻撃型')
      if (info.defense >= 7) ratings.push('防御型')
      if (info.magic >= 7) ratings.push('魔法型')
      if (ratings.length) parts.push(`  特性: ${ratings.join('・')}`)
    }

    // Riot公式Tips（チャンプの強み/弱み）
    if (spells?.allyTips?.length) {
      parts.push(`  強み: ${spells.allyTips.slice(0, 2).map(t => t.substring(0, 80)).join(' / ')}`)
    }
    if (spells?.enemyTips?.length) {
      parts.push(`  弱点: ${spells.enemyTips.slice(0, 2).map(t => t.substring(0, 80)).join(' / ')}`)
    }

    // スキル要約（60文字に要約）
    if (spells) {
      parts.push(`  パッシブ: ${spells.passive.name} - ${spells.passive.desc.substring(0, 60)}`)
      for (const s of spells.spells) {
        parts.push(`  ${s.key}: ${s.name} - ${s.desc.substring(0, 60)}`)
      }
    }

    return parts.join('\n')
  }

  // 味方チーム分析
  lines.push('【味方チームの構成と特徴】')
  for (const p of allies) {
    lines.push(formatChamp(p))
    lines.push('')
  }

  // 味方構成の強み/弱み判定
  const allyTags = allies.flatMap(p => p.tags || [])
  const allyHasTank = allyTags.includes('Tank')
  const allyHasAssassin = allyTags.includes('Assassin')
  const allyHasEngager = allyTags.filter(t => t === 'Tank').length >= 1
  const allyAD = allies.filter(p => (p.tags || []).some(t => t === 'Marksman' || t === 'Fighter')).length
  const allyAP = allies.filter(p => (p.tags || []).some(t => t === 'Mage')).length

  lines.push('【味方構成の分析】')
  if (allyHasTank) lines.push('- フロントラインあり: 集団戦で前線を張れる')
  if (!allyHasTank) lines.push('- フロントライン不足: 長時間の集団戦は不利。ピックやスプリットが有効')
  if (allyAD >= 3 && allyAP === 0) lines.push('- 警告: AD偏り。敵がアーマー積むと厳しい')
  if (allyAP >= 3 && allyAD === 0) lines.push('- 警告: AP偏り。敵がMR積むと厳しい')
  if (allyHasAssassin) lines.push('- アサシンあり: 序盤にリードを作ってスノーボールが勝ち筋')
  lines.push('')

  // 敵チーム分析
  lines.push('【敵チームの構成と特徴】')
  for (const p of enemies) {
    lines.push(formatChamp(p))
    lines.push('')
  }

  // 敵の脅威分析
  const enemyTags = enemies.flatMap(p => p.tags || [])
  const enemyHasAssassin = enemyTags.includes('Assassin')
  const enemyHasEngager = enemyTags.includes('Tank')
  const enemyLateScalers = enemies.filter(p => (p.tags || []).some(t => t === 'Marksman')).length

  lines.push('【敵構成の脅威】')
  if (enemyHasAssassin) lines.push('- 敵にアサシン: 味方キャリーのポジショニングに注意。集団で行動')
  if (enemyHasEngager) lines.push('- 敵にタンク/エンゲージ: 敵のエンゲージCDを把握して戦闘を避けるor受ける')
  if (enemyLateScalers >= 2) lines.push('- 敵に後半スケーラーが多い: 長引くと不利。早期にオブジェクトを取り切る')
  lines.push('')

  return lines.join('\n')
}

/**
 * ロール別ディープコーチング知識を構築
 * ロールに対応する全カテゴリの詳細Tipsをプロンプトに注入
 *
 * @param {string} position - TOP/JG/MID/ADC/SUP
 * @param {string} [championClass] - tank/assassin/mage/fighter/marksman/support_enchanter
 * @returns {string} ディープ知識コンテキスト
 */
function buildRoleDeepKnowledge(position, championClass) {
  const lines = []
  const roleData = ROLE_DEEP_KNOWLEDGE[position]

  if (roleData) {
    const sectionNames = {
      // TOP
      meleeVsRanged: 'メレーvsレンジのマッチアップ',
      waveManagement: 'ウェーブ管理（タワー付近）',
      teleportUsage: 'テレポート最適化',
      splitPushDecision: 'スプリットプッシュ判断',
      gankSurvival: 'ガンク対策',
      // JG
      clearOptimization: 'クリア最適化',
      gankTiming: 'ガンクタイミング',
      objectiveControl: 'オブジェクトコントロール',
      counterJungling: 'カウンタージャングル',
      tempoAndPathing: 'テンポとパス',
      // MID
      waveControlForRoam: 'ウェーブ管理とローム',
      assassinVsMage: 'アサシンvsメイジ',
      riverPriorityAndVision: 'リバー優先権と視界',
      tradingWindows: 'トレードウィンドウ',
      powerSpikeUsage: 'パワースパイク活用',
      // ADC
      spacingAndKiting: 'スペーシングとカイティング',
      supportSynergy: 'サポートシナジー',
      freezeVsPush: 'フリーズvsプッシュ判断',
      teamfightPositioning: 'チーム戦ポジショニング',
      itemPowerSpikes: 'アイテムパワースパイク',
      // SUP
      level2Race: 'Lv2レース',
      roamTiming: 'ロームタイミング',
      visionControlTiming: 'ビジョンコントロール',
      engageVsPeel: 'エンゲージvsピール判断',
      wardingByPhase: 'フェーズ別ワーディング',
    }

    for (const [key, tips] of Object.entries(roleData)) {
      const title = sectionNames[key] || key
      lines.push(`\n【${position} - ${title}】`)
      for (const tip of tips) {
        lines.push(`- ${tip}`)
      }
    }
  }

  // チャンピオンアーキタイプ別知識
  if (championClass && CLASS_DEEP_KNOWLEDGE[championClass]) {
    const classLabel = {
      tank: 'タンク', assassin: 'アサシン', mage: 'メイジ',
      fighter: 'ファイター', marksman: 'マークスマン',
      support_enchanter: 'エンチャンター',
    }
    lines.push(`\n【${classLabel[championClass] || championClass}のディープ戦略】`)
    for (const tip of CLASS_DEEP_KNOWLEDGE[championClass]) {
      lines.push(`- ${tip}`)
    }
  }

  return lines.join('\n')
}


/**
 * ランク別コーチング知識を構築
 * @param {string} rank - ランクティア (IRON, BRONZE, SILVER, GOLD, PLATINUM, EMERALD, DIAMOND, MASTER, GRANDMASTER, CHALLENGER)
 * @param {string} position - ロール (TOP, JG, MID, ADC, SUP)
 * @returns {string} ランク別アドバイステキスト
 */
function buildRankKnowledge(rank, position) {
  const tierKey = rank?.toUpperCase() || 'GOLD'
  let data = RANK_COACHING[tierKey]
  if (!data) data = RANK_COACHING.GOLD
  if (data.ref) data = RANK_COACHING[data.ref]

  const posKey = position?.toUpperCase() || 'MID'
  const posMap = { TOP: 'top', JUNGLE: 'jg', JG: 'jg', MIDDLE: 'mid', MID: 'mid', BOTTOM: 'adc', ADC: 'adc', UTILITY: 'sup', SUP: 'sup', SUPPORT: 'sup' }
  const benchKey = posMap[posKey] || 'mid'
  const benchmark = RANK_BENCHMARKS[tierKey] || RANK_BENCHMARKS.GOLD

  const lines = [
    `【プレイヤーランク: ${data.tier}（${data.label}）】`,
    `重点改善エリア: ${data.focusAreas.join('、')}`,
    `目標CS/分: ${benchmark[benchKey]}以上 | デス目標: ${data.deathTarget}以下 | KDA目標: ${data.kdaTarget}以上`,
    '',
    `【${data.tier}向けアドバイス】`,
    ...data.tips.map(t => `- ${t}`),
  ]

  return lines.join('\n')
}

module.exports = {
  ROLE_KNOWLEDGE,
  CLASS_KNOWLEDGE,
  PHASE_KNOWLEDGE,
  MACRO_TEXTBOOK,
  ROLE_DEEP_KNOWLEDGE,
  CLASS_DEEP_KNOWLEDGE,
  RANK_COACHING,
  RANK_BENCHMARKS,
  getGamePhase,
  buildKnowledgeContext,
  buildMacroKnowledge,
  buildMatchChampionKnowledge,
  buildRoleDeepKnowledge,
  buildRankKnowledge,
}
