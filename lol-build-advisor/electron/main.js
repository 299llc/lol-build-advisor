const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { LiveClientPoller } = require('./api/liveClient')
const { ClaudeApiClient } = require('./api/claudeApi')
const { OllamaProvider } = require('./api/providers/ollamaProvider')
const { LicenseManager } = require('./api/licenseManager')
const { ContextBuilder, extractEnName } = require('./api/contextBuilder')
const { DiffDetector } = require('./api/diffDetector')
const { setCacheDir, initPatchData, getVersion, getChampionById, getItemById, getSpells, loadSpellsForMatch, refreshCache, formatItemSummary } = require('./api/patchData')
const { fetchChampionBuild, buildCoreBuildIds, fetchMatchupItems } = require('./api/opggClient')
const { LcuClient } = require('./api/lcuClient')
const { detectFlags } = require('./core/championAnalysis')
const { RuleEngine } = require('./core/ruleEngine')
const { buildMacroStaticContext, buildMacroDynamicContext, getObjectivesSummary, getObjectiveTimers } = require('./core/objectiveTracker')
const { MACRO_INTERVAL_MS, MACRO_DEBOUNCE_MS, COUNTER_ITEMS, ITEM_COMPLETE_GOLD, ITEM_BOOT_GOLD, DEFAULT_WINDOW, DDRAGON_BASE, POLL_INTERVAL_MS, isCompletedItem, classifyObjectiveEvents } = require('./core/config')
const { SessionRecorder } = require('./core/sessionRecorder')
const { GameLogger } = require('./core/gameLogger')

// ── ゲームロガー（console.log フック）──────────────
const gameLogger = new GameLogger(app.getPath('userData'))
gameLogger.hook()

// ── 状態管理 ──────────────────────────────────────
const state = {
  // Electron
  mainWindow: null,
  isDev: false,

  // ポーリング
  poller: null,
  contextBuilder: null,
  diffDetector: null,
  pollingInterval: null,

  // コンパクトウィンドウ
  compactWindow: null,

  // AI
  claudeClient: null,
  lcuClient: null,
  aiEnabled: false,
  aiPending: false,

  // 試合状態
  lastSuggestion: null,
  lastGameSnapshot: null,
  spellsLoadedForGame: false,
  coachingRequested: false,
  gameEndTriggered: false,

  // コアビルド
  coreBuildLoaded: false,
  coreBuildSentForGame: false,
  currentCoreBuild: null,
  currentAnalysis: null,

  // マッチアップ
  matchupItemsLoaded: false,
  matchupTipLoaded: false,

  // マクロ
  lastMacroTime: 0,
  macroPending: false,
  lastObjectiveCount: 0,

  // 最後に送信したデータ（コンパクトウィンドウ再送用）
  lastMacroAdvice: null,
  lastMatchupTip: null,
  lastSubstituteItems: null,
  lastCoreBuildMsg: null,
  lastGameStatus: 'waiting',
  cachedEvents: [],  // フォールバック用イベントキャッシュ
  _lastObjLogKey: null,       // Objectivesログ重複防止（ゲーム中維持）
  _lastObjTriggerKey: null,   // オブジェクトスポーン前トリガー重複防止（ゲーム中維持）
  _lastStatsMinute: 0,        // プレイヤースタッツログ重複防止

  // チャンプセレクト
  champSelectChampId: null,

  // ポジション
  manualPosition: null,
  positionSelectSent: false,

  // ルールエンジン
  ruleEngine: null,
  // ライセンス
  licenseManager: null,

  // 観戦
  spectatorSelectedName: null,

  // Data Dragon
  ddragonBase: `${DDRAGON_BASE}/16.5.1`,

  // セッションレコーダー
  recorder: null,
}

// ── 設定 ──────────────────────────────────────────
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json')

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf-8')) }
  catch { return {} }
}

function saveSetting(key, value) {
  try {
    const settings = loadSettings()
    settings[key] = value
    fs.writeFileSync(settingsPath(), JSON.stringify(settings), 'utf-8')
  } catch {}
}

// ── 前回試合結果の永続化 ──────────────────────────
const lastGamePath = () => path.join(app.getPath('userData'), 'last-game.json')

function saveLastGame(gameData, coaching) {
  try {
    const data = {
      savedAt: new Date().toISOString(),
      gameData,
      coaching,
    }
    fs.writeFileSync(lastGamePath(), JSON.stringify(data), 'utf-8')
    console.log('[LastGame] Saved last game result')
  } catch (err) {
    console.error('[LastGame] Save error:', err.message)
  }
}

function loadLastGame() {
  try {
    return JSON.parse(fs.readFileSync(lastGamePath(), 'utf-8'))
  } catch {
    return null
  }
}

// ── ウィンドウ ────────────────────────────────────
const windowStatePath = () => path.join(app.getPath('userData'), 'window-state.json')

function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(windowStatePath(), 'utf-8')) }
  catch { return DEFAULT_WINDOW }
}

let saveWindowTimer = null
function saveWindowState() {
  if (saveWindowTimer) clearTimeout(saveWindowTimer)
  saveWindowTimer = setTimeout(() => {
    if (!state.mainWindow) return
    try { fs.writeFileSync(windowStatePath(), JSON.stringify(state.mainWindow.getBounds()), 'utf-8') }
    catch {}
  }, 500)
}

