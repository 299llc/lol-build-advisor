/**
 * Ollama + Qwen3.5 実際のLLM呼び出しテスト
 * - QWER表記ルールが反映されているか
 * - サンプリングパラメータが効いているか
 *
 * 使い方: ollama serve 起動後に node test/ollama-qwer-test.js
 */
const { OllamaProvider } = require('../electron/api/providers/ollamaProvider')
const { MATCHUP_PROMPT, MACRO_PROMPT, ITEM_PROMPT } = require('../electron/core/prompts')

const provider = new OllamaProvider()

async function testMatchup() {
  console.log('\n' + '='.repeat(60))
  console.log('テスト1: マッチアップTip (QWER表記チェック)')
  console.log('='.repeat(60))

  const system = MATCHUP_PROMPT
  const userMsg = `【自チャンプ】Yasuo MID
【敵チャンプ】Zed MID

【自チャンプスキル情報】
パッシブ: Way of the Wanderer - シールド生成+クリティカル率2倍
Q: Steel Tempest - 突き攻撃。3回目でノックアップ
W: Wind Wall - 飛び道具を遮断する壁を展開
E: Sweeping Blade - 敵ユニットにダッシュ
R: Last Breath - ノックアップされた敵にブリンク+斬撃

【敵チャンプスキル情報】
パッシブ: Contempt for the Weak - HP50%以下の対象にマジックダメージ
Q: Razor Shuriken - 手裏剣を投げる
W: Living Shadow - 影を飛ばす（スワップ可能）
E: Shadow Slash - 周囲にスラッシュ
R: Death Mark - 対象にマークを付けて3秒後に爆発`

  const result = await provider.sendMessage({
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 700,
    temperature: 0.7,
    system,
    messages: [{ role: 'user', content: userMsg }],
    jsonMode: true,
  })

  console.log('\n--- Raw Response ---')
  console.log(result.text)
  console.log('\n--- メタ情報 ---')
  console.log(`モデル: ${result._meta.model}`)
  console.log(`所要時間: ${result._meta.elapsedMs}ms`)
  console.log(`トークン: in=${result.usage.input} out=${result.usage.output}`)

  // QWER表記チェック
  const qwerPattern = /\([QWER]\)/g
  const passivePattern = /\(パッシブ\)/g
  const qwerMatches = result.text.match(qwerPattern) || []
  const passiveMatches = result.text.match(passivePattern) || []
  console.log(`\n--- QWER表記チェック ---`)
  console.log(`スキル名(キー) 出現数: ${qwerMatches.length} 箇所 ${qwerMatches.length > 0 ? '✅' : '⚠️  なし'}`)
  console.log(`スキル名(パッシブ) 出現数: ${passiveMatches.length} 箇所`)

  return result
}

async function testMacro() {
  console.log('\n' + '='.repeat(60))
  console.log('テスト2: マクロアドバイス (warning内QWER表記チェック)')
  console.log('='.repeat(60))

  const system = MACRO_PROMPT
  const userMsg = `【自分】Jinx (ADC)

【味方構成】
Leona SUP / Ahri MID / LeeSin JG / Garen TOP

【敵構成】
1. Zed MID [特性:バースト]
2. Malphite TOP [特性:CC(R)]
3. Lux SUP [特性:CC(Q),シールド(W)]
4. Caitlyn ADC
5. Thresh SUP [特性:CC(Q+E)]

【敵チャンプスキル情報】
Zed R: Death Mark - 対象にマークを付けて3秒後に爆発ダメージ
Malphite R: Unstoppable Force - 指定方向に突進しノックアップ
Thresh Q: Death Sentence - フック

Lv11 アイテム: Kraken Slayer, Berserker's Greaves
敵AD60%/AP40%
Zed Lv12 6/1/2 (fed)
20分(中盤) 拮抗

【オブジェクト状況】
ドラゴン: 取得可能（味方2体/敵1体）
バロン: スポーンまで300秒`

  const result = await provider.sendMessage({
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 500,
    temperature: 0.7,
    system,
    messages: [{ role: 'user', content: userMsg }],
    jsonMode: true,
  })

  console.log('\n--- Raw Response ---')
  console.log(result.text)
  console.log(`\n所要時間: ${result._meta.elapsedMs}ms`)

  const qwerPattern = /\([QWER]\)/g
  const matches = result.text.match(qwerPattern) || []
  console.log(`\n--- QWER表記チェック ---`)
  console.log(`スキル名(キー) 出現数: ${matches.length} 箇所 ${matches.length > 0 ? '✅' : '⚠️  なし'}`)

  return result
}

async function testItem() {
  console.log('\n' + '='.repeat(60))
  console.log('テスト3: アイテム提案 (reasoning内QWER表記チェック)')
  console.log('='.repeat(60))

  const system = ITEM_PROMPT
  const userMsg = `【コアビルド(統計)】
6672:Kraken Slayer
3031:Infinity Edge
3094:Rapid Firecannon

【入れ替え候補アイテム】
3026:Guardian Angel (復活効果)
3033:Mortal Reminder (重傷+貫通)
3139:Mercurial Scimitar (CC解除)
3072:Bloodthirster (ライフスティール+シールド)

【自チャンプ】Jinx ADC
敵AD60%/AP40%
Zed Lv12 6/1/2 (fed) → Death Mark(R)で暗殺してくる
Malphite → Unstoppable Force(R)でノックアップ
Thresh → Death Sentence(Q)でフック
20分(中盤) 拮抗`

  const result = await provider.sendMessage({
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 600,
    temperature: 0.7,
    system,
    messages: [{ role: 'user', content: userMsg }],
    jsonMode: true,
  })

  console.log('\n--- Raw Response ---')
  console.log(result.text)
  console.log(`\n所要時間: ${result._meta.elapsedMs}ms`)

  const qwerPattern = /\([QWER]\)/g
  const matches = result.text.match(qwerPattern) || []
  console.log(`\n--- QWER表記チェック ---`)
  console.log(`スキル名(キー) 出現数: ${matches.length} 箇所 ${matches.length > 0 ? '✅' : '⚠️  なし'}`)

  return result
}

async function main() {
  // まずOllama接続チェック
  const ok = await provider.validate()
  if (!ok) {
    console.error('❌ Ollamaに接続できません。`ollama serve` を起動してください。')
    process.exit(1)
  }

  const models = await provider.listModels()
  console.log('利用可能モデル:', models.map(m => m.name).join(', '))

  try {
    await testMatchup()
    await testMacro()
    await testItem()
  } catch (e) {
    console.error('❌ エラー:', e.message)
  }

  console.log('\n' + '='.repeat(60))
  console.log('全テスト完了')
  console.log('='.repeat(60))
}

main()
