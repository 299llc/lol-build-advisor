#!/usr/bin/env node
/**
 * AI テストハーネス
 *
 * 使い方:
 *   node test/harness/runner.js                        # ローカル(Ollama)で全テスト実行
 *   node test/harness/runner.js --provider gemini      # Gemini APIで全テスト実行
 *   node test/harness/runner.js --provider bedrock     # Bedrockで全テスト実行
 *   node test/harness/runner.js --provider anthropic   # Anthropic APIで全テスト実行
 *   node test/harness/runner.js --type macro           # マクロのみ
 *   node test/harness/runner.js --verbose              # 詳細出力
 */

const path = require('path')
const fs = require('fs')
const { AiClient } = require('../../electron/api/aiClient')
const { OllamaProvider } = require('../../electron/api/providers/ollamaProvider')
const { BedrockProvider } = require('../../electron/api/providers/bedrockProvider')
const { AnthropicProvider } = require('../../electron/api/providers/anthropicProvider')
const { GeminiProvider } = require('../../electron/api/providers/geminiProvider')
const { evaluateItem, evaluateMatchup, evaluateMacro, evaluateCoaching } = require('./evaluate')
const { validateCoachingInput, printValidation } = require('./validateInput')

// ── CLI引数パース ──
const args = process.argv.slice(2)
function getArg(name) {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null
}
const providerArg = getArg('provider') || 'ollama'
const modelArg = getArg('model') || 'qwen3.5:4b'
const typeFilter = getArg('type') // null = 全部
const verbose = args.includes('--verbose')
const validateOnly = args.includes('--validate-only')
const compareMode = args.includes('--compare')

// ── プロバイダー構築 ──
function createProvider() {
  if (providerArg === 'bedrock') {
    // .env から読み込み
    const envPath = path.join(__dirname, '..', '..', '.env')
    const env = {}
    try {
      const content = fs.readFileSync(envPath, 'utf-8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx < 0) continue
        const key = trimmed.substring(0, eqIdx).trim()
        let value = trimmed.substring(eqIdx + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        env[key] = value
      }
    } catch {
      console.error('.env ファイルが見つかりません')
      process.exit(1)
    }
    return new BedrockProvider({
      apiKey: env.BEDROCK_API_KEY || null,
      region: env.AWS_REGION || 'us-east-1',
      accessKeyId: env.AWS_ACCESS_KEY_ID || null,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY || null,
    })
  }

  if (providerArg === 'anthropic') {
    const envPath = path.join(__dirname, '..', '..', '.env')
    const env = {}
    try {
      const content = fs.readFileSync(envPath, 'utf-8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx < 0) continue
        const key = trimmed.substring(0, eqIdx).trim()
        let value = trimmed.substring(eqIdx + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        env[key] = value
      }
    } catch {
      console.error('.env ファイルが見つかりません')
      process.exit(1)
    }
    const apiKey = env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY が .env に設定されていません')
      process.exit(1)
    }
    return new AnthropicProvider(apiKey)
  }

  if (providerArg === 'gemini') {
    const envPath = path.join(__dirname, '..', '..', '.env')
    const env = {}
    try {
      const content = fs.readFileSync(envPath, 'utf-8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx < 0) continue
        const key = trimmed.substring(0, eqIdx).trim()
        let value = trimmed.substring(eqIdx + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        env[key] = value
      }
    } catch {
      console.error('.env ファイルが見つかりません')
      process.exit(1)
    }
    const apiKey = env.GEMINI_API_KEY
    if (!apiKey) {
      console.error('GEMINI_API_KEY が .env に設定されていません')
      process.exit(1)
    }
    return new GeminiProvider(apiKey)
  }

  // デフォルト: Ollama
  return new OllamaProvider({ baseUrl: 'http://localhost:11434', model: modelArg })
}

// ── テストケース読み込み ──
function loadTestCases(type) {
  const fixtureDir = path.join(__dirname, '..', 'fixtures', type)
  const expectedDir = path.join(__dirname, '..', 'expected', type)

  if (!fs.existsSync(fixtureDir)) return []

  const files = fs.readdirSync(fixtureDir).filter(f => f.endsWith('.json'))
  return files.map(file => {
    const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, file), 'utf-8'))
    let expected = {}
    const expectedPath = path.join(expectedDir, file)
    if (fs.existsSync(expectedPath)) {
      expected = JSON.parse(fs.readFileSync(expectedPath, 'utf-8'))
    }
    return { name: file.replace('.json', ''), fixture, expected }
  })
}

