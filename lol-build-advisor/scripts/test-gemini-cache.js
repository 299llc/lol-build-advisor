#!/usr/bin/env node
/**
 * Gemini 明示的キャッシュのテスト
 * 3回だけAPIを呼び、2回目以降でキャッシュヒット（cachedContentTokenCount > 0）するか確認
 *
 * Usage: node scripts/test-gemini-cache.js
 * 環境変数 GEMINI_API_KEY が必要（.env から自動読込）
 */

const path = require('path')
const fs = require('fs')

// .env 読み込み
const envPath = path.join(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim()
  }
}

const { GeminiProvider } = require('../electron/api/providers/geminiProvider')
const { buildMacroKnowledgeText, buildFullGameKnowledgeText } = require('../electron/core/knowledge/game')

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  console.error('GEMINI_API_KEY が設定されていません（.env を確認）')
  process.exit(1)
}

async function main() {
  const provider = new GeminiProvider(apiKey)

  // RAG知識テキスト（macroのドラゴン準備シナリオ）
  const ragKnowledge = buildMacroKnowledgeText(['dragon_prep', 'farm', 'ward'], 'early')
  const fullKnowledge = buildFullGameKnowledgeText()

  console.log('=== Gemini キャッシュテスト ===')
  console.log(`RAG知識: ${ragKnowledge.length} chars (フル: ${fullKnowledge.length} chars, ${Math.round(ragKnowledge.length/fullKnowledge.length*100)}%)`)
  console.log(`MIN_CACHE_CHARS: 8000 → RAG知識はキャッシュ対象${ragKnowledge.length >= 8000 ? '✓' : '✗（閾値未満）'}`)
  console.log('')

  // system = RAG知識 + 実際のMACRO_PROMPT + ダミーchampionKnowledge
  // 実運用に近い構成（合計 MIN_CACHE_CHARS 超え）
  const { MACRO_PROMPT } = require('../electron/core/prompts')
  const championKnowledge = `【味方チームの構成と特徴】
■ レオナ (SUP) - タンク/エンゲージ
タイプ: タンク（硬い・CC持ち）、集団戦: フロントラインでエンゲージ/ピール
パッシブ: 太陽光 - レオナのスキルが敵にマークを付与し、味方の攻撃でボーナスダメージ
Q: 日蝕の刃 - 次のAAが敵をスタンさせる。CD短い近接CC
W: 日食 - 防御力上昇バフ。範囲ダメージ付き
E: 天頂の刃 - スキルショットで敵に突進。エンゲージ用
R: ソーラーフレア - 広範囲スタン/スロウ。チーム戦のエンゲージULT

■ カイ＝サ (ADC) - マークスマン
タイプ: マークスマン（持続DPS・射程）、集団戦: 最後列からDPS
パッシブ: セカンドスキン - スキルがスタックを付与、5スタックで追加ダメージ
Q: イカシアの雨 - 複数ミサイル発射。単体に集中すると高ダメージ
W: ヴォイドシーカー - 長射程ポーク。命中でスタック2付与
E: スーパーチャージ - 移動速度UP。進化でステルス付与
R: キラーインスティンクト - マーク付きの敵に長距離ダッシュ+シールド

■ レネクトン (TOP) - ファイター
タイプ: ファイター（近接戦闘・サステイン）、集団戦: フランクorフロントライン
パッシブ: 支配の雄叫び - 激昂50以上でスキル強化
Q: 獰猛なる大刃 - 周囲を斬りつけ回復。激昂時2倍回復
W: 冷酷なる追撃 - スタン付きAA。激昂時アーマー破壊
E: ダイス/スライス - 2段ダッシュ。激昂時アーマー削り
R: ドミヌス - 体力増加+周囲継続ダメージ+激昂自動回復

■ ノクターン (JG) - アサシン
タイプ: アサシン（単体バースト・ローム）、集団戦: フランクから敵キャリー暗殺
パッシブ: アンブラルブレイド - 一定間隔でAA範囲化+回復
Q: ダスクブリンガー - 影の道を作りMS上昇+AD上昇
W: シュラウドオブダークネス - スペルシールド。成功時AS上昇
E: テラー - 対象を恐怖状態にする繋ぎスキル
R: パラノイア - 敵全体の視界を奪い、超長距離ダッシュ

■ オレリオン・ソル (MID) - メイジ
タイプ: メイジ（AoEダメージ・バースト）、集団戦: バックラインからAoEスキル
パッシブ: コズミッククリエイター - スキルでスターダストを蓄積し永続強化
Q: 息吹 - 方向指定のダメージスキル。スターダスト蓄積用
W: アストラルフライト - 長距離飛行移動。ローム用
E: シンギュラリティ - 範囲継続ダメージ+スタック。主力ダメージ
R: 流れ星の呼び声 - 広範囲に巨大ダメージ。スターダスト量でサイズ拡大

【敵チームの構成と特徴】
■ ヤスオ (TOP) - ファイター/アサシン
Q: 鋼鉄の嵐 - 突きスキル。3回目でノックアップ竜巻
W: 風の壁 - 飛翔体を完全遮断する壁
E: 抜刀 - 敵ユニットを経由してダッシュ
R: ラストブレス - ノックアップ中の敵に長距離追撃

■ グレイブス (JG) - マークスマン
Q: エンドオブザライン - 壁で跳ね返る弾丸
W: スモークスクリーン - 煙幕で視界遮断
E: クイックドロー - ダッシュ+AA弾リロード+アーマー
R: コラテラルダメージ - 貫通弾+ノックバック

■ ヨネ (MID) - アサシン/ファイター
Q: 鋼と心 - 突きスキル。3回目でノックアップ突進
W: 霊者斬り - シールド付き斬撃
E: ソウルアンバウンド - 霊体で前進、帰還時追加ダメージ
R: 封じられし者 - 長距離ノックアップ突進

■ シヴィア (ADC) - マークスマン
Q: ブーメランブレイド - 貫通ブーメラン
W: リコシェ - AA跳弾。ウェーブクリア用
E: スペルシールド - スキル1発を無効化+マナ回復
R: 突撃指令 - チーム全員の移動速度UP

■ ソラカ (SUP) - エンチャンター
Q: 星のささやき - 範囲スロウ+自身回復
W: 星霊の癒し - 味方を大幅回復（自分HP消費）
E: 星の静寂 - 範囲沈黙+ルート
R: 祈願 - マップ全体の味方を回復`

  const systemParts = [
    ragKnowledge,
    MACRO_PROMPT,
    championKnowledge,
  ].join('\n')

  console.log(`systemテキスト合計: ${systemParts.length} chars`)
  console.log('')

  const userMessage = JSON.stringify({
    game_time: 240,
    me: { champion: 'レオナ', role: 'SUP', level: 3 },
    game_phase: 'early',
    situation: 'even',
    action_candidates: [
      { action: 'dragon_prep', reason: 'ドラゴンまで60秒', priority: 2 },
      { action: 'ward', reason: '視界確保', priority: 4 },
    ],
  })

  // 3回呼ぶ（同じsystem → 2回目からキャッシュヒットするはず）
  for (let i = 1; i <= 3; i++) {
    console.log(`--- Call ${i}/3 ---`)
    const start = Date.now()

    try {
      const result = await provider.sendMessage({
        model: 'gemini-2.5-flash',
        maxTokens: 100,
        temperature: 0,
        system: systemParts,
        messages: [{ role: 'user', content: userMessage }],
      })

      const ms = Date.now() - start
      const u = result.usage

      if (u) {
        const cached = u.cache_read || 0
        const hitRate = u.input > 0 ? Math.round(cached / u.input * 100) : 0
        console.log(`  tokens: in=${u.input} out=${u.output} cache_read=${cached}`)
        console.log(`  cache hit: ${hitRate}% ${cached > 0 ? '✅ キャッシュ効いてる！' : '⬜ キャッシュなし'}`)
      }
      console.log(`  time: ${ms}ms`)
      console.log(`  response: ${(result.text || '').substring(0, 100)}`)
    } catch (err) {
      console.error(`  ERROR: ${err.message}`)
    }
    console.log('')
  }

  // キャッシュクリーンアップ
  console.log('--- クリーンアップ ---')
  await provider.clearCaches()
  console.log('完了')
}

main().catch(console.error)
