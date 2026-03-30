#!/usr/bin/env node
/**
 * セッションレコーディングからコーチング用テストフィクスチャを自動生成
 *
 * 使い方:
 *   node test/harness/generate-coaching-fixtures.js                           # 全セッション
 *   node test/harness/generate-coaching-fixtures.js --session session_2026-03-28_07-34-03
 *   node test/harness/generate-coaching-fixtures.js --min-duration 900        # 15分未満スキップ
 *   node test/harness/generate-coaching-fixtures.js --list                    # セッション一覧
 */

const fs = require('fs')
const path = require('path')
const { Preprocessor } = require('../../electron/core/preprocessor')
const { setCacheDir, initPatchData } = require('../../electron/api/patchData')
const { validateCoachingInput, printValidation } = require('./validateInput')

// ── CLI引数パース ──
const args = process.argv.slice(2)
function getArg(name) {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null
}
const sessionFilter = getArg('session')
const minDuration = parseInt(getArg('min-duration') || '600', 10)
const listOnly = args.includes('--list')

// ── パス設定 ──
const userDataDir = path.join(process.env.APPDATA || path.join(require('os').homedir(), '.config'), 'lol-build-advisor')
const recordingsDir = path.join(userDataDir, 'game-logs')
const cacheDataDir = path.join(userDataDir, 'ddragon-cache')
const fixtureDir = path.join(__dirname, '..', 'fixtures', 'coaching')
const expectedDir = path.join(__dirname, '..', 'expected', 'coaching')

/**
 * セッションJSONからgame:dataイベントを抽出
 * players (分割済み) → allPlayers (フラット) に変換
 */
function extractGameDataEvents(session) {
  return session.events
    .filter(e => e.ch === 'game:data' && e.data?.gameData?.gameTime > 0)
    .map(e => {
      const d = e.data
      // allPlayers が無い場合、players から再構築
      if (!d.allPlayers && d.players) {
        const { me, allies = [], enemies = [] } = d.players
        d.allPlayers = [me, ...allies, ...enemies].filter(Boolean)
      }
      return d
    })
}

/**
 * game:data からコアビルドを抽出
 */
function extractCoreBuild(session) {
  const coreBuildEvent = session.events.find(e => e.ch === 'core:build' && e.data?.build_goal)
  if (!coreBuildEvent) return []
  return coreBuildEvent.data.build_goal.map((id, i) => ({
    id,
    name: coreBuildEvent.data.build_goal_names?.[i] || `item_${id}`,
  }))
}

/**
 * game:dataイベント列から60秒間隔のスナップショットを構築
 * recordSnapshot() と同形式
 */
function buildSnapshotsFromGameData(gameDataEvents) {
  const snapshots = []
  let lastSnapTime = -999

  for (const gd of gameDataEvents) {
    const gameTime = gd.gameData?.gameTime || 0
    if (gameTime - lastSnapTime < 60) continue
    lastSnapTime = gameTime

    // プレイヤー情報の取得 (players.me か allPlayers から)
    const me = gd.players?.me || gd.allPlayers?.[0]
    if (!me) continue

    const scores = me.scores || {}
    const snap = {
      timestamp: gameTime,
      kda: [scores.kills || 0, scores.deaths || 0, scores.assists || 0],
      cs: scores.creepScore || 0,
      items: (me.items || []).filter(i => i.itemID > 0).map(i => ({ id: i.itemID, name: i.displayName || `item_${i.itemID}` })),
      level: me.level || 1,
      gold: gd.activePlayer?.currentGold || 0,
      killDiff: calcKillDiff(gd),
      situation: calcSituation(gd),
    }

    // 対面情報
    const opp = findLaneOpponent(gd, me)
    if (opp) {
      const oppScores = opp.scores || {}
      snap.laneOpponent = {
        champion: opp.championName || opp.rawChampionName || 'Unknown',
        level: opp.level || 1,
        kda: [oppScores.kills || 0, oppScores.deaths || 0, oppScores.assists || 0],
        items: (opp.items || []).filter(i => i.itemID > 0).map(i => ({ id: i.itemID, name: i.displayName || `item_${i.itemID}` })),
        estimatedGold: 0,
      }
    }

    snapshots.push(snap)
  }

  return snapshots
}