// ── テスト実行 ──
const TYPES = ['item', 'matchup', 'macro', 'coaching']

const evaluators = {
  item: evaluateItem,
  matchup: evaluateMatchup,
  macro: evaluateMacro,
  coaching: evaluateCoaching,
}

const callers = {
  item: (client, fixture) => client.getSuggestion(fixture),
  matchup: (client, fixture) => client.getMatchupTip(fixture),
  macro: (client, fixture) => client.getMacroAdvice(fixture.staticContext || null, fixture.dynamicInput || fixture),
  coaching: (client, fixture) => client.getCoaching(fixture),
}

// ── .env からモデル設定読み込み ──
function loadModelOpts(providerType) {
  const envPath = path.join(__dirname, '..', '..', '.env')
  const env = {}
  try {
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const t = line.trim(); if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('='); if (eq < 0) continue
      env[t.substring(0, eq).trim()] = t.substring(eq + 1).trim()
    }
  } catch { return {} }

  if (providerType === 'gemini') {
    return {
      ...(env.GEMINI_MODEL && { model: env.GEMINI_MODEL }),
      ...(env.GEMINI_QUALITY_MODEL && { qualityModel: env.GEMINI_QUALITY_MODEL }),
      ...(env.GEMINI_SUGGESTION_MODEL && { suggestionModel: env.GEMINI_SUGGESTION_MODEL }),
      ...(env.GEMINI_MATCHUP_MODEL && { matchupModel: env.GEMINI_MATCHUP_MODEL }),
      ...(env.GEMINI_MACRO_MODEL && { macroModel: env.GEMINI_MACRO_MODEL }),
      ...(env.GEMINI_COACHING_MODEL && { coachingModel: env.GEMINI_COACHING_MODEL }),
    }
  }
  return {
    ...(env.CLAUDE_MODEL && { model: env.CLAUDE_MODEL }),
    ...(env.CLAUDE_QUALITY_MODEL && { qualityModel: env.CLAUDE_QUALITY_MODEL }),
    ...(env.CLAUDE_SUGGESTION_MODEL && { suggestionModel: env.CLAUDE_SUGGESTION_MODEL }),
    ...(env.CLAUDE_MATCHUP_MODEL && { matchupModel: env.CLAUDE_MATCHUP_MODEL }),
    ...(env.CLAUDE_MACRO_MODEL && { macroModel: env.CLAUDE_MACRO_MODEL }),
    ...(env.CLAUDE_COACHING_MODEL && { coachingModel: env.CLAUDE_COACHING_MODEL }),
  }
}

// ── 結果キャッシュ ──
const resultsBaseDir = path.join(__dirname, '..', 'results')

function saveResult(type, name, actual) {
  const dir = path.join(resultsBaseDir, type)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(actual, null, 2), 'utf-8')
}

