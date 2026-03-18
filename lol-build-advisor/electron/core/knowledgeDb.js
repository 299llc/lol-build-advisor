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

// ═══════════════════════════════════════════════════════════════
//  LoLマクロ戦略の教科書（状況判断の根拠として使用）
//  buildMacroKnowledge() で状況に応じた章を選択して注入
// ═══════════════════════════════════════════════════════════════
const MACRO_TEXTBOOK = {

  // ── 勝利条件の見極め ──
  winConditions: [
    'チームの勝利条件を見極めることが最重要。スケーリング構成なら時間を稼ぐ、序盤構成ならスノーボール',
    '味方にスプリットプッシャー（フィオラ、ヨリック、トリンダメア等）がいるなら1-3-1や1-4を検討',
    '味方にエンゲージ（マルファイト、レオナ等）がいるなら5v5集団戦を仕掛ける',
    '敵にスケーリングチャンプ（カイ=サ、ヴェイン等）がいるなら早期にオブジェクトを取り切る',
    'エンゲージ構成はポークに強い、ポークはカウンターエンゲージに強い、カウンターエンゲージはエンゲージに強い',
  ],

  // ── ウェーブ管理 ──
  waveManagement: [
    'オブジェクトを取る前にサイドウェーブをプッシュしておく（CS損失＋敵にタワーを折られるのを防ぐ）',
    'バロン前にBOTウェーブを押す。エルダー前にTOPウェーブを押す',
    'タワーが折れたレーンはスローに押す。相手がサイドに来ざるを得ない状況を作る',
    'スーパーミニオンが出ているレーンは放置しない。最低1人が対処する必要がある',
    'フリーズ: 敵ミニオンが3-4体多い状態をタワー前で維持。敵のCS・経験値を否定しガンクを誘う',
    'スロープッシュ: ラストヒットのみで3ウェーブ分の大波を作りタワーにクラッシュ。ダイブ・ローム・リコールの前準備',
    'ファストプッシュ: 全スキルで最速処理。リコール前やローム対応時に使う',
    'プッシュしてからローム/リコールが鉄則。レーンを放置してロームするとCS・経験値・タワーを失う',
  ],

  // ── ウェーブ管理（序盤レーン向け） ──
  earlyWaveManagement: [
    'Lv2先行（最初のウェーブ6体+次のメレー1体）は序盤最大のパワースパイク。2スキルvs1スキルの圧倒的差',
    'キャノンウェーブ到着前にウェーブ全処理→リコールが最も効率的',
    '相手がリコールしたら: プッシュしてタワーにぶつける or フリーズして差を広げる',
    '敵JGの位置不明時はウェーブを引いてタワー下へ。位置が分かっていればアグレッシブにプッシュ',
    'トレードに勝ったら必ず何かに変換する: ワード設置、ウェーブクラッシュ、フリーズ、プレート獲得',
  ],

  // ── レーンでのトレード ──
  laneTrading: [
    '敵がメインスキルを使った直後（CD中）にトレードを仕掛ける',
    '自分のミニオンが多い状態でトレード。ミニオンの自動攻撃分のダメージで勝てる',
    '相手のダッシュ/脱出スキル使用後は追撃のチャンス',
    'テザリング: 攻撃射程ギリギリでAA1発→即座に射程外まで下がる。一方的にダメージを与える',
    'ショートトレード（一瞬のバースト→即離脱）はCD長いチャンプや序盤弱いチャンプに有効',
    'ロングトレード（長く殴り合い）はDPS勝ちできるチャンプ・コンクァラー持ちに有効',
  ],

  // ── リコールタイミング ──
  recallTiming: [
    'キャノンウェーブ直前にウェーブ全処理→リコールが最も効率的。キャノンがタワー攻撃を長時間吸収',
    '理想のリコールゴールド: 350G(ブーツ)、875G(中間素材)、1300G(B.F.ソード)',
    'オブジェクトのスポーン60-90秒前にリコール完了→買い物→HP回復→オブジェクトに合流',
    '1000G以上持っている状態で戦闘に入らない。先にアイテムに変換する',
    '必ず敵の視界外でリコールする（ブッシュ内など）',
  ],

  // ── ビジョンコントロール ──
  visionControl: [
    'オブジェクトの60秒前にはコントロールワードを設置開始する',
    'バロンピット周辺: 攻め側はピンク、守り側はピット内に設置',
    '視界の有利＝情報の有利。敵の位置が分かれば安全にオブジェクトを取れる',
    'スイーパーを持つサポート/JGがデワードの主役。ワード設置とデワードはセット',
    '攻めの目的にはディープワード、守りの目的には自軍領域にワード',
  ],

  // ── ビジョン（序盤） ──
  earlyVision: [
    'TOPレーン: リバーブッシュ+トライブッシュにワード',
    'MIDレーン: サイドブッシュ（ラプター前/ウルフ前の入口）にワード。両方向からのガンク警戒',
    'BOTレーン: リバーブッシュ+トライブッシュ+レーンブッシュ。3方向をカバー',
    'コントロールワードはリバーブッシュか自軍JG入口のブッシュに。防衛目的で長く残す場所に置く',
  ],

  // ── ビジョン（中盤以降） ──
  lateVision: [
    'オブジェクト周辺のアプローチルートにワード配置が最優先',
    '敵JGのバフキャンプ付近にワード→敵の動きとバフタイマーを把握',
    '終盤はドラゴンピット内だけでなくドラゴンへの「道」にワード（ピット内だけでは対応が遅れる）',
    '敵JG入口にディープワード→敵の集合位置を早めに把握',
  ],

  // ── オブジェクト判断 ──
  objectivePriority: [
    'インヒビター > バロン > エルダー > ドラゴン > タワー > ヘラルドの優先順位が基本',
    'ドラゴンソウルリーチ（3体目取得後）は最優先。ソウル阻止も同様に重要',
    'バロンは試合を閉じる最強のオブジェクト。敵のデスタイマー30秒以上ならバロンを検討',
    'オブジェクトトレード: ドラゴンを渡す代わりにヘラルドやタワーを取る判断も有効',
    '人数有利（4v5等）の時は必ずオブジェクトを取る。何もしないのが最悪',
    'エルダードラゴンはゲーム内最強バフ。取られるとほぼ逆転不能。バロンより優先される場面も多い',
  ],

  // ── オブジェクト準備の3習慣 ──
  objectivePrep: [
    'オブジェクト前にミッドウェーブをプッシュする',
    '余裕を持ってリコール（スポーン60-90秒前にアイテム購入完了）',
    'スポーン60秒前にワードを設置する',
    'バロン失敗の3大原因: ウェーブ未プッシュ、視界不足、チーム分散',
  ],

  // ── ヘラルド/ヴォイドグラブ ──
  heraldVoidgrub: [
    'ヴォイドグラブは8分スポーン。Lv6タイミングでTOP+JGで確保を狙う',
    'ヘラルドはタワープレート破壊に効果的。プレートが多く残っているタワーに使う',
    'ヘラルドはドラゴンとのオブジェクトトレードの判断材料。BOTでドラゴン取られる代わりにTOPでヘラルド',
  ],

  // ── ジャングルトラッキング ──
  jungleTracking: [
    '敵JGがマップに映った時間と場所を記録。次の行動を予測する',
    '敵JGのCS数で何キャンプ狩ったか推測可能',
    'バフの再スポーンは5分。取った時間を記録すれば次のスポーン時間がわかる',
    '敵JGが反対サイドにいると分かったら→アグレッシブにプッシュ・トレード',
    '敵JGの位置不明→ディフェンシブに引いてプレイ',
  ],

  // ── 劣勢時の戦い方 ──
  playingFromBehind: [
    '劣勢時は5v5を避ける。相手がミスするまでファームとウェーブクリアで耐える',
    '敵がオブジェクトを取りに来たら、別のレーンのタワーやオブジェクトと交換する',
    'キャッチ（1人をピック）が最高の逆転手段。ワードで敵の孤立を狙う',
    'タワー下での戦いを強制する。タワーダメージで人数不利を補える',
    'シャットダウンゴールド（連勝中の敵キル時300-1000Gボーナス）は逆転の鍵',
    'スプリットプッシュで敵を分断。5人で固まっている敵を引き剥がす',
    'ウェーブを自陣に引き込んで安全にファーム。CS差を広げられないことが重要',
    '無駄なデスを減らすことが最優先。デスすると経験値差・ゴールド差がさらに開く',
    '試合を引き延ばすほどレベル差・アイテム差は縮まりやすい',
    'オブジェクトバウンティ: ゴールド差が開くとタワー・ドラゴンにバウンティが付く',
    '防御的アイテムビルドに切り替えてチームファイトの生存率を上げる判断も有効',
  ],

  // ── 優勢時の畳み方 ──
  closingOutGames: [
    '優勢時は相手にファームさせない。敵JGに侵入してキャンプを奪う',
    'キルだけでは試合は終わらない。キル→プッシュ→オブジェクトの流れを常に意識',
    'バロン取得後はグループして1レーンをプッシュ。インヒビターを優先',
    'インヒビター1本折ればスーパーミニオンが出現し、相手は常に対応を迫られる',
    '優勢で無理なダイブは禁物。安全にオブジェクトを取り続ける',
    'シャットダウンゴールドを渡さない。デスしないことが優勢維持の鍵',
    '1000G以上持っていたらリコールしてアイテムに変換してから戦う',
    'リードしたらローム。自レーンの優位を味方全体に広げる',
  ],

  // ── スプリットプッシュ ──
  splitPush: [
    '前提: 1v1で対面に勝てるチャンプであること、TPが使用可能、味方4人が安全に撤退できること',
    '相手が2人以上送ってきたら→反対サイドでチームが人数有利でオブジェクト獲得',
    '相手が1人で対応してきたら→1v1で勝ってタワーを折る',
    '相手が無視したら→タワー・インヒビターを破壊',
    'バロン/ドラゴンが沸いている時にサイドレーンを押す→相手に二択を迫る',
    'NG: TPなし+視界なしでのスプリット（3人以上に囲まれてキルされる）',
    'チームは絶対に4v5の集団戦をしない。スプリッターの圧力で引きつける間はディスエンゲージに徹する',
  ],

  // ── チーム戦 ──
  teamfighting: [
    'チーム戦は人数が揃ってから始める。4v5は基本不利',
    'エンゲージの判断: 敵の重要スキル（ゾーニャ、フラッシュ、ULT）のCDを見る',
    'ピール（味方キャリーを守る）とダイブ（敵キャリーを倒す）のどちらが勝てるか判断',
    'チーム戦を避けてオブジェクトを取ることも有効な選択肢',
    'フォーカス: 5人で同じ敵を攻撃することが最も重要。バラバラに攻撃すると負ける',
    '理想は敵のDPS（ADC/メイジ）を最初に倒すこと。無理なら安全に攻撃できる最寄りの敵を攻撃',
  ],

  // ── チーム戦ロール別 ──
  teamfightByRole: {
    TOP: '【タンク】フロントラインでエンゲージ/ピール 【ファイター】フランクから敵キャリーを狙う or スプリット→TPで合流',
    JG: '敵JGのスマイト残量を把握。オブジェクトファイトではスマイト争いに負けないことが最優先',
    MID: '【メイジ】バックラインからAoEスキルを敵集団に当てる 【アサシン】横/後ろから敵キャリーに奇襲。正面参加NG',
    ADC: '最後列でフロントラインの後ろから攻撃。集団戦開始まで前に出ない。Flashは防御用に温存',
    SUP: '【タンクSUP】エンゲージ or ピール 【エンチャンターSUP】ADCの横でシールド・ヒール 【メイジSUP】バックラインでダメージ+CC',
  },

  // ── タワーダイブ ──
  towerDiving: [
    '前提: フルHPミニオン波（9体以上が理想）、2v1以上、脱出スキルあり',
    '手順: タンキーな方が先にタワーアグロ取得→ダメージ担当がキル→全員即座にタワーレンジ外へ',
    'HP危険域になったらアグロスワップ: 次のチャンプが敵にスキル/AAを当ててアグロ移動',
    'NG: 相手に強力なCC（スタン/ノックアップ）がある場合、敵JG位置不明の場合',
    'タワーの攻撃は連続で受けるほどダメージ増加。長居しないこと',
  ],

  // ── パワースパイク ──
  powerSpikes: [
    'Lv2: 2スキル解放。特にSUP+ADCのLv2オールインは強力',
    'Lv3: 3スキルコンボ可能。JGの最初のガンクタイミング',
    'Lv6: ULT解放。多くのチャンプの最大パワースパイク',
    'Lv9: メインスキルマックスランク。スキルダメージとCD短縮で大幅強化',
    '1アイテム完成（約3000-3200G）: 最初の大きなパワースパイク',
    '2アイテム完成: 中盤の強さのピーク。最も効率的に強い時間帯',
    '自分のアイテム完成タイミングで積極的にトレード/ファイトを仕掛ける',
    '敵のコアアイテム完成直後は無理をしない。スパイクが過ぎるまで待つ判断も重要',
  ],

  // ── ゴールド/経験値の理解 ──
  goldXpAdvantage: [
    '1000Gリード ≒ ロングソード2-3本分。小さいが積み重なる',
    '3000Gリード ≒ アイテム1個分の差。集団戦で明確な差',
    '5000G以上のリード ≒ 圧倒的。相手は集団戦を避けるべきレベル',
    'レベル差1 ≒ スキルポイント1つ分。レベル差2以上は致命的',
    '完成アイテム数の差で判断する方が正確。素材状態と完成品では雲泥の差',
    '持っているゴールドはアイテムに変えないと意味がない',
  ],

  // ── ローム（MID/SUP向け） ──
  roaming: [
    'ウェーブプッシュ完了後にローム。タワー下に押し込まれている状態でのロームは絶対NG',
    'サポートのローム: ウェーブクラッシュ後 or ADCリコール中がチャンス',
    'ローム前にマップ確認: 他レーンの味方/敵の位置、HPバー、ウェーブ状態を見る',
    '「キルまたはアシストが取れるか？」を考える。何も得られないロームは損',
    '相手のサモナースペル（フラッシュ/ヒール）のCD確認。CDならキルチャンス大',
    'ロームは速攻→帰還が原則。無駄にうろうろしない',
    'ロームに行く前にADCにピンで知らせること（SUP）',
  ],
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

/**
 * マクロアドバイス用の戦略知識を構築
 * キル差・フェーズに応じて関連する教科書の章を選択して注入
 *
 * @param {string} position - TOP/JG/MID/ADC/SUP
 * @param {number} gameTimeSec - ゲーム時間（秒）
 * @param {number} killDiff - キル差（味方-敵、正=優勢、負=劣勢）
 * @returns {string} 戦略知識コンテキスト
 */
function buildMacroKnowledge(position, gameTimeSec, killDiff) {
  const lines = []
  const phase = getGamePhase(gameTimeSec)
  const phaseName = phase === 'early' ? '序盤' : phase === 'mid' ? '中盤' : '終盤'
  const role = ROLE_KNOWLEDGE[position]

  // ヘルパー: セクション追加
  const addSection = (title, tips) => {
    lines.push('')
    lines.push(`【${title}】`)
    for (const tip of tips) lines.push(`- ${tip}`)
  }

  // ── ロール別の現フェーズ戦略 ──
  if (role) {
    const phaseAdvice = phase === 'early' ? role.earlyGame : phase === 'mid' ? role.midGame : role.lateGame
    lines.push(`【${position}の${phaseName}戦略】`)
    lines.push(phaseAdvice)
  }

  // ── 勝利条件（常に注入） ──
  addSection('勝利条件の判断基準', MACRO_TEXTBOOK.winConditions)

  // ── 状況に応じた戦略を選択 ──
  if (killDiff <= -3) {
    addSection('劣勢時の戦い方', MACRO_TEXTBOOK.playingFromBehind)
  } else if (killDiff >= 5) {
    addSection('優勢時の畳み方', MACRO_TEXTBOOK.closingOutGames)
  }

  // ── フェーズに応じた知識 ──
  if (phase === 'early') {
    addSection('序盤のウェーブ管理', MACRO_TEXTBOOK.earlyWaveManagement)
    addSection('レーンでのトレード', MACRO_TEXTBOOK.laneTrading)
    addSection('リコールタイミング', MACRO_TEXTBOOK.recallTiming)
    addSection('序盤のビジョン', MACRO_TEXTBOOK.earlyVision)
    // JG向け
    if (position === 'JG') {
      addSection('ジャングルトラッキング', MACRO_TEXTBOOK.jungleTracking)
    }
    // MID/SUP向け
    if (position === 'MID' || position === 'SUP') {
      addSection('ローム', MACRO_TEXTBOOK.roaming)
    }
  } else {
    // 中盤・終盤
    addSection('オブジェクト優先度', MACRO_TEXTBOOK.objectivePriority)
    addSection('オブジェクト準備', MACRO_TEXTBOOK.objectivePrep)
    addSection('ウェーブ管理', MACRO_TEXTBOOK.waveManagement)
    addSection('ビジョンコントロール', MACRO_TEXTBOOK.lateVision)
    addSection('チーム戦', MACRO_TEXTBOOK.teamfighting)
    // ロール別チーム戦
    if (MACRO_TEXTBOOK.teamfightByRole[position]) {
      lines.push(`- ${MACRO_TEXTBOOK.teamfightByRole[position]}`)
    }
    // スプリットプッシュ（TOP/ファイター向け）
    if (position === 'TOP') {
      addSection('スプリットプッシュ', MACRO_TEXTBOOK.splitPush)
    }
  }

  // ── パワースパイク（常に有用） ──
  addSection('パワースパイク', MACRO_TEXTBOOK.powerSpikes)

  return lines.join('\n')
}

// ── タグから戦い方の特徴を推定 ──
const TAG_TRAITS = {
  Fighter: { style: 'ファイター（近接戦闘・サステイン）', teamfight: 'フランクorフロントライン', scaling: '中盤' },
  Tank: { style: 'タンク（硬い・CC持ち）', teamfight: 'フロントラインでエンゲージ/ピール', scaling: '中盤' },
  Mage: { style: 'メイジ（AoEダメージ・バースト）', teamfight: 'バックラインからAoEスキル', scaling: '中盤〜後半' },
  Assassin: { style: 'アサシン（単体バースト・ローム）', teamfight: 'フランクから敵キャリー暗殺', scaling: '序盤〜中盤' },
  Marksman: { style: 'マークスマン（持続DPS・射程）', teamfight: '最後列からDPS。死なないことが最優先', scaling: '後半（2-3アイテム以降）' },
  Support: { style: 'サポート（味方補助・CC・視界）', teamfight: 'ピールorエンゲージ', scaling: '序盤〜中盤' },
}

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

module.exports = {
  ROLE_KNOWLEDGE,
  CLASS_KNOWLEDGE,
  PHASE_KNOWLEDGE,
  MACRO_TEXTBOOK,
  getGamePhase,
  buildKnowledgeContext,
  buildMacroKnowledge,
  buildMatchChampionKnowledge,
}