function calcKillDiff(gd) {
  const allPlayers = gd.allPlayers || []
  const me = gd.players?.me
  if (!me) return 0
  const myTeam = me.team
  const allyKills = allPlayers.filter(p => p.team === myTeam).reduce((s, p) => s + (p.scores?.kills || 0), 0)
  const enemyKills = allPlayers.filter(p => p.team !== myTeam).reduce((s, p) => s + (p.scores?.kills || 0), 0)
  return allyKills - enemyKills
}

function calcSituation(gd) {
  const diff = calcKillDiff(gd)
  if (diff >= 3) return 'ahead'
  if (diff <= -3) return 'behind'
  return 'even'
}

function findLaneOpponent(gd, me) {
  if (!me?.position) return null
  const allPlayers = gd.allPlayers || []
  const enemies = allPlayers.filter(p => p.team !== me.team)
  return enemies.find(e => normalizePos(e.position) === normalizePos(me.position))
}

function normalizePos(pos) {
  const map = { TOP: 'TOP', JUNGLE: 'JG', MIDDLE: 'MID', BOTTOM: 'ADC', UTILITY: 'SUP' }
  return map[pos] || pos
}

/**
 * セッションからフィクスチャ名を決定
 */
function buildFixtureName(gd, index) {
  const me = gd.players?.me || gd.allPlayers?.[0]
  const champion = (me?.championName || me?.rawChampionName || 'unknown').toLowerCase().replace(/[・\s]/g, '')
  const role = normalizePos(me?.position || 'unknown').toLowerCase()
  const situation = calcSituation(gd)
  const num = String(index).padStart(2, '0')
  return `${num}-${champion}-${role}-${situation}`
}

/**
 * 入力データから自動推論できるexpectedルールを生成
 */
function generateExpectedRules(input) {
  const rules = []

  // 重傷チェック
  if ((input.enemy_healer_count || 0) < 2) {
    rules.push({ type: 'must_not_recommend_grievous_when_no_healers' })
  }

  // ダメージプロファイルチェック
  if (input.enemy_damage_profile) {
    rules.push({ type: 'must_respect_damage_profile' })
  }

  // サポートアイテム批判チェック
  if (input.me?.role === 'SUP') {
    rules.push({ type: 'must_not_criticize_role_item', role: 'SUP', items: ['至点のソリ', 'ルーニック コンパス', 'ブラッドソング', 'ドリーム メーカー'] })
  }

  // 試合時間チェック
  if (input.game_duration) {
    rules.push({ type: 'game_duration_aware' })
  }

  // スコア整合性
  rules.push({ type: 'score_consistency' })

  return rules
}