function loadPreviousResult(type, name) {
  const filePath = path.join(resultsBaseDir, type, `${name}.json`)
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

async function runTests() {
  // validate-only モード: AI呼び出しなしで入力品質のみチェック
  if (validateOnly) {
    const types = typeFilter ? [typeFilter] : TYPES
    console.log('\n=== Input Validation Only ===\n')
    for (const type of types) {
      if (type !== 'coaching') continue
      const cases = loadTestCases(type)
      if (cases.length === 0) { console.log('  コーチングテストケースなし'); continue }
      for (const tc of cases) {
        const result = validateCoachingInput(tc.fixture)
        printValidation(tc.name, result)
      }
    }
    return
  }

  const provider = createProvider()
  const modelOpts = loadModelOpts(providerArg)
  const client = new AiClient(provider, modelOpts)

  // バリデーション
  console.log(`\nProvider: ${providerArg}`)
  const ok = await provider.validate()
  if (!ok) {
    console.error(`Provider validation failed (${providerArg})`)
    process.exit(1)
  }
  console.log('Provider validation OK\n')

  const types = typeFilter ? [typeFilter] : TYPES
  const results = { total: 0, passed: 0, failed: 0, errors: 0, byType: {} }

  for (const type of types) {
    const cases = loadTestCases(type)
    if (cases.length === 0) {
      console.log(`[${type}] テストケースなし — スキップ`)
      continue
    }

    console.log(`\n=== ${type.toUpperCase()} (${cases.length} cases) ===`)
    const typeResult = { passed: 0, failed: 0, errors: 0 }

    for (const tc of cases) {
      results.total++
      process.stdout.write(`  ${tc.name} ... `)

      // コーチングの場合、入力品質を事前チェック
      if (type === 'coaching' && verbose) {
        const inputValidation = validateCoachingInput(tc.fixture)
        if (inputValidation.warnings.length > 0 || inputValidation.errors.length > 0) {
          console.log('')
          printValidation('    入力品質', inputValidation)
          process.stdout.write(`  ${tc.name} ... `)
        }
      }

      // テストケースごとにクライアントをリセット（Interactionsセッション・totalCalls初期化）
      client.clearMatch()

      try {
        const startTime = Date.now()
        const actual = await callers[type](client, tc.fixture)
        const elapsed = Date.now() - startTime

        // コーチングは入力データも渡す
        const evaluation = type === 'coaching'
          ? evaluators[type](actual, tc.expected, tc.fixture)
          : evaluators[type](actual, tc.expected)

        if (evaluation.pass) {
          typeResult.passed++
          results.passed++
          console.log(`PASS (${elapsed}ms)`)
        } else {
          typeResult.failed++
          results.failed++
          console.log(`FAIL (${elapsed}ms)`)
          for (const d of evaluation.details) {
            console.log(`    - ${d}`)
          }
        }

        // 結果キャッシュ保存
        if (type === 'coaching' && actual) {
          saveResult(type, tc.name, actual)
        }

        // compareモード: 前回結果との比較
        if (compareMode && type === 'coaching') {
          const prev = loadPreviousResult(type, tc.name)
          if (prev) {
            const prevEval = evaluators[type](prev, tc.expected, tc.fixture)
            const change = prevEval.pass === evaluation.pass ? '(変化なし)' : prevEval.pass ? '(前回PASS→今回FAIL ⬇)' : '(前回FAIL→今回PASS ⬆)'
            console.log(`    比較: ${change}`)
            if (prev.overall_score !== actual?.overall_score) {
              console.log(`    スコア: ${prev.overall_score} → ${actual?.overall_score}`)
            }
          } else {
            console.log(`    比較: (前回結果なし)`)
          }
        }

        if (verbose && actual) {
          console.log(`    Response: ${JSON.stringify(actual).substring(0, 300)}`)
        }
      } catch (err) {
        typeResult.errors++
        results.errors++
        console.log(`ERROR: ${err.message}`)
      }
    }

    results.byType[type] = typeResult
  }

  // ── レポート ──
  console.log('\n' + '='.repeat(50))
  console.log('RESULTS')
  console.log('='.repeat(50))
  console.log(`Total: ${results.total}  Passed: ${results.passed}  Failed: ${results.failed}  Errors: ${results.errors}`)

  for (const [type, r] of Object.entries(results.byType)) {
    const rate = r.passed + r.failed > 0 ? ((r.passed / (r.passed + r.failed)) * 100).toFixed(0) : 'N/A'
    console.log(`  ${type}: ${r.passed}/${r.passed + r.failed} passed (${rate}%)${r.errors > 0 ? ` [${r.errors} errors]` : ''}`)
  }

  console.log('')
  process.exit(results.failed + results.errors > 0 ? 1 : 0)
}

runTests().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
