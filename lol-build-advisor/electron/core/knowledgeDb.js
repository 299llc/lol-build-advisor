/**
 * ドメイン知識データベース
 * ローカル小型LLM (Qwen3 3-4B) の知識不足を補うため、
 * LoL固有のドメイン知識をプロンプトに注入する
 *
 * Data Dragon / OP.GG から取得済みのデータと組み合わせて使用
 */

// ロール別の基本戦略知識
const ROLE_KNOWLEDGE = {
  TOP: {
    priorities: ['対面とのトレード', 'ウェーブ管理', 'テレポートタイミング', 'スプリットプッシュ判断'],
    earlyGame: 'レーンで有利を作り、ヘラルドに寄る。テレポートは温存してボットダイブ or オブジェクトに使う',
    midGame: 'スプリットプッシュ or テレポート合流。1v1で勝てるならサイドレーン圧力',
    lateGame: 'チーム戦参加 or スプリット。バロン/エルダー前にチームに合流',
    csTarget: 7.0,
  },
  JG: {
    priorities: ['ファームルート', 'ガンクタイミング', 'オブジェクト管理', 'カウンタージャングル'],
    earlyGame: 'フルクリア or 3キャンプ→ガンク。敵JGの位置を推測してカウンターガンク',
    midGame: 'オブジェクト管理が最重要。ファーム→オブジェクト→ガンクの優先順位',
    lateGame: 'スマイト温存でオブジェクト確保。チーム戦ではフランクかピール',
    csTarget: 5.5,
  },
  MID: {
    priorities: ['ウェーブプッシュ', 'ローム', 'レーン優先権', 'バースト/ポーク'],
    earlyGame: 'ウェーブ押してからローム。Lv2/Lv3/Lv6のパワースパイクを活かす',
    midGame: 'レーン優先権を活かしてオブジェクトに先着。サイドウェーブも回収',
    lateGame: 'チーム戦のメインダメージ or ピック。ポジショニングが命',
    csTarget: 7.5,
  },
  ADC: {
    priorities: ['安全なファーム', 'ポジショニング', 'DPS出力', 'コアアイテム完成'],
    earlyGame: 'CSに集中。サポートと合わせてトレード。無理なファイトは避ける',
    midGame: 'コアアイテム2品完成が目標。チーム戦ではフロントラインの後ろからDPS',
    lateGame: '最重要ダメージ源。絶対にデスしない。バロン/ドラゴンへのDPSが仕事',
    csTarget: 8.0,
  },
  SUP: {
    priorities: ['ビジョン管理', 'ロームタイミング', 'エンゲージ/ピール', 'オブジェクト準備'],
    earlyGame: 'ADCを守りながらトレード。Lv2先行でオールイン検討。ワード管理',
    midGame: 'ビジョン管理とローム。オブジェクト60秒前からワード設置開始',
    lateGame: 'チーム戦でのエンゲージ or ピール。ビジョンで情報有利を作る',
    csTarget: 1.0,
  },
}

// チャンピオンクラス別の知識
const CLASS_KNOWLEDGE = {
  tank: {
    playstyle: 'フロントライン。CCでエンゲージし、味方のDPSを守る',
    itemPriority: 'HP → 敵の主要ダメージタイプに合わせた防御 → CDR',
    teamfight: '先頭でエンゲージ。CCチェインで敵キャリーを拘束',
  },
  fighter: {
    playstyle: 'サイドレーンで圧力。1v1/1v2を目指す',
    itemPriority: '攻撃+防御バランス。対面に合わせた防御アイテム',
    teamfight: 'フランクから敵キャリーを狙う or フロントライン',
  },
  assassin: {
    playstyle: 'バーストで敵キャリーを削除。ロームでキル',
    itemPriority: '貫通/ダメージ優先。防御は最後',
    teamfight: 'フランクからキャリー暗殺。タイミングが命',
  },
  mage: {
    playstyle: 'ウェーブクリア+ポーク。チーム戦ではAoEダメージ',
    itemPriority: 'AP → CDR → 貫通。ゾーニャは必須級',
    teamfight: '安全な位置からスキルを当て続ける',
  },
  marksman: {
    playstyle: '安全にファームしてアイテムスパイク到達',
    itemPriority: 'クリティカル: IE→ジール系→LDR。オンヒット: BORK→グインソー',
    teamfight: 'フロントラインの後ろから最も近い敵を攻撃。ポジショニング最優先',
  },
  support_enchanter: {
    playstyle: '味方を強化・回復。安全な位置からスキル使用',
    itemPriority: 'サポートアイテム→CDR→味方強化',
    teamfight: 'キャリーの近くでピール。シールド/回復を最適なタイミングで',
  },
  support_engage: {
    playstyle: 'エンゲージでチーム戦を開始。ビジョン管理',
    itemPriority: '防御+CDR。ゼケズ等の味方強化アイテム',
    teamfight: 'CCでエンゲージ。敵キャリーを拘束',
  },
}

// ゲームフェーズ別の一般知識
const PHASE_KNOWLEDGE = {
  early: {  // 0-14分
    focus: 'レーニング、CS、ファーストブラッド、ファーストタワー',
    objectives: 'ドラゴン (5:00)、ヴォイドグラブ (8:00)、ヘラルド (15:00)',
    tips: [
      'Lv1-3はチャンプ相性が大きい。不利マッチアップは無理しない',
      'ファーストリコールのゴールド管理が重要 (1100-1300G目安)',
      'ワードは川のブッシュに。敵JGのガンクルートを把握',
    ],
  },
  mid: {  // 14-25分
    focus: 'オブジェクト争奪、タワー、ローテーション',
    objectives: 'ドラゴンソウル、バロン (20:00)、タワー',
    tips: [
      'ARAMを避ける。サイドウェーブの回収が重要',
      'バロン前にワードを設置。視界戦に勝つことが鍵',
      'パワースパイク（アイテム完成）のタイミングでオブジェクトを強制',
    ],
  },
  late: {  // 25分以降
    focus: 'バロン/エルダー、インヒビター、1デス=敗北の緊張感',
    objectives: 'バロン、エルダードラゴン、インヒビター',
    tips: [
      'デスしないことが最優先。シャットダウンゴールドが試合を決める',
      'エルダードラゴンは絶対に相手に渡さない',
      '単独行動禁止。チームで行動する',
    ],
  },
}

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

module.exports = {
  ROLE_KNOWLEDGE,
  CLASS_KNOWLEDGE,
  PHASE_KNOWLEDGE,
  getGamePhase,
  buildKnowledgeContext,
}