// ── メイン処理 ──
async function main() {
  // セッション一覧確認
  if (!fs.existsSync(recordingsDir)) {
    console.error(`recordings ディレクトリが見つかりません: ${recordingsDir}`)
    process.exit(1)
  }

  const sessionFiles = fs.readdirSync(recordingsDir)
    .filter(f => f.endsWith('.json') && f.startsWith('session_'))
    .sort()

  if (listOnly) {
    console.log(`\n${sessionFiles.length} sessions found:\n`)
    for (const f of sessionFiles) {
      try {
        const session = JSON.parse(fs.readFileSync(path.join(recordingsDir, f), 'utf-8'))
        const durationMin = Math.round(session.duration / 60000)
        const events = session.eventCount
        console.log(`  ${f}  (${durationMin}min, ${events} events)`)
      } catch {
        console.log(`  ${f}  (読み込みエラー)`)
      }
    }
    return
  }

  // PatchData初期化
  setCacheDir(cacheDataDir)
  console.log('PatchData 初期化中...')
  try {
    await initPatchData()
  } catch (err) {
    console.error(`PatchData 初期化失敗: ${err.message}`)
    console.error('アプリを一度起動してキャッシュを作成してください')
    process.exit(1)
  }

  // fixture/expected ディレクトリ作成
  fs.mkdirSync(fixtureDir, { recursive: true })
  fs.mkdirSync(expectedDir, { recursive: true })

  // 既存のfixture番号を取得
  const existingFixtures = fs.readdirSync(fixtureDir).filter(f => f.endsWith('.json'))
  let nextIndex = existingFixtures.length + 1

  const targetSessions = sessionFilter
    ? sessionFiles.filter(f => f.includes(sessionFilter))
    : sessionFiles

  if (targetSessions.length === 0) {
    console.error('対象セッションが見つかりません')
    process.exit(1)
  }

  console.log(`\n${targetSessions.length} セッションを処理中...\n`)

  let generated = 0
  let skipped = 0

  for (const file of targetSessions) {
    const sessionPath = path.join(recordingsDir, file)
    let session
    try {
      session = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'))
    } catch {
      console.log(`  [SKIP] ${file} — 読み込みエラー`)
      skipped++
      continue
    }

    // game:data イベント抽出
    const gameDataEvents = extractGameDataEvents(session)
    if (gameDataEvents.length < 3) {
      console.log(`  [SKIP] ${file} — game:dataイベントが少ない (${gameDataEvents.length}件)`)
      skipped++
      continue
    }

    // 試合時間チェック
    const lastGd = gameDataEvents[gameDataEvents.length - 1]
    const gameDuration = lastGd.gameData?.gameTime || 0
    if (gameDuration < minDuration) {
      console.log(`  [SKIP] ${file} — 試合時間が短い (${Math.round(gameDuration / 60)}分)`)
      skipped++
      continue
    }

    // スナップショット構築
    const snapshots = buildSnapshotsFromGameData(gameDataEvents)
    if (snapshots.length < 3) {
      console.log(`  [SKIP] ${file} — スナップショットが少ない (${snapshots.length}件)`)
      skipped++
      continue
    }

    // Preprocessor で buildGameState + buildCoachingInput
    const preprocessor = new Preprocessor()
    preprocessor.gameLog = snapshots

    let gameState
    try {
      gameState = preprocessor.buildGameState(lastGd, lastGd.events?.Events || [])
    } catch (err) {
      console.log(`  [SKIP] ${file} — buildGameState エラー: ${err.message}`)
      skipped++
      continue
    }

    const coreBuild = extractCoreBuild(session)

    let coachingInput
    try {
      coachingInput = preprocessor.buildCoachingInput(
        gameState,
        snapshots,
        coreBuild,
        lastGd.events?.Events || []
      )
    } catch (err) {
      console.log(`  [SKIP] ${file} — buildCoachingInput エラー: ${err.message}`)
      skipped++
      continue
    }

    // 品質チェック
    const validation = validateCoachingInput(coachingInput)

    // フィクスチャ名決定
    const fixtureName = buildFixtureName(lastGd, nextIndex)

    // 重複チェック（同じチャンピオン・ロール・状況の組み合わせがあるか）
    const pattern = fixtureName.replace(/^\d+-/, '')
    const duplicate = existingFixtures.find(f => f.includes(pattern))
    if (duplicate) {
      console.log(`  [SKIP] ${file} — 類似フィクスチャ既存: ${duplicate}`)
      skipped++
      continue
    }

    // フィクスチャ保存
    const fixtureFile = `${fixtureName}.json`
    fs.writeFileSync(
      path.join(fixtureDir, fixtureFile),
      JSON.stringify(coachingInput, null, 2),
      'utf-8'
    )

    // expected 生成
    const expectedRules = generateExpectedRules(coachingInput)
    const expectedData = {
      score_range: [1, 10],
      rules: expectedRules,
      _auto_generated: true,
      _source_session: file,
    }
    fs.writeFileSync(
      path.join(expectedDir, fixtureFile),
      JSON.stringify(expectedData, null, 2),
      'utf-8'
    )

    console.log(`  [GEN] ${fixtureFile}`)
    printValidation(`      品質`, validation)

    existingFixtures.push(fixtureFile)
    nextIndex++
    generated++
  }

  console.log(`\n完了: ${generated}件生成, ${skipped}件スキップ`)
  console.log(`フィクスチャ: ${fixtureDir}`)
  console.log(`期待出力:     ${expectedDir}`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
