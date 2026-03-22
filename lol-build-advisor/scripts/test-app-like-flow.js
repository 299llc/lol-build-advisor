#!/usr/bin/env node
/**
 * 実アプリに近い AI パイプライン検証スクリプト
 *
 * 対象:
 * - src/test/fixtures/*.json の UI 向けシナリオ
 * - Preprocessor -> AiClient -> Postprocessor の流れ
 *
 * 使い方:
 *   node scripts/test-app-like-flow.js
 *   node scripts/test-app-like-flow.js --scenario ingame-mid
 *   node scripts/test-app-like-flow.js --features item,macro
 *   node scripts/test-app-like-flow.js --features macro --ui-only
 */

const fs = require('fs')
const path = require('path')
const { setCacheDir, initPatchData, loadSpellsForMatch, getItemById } = require('../electron/api/patchData')
const { Preprocessor } = require('../electron/core/preprocessor')
const { Postprocessor } = require('../electron/core/postprocessor')
const { buildMacroStaticContext } = require('../electron/core/objectiveTracker')
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

function loadScenario(name) {
  const filePath = path.join(__dirname, '..', 'src', 'test', 'fixtures', `${name}.json`)
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function adaptScenarioToAllGameData(scenario) {
  const gameData = scenario.gameData || {}
  const players = gameData.players || {}
  const me = players.me
  const allies = players.allies || []
  const enemies = players.enemies || []

  const activePlayer = {
    summonerName: me?.summonerName,
    riotIdGameName: me?.summonerName,
    currentGold: estimateCurrentGoldFromScenario(me),
    abilities: { R: { abilityLevel: me?.level >= 6 ? 1 : 0 } },
  }

  return {
    activePlayer,
    allPlayers: [me, ...allies, ...enemies].map(adaptPlayer),
    gameData: gameData.gameData || { gameTime: 0 },
    events: { Events: gameData.events || [] },
  }
}

function estimateCurrentGoldFromScenario(player) {
  if (!player) return 0
  const items = player.items || []
  let roughSpent = 0
  for (const item of items) {
    const patchItem = getItemById(item.itemID)
    roughSpent += patchItem?.gold?.total || 0
  }
  if (roughSpent === 0) return 1200
  return Math.max(300, Math.round(roughSpent * 0.08))
}

function adaptPlayer(player) {
  return {
    summonerName: player.summonerName,
    riotIdGameName: player.summonerName,
    championName: player.championName,
    championId: player.championId,
    rawChampionName: `game_character_displayname_${player.enName || ''}`,
    team: player.team,
    position: player.position,
    level: player.level,
    scores: player.scores || {},
    items: player.items || [],
    isDead: !!player.isDead,
    respawnTimer: player.respawnTimer || 0,
    summonerSpells: player.summonerSpells || null,
  }
}

function buildCoreBuildFromScenario(scenario) {
  const coreBuild = scenario.coreBuild || {}
  const ids = coreBuild.build_goal || []
  const names = coreBuild.build_goal_names || []
  return ids.map((id, index) => ({ id, name: names[index] || String(id) }))
}

function buildSubstituteItemsFromScenario(scenario) {
  return (scenario.substituteItems || []).map(item => ({
    id: item.id,
    name: item.name,
  }))
}

function parseFeatures(raw) {
  if (!raw) return ['item', 'macro', 'matchup']
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

function isUiOnlyMode() {
  return process.argv.slice(2).includes('--ui-only')
}

function toUiItemResult(result) {
  if (!result) return null
  return {
    ...result,
    recommended: (result.recommended || []).map(item => {
      const patchItem = getItemById(item.id)
      return {
        ...item,
        name: patchItem?.jaName || item.id,
        image: patchItem?.image || '',
      }
    })
  }
}

function summarizeLog(log) {
  if (!log) return null
  return {
    type: log.type,
    provider: log.provider,
    model: log.sessionInfo?.model || log.model || null,
    mode: log.sessionInfo?.mode || 'generateContent',
    continued: !!log.sessionInfo?.continued,
    interactionId: log.sessionInfo?.interactionId || null,
    previousInteractionId: log.sessionInfo?.previousInteractionId || null,
    durationMs: log.durationMs || null,
  }
}

async function runItemPipeline({ scenario, rawGameData, preprocessor, postprocessor, client }) {
  const gameTime = rawGameData.gameData?.gameTime || 0
  if (gameTime < 900) {
    return {
      skipped: true,
      reason: '実アプリと同様に15分未満ではアイテムAIを呼ばない',
    }
  }

  const gameState = preprocessor.buildGameState(rawGameData, rawGameData.events?.Events || [])
  const coreBuild = buildCoreBuildFromScenario(scenario)
  const substituteItems = buildSubstituteItemsFromScenario(scenario)
  const itemInput = preprocessor.buildItemInput(gameState, coreBuild, substituteItems)
  const candidateIds = itemInput.candidates.map(candidate => candidate.id)
  const raw = await client.getSuggestion(itemInput)
  const processed = postprocessor.processItemResult(raw, candidateIds, postprocessor.lastItemResult)
  if (processed) preprocessor.setItemAdvice(processed)
  const log = client.getLogs().at(-1) || null
  return {
    input: itemInput,
    raw,
    ui: toUiItemResult(processed),
    log,
    pipeline: {
      previousResultUsed: !!postprocessor.lastItemResult,
      uiUpdated: !!processed,
      finalBroadcastPayload: toUiItemResult(processed),
      log: summarizeLog(log),
    }
  }
}

async function runMacroPipeline({ rawGameData, preprocessor, postprocessor, client }) {
  const me = rawGameData.allPlayers.find(player => player.summonerName === rawGameData.activePlayer.summonerName)
  const allies = rawGameData.allPlayers.filter(player => player.team === me.team && player !== me)
  const enemies = rawGameData.allPlayers.filter(player => player.team !== me.team)
  const gameState = preprocessor.buildGameState(rawGameData, rawGameData.events?.Events || [])
  const macroInput = preprocessor.buildMacroInput(gameState, rawGameData.events?.Events || [])
  const staticContext = buildMacroStaticContext(me, allies, enemies)
  const raw = await client.getMacroAdvice(staticContext, macroInput)
  const actionCandidates = macroInput.action_candidates.map(candidate => candidate.action)
  const processed = postprocessor.processMacroResult(raw, actionCandidates, postprocessor.lastMacroResult)
  if (processed) preprocessor.setMacroAdvice(processed)
  const log = client.getLogs().at(-1) || null
  return {
    input: macroInput,
    raw,
    ui: processed,
    log,
    pipeline: {
      actionCandidates,
      uiUpdated: !!processed,
      finalBroadcastPayload: processed,
      log: summarizeLog(log),
    }
  }
}

async function runMatchupPipeline({ rawGameData, preprocessor, postprocessor, client }) {
  const gameState = preprocessor.buildGameState(rawGameData, rawGameData.events?.Events || [])
  const matchupInput = preprocessor.buildMatchupInput(gameState)
  const raw = await client.getMatchupTip(matchupInput)
  const processed = postprocessor.processMatchupResult(raw, matchupInput.opponent)
  const log = client.getLogs().at(-1) || null
  return {
    input: matchupInput,
    raw,
    ui: processed,
    log,
    pipeline: {
      uiUpdated: !!processed,
      finalBroadcastPayload: processed,
      log: summarizeLog(log),
    }
  }
}

function reduceForUiOnly(results, features) {
  return results.map(entry => {
    const reduced = { scenario: entry.scenario }
    if (features.includes('item') && entry.item) {
      reduced.item = entry.item.skipped
        ? { skipped: true, reason: entry.item.reason }
        : entry.item.pipeline
    }
    if (features.includes('macro') && entry.macro) {
      reduced.macro = entry.macro.pipeline
    }
    if (features.includes('matchup') && entry.matchup) {
      reduced.matchup = entry.matchup.pipeline
    }
    return reduced
  })
}

async function main() {
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) throw new Error('.env が見つかりません')

  const env = readEnvFile(envPath)
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY が .env に設定されていません')

  const scenariosArg = getArg('scenario')
  const scenarioNames = scenariosArg
    ? scenariosArg.split(',').map(s => s.trim()).filter(Boolean)
    : ['ingame-early', 'ingame-mid']
  const features = parseFeatures(getArg('features'))
  const uiOnly = isUiOnlyMode()

  setCacheDir(path.join(__dirname, '..', '.cache'))
  await initPatchData()

  const spellNames = new Set()
  for (const scenarioName of scenarioNames) {
    const scenario = loadScenario(scenarioName)
    const players = scenario.gameData?.players || {}
    const all = [players.me, ...(players.allies || []), ...(players.enemies || [])].filter(Boolean)
    for (const player of all) {
      if (player.enName) spellNames.add(player.enName)
    }
  }
  await loadSpellsForMatch([...spellNames])

  const provider = new GeminiProvider(env.GEMINI_API_KEY)
  const client = new AiClient(provider, {
    model: 'gemini-2.5-flash-lite',
    qualityModel: 'gemini-2.5-flash',
  })
  const preprocessor = new Preprocessor()
  const postprocessor = new Postprocessor()

  const valid = await provider.validate()
  if (!valid) throw new Error('Gemini API の接続確認に失敗しました')

  const results = []
  for (const scenarioName of scenarioNames) {
    const scenario = loadScenario(scenarioName)
    const rawGameData = adaptScenarioToAllGameData(scenario)
    const entry = { scenario: scenarioName }

    if (features.includes('item')) {
      entry.item = await runItemPipeline({ scenario, rawGameData, preprocessor, postprocessor, client })
    }
    if (features.includes('macro')) {
      entry.macro = await runMacroPipeline({ rawGameData, preprocessor, postprocessor, client })
    }
    if (features.includes('matchup')) {
      entry.matchup = await runMatchupPipeline({ rawGameData, preprocessor, postprocessor, client })
    }

    results.push(entry)
  }

  const payload = {
    ok: true,
    provider: 'gemini',
    model: 'gemini-2.5-flash-lite',
    qualityModel: 'gemini-2.5-flash',
    features,
    scenarios: scenarioNames,
    uiOnly,
    verified_at: new Date().toISOString(),
    results: uiOnly ? reduceForUiOnly(results, features) : results,
  }

  console.log(JSON.stringify(payload, null, 2))
}

main().catch(error => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message || String(error),
  }, null, 2))
  process.exit(1)
})
