#!/usr/bin/env node
/**
 * Gemini Interactions API の最小検証スクリプト
 *
 * 目的:
 * - build / macro の2系統で interaction が継続できるか確認する
 * - 既存の AiClient をそのまま使い、本番に近い呼び出し経路を検証する
 *
 * 使い方:
 *   node scripts/verify-gemini-interactions.js
 *   node scripts/verify-gemini-interactions.js --mode build
 *   node scripts/verify-gemini-interactions.js --mode macro
 */

const fs = require('fs')
const path = require('path')
const { AiClient } = require('../electron/api/aiClient')
const { GeminiProvider } = require('../electron/api/providers/geminiProvider')

function getArg(name) {
  const args = process.argv.slice(2)
  const index = args.indexOf(`--${name}`)
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null
}

function readEnvFile(envPath) {
  const env = {}
  const content = fs.readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex < 0) continue
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function loadJson(relPath) {
  const filePath = path.join(__dirname, '..', relPath)
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function summarizeLog(log) {
  if (!log) return null
  return {
    type: log.type,
    mode: log.sessionInfo?.mode || 'generateContent',
    continued: !!log.sessionInfo?.continued,
    previousInteractionId: log.sessionInfo?.previousInteractionId || null,
    interactionId: log.sessionInfo?.interactionId || null,
    durationMs: log.durationMs || null,
    error: log.error || null,
  }
}

async function runBuildScenario(client) {
  const firstTurn = loadJson('test/fixtures/item/01-adc-behind-ap-heavy.json')
  const secondTurn = clone(firstTurn)

  secondTurn.me.gold = 2100
  secondTurn.me.level = 12
  secondTurn.me.items = [3031, 3085, 3156]
  secondTurn.situation = 'even'
  secondTurn.enemy_healing = 'needed'
  secondTurn.enemy_damage_profile = { ad_pct: 45, ap_pct: 55 }
  secondTurn.candidates = [
    { id: 3139, name: 'マーキュリアルシミター', tag: 'counter', desc: 'MR+QSS' },
    { id: 3046, name: 'ファントムダンサー', tag: 'core', desc: 'AS+クリ' },
    { id: 3036, name: 'ドミニクリガード', tag: 'situational', desc: 'AR貫通' },
  ]

  const first = await client.getSuggestion(firstTurn)
  const buildSessionAfterFirst = client.getInteractionSession('build')
  secondTurn.previous_advice = first
  const firstLog = client.getLogs().at(-1)

  const second = await client.getSuggestion(secondTurn)
  const buildSessionAfterSecond = client.getInteractionSession('build')
  const secondLog = client.getLogs().at(-1)

  assert(first, 'build 1ターン目の応答が取得できませんでした')
  assert(second, 'build 2ターン目の応答が取得できませんでした')
  assert(buildSessionAfterFirst.id, 'build interaction id が作成されませんでした')
  assert(buildSessionAfterSecond.id, 'build interaction id が2ターン目で失われました')
  assert(firstLog?.sessionInfo?.mode === 'interactions', 'build 1ターン目が interactions で実行されていません')
  assert(secondLog?.sessionInfo?.mode === 'interactions', 'build 2ターン目が interactions で実行されていません')
  assert(secondLog?.sessionInfo?.continued === true, 'build 2ターン目が継続 interaction になっていません')
  assert(
    secondLog?.sessionInfo?.previousInteractionId === buildSessionAfterFirst.id,
    'build 2ターン目が前回 interaction id を引き継いでいません'
  )

  return {
    first,
    second,
    firstLog: summarizeLog(firstLog),
    secondLog: summarizeLog(secondLog),
    sessionIdAfterFirst: buildSessionAfterFirst.id,
    sessionIdAfterSecond: buildSessionAfterSecond.id,
  }
}

async function runMacroScenario(client) {
  const firstTurn = loadJson('test/fixtures/macro/09-recall-or-contest-dragon.json')
  const secondTurn = loadJson('test/fixtures/macro/01-dragon-soul-reach.json')
  const staticContext = '味方は engage 構成、敵は poke 構成。ADC視点で次アクションを最短で判断する。'

  const first = await client.getMacroAdvice(staticContext, firstTurn)
  const macroSessionAfterFirst = client.getInteractionSession('macro')
  secondTurn.previous_advice = first
  const firstLog = client.getLogs().at(-1)

  const second = await client.getMacroAdvice(staticContext, secondTurn)
  const macroSessionAfterSecond = client.getInteractionSession('macro')
  const secondLog = client.getLogs().at(-1)

  assert(first, 'macro 1ターン目の応答が取得できませんでした')
  assert(second, 'macro 2ターン目の応答が取得できませんでした')
  assert(macroSessionAfterFirst.id, 'macro interaction id が作成されませんでした')
  assert(macroSessionAfterSecond.id, 'macro interaction id が2ターン目で失われました')
  assert(firstLog?.sessionInfo?.mode === 'interactions', 'macro 1ターン目が interactions で実行されていません')
  assert(secondLog?.sessionInfo?.mode === 'interactions', 'macro 2ターン目が interactions で実行されていません')
  assert(secondLog?.sessionInfo?.continued === true, 'macro 2ターン目が継続 interaction になっていません')
  assert(
    secondLog?.sessionInfo?.previousInteractionId === macroSessionAfterFirst.id,
    'macro 2ターン目が前回 interaction id を引き継いでいません'
  )

  return {
    first,
    second,
    firstLog: summarizeLog(firstLog),
    secondLog: summarizeLog(secondLog),
    sessionIdAfterFirst: macroSessionAfterFirst.id,
    sessionIdAfterSecond: macroSessionAfterSecond.id,
  }
}

async function main() {
  const mode = getArg('mode') || 'all'
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) {
    throw new Error('.env が見つかりません')
  }

  const env = readEnvFile(envPath)
  const apiKey = env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY が .env に設定されていません')
  }

  const provider = new GeminiProvider(apiKey)
  const client = new AiClient(provider, {
    model: 'gemini-2.5-flash-lite',
    qualityModel: 'gemini-2.5-flash',
  })

  const valid = await provider.validate()
  assert(valid, 'Gemini API の接続確認に失敗しました')

  const results = {}

  if (mode === 'all' || mode === 'build') {
    results.build = await runBuildScenario(client)
  }

  if (mode === 'all' || mode === 'macro') {
    results.macro = await runMacroScenario(client)
  }

  console.log(JSON.stringify({
    ok: true,
    mode,
    provider: 'gemini',
    model: 'gemini-2.5-flash-lite',
    verified_at: new Date().toISOString(),
    results,
  }, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message || String(error),
  }, null, 2))
  process.exit(1)
})