function createWindow() {
  const saved = loadWindowState()
  const settings = loadSettings()

  state.isDev = !app.isPackaged
  state.aiEnabled = settings.aiEnabled ?? false
  const onTop = settings.onTop ?? true

  state.mainWindow = new BrowserWindow({
    width: saved.width || DEFAULT_WINDOW.width,
    height: saved.height || DEFAULT_WINDOW.height,
    x: saved.x,
    y: saved.y,
    frame: false,
    transparent: true,
    alwaysOnTop: onTop,
    resizable: true,
    skipTaskbar: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  state.mainWindow.setAlwaysOnTop(onTop, onTop ? 'screen-saver' : 'normal')
  state.mainWindow.on('moved', saveWindowState)
  state.mainWindow.on('resized', saveWindowState)

  // セッションレコーダー: webContents.send をラップ
  state.recorder = new SessionRecorder(app.getPath('userData'))
  state.recorder.install(state.mainWindow.webContents)

  if (state.isDev) {
    state.mainWindow.loadURL('http://localhost:5173')
  } else {
    state.mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

// ── コンパクトウィンドウ ──────────────────────────
function toggleCompactWindow() {
  if (state.compactWindow) {
    state.compactWindow.close()
    return
  }

  const compactState = loadCompactWindowState()
  state.compactWindow = new BrowserWindow({
    width: compactState.width || 380,
    height: compactState.height || 520,
    x: compactState.x,
    y: compactState.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  state.compactWindow.setAlwaysOnTop(true, 'screen-saver')

  const saveCompactState = () => {
    if (!state.compactWindow) return
    try {
      const bounds = state.compactWindow.getBounds()
      fs.writeFileSync(compactWindowStatePath(), JSON.stringify(bounds), 'utf-8')
    } catch {}
  }
  state.compactWindow.on('moved', saveCompactState)
  state.compactWindow.on('resized', saveCompactState)

  state.compactWindow.on('closed', () => {
    state.compactWindow = null
    state.mainWindow?.webContents.send('compact:status', false)
  })

  // 読み込み完了後に既存データを再送
  state.compactWindow.webContents.on('did-finish-load', () => {
    sendStateToCompactWindow()
  })

  if (state.isDev) {
    state.compactWindow.loadURL('http://localhost:5173?compact=true')
  } else {
    const filePath = path.join(__dirname, '../dist/index.html')
    state.compactWindow.loadURL(`file://${filePath}?compact=true`)
  }

  state.mainWindow?.webContents.send('compact:status', true)
}

function compactWindowStatePath() {
  return path.join(app.getPath('userData'), 'compact-window-state.json')
}

function loadCompactWindowState() {
  try {
    return JSON.parse(fs.readFileSync(compactWindowStatePath(), 'utf-8'))
  } catch { return {} }
}

// ── broadcast: メイン + コンパクト両方に送信 ─────
function broadcast(channel, data) {
  // コンパクトウィンドウ再送用にキャッシュ
  if (channel === 'macro:advice') state.lastMacroAdvice = data
  else if (channel === 'matchup:tip') state.lastMatchupTip = data
  else if (channel === 'substitute:items') state.lastSubstituteItems = data
  else if (channel === 'core:build') state.lastCoreBuildMsg = data
  else if (channel === 'game:status') state.lastGameStatus = data

  state.mainWindow?.webContents.send(channel, data)
  state.compactWindow?.webContents.send(channel, data)
}

// コンパクトウィンドウに既存データを再送
function sendStateToCompactWindow() {
  const cw = state.compactWindow
  if (!cw) return
  cw.webContents.send('game:status', state.lastGameStatus)
  if (state.lastGameSnapshot) cw.webContents.send('game:data', state.lastGameSnapshot)
  if (state.lastCoreBuildMsg) cw.webContents.send('core:build', state.lastCoreBuildMsg)
  if (state.lastSuggestion) cw.webContents.send('ai:suggestion', state.lastSuggestion)
  if (state.lastSubstituteItems) cw.webContents.send('substitute:items', state.lastSubstituteItems)
  if (state.lastMatchupTip) cw.webContents.send('matchup:tip', state.lastMatchupTip)
  if (state.lastMacroAdvice) cw.webContents.send('macro:advice', state.lastMacroAdvice)
}

// ── デバッグログ ──────────────────────────────────
function macroLog(msg) {
  console.log(`[Macro] ${msg}`)
}

// ── IPC ハンドラ ──────────────────────────────────
function setupIPC() {
  const { mainWindow } = state
  ipcMain.on('window:minimize', () => state.mainWindow?.minimize())
  ipcMain.on('window:close', () => {
    state.compactWindow?.close()
    state.mainWindow?.close()
  })

  // コンパクトウィンドウ
  ipcMain.handle('compact:toggle', () => {
    toggleCompactWindow()
    return !!state.compactWindow
  })
  ipcMain.handle('compact:status', () => !!state.compactWindow)
  ipcMain.on('compact:minimize', () => state.compactWindow?.minimize())
  ipcMain.on('compact:close', () => state.compactWindow?.close())

  const keyPath = path.join(app.getPath('userData'), '.api-key')

  ipcMain.handle('apikey:get', () => {
    try { return fs.readFileSync(keyPath, 'utf-8') } catch { return '' }
  })
  ipcMain.handle('apikey:set', (_, key) => {
    fs.writeFileSync(keyPath, key, 'utf-8')
    state.claudeClient = new ClaudeApiClient(key)
    return true
  })
  ipcMain.handle('apikey:validate', async (_, key) => {
    const client = new ClaudeApiClient(key)
    return client.validate()
  })

  // ── ローカル LLM (Ollama) プロバイダー ──
  ipcMain.handle('provider:set-ollama', async (_, opts) => {
    // opts: { baseUrl?, model? }
    const provider = new OllamaProvider(opts || {})
    const ok = await provider.validate()
    if (!ok) return { success: false, error: 'Ollama に接続できません。ollama が起動しているか確認してください。' }
    state.claudeClient = new ClaudeApiClient(provider)
    saveSetting('provider', { type: 'ollama', baseUrl: provider.baseUrl, model: provider.defaultModel })
    return { success: true, model: provider.defaultModel || 'auto' }
  })

  ipcMain.handle('provider:set-anthropic', async (_, key) => {
    fs.writeFileSync(keyPath, key, 'utf-8')
    state.claudeClient = new ClaudeApiClient(key)
    saveSetting('provider', { type: 'anthropic' })
    return { success: true }
  })

  ipcMain.handle('provider:get', () => {
    const settings = loadSettings()
    return settings.provider || { type: 'anthropic' }
  })

  ipcMain.handle('ollama:models', async (_, baseUrl) => {
    const provider = new OllamaProvider({ baseUrl })
    return provider.listModels()
  })

  ipcMain.handle('ollama:validate', async (_, opts) => {
    const provider = new OllamaProvider(opts || {})
    return provider.validate()
  })

  // ── ライセンス管理 ──
  ipcMain.handle('license:status', () => {
    return state.licenseManager?.getStatus() || { tier: 'free', remainingGames: 0 }
  })

  ipcMain.handle('license:verify', async (_, key) => {
    if (!state.licenseManager) return { valid: false, error: 'LicenseManager not initialized' }
    return state.licenseManager.verifyLicense(key)
  })

  ipcMain.handle('license:clear', () => {
    state.licenseManager?.clearLicense()
    return { tier: 'free' }
  })

  ipcMain.handle('polling:start', () => startPolling())
  ipcMain.handle('polling:stop', () => stopPolling())
  ipcMain.handle('ai:toggle', (_, enabled) => { state.aiEnabled = enabled; saveSetting('aiEnabled', enabled); return state.aiEnabled })
  ipcMain.handle('ai:status', () => state.aiEnabled)
  ipcMain.handle('ontop:toggle', (_, enabled) => {
    state.mainWindow?.setAlwaysOnTop(enabled, enabled ? 'screen-saver' : 'normal')
    saveSetting('onTop', enabled)
    return enabled
  })
  ipcMain.handle('ontop:status', () => state.mainWindow?.isAlwaysOnTop() ?? true)

  ipcMain.handle('ai:logs', () => state.claudeClient?.getLogs() || [])
  ipcMain.handle('ai:clearLogs', () => { state.claudeClient?.clearLogs(); return true })
  ipcMain.handle('app:isDev', () => state.isDev)

  ipcMain.handle('debug:state', async () => {
    const raw = await state.poller?.fetchAllGameData()
    return raw || null
  })

  ipcMain.handle('item:detail', (_, itemId) => {
    const item = getItemById(String(itemId))
    if (!item) return null
    return { jaName: item.jaName, fullDesc: item.fullDesc || item.description || '', gold: item.gold?.total || 0, image: item.image }
  })

  ipcMain.handle('cache:refresh', async () => {
    try {
      const result = await refreshCache()
      console.log('[Cache] Refreshed:', result)
      return { success: true, version: result?.version }
    } catch (err) {
      console.error('[Cache] Refresh error:', err.message)
      return { success: false, error: err.message }
    }
  })

  // ── セッションレコーダー IPC ──
  ipcMain.handle('recorder:list', () => {
    return state.recorder?.listSessions() || []
  })

  ipcMain.handle('recorder:load', (_, filepath) => {
    return SessionRecorder.loadSession(filepath)
  })

  ipcMain.handle('recorder:toggle', () => {
    if (!state.recorder) return { recording: false }
    if (state.recorder.isRecording()) {
      const savedPath = state.recorder.save()
      return { recording: false, savedPath }
    } else {
      state.recorder.start()
      return { recording: true }
    }
  })

  ipcMain.handle('recorder:status', () => {
    return { recording: state.recorder?.isRecording() || false }
  })

  // ゲームログフォルダを開く
  ipcMain.handle('gamelog:openFolder', () => {
    const { shell } = require('electron')
    const logDir = path.join(app.getPath('userData'), 'game-logs')
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
    shell.openPath(logDir)
    return logDir
  })

  ipcMain.handle('lastgame:get', () => loadLastGame())

  ipcMain.handle('position:set', (_, position) => {
    state.manualPosition = position
    resetBuildState()
    console.log(`[Position] Manual set: ${position}`)
    return true
  })

  ipcMain.handle('spectator:select', (_, name) => {
    state.spectatorSelectedName = name
    resetBuildState()
    return true
  })
}

// ── ビルド状態リセット ────────────────────────────
function resetBuildState() {
  // コアビルド
  state.coreBuildLoaded = false
  state.coreBuildSentForGame = false
  state.currentCoreBuild = null
  state.currentAnalysis = null
  // マッチアップ
  state.matchupItemsLoaded = false
  state.matchupTipLoaded = false
  // AI提案
  state.lastSuggestion = null
  state.aiPending = false
  // マクロ
  state.lastMacroTime = 0
  state.macroPending = false
  state.lastObjectiveCount = 0
  // コンパクトウィンドウ再送用キャッシュ
  state.lastMacroAdvice = null
  state.lastMatchupTip = null
  state.lastSubstituteItems = null
  state.lastCoreBuildMsg = null
  state.cachedEvents = []
  // ポジション
  state.manualPosition = null
  state.positionSelectSent = false
  // Claude API client側もクリア
  if (state.claudeClient) state.claudeClient.clearMatch()
  // ルールエンジンリセット
  if (state.ruleEngine) state.ruleEngine.reset()
  // Renderer側もクリア
  if (state.mainWindow) {
    state.mainWindow.webContents.send('core:build', null)
    state.mainWindow.webContents.send('matchup:tip', null)
    state.mainWindow.webContents.send('ai:suggestion', null)
    state.mainWindow.webContents.send('substitute:items', [])
    state.mainWindow.webContents.send('macro:advice', null)
    state.mainWindow.webContents.send('coaching:result', null)
    state.mainWindow.webContents.send('ai:loading', false)
    state.mainWindow.webContents.send('macro:loading', false)
    state.mainWindow.webContents.send('coaching:loading', false)
    state.mainWindow.webContents.send('position:select', null)
  }
}

// ── アイテム解決 ──────────────────────────────────
function resolveItemInfo(ids) {
  const items = ids.map(id => getItemById(String(id)))
  return {
    ids,
    names: items.map((it, i) => it?.jaName || String(ids[i])),
    images: items.map(it => it?.image || null),
    descs: items.map(it => it?.fullDesc || it?.description || '')
  }
}

// ── マクロアドバイス ──────────────────────────────
async function requestMacroAdvice(gameData, me, allies, enemies) {
  if (state.macroPending || !state.claudeClient || !state.aiEnabled) return

  state.macroPending = true
  broadcast('macro:loading', true)

  try {
    const staticCtx = buildMacroStaticContext(me, allies, enemies)
    const dynamicCtx = buildMacroDynamicContext(gameData, me, allies, enemies)
    const advice = await state.claudeClient.getMacroAdvice(staticCtx, dynamicCtx)
    if (advice) {
      advice.gameTime = gameData.gameData?.gameTime || 0
      broadcast('macro:advice', advice)
      macroLog(`Sent: ${advice.title}`)
    } else {
      macroLog('API returned null')
    }
  } catch (err) {
    macroLog(`Error: ${err.message}`)
    broadcast('macro:advice', { error: err.message })
  } finally {
    state.macroPending = false
    broadcast('macro:loading', false)
  }
}

// ── コーチング ────────────────────────────────────
async function requestCoaching(snapshot) {
  if (!state.claudeClient || !snapshot) return

  const { players, gameData: gd } = snapshot
  const { me, allies, enemies } = players || {}
  if (!me) return

  const gameTime = gd?.gameTime || 0
  const minutes = Math.floor(gameTime / 60)
  const myItems = (me.items || []).filter(i => i.itemID > 0).map(i => i.displayName).join(', ')
  const myKDA = me.scores ? `${me.scores.kills}/${me.scores.deaths}/${me.scores.assists}` : '不明'
  const myCS = me.scores?.creepScore || 0

  const allAllies = [me, ...(allies || [])]
  const allyKills = allAllies.reduce((s, p) => s + (p.scores?.kills || 0), 0)
  const enemyKills = (enemies || []).reduce((s, p) => s + (p.scores?.kills || 0), 0)
  const myKillParticipation = allyKills > 0
    ? Math.round(((me.scores?.kills || 0) + (me.scores?.assists || 0)) / allyKills * 100) : 0

  const formatPlayer = (p) => {
    const items = (p.items || []).filter(i => i.itemID > 0).map(i => i.displayName).join(', ')
    const kda = p.scores ? `${p.scores.kills}/${p.scores.deaths}/${p.scores.assists}` : '?'
    const flags = p.flags?.length ? ` [${p.flags.join(',')}]` : ''
    return `${p.championName} (${p.position || '?'}) KDA:${kda} Lv${p.level} ${items}${flags}`
  }

  // --- チャンプスキル情報を構築 ---
  const champSkillLines = []
  const allPlayers = [me, ...(allies || []), ...(enemies || [])]
  for (const p of allPlayers) {
    const spells = getSpells(p.enName)
    if (!spells) continue
    const skillTexts = spells.spells.map(s => `${s.key}:${s.name}(${s.desc.substring(0, 40)})`).join(' ')
    champSkillLines.push(`${p.championName}: ${skillTexts}`)
  }

  // --- 試合に登場したアイテム辞書を構築 ---
  const itemIds = new Set()
  // 全プレイヤーのアイテムを収集
  for (const p of allPlayers) {
    for (const item of (p.items || [])) {
      if (item.itemID > 0) itemIds.add(String(item.itemID))
    }
  }
  // コアビルドのアイテムも追加
  if (state.currentCoreBuild?.ids) {
    for (const id of state.currentCoreBuild.ids) itemIds.add(String(id))
  }
  // カウンターアイテム候補も追加（敵フラグに応じて）
  const enemyFlags = new Set()
  for (const e of (enemies || [])) {
    for (const f of (e.flags || [])) enemyFlags.add(f)
  }
  for (const [flag, ids] of Object.entries(COUNTER_ITEMS)) {
    if (enemyFlags.has(flag)) {
      for (const id of ids) itemIds.add(String(id))
    }
  }
  // アイテム辞書テキスト生成
  const itemDictLines = []
  for (const id of itemIds) {
    const summary = formatItemSummary(id)
    if (!summary || summary.gold < 400) continue // 素材アイテムの詳細説明は省略
    itemDictLines.push(`${summary.name}(${summary.gold}G): ${summary.stats} / ${summary.desc}`)
  }

  const lines = [
    `=== 試合終了データ ===`,
    `試合時間: ${minutes}分`,
    '',
    `【自分】${me.championName} (${me.position || '?'})`,
    `KDA: ${myKDA}`,
    `CS: ${myCS} (${minutes > 0 ? (myCS / minutes).toFixed(1) : 0}/min)`,
    `レベル: ${me.level}`,
    `アイテム: ${myItems || 'なし'}`,
    '',
    ...(state.currentCoreBuild ? [`【推奨コアビルド(OP.GG統計)】${state.currentCoreBuild.names.join(', ')}`, ''] : []),
    `チームキル: 味方${allyKills} vs 敵${enemyKills}`,
    `キル参加率: ${myKillParticipation}%`,
    '',
    `【味方チーム】`,
    ...(allies || []).map(formatPlayer),
    '',
    `【敵チーム】`,
    ...(enemies || []).map(formatPlayer),
    '',
    `【チャンピオンスキル情報】`,
    ...champSkillLines,
    '',
    `【アイテム辞書（効果・ステータス）】`,
    `※以下はこの試合に関連するアイテムの正確な効果です。コーチングではこの情報を参照してください。`,
    ...itemDictLines
  ]

  console.log('[Coaching] Requesting post-game evaluation...')
  broadcast('coaching:loading', true)

  try {
    const result = await state.claudeClient.getCoaching(lines.join('\n'))
    if (result) {
      console.log(`[Coaching] Score: ${result.overall_score}/10 Build: ${result.build_score || '?'}/10`)
      if (result.sections) {
        for (const s of result.sections) {
          console.log(`[Coaching] [${s.grade || '?'}] ${s.title}: ${(s.content || '').substring(0, 120)}`)
        }
      }
      if (result.good_points) {
        result.good_points.forEach((p, i) => console.log(`[Coaching] Good${i+1}: ${p.substring(0, 120)}`))
      }
      if (result.improve_points) {
        result.improve_points.forEach((p, i) => console.log(`[Coaching] Improve${i+1}: ${p.substring(0, 120)}`))
      }
      if (result.next_game_advice) {
        console.log(`[Coaching] NextGame: ${result.next_game_advice.substring(0, 150)}`)
      }
      broadcast('coaching:result', result)
      saveLastGame(snapshot, result)
    } else {
      console.error('[Coaching] No result returned')
      saveLastGame(snapshot, null)
    }
  } catch (err) {
    console.error('[Coaching] Error:', err.message)
    // エラー時も試合データを保存（古いコーチング結果が残らないように）
    saveLastGame(snapshot, null)
  } finally {
    broadcast('coaching:loading', false)
  }
}

// ── カウンターアイテム注入 ────────────────────────
function injectCounterItems(items, enemies) {
  const enemyFlags = new Set()
  for (const e of enemies) {
    for (const f of (e.flags || [])) enemyFlags.add(f)
  }

  const existingIds = new Set(items.map(it => String(it.id)))
  const coreIds = new Set((state.currentCoreBuild?.ids || []).map(String))
  const toAdd = []

  for (const [flag, counterIds] of Object.entries(COUNTER_ITEMS)) {
    if (!enemyFlags.has(flag)) continue
    for (const id of counterIds) {
      if (existingIds.has(id) || coreIds.has(id)) continue
      const patchItem = getItemById(id)
      if (!patchItem) continue
      toAdd.push({ id, jaName: patchItem.jaName || id, desc: patchItem.fullDesc || patchItem.description || '' })
      existingIds.add(id)
    }
  }
  if (toAdd.length > 0) {
    console.log(`[CounterItems] Injected: ${toAdd.map(it => it.jaName).join(', ')}`)
  }
  return [...items, ...toAdd]
}

// ── フォールバック候補 ────────────────────────────
function buildFallbackSubstituteItems() {
  const analysis = state.currentAnalysis
  if (!analysis) return []

  const seen = new Set()
  const coreIds = new Set((state.currentCoreBuild?.ids || []).map(String))
  const items = []

  const sources = [
    ...(analysis.fourthItems || []),
    ...(analysis.fifthItems || []),
    ...(analysis.sixthItems || []),
    ...(analysis.lastItems || [])
  ]

  for (const entry of sources) {
    for (const id of (entry.ids || [])) {
      const idStr = String(id)
      if (seen.has(idStr) || coreIds.has(idStr)) continue
      seen.add(idStr)
      const patchItem = getItemById(idStr)
      if (!isCompletedItem(patchItem)) continue
      items.push({ id: idStr, jaName: patchItem.jaName || idStr, desc: patchItem.fullDesc || patchItem.description || '' })
    }
  }
  return items.slice(0, 15)
}

function useFallbackSubstituteItems(enemies) {
  let fallback = buildFallbackSubstituteItems()
  if (enemies) fallback = injectCounterItems(fallback, enemies)
  if (fallback.length > 0) {
    if (state.claudeClient) state.claudeClient.setSubstituteItems(fallback)
    const candidatesForUI = fallback.map(it => {
      const patchItem = getItemById(it.id)
      return { id: it.id, name: it.jaName, image: patchItem?.image || null }
    })
    broadcast('substitute:items', candidatesForUI)
    console.log(`[MatchupItems] Fallback: ${fallback.length} items from OP.GG analysis`)
  } else {
    broadcast('substitute:error', 'マッチアップデータを取得できませんでした')
  }
}

// ── コアビルド取得 ────────────────────────────────
async function loadCoreBuild(championEnName, position) {
  try {
    const analysis = await fetchChampionBuild(championEnName, position)
    if (!analysis) return null

    state.currentAnalysis = analysis
    const defaultIds = buildCoreBuildIds(analysis)
    if (!defaultIds.length) return null

    const defaultBuild = resolveItemInfo(defaultIds)
    state.currentCoreBuild = defaultBuild

    if (state.claudeClient) {
      state.claudeClient.setCoreBuild({ ids: defaultBuild.ids, names: defaultBuild.names, descs: defaultBuild.descs })
    }

    console.log(`[CoreBuild] ${championEnName} ${position}: ${defaultBuild.names.join(', ')}`)

    const coreSuggestion = {
      build_goal: defaultBuild.ids,
      build_goal_names: defaultBuild.names,
      build_goal_images: defaultBuild.images,
      changes: [],
      priority: '',
      reasoning: 'OP.GG統計データに基づくコアビルド',
      isCoreBuild: true
    }
    state.lastSuggestion = null
    broadcast('core:build', coreSuggestion)

    return analysis
  } catch (err) {
    console.error(`[CoreBuild] Error: ${err.message}`)
    return null
  }
}

// ── チャンプセレクト ──────────────────────────────
async function checkChampSelect() {
  try {
    if (!state.lcuClient) state.lcuClient = new LcuClient()
    const phase = await state.lcuClient.getGameflowPhase()
    if (phase !== 'ChampSelect') {
      if (state.champSelectChampId) {
        state.champSelectChampId = null
        resetBuildState()
        state.currentAnalysis = null
      }
      if (!state.lastGameSnapshot?.ended) {
        broadcast('game:status', 'waiting')
      }
      return
    }

    if (state.lastGameSnapshot?.ended) {
      state.lastGameSnapshot = null
      state.lastSuggestion = null
      state.coachingRequested = false
    }

    // 新しいセッション記録を開始
    if (state.recorder && !state.recorder.isRecording()) {
      state.recorder.start()
    }

    broadcast('game:status', 'champselect')

    const session = await state.lcuClient.getChampSelect()
    if (!session || !session.myTeam) return

    const teamComp = session.myTeam
      .filter(p => p.championId && p.championId !== 0)
      .map(p => {
        const info = getChampionById(p.championId)
        return {
          championId: p.championId,
          enName: info?.enName || 'Unknown',
          jaName: info?.jaName || '不明',
          tags: info?.tags || [],
          position: p.assignedPosition || '',
          isMe: p.cellId === session.localPlayerCellId
        }
      })
    broadcast('champselect:team', teamComp)

    const myCell = session.myTeam.find(p => p.cellId === session.localPlayerCellId)
    if (!myCell || !myCell.championId || myCell.championId === 0) return
    if (state.champSelectChampId === myCell.championId) return
    state.champSelectChampId = myCell.championId

    const champInfo = getChampionById(myCell.championId)
    if (!champInfo || champInfo.enName.startsWith('Unknown')) return

    const pos = myCell.assignedPosition || 'mid'
    console.log(`[ChampSelect] Picked: ${champInfo.enName} (${pos})`)

    loadCoreBuild(champInfo.enName, pos).then(analysis => {
      if (!analysis) return
      const extras = { ddragon: state.ddragonBase }
      if (analysis.summonerSpells?.length > 0) {
        extras.summonerSpells = analysis.summonerSpells.map(sp => ({
          ids: sp.ids, names: sp.names, pickRate: sp.pickRate, winRate: sp.winRate
        }))
      }
      if (analysis.runes) extras.runes = analysis.runes
      if (analysis.skills) extras.skills = analysis.skills
      broadcast('champselect:extras', extras)
    }).catch(err => {
      console.error(`[ChampSelect] CoreBuild failed: ${err.message}`)
    })
  } catch (err) {
    console.error('[ChampSelect] Error:', err.message)
  }
}

// ── ポーリング ────────────────────────────────────
async function startPolling() {
  if (state.pollingInterval) return

  state.poller = new LiveClientPoller()
  state.contextBuilder = new ContextBuilder()
  state.diffDetector = new DiffDetector()
  state.ruleEngine = new RuleEngine()

  state.pollingInterval = setInterval(async () => {
    try {
      const gameData = await state.poller.fetchAllGameData()

      if (!gameData) {
        handleNoGameData()
        return
      }

      await handleGameData(gameData)
    } catch (err) {
      console.error('Polling error:', err.message)
    }
  }, POLL_INTERVAL_MS)
}

function handleNoGameData() {
  if (state.lastGameSnapshot && !state.lastGameSnapshot.ended) {
    triggerGameEnd()
  } else {
    // ゲーム中でない場合、LCU EndOfGame もチェック
    checkEndOfGameOrChampSelect()
  }
}

async function checkEndOfGameOrChampSelect() {
  // LCU の EndOfGame フェーズを検知してコーチングを発火
  if (state.lastGameSnapshot?.ended && !state.coachingRequested) {
    try {
      if (!state.lcuClient) state.lcuClient = new LcuClient()
      const phase = await state.lcuClient.getGameflowPhase()
      if (phase === 'EndOfGame' || phase === 'PreEndOfGame') {
        console.log(`[GameEnd] LCU phase=${phase}, triggering coaching`)
        if (state.claudeClient && state.aiEnabled) {
          state.coachingRequested = true
          requestCoaching(state.lastGameSnapshot)
        }
        return
      }
    } catch {}
  }
  checkChampSelect()
}

function triggerGameEnd() {
  console.log(`[GameEnd] Game ended. spellsLoaded=${state.spellsLoadedForGame} aiEnabled=${state.aiEnabled} claudeClient=${!!state.claudeClient} coachingRequested=${state.coachingRequested}`)

  // スナップショットを先にコピー（リセット前に保持）
  const snapshotForCoaching = state.lastGameSnapshot ? { ...state.lastGameSnapshot } : null

  // UIから古いコーチング結果を即座にクリア
  broadcast('coaching:result', null)

  // 状態リセット（コーチング発火前に行う。snapshotForCoachingは独立コピー）
  if (state.spellsLoadedForGame) {
    const wasSpellsLoaded = true
    state.spellsLoadedForGame = false
    resetBuildState()
    state.currentAnalysis = null
    state.champSelectChampId = null
    state.manualPosition = null
    state.positionSelectSent = false
    state._lastObjLogKey = null
    state._lastObjTriggerKey = null

    // clearMatch はコーチングが使わないので安全
    if (state.claudeClient) state.claudeClient.clearMatch()

    // コーチングリクエスト（非同期）
    if (state.claudeClient && state.aiEnabled && !state.coachingRequested && wasSpellsLoaded) {
      state.coachingRequested = true
      console.log('[GameEnd] Requesting coaching evaluation...')
      requestCoaching(snapshotForCoaching)
    } else {
      console.log(`[GameEnd] Coaching skipped: claudeClient=${!!state.claudeClient} aiEnabled=${state.aiEnabled} coachingRequested=${state.coachingRequested}`)
      saveLastGame(snapshotForCoaching, null)
    }
  } else {
    console.log(`[GameEnd] Coaching skipped: spellsLoaded=false`)
    saveLastGame(snapshotForCoaching, null)
  }

  state.lastGameSnapshot = { ...(snapshotForCoaching || {}), ended: true }
  broadcast('game:status', 'ended')
  broadcast('game:data', state.lastGameSnapshot)

  // セッション記録を保存（コーチング結果も含めるため少し遅延）
  if (state.recorder?.isRecording()) {
    setTimeout(() => {
      const savedPath = state.recorder.save()
      if (savedPath) console.log(`[Recorder] Session saved: ${savedPath}`)
    }, 15000) // コーチング完了を待つ
  }

  // ゲームログを保存（コーチングログも含めるため遅延）
  if (gameLogger.isActive()) {
    setTimeout(() => {
      const logPath = gameLogger.endGame()
      if (logPath) console.log(`[GameLogger] Log saved: ${logPath}`)
    }, 20000)
  }
}

async function handleGameData(gameData) {
  if (state.champSelectChampId) state.champSelectChampId = null

  // ゲーム終了済みの場合
  if (state.lastGameSnapshot?.ended) {
    // GameEnd イベントがまだ残っている = 同じ試合のデータ → 無視
    const endEvents = (gameData.events?.Events || [])
    if (endEvents.some(e => e.EventName === 'GameEnd')) return

    // GameEnd がない = 新しい試合が始まった → 状態リセット
    state.lastGameSnapshot = null
    state.lastSuggestion = null
    state.coachingRequested = false
    state.gameEndTriggered = false
    state.lastMacroTime = 0
    state.macroPending = false
    state.lastObjectiveCount = 0
  }

  const allPlayers = gameData.allPlayers || []
  allPlayers.forEach(p => { p.enName = extractEnName(p) })

  if (!state.spellsLoadedForGame) {
    state.spellsLoadedForGame = true
    const names = allPlayers.map(p => p.enName).filter(Boolean)
    loadSpellsForMatch(names).catch(() => {})
    // ゲームログ記録開始
    if (!gameLogger.isActive()) gameLogger.startGame()
  }

  // 自分を特定
  const isSpectator = !gameData.activePlayer?.summonerName && !gameData.activePlayer?.riotIdGameName
  let me
  if (isSpectator && state.spectatorSelectedName) {
    me = allPlayers.find(p => p.summonerName === state.spectatorSelectedName) || allPlayers[0]
  } else {
    me = allPlayers.find(p =>
      p.summonerName === gameData.activePlayer?.summonerName ||
      p.riotIdGameName === gameData.activePlayer?.riotIdGameName
    ) || allPlayers[0]
  }
  if (!me) {
    console.warn('[Polling] Could not identify local player, skipping tick')
    return
  }

  const myTeam = me.team || 'ORDER'
  const allies = allPlayers.filter(p => p.team === myTeam && p !== me)
  const enemies = allPlayers.filter(p => p.team !== myTeam)

  // フラグ付与
  enemies.forEach(e => { e.flags = detectFlags(e.enName, e.championId, e.scores) })
  allies.forEach(a => { a.flags = detectFlags(a.enName, a.championId, a.scores) })
  me.flags = detectFlags(me.enName, me.championId, me.scores)

  // ポジション解決
  resolvePosition(me)

  const resolvedPosition = me.position && me.position !== 'NONE' ? me.position : state.manualPosition

  // ローカルLLM用: ポジション・ゲーム時間を設定
  if (state.claudeClient) {
    state.claudeClient.setPosition(resolvedPosition)
    state.claudeClient.setGameTime(gameData.gameData?.gameTime || 0)
  }

  // コアビルド取得
  handleCoreBuild(me, resolvedPosition)

  // マッチアップアイテム
  handleMatchupItems(me, resolvedPosition, enemies)

  // マッチアップTip
  handleMatchupTip(me, resolvedPosition, enemies)

  // イベント取得（オブジェクト状況 + マクロコンテキスト両方で使う）
  let events = gameData.events?.Events || []
  const gt = gameData.gameData?.gameTime || 0

  // allgamedata にイベントが無い場合、eventdata エンドポイントをフォールバック
  if (events.length === 0 && gt > 10) {
    const eventData = await state.poller.fetchEventData()
    if (eventData) {
      events = eventData.Events || (Array.isArray(eventData) ? eventData : [])
      if (events.length > 0) {
        console.log(`[Events] Fallback eventdata endpoint returned ${events.length} events`)
      }
    }
  }

  // イベントキャッシュ更新 & gameData に注入（buildMacroContext で使えるように）
  if (events.length > 0) {
    // 新規イベントをログ出力
    const prevCount = state.cachedEvents?.length || 0
    const newEvents = events.slice(prevCount)
    for (const e of newEvents) {
      const t = Math.floor(e.EventTime)
      switch (e.EventName) {
        case 'DragonKill':
          console.log(`[Event] DragonKill t=${t}s killer=${e.KillerName} stolen=${e.Stolen || false}`)
          break
        case 'BaronKill':
          console.log(`[Event] BaronKill t=${t}s killer=${e.KillerName} stolen=${e.Stolen || false}`)
          break
        case 'HeraldKill':
          console.log(`[Event] HeraldKill t=${t}s killer=${e.KillerName} stolen=${e.Stolen || false}`)
          break
        case 'HordeKill':
          console.log(`[Event] VoidgrubKill t=${t}s killer=${e.KillerName}`)
          break
        case 'ChampionKill':
          console.log(`[Event] Kill t=${t}s killer=${e.KillerName} victim=${e.VictimName} assists=[${(e.Assisters || []).join(',')}]`)
          break
        case 'TurretKilled':
          console.log(`[Event] TurretKill t=${t}s turret=${e.TurretKilled} killer=${e.KillerName}`)
          break
        case 'InhibKilled':
          console.log(`[Event] InhibKill t=${t}s inhib=${e.InhibKilled} killer=${e.KillerName}`)
          break
        case 'InhibRespawningSoon':
          console.log(`[Event] InhibRespawningSoon t=${t}s inhib=${e.InhibRespawningSoon}`)
          break
        case 'InhibRespawned':
          console.log(`[Event] InhibRespawned t=${t}s inhib=${e.InhibRespawned}`)
          break
        case 'Ace':
          console.log(`[Event] Ace t=${t}s acer=${e.Acer} team=${e.AcingTeam}`)
          break
        case 'Multikill':
          console.log(`[Event] Multikill t=${t}s killer=${e.KillerName} count=${e.KillStreak}`)
          break
        case 'FirstBlood':
          console.log(`[Event] FirstBlood t=${t}s killer=${e.Recipient}`)
          break
        case 'GameEnd':
          console.log(`[Event] GameEnd t=${t}s result=${e.Result}`)
          break
      }
    }
    state.cachedEvents = events
    if (!gameData.events) gameData.events = {}
    gameData.events.Events = events
  }

  // AI提案
  handleAiSuggestion(gameData)

  // マクロアドバイス
  handleMacroAdvice(gameData, me, allies, enemies)

  // ルールベースアラート (LLM不要)
  if (state.ruleEngine) {
    const ruleAlerts = state.ruleEngine.evaluate(gameData, resolvedPosition)
    if (ruleAlerts.length > 0) {
      broadcast('rule:alerts', ruleAlerts)
    }
  }

  // スナップショット送信
  const snapshot = {
    gameData: gameData.gameData,
    activePlayer: gameData.activePlayer,
    players: { me, allies, enemies },
    allPlayers: isSpectator ? allPlayers : undefined,
    isSpectator,
    myTeamSide: me.team,
    ddragon: state.ddragonBase,
    ended: false
  }
  state.lastGameSnapshot = snapshot

  const objSummary = getObjectivesSummary(events, gt)
  // デバッグ: 60秒ごとにオブジェクト状況をログ（前回と同じ内容ならスキップ）
  const objLogKey = `${Math.floor(gt / 60)}_${objSummary.dragon}_${objSummary.baron}`
  if (objLogKey !== state._lastObjLogKey) {
    state._lastObjLogKey = objLogKey
    console.log(`[Objectives] t=${Math.floor(gt)}s dragon=${objSummary.dragon} baron=${objSummary.baron}`)
  }
  broadcast('objectives:status', objSummary)

  // プレイヤースタッツ定期ログ（60秒ごと）
  const statsMinute = Math.floor(gt / 60)
  if (statsMinute > 0 && statsMinute !== state._lastStatsMinute) {
    state._lastStatsMinute = statsMinute
    const s = me.scores || {}
    const cs = me.scores?.creepScore ?? 0
    const items = (me.items || []).map(i => i.displayName || i.itemID).join(', ')
    const lvl = me.level || '?'
    console.log(`[Stats] t=${Math.floor(gt)}s ${me.championName} Lv${lvl} KDA=${s.kills || 0}/${s.deaths || 0}/${s.assists || 0} CS=${cs}`)
    if (items) console.log(`[Stats] Items: ${items}`)
    // 全プレイヤーのKDAサマリー
    const allKda = [me, ...allies].map(p => `${p.championName}(${p.scores?.kills||0}/${p.scores?.deaths||0}/${p.scores?.assists||0})`).join(' ')
    const enemyKda = enemies.map(p => `${p.championName}(${p.scores?.kills||0}/${p.scores?.deaths||0}/${p.scores?.assists||0})`).join(' ')
    console.log(`[Stats] Ally: ${allKda}`)
    console.log(`[Stats] Enemy: ${enemyKda}`)
  }

  // ゲーム内で GameEnd イベント検知 → 即座にコーチング発火
  const hasGameEnd = events.some(e => e.EventName === 'GameEnd')
  if (hasGameEnd) {
    if (!state.gameEndTriggered) {
      console.log('[GameEnd] GameEnd event detected in live data, triggering end...')
      state.gameEndTriggered = true
      state.lastGameSnapshot = snapshot
      triggerGameEnd()
    }
    return
  }

  if (state.lastGameStatus !== 'ingame') broadcast('game:status', 'ingame')
  broadcast('game:data', snapshot)
}

function resolvePosition(me) {
  let resolvedPosition = (me.position && me.position !== 'NONE') ? me.position : state.manualPosition

  if (!resolvedPosition && me.enName && !state.coreBuildLoaded) {
    const champInfo = getChampionById(me.championId || 0)
    if (champInfo?.tags) {
      if (champInfo.tags.includes('Support')) resolvedPosition = 'UTILITY'
      else if (champInfo.tags.includes('Marksman')) resolvedPosition = 'BOTTOM'
    }
    if (resolvedPosition) {
      console.log(`[Position] Auto-guessed from tags: ${resolvedPosition}`)
    }
  }

  if (resolvedPosition && me.position !== resolvedPosition) {
    me.position = resolvedPosition
  }
  if (!resolvedPosition && !state.coreBuildLoaded && !state.positionSelectSent) {
    state.positionSelectSent = true
    broadcast('position:select', me.enName)
  }
}

function handleCoreBuild(me, resolvedPosition) {
  if (!state.coreBuildLoaded && me.enName && resolvedPosition) {
    state.coreBuildLoaded = true
    console.log(`[CoreBuild] Loading for ${me.enName} ${resolvedPosition}...`)
    loadCoreBuild(me.enName, resolvedPosition).catch(err => {
      console.error(`[CoreBuild] Failed: ${err.message}`)
      state.coreBuildLoaded = false
    })
  } else if (state.coreBuildLoaded && state.currentCoreBuild && !state.coreBuildSentForGame) {
    state.coreBuildSentForGame = true
    const coreSuggestion = {
      build_goal: state.currentCoreBuild.ids,
      build_goal_names: state.currentCoreBuild.names,
      build_goal_images: state.currentCoreBuild.images,
      changes: [], priority: '',
      reasoning: 'OP.GG統計データに基づくコアビルド',
      isCoreBuild: true
    }
    broadcast('core:build', coreSuggestion)
    console.log(`[CoreBuild] Re-sent from champ select: ${state.currentCoreBuild.names.join(', ')}`)
  }
}

function findLaneOpponent(enemies, position, logTag) {
  let opponent = enemies.find(e => e.position === position)
  if (!opponent?.enName) {
    opponent = enemies.find(e => e.enName)
    if (opponent) {
      console.log(`[${logTag}] No exact lane match for ${position}, using ${opponent.enName} as fallback`)
    }
  }
  return opponent?.enName ? opponent : null
}

function handleMatchupItems(me, resolvedPosition, enemies) {
  if (state.matchupItemsLoaded || !me.enName || !resolvedPosition || !state.claudeClient || !state.currentCoreBuild) return

  const laneOpponent = findLaneOpponent(enemies, resolvedPosition, 'MatchupItems')
  if (!laneOpponent) return

  state.matchupItemsLoaded = true
  fetchMatchupItems(me.enName, laneOpponent.enName, resolvedPosition).then(items => {
    if (items && items.length > 0) {
      const coreIds = new Set((state.currentCoreBuild?.ids || []).map(String))
      const completed = items.reduce((acc, it) => {
        if (acc.length >= 15 || coreIds.has(String(it.id))) return acc
        const patchItem = getItemById(it.id)
        if (!patchItem) { acc.push(it); return acc }
        if (isCompletedItem(patchItem)) {
          acc.push({ ...it, desc: patchItem.fullDesc || patchItem.description || '' })
        }
        return acc
      }, [])
      const withCounters = injectCounterItems(completed, enemies)
      state.claudeClient.setSubstituteItems(withCounters)
      const candidatesForUI = withCounters.map(it => ({
        id: it.id, name: it.jaName, image: getItemById(it.id)?.image || null
      }))
      broadcast('substitute:items', candidatesForUI)
      console.log(`[MatchupItems] ${me.enName} vs ${laneOpponent.enName}: ${withCounters.length} items`)
    } else {
      console.warn('[MatchupItems] No data returned, using fallback')
      useFallbackSubstituteItems(enemies)
    }
  }).catch(err => {
    console.error('[MatchupItems] Error:', err.message)
    useFallbackSubstituteItems(enemies)
  })
}

function handleMatchupTip(me, resolvedPosition, enemies) {
  if (state.matchupTipLoaded || !me.enName || !resolvedPosition || !state.claudeClient || !state.aiEnabled || !state.currentCoreBuild) {
    if (!state.matchupTipLoaded && me.enName && resolvedPosition) {
      console.log(`[MatchupTip] Waiting... claude=${!!state.claudeClient} ai=${state.aiEnabled} coreBuild=${!!state.currentCoreBuild}`)
    }
    return
  }

  const laneOpponent = findLaneOpponent(enemies, resolvedPosition, 'MatchupTip')
  if (!laneOpponent) return

  state.matchupTipLoaded = true
  console.log(`[MatchupTip] Requesting: ${me.enName} vs ${laneOpponent.enName} (${resolvedPosition})`)
  const tipContext = `自分: ${me.championName} (${resolvedPosition})\n対面: ${laneOpponent.championName} (${laneOpponent.enName})`
  state.claudeClient.getMatchupTip(tipContext).then(tip => {
    if (tip) {
      tip.opponent = laneOpponent.championName
      broadcast('matchup:tip', tip)
      console.log(`[MatchupTip] ${me.enName} vs ${laneOpponent.enName}: ${tip.summary}`)
    } else {
      console.warn('[MatchupTip] API returned null, will retry')
      state.matchupTipLoaded = false
    }
  }).catch(err => {
    console.error('[MatchupTip] Error:', err.message, '- will retry')
    state.matchupTipLoaded = false
  })
}

function handleAiSuggestion(gameData) {
  const triggered = state.diffDetector.check(gameData)

  // 完成アイテム3個以上になるまでAI提案しない
  const me = gameData.allPlayers?.find(p => p.summonerName === gameData.activePlayer?.summonerName)
  const completedItems = (me?.items || []).filter(i => {
    const patchItem = getItemById(String(i.itemID))
    if (!patchItem) return false
    return isCompletedItem(patchItem)
  }).length
  if (completedItems < 3) return

  if ((triggered || !state.lastSuggestion) && !state.aiPending && state.claudeClient && state.aiEnabled && state.currentCoreBuild) {
    const context = state.contextBuilder.build(gameData)
    state.aiPending = true
    broadcast('ai:loading', true)
    state.claudeClient.getSuggestion(context).then(s => {
      if (s) {
        if (s.recommended) {
          s.recommended = s.recommended.map(r => {
            const item = getItemById(String(r.id))
            return { ...r, name: item?.jaName || r.id, image: item?.image || '' }
          })
        }
        s.gameTime = gameData.gameData?.gameTime || 0
        state.lastSuggestion = s
        const recNames = (s.recommended || []).map(r => r.name || r.id).join(', ')
        console.log(`[AiSuggestion] t=${Math.floor(s.gameTime)}s recommended=[${recNames}] reason=${(s.reasoning || '').substring(0, 80)}`)
        broadcast('ai:suggestion', s)
      }
      state.aiPending = false
      broadcast('ai:loading', false)
    }).catch(err => {
      state.aiPending = false
      broadcast('ai:loading', false)
      broadcast('ai:suggestion', { error: err.message })
    })
  }
}

function handleMacroAdvice(gameData, me, allies, enemies) {
  const now = Date.now()
  const events = gameData.events?.Events || []
  // オブジェクトキルイベント数(APIが返さない場合は0のまま → 時間ベーストリガーのみ)
  const objEvents = classifyObjectiveEvents(events)
  const objectiveCount = objEvents.dragon.length + objEvents.baron.length + objEvents.herald.length + objEvents.voidgrub.length
  const objectiveTaken = objectiveCount > state.lastObjectiveCount
  if (objectiveTaken) state.lastObjectiveCount = objectiveCount

  const timeSinceLastMacro = now - state.lastMacroTime

  // オブジェクトスポーン90秒前トリガー
  const gt = gameData.gameData?.gameTime || 0
  const timers = getObjectiveTimers(events, gt)
  const OBJ_PRE_TRIGGER_SEC = 90
  const OBJ_PRE_TRIGGER_MIN_SEC = 30 // 30秒以内なら「もう近すぎ」ではなく準備として有効
  let objectivePreTrigger = false
  const approachingObjs = []
  for (const [name, remaining] of Object.entries(timers)) {
    if (remaining > OBJ_PRE_TRIGGER_MIN_SEC && remaining <= OBJ_PRE_TRIGGER_SEC) {
      approachingObjs.push(`${name}:${remaining}s`)
    }
  }
  if (approachingObjs.length > 0) {
    const triggerKey = approachingObjs.join(',')
    if (triggerKey !== state._lastObjTriggerKey && timeSinceLastMacro >= MACRO_DEBOUNCE_MS) {
      objectivePreTrigger = true
      state._lastObjTriggerKey = triggerKey
    }
  }

  const shouldMacro = timeSinceLastMacro >= MACRO_INTERVAL_MS ||
    (objectiveTaken && timeSinceLastMacro >= MACRO_DEBOUNCE_MS) ||
    objectivePreTrigger

  if (state.claudeClient && state.aiEnabled && !state.macroPending && shouldMacro) {
    state.lastMacroTime = now
    if (objectivePreTrigger) {
      macroLog(`Triggering macro advice (objective approaching: ${approachingObjs.join(', ')})`)
    } else {
      macroLog(`Triggering macro advice`)
    }
    requestMacroAdvice(gameData, me, allies, enemies)
  }
}

function stopPolling() {
  if (state.pollingInterval) {
    clearInterval(state.pollingInterval)
    state.pollingInterval = null
  }
}

// ── アプリ起動 ────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (state.mainWindow) {
      if (state.mainWindow.isMinimized()) state.mainWindow.restore()
      state.mainWindow.show()
      state.mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    createWindow()
    setupIPC()

    // ライセンスマネージャー初期化
    // TODO: Gumroad プロダクトID を設定する (商品作成後に変更)
    state.licenseManager = new LicenseManager(app.getPath('userData'), 'GUMROAD_PRODUCT_ID')

    // プロバイダー復元 (Ollama or Anthropic)
    const savedProvider = loadSettings().provider
    if (savedProvider?.type === 'ollama') {
      const provider = new OllamaProvider({ baseUrl: savedProvider.baseUrl, model: savedProvider.model })
      state.claudeClient = new ClaudeApiClient(provider)
      console.log(`[Provider] Restored Ollama (model: ${savedProvider.model || 'auto'})`)
    } else {
      const keyPath = path.join(app.getPath('userData'), '.api-key')
      try {
        const key = fs.readFileSync(keyPath, 'utf-8')
        if (key) state.claudeClient = new ClaudeApiClient(key)
      } catch {}
    }

    setCacheDir(path.join(app.getPath('userData'), 'patch-cache'))
    initPatchData().then(info => {
      if (info) {
        state.ddragonBase = `${DDRAGON_BASE}/${info.version}`
        console.log(`[PatchData] v${info.version} loaded`)
      }
    })

    startPolling()
  })
}

app.on('window-all-closed', () => {
  stopPolling()
  app.quit()
})
