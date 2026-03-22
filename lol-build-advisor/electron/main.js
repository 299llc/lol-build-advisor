const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { LiveClientPoller } = require('./api/liveClient')
const { AiClient } = require('./api/aiClient')
const { OllamaProvider } = require('./api/providers/ollamaProvider')
const { BedrockProvider } = require('./api/providers/bedrockProvider')
const { AnthropicProvider } = require('./api/providers/anthropicProvider')
const { GeminiProvider } = require('./api/providers/geminiProvider')
const { OllamaSetup } = require('./api/ollamaSetup')
const { ContextBuilder, extractEnName } = require('./api/contextBuilder')
const { DiffDetector } = require('./api/diffDetector')
const { setCacheDir, initPatchData, getVersion, getChampionById, getItemById, getSpells, loadSpellsForMatch, refreshCache, formatItemSummary } = require('./api/patchData')
const { fetchChampionBuild, buildCoreBuildIds, fetchMatchupItems } = require('./api/opggClient')
const { LcuClient } = require('./api/lcuClient')
const { detectFlags } = require('./core/championAnalysis')
const { RuleEngine } = require('./core/ruleEngine')
const { buildMacroStaticContext, buildMacroDynamicContext, getObjectivesSummary, getObjectiveTimers, getAvailableObjectiveNames } = require('./core/objectiveTracker')
const { buildMatchChampionKnowledge } = require('./core/knowledgeDb')
const { MACRO_INTERVAL_MS, MACRO_DEBOUNCE_MS, MACRO_FALLBACK_MS, RECALL_GOLD_THRESHOLDS, COUNTER_ITEMS, ITEM_COMPLETE_GOLD, ITEM_BOOT_GOLD, DEFAULT_WINDOW, DDRAGON_BASE, POLL_INTERVAL_MS, isCompletedItem, classifyObjectiveEvents } = require('./core/config')
const { SessionRecorder } = require('./core/sessionRecorder')
const { GameLogger } = require('./core/gameLogger')
const { Preprocessor } = require('./core/preprocessor')
const { Postprocessor } = require('./core/postprocessor')

// ── Ollama サービス停止（ローカル以外に切替時） ──
const _stopOllamaIfRunning = async () => {
  try {
    const setup = new OllamaSetup(app.getPath('userData'))
    const status = await setup.checkStatus()
    if (status.running) {
      require('child_process').exec('taskkill /IM ollama.exe /F', { timeout: 5000 }, () => {})
      console.log('[OllamaSetup] Stopped Ollama service (switched to non-local provider)')
    }
  } catch {}
}

// ── .env 読み込み ────────────────────────────────
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '..', '.env')
    const content = fs.readFileSync(envPath, 'utf-8')
    const env = {}
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
    return env
  } catch {
    return {}
  }
}

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
  aiClient: null,
  lcuClient: null,
  aiEnabled: false,
  aiPending: false,
  claudeModel: null,         // .env CLAUDE_MODEL (macro/suggestion用)
  claudeQualityModel: null,  // .env CLAUDE_QUALITY_MODEL (matchup/coaching用)

  // 試合状態
  lastSuggestion: null,
  lastGameSnapshot: null,
  spellsLoadedForGame: false,
  championKnowledgeGenerated: false,
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
  lastTurretCount: 0,
  _lastMacroFingerprint: null,
  _prevMacroState: {},
  _lastSuggFingerprint: null,

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
  _nonClassicLogged: false,   // ARAM等の非CLASSICモードログ重複防止

  // チャンプセレクト
  champSelectChampId: null,

  // ポジション
  manualPosition: null,
  positionSelectSent: false,

  // ルールエンジン
  ruleEngine: null,

  // 観戦
  spectatorSelectedName: null,

  // Data Dragon
  ddragonBase: `${DDRAGON_BASE}/16.5.1`,

  // セッションレコーダー
  recorder: null,

  // 3層パイプライン
  preprocessor: new Preprocessor(),
  postprocessor: new Postprocessor(),
  currentGameState: null,
  matchSession: null,
  currentMatchAiAllowed: true,
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

const runtimeSessionPath = () => path.join(app.getPath('userData'), 'runtime-session.json')
const FREE_MATCHES_PER_DAY = 3

function todayKey() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function loadQuotaState() {
  const settings = loadSettings()
  const quota = settings.freeQuota || {}
  const today = todayKey()
  if (quota.date !== today) {
    return { date: today, usedMatches: 0, limit: FREE_MATCHES_PER_DAY }
  }
  return {
    date: today,
    usedMatches: quota.usedMatches || 0,
    limit: quota.limit || FREE_MATCHES_PER_DAY,
  }
}

function saveQuotaState(quota) {
  saveSetting('freeQuota', quota)
}

function getRemainingFreeMatches() {
  const quota = loadQuotaState()
  return Math.max(0, quota.limit - quota.usedMatches)
}

function incrementFreeMatchCount() {
  const quota = loadQuotaState()
  quota.usedMatches += 1
  saveQuotaState(quota)
  console.log(`[Quota] Counted finished match: ${quota.usedMatches}/${quota.limit}`)
}

function saveRuntimeSession() {
  try {
    if (!state.matchSession) return
    fs.writeFileSync(runtimeSessionPath(), JSON.stringify(state.matchSession), 'utf-8')
    console.log(
      `[Session] Saved runtime session ` +
      `match=${state.matchSession.matchKey} ` +
      `build=${state.matchSession.buildInteractionId ? 'set' : 'none'} ` +
      `macro=${state.matchSession.macroInteractionId ? 'set' : 'none'} ` +
      `history=${(state.matchSession.macroAdviceHistory || []).length} ` +
      `ended=${!!state.matchSession.ended}`
    )
  } catch (err) {
    console.warn(`[Session] Failed to save runtime session: ${err.message}`)
  }
}

function clearRuntimeSession() {
  state.matchSession = null
  try {
    if (fs.existsSync(runtimeSessionPath())) fs.unlinkSync(runtimeSessionPath())
    console.log('[Session] Cleared runtime session file')
  } catch {}
}

function loadRuntimeSession() {
  try {
    if (!fs.existsSync(runtimeSessionPath())) return null
    const loaded = JSON.parse(fs.readFileSync(runtimeSessionPath(), 'utf-8'))
    console.log(
      `[Session] Loaded runtime session ` +
      `match=${loaded?.matchKey || '-'} ` +
      `build=${loaded?.buildInteractionId ? 'set' : 'none'} ` +
      `macro=${loaded?.macroInteractionId ? 'set' : 'none'} ` +
      `ended=${!!loaded?.ended}`
    )
    return loaded
  } catch {
    return null
  }
}

function buildMatchSessionKey(me) {
  const player = me?.summonerName || me?.riotIdGameName || 'unknown'
  const champion = me?.championName || 'unknown'
  return `${player}:${champion}`
}

function ensureMatchSession(me, gameTime) {
  const matchKey = buildMatchSessionKey(me)
  if (state.matchSession?.matchKey === matchKey) {
    state.matchSession.lastGameTime = gameTime
    console.log(`[Session] Reusing in-memory session for ${matchKey} at t=${gameTime}s`)
    saveRuntimeSession()
    return { status: 'existing' }
  }

  const saved = loadRuntimeSession()
  if (saved && saved.matchKey === matchKey && !saved.ended) {
    state.matchSession = saved
    console.log(`[Session] Restored runtime session for ${matchKey}`)
    if (state.matchSession.lastGameTime == null) state.matchSession.lastGameTime = gameTime
    saveRuntimeSession()
    return { status: 'restored' }
  } else {
    state.matchSession = {
      matchKey,
      startedAt: new Date().toISOString(),
      player: me?.summonerName || me?.riotIdGameName || '',
      champion: me?.championName || '',
      buildInteractionId: null,
      macroInteractionId: null,
      macroAdviceHistory: [],
      lastGameTime: gameTime,
      ended: false,
    }
    console.log(`[Session] Started runtime session for ${matchKey}`)
  }

  if (state.aiClient) {
    state.aiClient.setInteractionSession('build', {
      id: state.matchSession.buildInteractionId || null,
      bootstrapped: !!state.matchSession.buildInteractionId,
    })
    state.aiClient.setInteractionSession('macro', {
      id: state.matchSession.macroInteractionId || null,
      bootstrapped: !!state.matchSession.macroInteractionId,
    })
  }

  saveRuntimeSession()
  return { status: 'new' }
}

function syncInteractionSessionsFromClient() {
  if (!state.aiClient || !state.matchSession) return
  const buildSession = state.aiClient.getInteractionSession('build')
  const macroSession = state.aiClient.getInteractionSession('macro')
  const prevBuild = state.matchSession.buildInteractionId
  const prevMacro = state.matchSession.macroInteractionId
  state.matchSession.buildInteractionId = buildSession?.id || null
  state.matchSession.macroInteractionId = macroSession?.id || null
  if (prevBuild !== state.matchSession.buildInteractionId || prevMacro !== state.matchSession.macroInteractionId) {
    console.log(
      `[Session] Synced interaction ids ` +
      `build=${prevBuild ? 'set' : 'none'}->${state.matchSession.buildInteractionId ? 'set' : 'none'} ` +
      `macro=${prevMacro ? 'set' : 'none'}->${state.matchSession.macroInteractionId ? 'set' : 'none'}`
    )
  }
  saveRuntimeSession()
}

function appendMacroAdviceHistory(entry) {
  if (!state.matchSession) return
  const history = state.matchSession.macroAdviceHistory || []
  history.push(entry)
  state.matchSession.macroAdviceHistory = history.slice(-10)
  console.log(
    `[Session] Appended macro history ` +
    `count=${state.matchSession.macroAdviceHistory.length} ` +
    `action=${entry?.action || '-'} trigger=${entry?.trigger || '-'} time=${entry?.gameTime ?? '-'}`
  )
  saveRuntimeSession()
}

function buildMacroBroadcastPayload(advice, gameTime, trigger, source = 'ai') {
  return {
    ...advice,
    gameTime,
    _meta: {
      source,
      trigger: trigger || null,
      updatedAt: advice?.updatedAt || Date.now(),
    },
  }
}

function buildMacroFallbackPayload(alert, gameTime, trigger) {
  return buildMacroBroadcastPayload({
    title: alert.title,
    desc: alert.desc,
    warning: alert.warning || '',
    _fallback: true,
  }, gameTime, trigger, 'rule')
}

function summarizeMacroAdviceHistory() {
  const history = state.matchSession?.macroAdviceHistory || []
  return history.map(item => ({
    game_time: item.gameTime,
    action: item.action || '',
    title: item.title || '',
    desc: item.desc || '',
    trigger: item.trigger || '',
  }))
}

function isNormalEndFromEvents(events) {
  const safeEvents = events || []
  const hasGameEnd = safeEvents.some(event => event?.EventName === 'GameEnd')
  const turretKillCount = safeEvents.filter(event => event?.EventName === 'TurretKilled').length
  const hit = hasGameEnd && turretKillCount >= 3
  console.log(
    `[GameEnd] normal_end=${hit} ` +
    `game_end=${hasGameEnd} turret_kills=${turretKillCount} from_events=${safeEvents.length}`
  )
  return hit
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
  state.mainWindow = new BrowserWindow({
    width: saved.width || DEFAULT_WINDOW.width,
    height: saved.height || DEFAULT_WINDOW.height,
    x: saved.x,
    y: saved.y,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
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
    focusable: false,
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

  // 読み込み完了後に既存データを再送 + クリックスルー有効化
  state.compactWindow.webContents.on('did-finish-load', () => {
    sendStateToCompactWindow()
    state.compactWindow?.setIgnoreMouseEvents(true, { forward: true })
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
  else if (channel === 'champselect:extras') state.lastChampSelectExtras = data

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
  if (state.lastChampSelectExtras) cw.webContents.send('champselect:extras', state.lastChampSelectExtras)
}

// ── デバッグログ ──────────────────────────────────
function macroLog(msg) {
  const provider = state.aiClient?.getProviderType?.() || '?'
  const model = state.aiClient?.provider?.defaultModel || '?'
  console.log(`[Macro:${provider}:${model}] ${msg}`)
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
  ipcMain.on('compact:set-passthrough', (_, enabled) => {
    state.compactWindow?.setIgnoreMouseEvents(enabled, { forward: true })
  })

  const keyPath = path.join(app.getPath('userData'), '.api-key')

  const _modelOpts = (providerType) => {
    if (providerType === 'gemini') {
      return {
        ...(state.geminiModel && { model: state.geminiModel }),
        ...(state.geminiQualityModel && { qualityModel: state.geminiQualityModel }),
      }
    }
    return {
      ...(state.claudeModel && { model: state.claudeModel }),
      ...(state.claudeQualityModel && { qualityModel: state.claudeQualityModel }),
    }
  }

  ipcMain.handle('apikey:get', () => {
    try { return fs.readFileSync(keyPath, 'utf-8') } catch { return '' }
  })
  ipcMain.handle('apikey:set', (_, key) => {
    fs.writeFileSync(keyPath, key, 'utf-8')
    state.aiClient = new AiClient(key, _modelOpts())
    return true
  })
  ipcMain.handle('apikey:validate', async (_, key) => {
    const client = new AiClient(key)
    return client.validate()
  })

  // ── ローカル LLM (Ollama) プロバイダー ──
  ipcMain.handle('provider:set-ollama', async (_, opts) => {
    // opts: { baseUrl?, model? }
    const provider = new OllamaProvider(opts || {})
    const ok = await provider.validate()
    if (!ok) return { success: false, error: 'Ollama に接続できません。ollama が起動しているか確認してください。' }
    state.aiClient = new AiClient(provider, _modelOpts())
    saveSetting('provider', { type: 'ollama', baseUrl: provider.baseUrl, model: provider.defaultModel })
    return { success: true, model: provider.defaultModel || 'auto' }
  })

  ipcMain.handle('provider:set-anthropic', async () => {
    const env = loadEnv()
    const key = env.ANTHROPIC_API_KEY
    if (!key) {
      return { success: false, error: 'ANTHROPIC_API_KEY が .env に見つかりません' }
    }
    const provider = new AnthropicProvider(key)
    const ok = await provider.validate()
    if (!ok) return { success: false, error: 'Anthropic API 接続に失敗しました' }
    state.aiClient = new AiClient(provider, _modelOpts())
    saveSetting('provider', { type: 'anthropic' })
    _stopOllamaIfRunning()
    return { success: true }
  })

  ipcMain.handle('provider:set-gemini', async () => {
    const env = loadEnv()
    const key = env.GEMINI_API_KEY
    if (!key) {
      return { success: false, error: 'GEMINI_API_KEY が .env に見つかりません' }
    }
    const provider = new GeminiProvider(key)
    const ok = await provider.validate()
    if (!ok) return { success: false, error: 'Gemini API 接続に失敗しました' }
    state.aiClient = new AiClient(provider, _modelOpts('gemini'))
    saveSetting('provider', { type: 'gemini' })
    _stopOllamaIfRunning()
    return { success: true }
  })

  ipcMain.handle('provider:set-bedrock', async () => {
    const env = loadEnv()
    const region = env.AWS_REGION || 'us-east-1'
    const apiKey = env.BEDROCK_API_KEY
    const accessKeyId = env.AWS_ACCESS_KEY_ID
    const secretAccessKey = env.AWS_SECRET_ACCESS_KEY
    if (!apiKey && (!accessKeyId || !secretAccessKey)) {
      return { success: false, error: 'AWS認証情報が .env に見つかりません' }
    }
    const provider = new BedrockProvider({ apiKey, region, accessKeyId, secretAccessKey })
    const ok = await provider.validate()
    if (!ok) return { success: false, error: 'Bedrock 接続に失敗しました' }
    state.aiClient = new AiClient(provider, _modelOpts())
    saveSetting('provider', { type: 'bedrock', region })
    _stopOllamaIfRunning()
    return { success: true }
  })

  ipcMain.handle('provider:get', () => {
    const settings = loadSettings()
    return settings.provider || { type: 'ollama' }
  })

  ipcMain.handle('ollama:models', async (_, baseUrl) => {
    const provider = new OllamaProvider({ baseUrl })
    return provider.listModels()
  })

  ipcMain.handle('ollama:validate', async (_, opts) => {
    const provider = new OllamaProvider(opts || {})
    return provider.validate()
  })

  // ── Ollama 自動セットアップ ──
  ipcMain.handle('ollama:check-status', async () => {
    const setup = new OllamaSetup(app.getPath('userData'))
    return setup.checkStatus()
  })

  ipcMain.handle('ollama:full-setup', async (_, model) => {
    const setup = new OllamaSetup(app.getPath('userData'), (progress) => {
      broadcast('ollama:setup-progress', progress)
    })
    return setup.fullSetup(model || undefined)
  })

  ipcMain.handle('ollama:pull-model', async (_, model) => {
    const setup = new OllamaSetup(app.getPath('userData'), (progress) => {
      broadcast('ollama:setup-progress', progress)
    })
    return setup.pullModel(model || undefined)
  })

  ipcMain.handle('ollama:delete-model', async (_, model) => {
    try {
      const res = await fetch('http://localhost:11434/api/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model }),
      })
      return { success: res.ok }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // ランク設定（手動）
  ipcMain.handle('player:set-rank', async (_, rank) => {
    if (state.aiClient) state.aiClient.setRank(rank)
    // 永続化
    const fs = require('fs')
    const path = require('path')
    const rankFile = path.join(app.getPath('userData'), '.player-rank')
    fs.writeFileSync(rankFile, rank, 'utf-8')
    console.log(`[Rank] Manual rank set: ${rank}`)
    return { success: true }
  })
  ipcMain.handle('player:get-rank', async () => {
    const fs = require('fs')
    const path = require('path')
    const rankFile = path.join(app.getPath('userData'), '.player-rank')
    try {
      return fs.readFileSync(rankFile, 'utf-8').trim()
    } catch {
      return null
    }
  })

  ipcMain.handle('ollama:start-service', async () => {
    const setup = new OllamaSetup(app.getPath('userData'))
    const running = await setup._isRunning()
    if (running) return { success: true, already: true }
    await setup._startService()
    const ready = await setup._waitForReady(15000)
    return { success: ready }
  })

  ipcMain.handle('polling:start', () => startPolling())
  ipcMain.handle('polling:stop', () => stopPolling())
  ipcMain.handle('ai:toggle', (_, enabled) => { state.aiEnabled = enabled; saveSetting('aiEnabled', enabled); return state.aiEnabled })
  ipcMain.handle('ai:status', () => state.aiEnabled)

  ipcMain.handle('ai:logs', () => state.aiClient?.getLogs() || [])
  ipcMain.handle('ai:clearLogs', () => { state.aiClient?.clearLogs(); return true })
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

  // 外部リンクをブラウザで開く
  ipcMain.handle('shell:openExternal', (_, url) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      const { shell } = require('electron')
      shell.openExternal(url)
    }
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
  state._lastMacroFingerprint = null
  state._prevMacroState = {}
  state._lastObjTriggerKey = null
  state._lastSuggFingerprint = null
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
  if (state.aiClient) state.aiClient.clearMatch()
  // ルールエンジンリセット
  if (state.ruleEngine) state.ruleEngine.reset()
  // パイプラインリセット
  state.preprocessor.reset()
  state.postprocessor.reset()
  state.currentGameState = null
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
async function requestMacroAdvice(gameData, me, allies, enemies, eventTrigger = null) {
  if (state.macroPending || !state.aiClient || !state.aiEnabled) return

  state.macroPending = true
  broadcast('macro:loading', true)

  try {
    const gameState = state.currentGameState
    const events = gameData.events?.Events || []
    const gameTime = gameData.gameData?.gameTime || 0

    // 前処理: 構造化入力を生成
    const structuredInput = state.preprocessor.buildMacroInput(gameState, events)

    // 状況未変化ならスキップ（コスト削減）
    // objectivesのタイマー秒数やgold_diffの微差でfingerprintが変わらないよう正規化
    const deadEnemies = (structuredInput.enemies || []).filter(e => e.isDead).map(e => e.champion).join(',')
    const obj = structuredInput.objectives || {}
    const objKey = `d${obj.dragon?.allyCount || 0}v${obj.dragon?.enemyCount || 0}_${obj.dragon?.available ? 'A' : ''}${obj.dragon?.soulPoint ? 'S' : ''}|b${obj.baron?.available ? 'A' : ''}`
    const goldDiffRounded = Math.round((structuredInput.gold_diff || 0) / 1000) // 1000G単位で丸め
    const macroFingerprint = `${structuredInput.game_phase}|${structuredInput.situation}|${structuredInput.kill_diff}|${goldDiffRounded}|${structuredInput.action_candidates.map(c => c.action).join(',')}|${objKey}|${JSON.stringify(structuredInput.towers)}|${deadEnemies}`
    if (macroFingerprint === state._lastMacroFingerprint) {
      macroLog(`Skipped: situation unchanged`)
      state.macroPending = false
      broadcast('macro:loading', false)
      return
    }
    state._lastMacroFingerprint = macroFingerprint

    console.log(`[Pipeline] Macro input: phase=${structuredInput.game_phase} situation=${structuredInput.situation} actions=${structuredInput.action_candidates.map(c => c.action).join(',')}`)

    // staticContextはcache_control用に引き続き使う
    const staticCtx = buildMacroStaticContext(me, allies, enemies)

    // 推論
    let rawResult = await state.aiClient.getMacroAdvice(staticCtx, structuredInput)
    syncInteractionSessionsFromClient()
    macroLog(`[Pipeline] Raw: ${JSON.stringify(rawResult).substring(0, 300)}`)

    // 後処理
    const actionCandidates = structuredInput.action_candidates.map(c => c.action)
    const previousResult = state.postprocessor.lastMacroResult
    const advice = state.postprocessor.processMacroResult(rawResult, actionCandidates, previousResult)

    if (advice) {
      // 次回フィードバック用に保存
      state.preprocessor.setMacroAdvice(advice)
      appendMacroAdviceHistory({
        gameTime,
        action: advice.action || '',
        title: advice.title || '',
        desc: advice.desc || '',
        trigger: eventTrigger,
      })

      macroLog(`[Pipeline] Processed: ${JSON.stringify(advice).substring(0, 300)}`)
      const payload = buildMacroBroadcastPayload(advice, gameTime, eventTrigger, 'ai')
      broadcast('macro:advice', payload)
      macroLog(`Sent: ${payload.title}`)
    } else {
      // フォールバック: ruleEngineのアラートを使用
      const position = state.aiClient?.position || 'MID'
      const ruleAlerts = state.ruleEngine ? state.ruleEngine.evaluate(gameData, position) : []
      if (ruleAlerts.length > 0) {
        const top = ruleAlerts[0]
        const fallback = buildMacroFallbackPayload(top, gameTime, eventTrigger)
        broadcast('macro:advice', fallback)
        macroLog(`[Pipeline] Fallback to ruleEngine: ${top.title}`)
      } else {
        macroLog('[Pipeline] Postprocessor returned null, no ruleEngine fallback available')
      }
    }
  } catch (err) {
    if (err.authError) {
      macroLog('Auth error - stopping. Check provider settings.')
      state.aiEnabled = false
      broadcast('ai:error', { type: 'auth', message: 'APIキーが無効またはプロバイダー未設定です。' })
    } else {
      macroLog(`Error: ${err.message}`)
      broadcast('macro:advice', {
        error: err.message,
        _meta: {
          source: 'error',
          trigger: eventTrigger || null,
          updatedAt: Date.now(),
        }
      })
    }
  } finally {
    state.macroPending = false
    broadcast('macro:loading', false)
  }
}

// ── コーチング ────────────────────────────────────
async function requestCoaching(snapshot, macroHistorySummary = null) {
  if (!state.aiClient || !snapshot || !state.currentMatchAiAllowed) return

  const { players, gameData: gd } = snapshot
  const { me } = players || {}
  if (!me) return

  console.log('[Pipeline] Requesting coaching evaluation...')
  broadcast('coaching:loading', true)

  try {
    // GameStateが残っていなければsnapshotから再構築
    const gameState = state.currentGameState || state.preprocessor.buildGameState(
      { activePlayer: snapshot.activePlayer, allPlayers: snapshot.allPlayers || [me, ...(players.allies || []), ...(players.enemies || [])], gameData: gd },
      gd?.events?.Events || [],
      { spectatorSelectedName: state.spectatorSelectedName || null }
    )

    const events = gd?.events?.Events || []
    const coreBuild = state.currentCoreBuild
      ? state.currentCoreBuild.ids.map((id, i) => ({ id, name: state.currentCoreBuild.names[i] }))
      : []

    // 前処理: 構造化入力を生成
    const structuredInput = state.preprocessor.buildCoachingInput(gameState, state.preprocessor.gameLog, coreBuild, events)
    structuredInput.macro_advice_history_summary = macroHistorySummary || summarizeMacroAdviceHistory()
    console.log(`[Pipeline] Coaching input: duration=${structuredInput.game_duration}s phase=${structuredInput.game_phase_final} snapshots=${structuredInput.snapshot_count}`)

    // 推論
    const rawResult = await state.aiClient.getCoaching(structuredInput)

    // 後処理
    const result = state.postprocessor.processCoachingResult(rawResult)

    if (result) {
      console.log(`[Pipeline] Coaching processed: score=${result.overall_score}/10 build=${result.build_score}/10`)
      if (result.sections) {
        for (const s of result.sections) {
          console.log(`[Pipeline] Coaching [${s.grade || '?'}] ${s.title}: ${(s.content || '').substring(0, 120)}`)
        }
      }
      if (result.good_points) {
        result.good_points.forEach((p, i) => console.log(`[Pipeline] Coaching Good${i+1}: ${p.substring(0, 120)}`))
      }
      if (result.improve_points) {
        result.improve_points.forEach((p, i) => console.log(`[Pipeline] Coaching Improve${i+1}: ${p.substring(0, 120)}`))
      }
      if (result.next_game_advice) {
        console.log(`[Pipeline] Coaching NextGame: ${result.next_game_advice.substring(0, 150)}`)
      }
      broadcast('coaching:result', result)
      saveLastGame(snapshot, result)
    } else {
      console.error('[Pipeline] Coaching postprocessor returned null')
      saveLastGame(snapshot, null)
    }
  } catch (err) {
    console.error('[Pipeline] Coaching error:', err.message)
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
    if (state.aiClient) state.aiClient.setSubstituteItems(fallback)
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

    if (state.aiClient) {
      state.aiClient.setCoreBuild({ ids: defaultBuild.ids, names: defaultBuild.names, descs: defaultBuild.descs })
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
        if (state.aiClient && state.aiEnabled) {
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
  console.log(`[GameEnd] Game ended. spellsLoaded=${state.spellsLoadedForGame} aiEnabled=${state.aiEnabled} aiClient=${!!state.aiClient} coachingRequested=${state.coachingRequested}`)
  const normalEnd = isNormalEndFromEvents(state.cachedEvents)

  // スナップショットを先にコピー（リセット前に保持）
  const snapshotForCoaching = state.lastGameSnapshot ? { ...state.lastGameSnapshot } : null
  if (snapshotForCoaching) {
    snapshotForCoaching.normal_end = normalEnd
  }
  const macroHistorySummary = summarizeMacroAdviceHistory()

  // UIから古いコーチング結果を即座にクリア
  broadcast('coaching:result', null)

  // 状態リセット（コーチング発火前に行う。snapshotForCoachingは独立コピー）
  if (state.spellsLoadedForGame) {
    const wasSpellsLoaded = true
    state.spellsLoadedForGame = false
    state.championKnowledgeGenerated = false
    resetBuildState()
    state.currentAnalysis = null
    state.champSelectChampId = null
    state.manualPosition = null
    state.positionSelectSent = false
    state._lastObjLogKey = null
    state._lastObjTriggerKey = null

    // clearMatch はコーチングが使わないので安全
    if (state.aiClient) state.aiClient.clearMatch()

    // コーチングリクエスト（非同期）
    if (state.aiClient && state.aiEnabled && !state.coachingRequested && wasSpellsLoaded) {
      state.coachingRequested = true
      console.log('[GameEnd] Requesting coaching evaluation...')
      requestCoaching(snapshotForCoaching, macroHistorySummary)
    } else {
      console.log(`[GameEnd] Coaching skipped: aiClient=${!!state.aiClient} aiEnabled=${state.aiEnabled} coachingRequested=${state.coachingRequested}`)
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
  if (!state.lastGameSnapshot?.isSpectator && normalEnd && state.currentMatchAiAllowed) {
    incrementFreeMatchCount()
  }
  if (state.matchSession) {
    state.matchSession.ended = true
    saveRuntimeSession()
  }
  clearRuntimeSession()
  state.currentMatchAiAllowed = true
}

async function handleGameData(gameData) {
  // サモナーズリフト以外（ARAM等）はAI分析をスキップ
  // 待機画面のままで前回のコーチング結果が表示される
  const gameMode = gameData.gameData?.gameMode
  if (gameMode && gameMode !== 'CLASSIC') {
    if (!state._nonClassicLogged) {
      console.log(`[Game] ゲームモード "${gameMode}" — サポート対象外、待機画面を維持`)
      state._nonClassicLogged = true
    }
    return
  }
  if (state._nonClassicLogged) state._nonClassicLogged = false

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

  // 10体のチャンプ教科書生成（プレイヤー情報が揃ってから1回だけ）
  if (!state.championKnowledgeGenerated && allPlayers.length >= 6 && state.aiClient?.isLocalLLM?.()) {
    try {
      const { getAllChampions } = require('./api/patchData')
      const champMap = getAllChampions() || {}
      const champValues = Object.values(champMap)
      const spellData = require('./api/patchData').getSpells ? {} : {}

      // スキル情報を収集
      const spellMap = {}
      for (const p of allPlayers) {
        const s = getSpells(p.enName)
        if (s) spellMap[p.enName] = s
      }

      const makeTeam = (team) => allPlayers.filter(p => p.team === team).map(p => {
        const champInfo = champValues.find(c => c.enName === p.enName)
        return {
          championName: p.championName, enName: p.enName,
          position: p.position,
          tags: champInfo?.tags || [],
          stats: champInfo?.stats || {},
        }
      })

      const allyTeam = makeTeam('ORDER')
      const enemyTeam = makeTeam('CHAOS')
      const knowledge = buildMatchChampionKnowledge(allyTeam, enemyTeam, spellMap)
      state.aiClient.setChampionKnowledge(knowledge)
      state.championKnowledgeGenerated = true
      console.log(`[MatchKnowledge] Generated champion textbook (${knowledge.length} chars, ${allyTeam.length + enemyTeam.length} champs)`)

      // ランク取得（LCU経由）
      if (state.lcuClient && !state.aiClient.rank) {
        try {
          const tier = await state.lcuClient.getSoloRankTier()
          if (tier) {
            state.aiClient.setRank(tier)
            console.log(`[Rank] Player rank: ${tier}`)
          }
        } catch { /* LCU接続失敗 → ランクなしで続行 */ }
      }
    } catch (err) {
      console.error(`[MatchKnowledge] Error: ${err.message}`)
    }
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
  if (state.aiClient) {
    state.aiClient.setPosition(resolvedPosition)
    state.aiClient.setGameTime(gameData.gameData?.gameTime || 0)
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
  const sessionStatus = isSpectator ? { status: 'spectator' } : ensureMatchSession(me, gt)
  if (!isSpectator && sessionStatus.status === 'new') {
    state.currentMatchAiAllowed = getRemainingFreeMatches() > 0
    if (!state.currentMatchAiAllowed) {
      console.log('[Quota] Free quota exhausted. This new match will run without AI.')
      broadcast('ai:error', { type: 'quota', message: '本日の無料枠を使い切りました。次の試合からAIは停止します。' })
    }
  } else if (sessionStatus.status === 'restored') {
    state.currentMatchAiAllowed = true
  }

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

  // GameState構築（毎ポーリング）
  const gameState = state.preprocessor.buildGameState(gameData, events, {
    spectatorSelectedName: isSpectator ? state.spectatorSelectedName : null
  })
  state.currentGameState = gameState

  // 60秒間隔でスナップショット蓄積（コーチング用）
  state.preprocessor.recordSnapshot(gameState, gt)

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
    // 未出現・リスポーン待ちのオブジェクトはログから省略
    const objParts = []
    if (!objSummary.dragon.includes('未出現') && !objSummary.dragon.includes('リスポーン待ち') && !objSummary.dragon.includes('終了')) objParts.push(`dragon=${objSummary.dragon}`)
    if (!objSummary.baron.includes('未出現') && !objSummary.baron.includes('リスポーン待ち') && !objSummary.baron.includes('終了')) objParts.push(`baron=${objSummary.baron}`)
    if (objParts.length > 0) {
      console.log(`[Objectives] t=${Math.floor(gt)}s ${objParts.join(' ')}`)
    }
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

  if (state.lastGameStatus !== 'ingame') {
    broadcast('game:status', 'ingame')
  }
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
    loadCoreBuild(me.enName, resolvedPosition).then(analysis => {
      if (analysis?.skills) {
        broadcast('champselect:extras', { skills: analysis.skills, ddragon: state.ddragonBase })
      }
    }).catch(err => {
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
  if (state.matchupItemsLoaded || !me.enName || !resolvedPosition || !state.aiClient || !state.currentCoreBuild) return

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
      state.aiClient.setSubstituteItems(withCounters)
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
  if (!state.currentMatchAiAllowed) return
  if (state.matchupTipLoaded || !me.enName || !resolvedPosition || !state.aiClient || !state.aiEnabled || !state.currentCoreBuild) {
    if (!state.matchupTipLoaded && me.enName && resolvedPosition) {
      console.log(`[MatchupTip] Waiting... claude=${!!state.aiClient} ai=${state.aiEnabled} coreBuild=${!!state.currentCoreBuild}`)
    }
    return
  }

  const laneOpponent = findLaneOpponent(enemies, resolvedPosition, 'MatchupTip')
  if (!laneOpponent) return

  state.matchupTipLoaded = true

  const gameState = state.currentGameState
  if (!gameState) {
    console.warn('[Pipeline] MatchupTip: no gameState available, will retry')
    state.matchupTipLoaded = false
    return
  }

  // 前処理: 構造化入力を生成
  const spellData = getSpells(laneOpponent.enName)
  const structuredInput = state.preprocessor.buildMatchupInput(gameState, spellData)
  console.log(`[Pipeline] MatchupTip input: ${me.enName} vs ${structuredInput.opponent?.champion || '?'} (${resolvedPosition})`)

  broadcast('matchup:loading', { loading: true, opponent: laneOpponent.championName, opponentPartner: structuredInput.opponent_partner?.champion || null })

  state.aiClient.getMatchupTip(structuredInput).then(rawTip => {
    // 後処理
    const tip = state.postprocessor.processMatchupResult(rawTip, structuredInput.opponent)

    if (tip) {
      tip.opponent = laneOpponent.championName
      tip.opponentPartner = structuredInput.opponent_partner?.champion || null
      tip.myChampion = me.championName
      tip.mySkills = structuredInput.me?.skills || null
      tip.opponentSkills = structuredInput.opponent?.skills || null
      broadcast('matchup:loading', false)
      broadcast('matchup:tip', tip)
      console.log(`[Pipeline] MatchupTip processed: ${me.enName} vs ${laneOpponent.enName}: ${tip.summary}`)
    } else {
      broadcast('matchup:loading', false)
      console.warn('[Pipeline] MatchupTip postprocessor returned null, will retry')
      state.matchupTipLoaded = false
    }
  }).catch(err => {
    broadcast('matchup:loading', false)
    if (err.authError) {
      console.error('[MatchupTip] Auth error - stopping retries. Check provider settings.')
      state.aiEnabled = false
      broadcast('ai:error', { type: 'auth', message: 'APIキーが無効またはプロバイダー未設定です。' })
    } else {
      console.error('[MatchupTip] Error:', err.message, '- will retry')
      state.matchupTipLoaded = false
    }
  })
}

function handleAiSuggestion(gameData) {
  if (!state.currentMatchAiAllowed) return
  const triggered = state.diffDetector.check(gameData)

  // 15分未満はAI提案しない
  const gameTime = gameData.gameData?.gameTime || 0
  if (gameTime < 900) return

  if ((triggered || !state.lastSuggestion) && !state.aiPending && state.aiClient && state.aiEnabled && state.currentCoreBuild) {
    const gameState = state.currentGameState
    if (!gameState) return

    // 前処理: 構造化入力を生成
    const coreBuild = state.currentCoreBuild.ids.map((id, i) => ({ id, name: state.currentCoreBuild.names[i] }))
    const substituteItems = state.aiClient.getSubstituteItems() || []
    const structuredInput = state.preprocessor.buildItemInput(gameState, coreBuild, substituteItems)
    const candidateIds = structuredInput.candidates.map(c => c.id)

    // 重複スキップ: 候補リスト+状況が前回と同じならAPI呼び出しを省略
    const suggFingerprint = `${candidateIds.join(',')}|${structuredInput.situation}|${structuredInput.me?.level || 0}|${(structuredInput.me?.items || []).map(i => i.id).join(',')}`
    if (suggFingerprint === state._lastSuggFingerprint && state.lastSuggestion) {
      return // 候補もアイテム構成も変わっていない → スキップ
    }
    state._lastSuggFingerprint = suggFingerprint

    console.log(`[Pipeline] Item input: candidates=[${candidateIds.join(',')}] situation=${structuredInput.situation}`)

    state.aiPending = true
    broadcast('ai:loading', true)
    state.aiClient.getSuggestion(structuredInput).then(rawResult => {
      syncInteractionSessionsFromClient()
      // 後処理
      const previousResult = state.postprocessor.lastItemResult
      const processedResult = state.postprocessor.processItemResult(rawResult, candidateIds, previousResult)

      if (processedResult) {
        // 次回フィードバック用に保存
        state.preprocessor.setItemAdvice(processedResult)

        // UIに送るデータを整形
        const s = { ...processedResult }
        if (s.recommended) {
          s.recommended = s.recommended.map(r => {
            const item = getItemById(String(r.id))
            return { ...r, name: item?.jaName || r.id, image: item?.image || '' }
          })
        }
        s.gameTime = gameData.gameData?.gameTime || 0
        // 推薦蓄積（既存互換）
        s.history = rawResult?.history || {}
        s.totalCalls = rawResult?.totalCalls || 0
        state.lastSuggestion = s
        const recNames = (s.recommended || []).map(r => r.name || r.id).join(', ')
        console.log(`[Pipeline] Item processed: t=${Math.floor(s.gameTime)}s recommended=[${recNames}] reason=${(s.reasoning || '').substring(0, 80)}`)
        broadcast('ai:suggestion', s)
      }
      state.aiPending = false
      broadcast('ai:loading', false)
    }).catch(err => {
      state.aiPending = false
      broadcast('ai:loading', false)
      if (err.authError) {
        console.error('[AiSuggestion] Auth error - stopping. Check provider settings.')
        state.aiEnabled = false
        broadcast('ai:error', { type: 'auth', message: 'APIキーが無効またはプロバイダー未設定です。' })
      } else {
        broadcast('ai:suggestion', { error: err.message })
      }
    })
  }
}

function handleMacroAdvice(gameData, me, allies, enemies) {
  if (!state.currentMatchAiAllowed) return
  const now = Date.now()
  const events = gameData.events?.Events || []
  // オブジェクトキルイベント数(APIが返さない場合は0のまま → 時間ベーストリガーのみ)
  const objEvents = classifyObjectiveEvents(events)
  const objectiveCount = objEvents.dragon.length + objEvents.baron.length + objEvents.herald.length + objEvents.voidgrub.length
  const turretCount = events.filter(e => e.EventName === 'TurretKilled').length
  const objectiveTaken = objectiveCount > state.lastObjectiveCount || turretCount > (state.lastTurretCount || 0)
  if (objectiveCount > state.lastObjectiveCount) state.lastObjectiveCount = objectiveCount
  if (turretCount > (state.lastTurretCount || 0)) state.lastTurretCount = turretCount

  // キル/デス検出トリガー
  const championKillCount = events.filter(e => e.EventName === 'ChampionKill').length
  const killDeathOccurred = championKillCount > (state.lastChampionKillCount || 0)
  if (championKillCount > (state.lastChampionKillCount || 0)) state.lastChampionKillCount = championKillCount

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
    // オブジェクト名のみで比較（秒数の変化で再発火させない）
    const triggerKey = approachingObjs.map(o => o.split(':')[0]).join(',')
    if (triggerKey !== state._lastObjTriggerKey && timeSinceLastMacro >= MACRO_DEBOUNCE_MS) {
      objectivePreTrigger = true
      state._lastObjTriggerKey = triggerKey
    }
  }

  // ── イベント駆動トリガー（periodic_90s廃止） ──
  // 時間経過ではなく「意味のある変化」でのみAPI呼び出し
  const gameState = state.currentGameState
  const prevMacroState = state._prevMacroState || {}
  let eventTrigger = null

  if (!eventTrigger && objectiveTaken) {
    eventTrigger = 'objective_taken'
  }
  if (!eventTrigger && objectivePreTrigger) {
    eventTrigger = `objective_approaching: ${approachingObjs.join(', ')}`
  }
  if (!eventTrigger && killDeathOccurred && timeSinceLastMacro >= MACRO_DEBOUNCE_MS) {
    eventTrigger = 'kill_death'
  }

  // ゴールド閾値超え（リコール判断に影響）
  if (!eventTrigger && gameState?.me && timeSinceLastMacro >= MACRO_DEBOUNCE_MS) {
    const currGold = gameState.me.gold || 0
    const prevGold = prevMacroState.gold || 0
    const thresholds = RECALL_GOLD_THRESHOLDS
    for (const t of thresholds) {
      if (prevGold < t && currGold >= t) {
        eventTrigger = `gold_threshold_${t}`
        break
      }
    }
  }

  // バフ切れ（バロン/エルダー終了 → 戦略転換）
  if (!eventTrigger && gameState?.objectives && timeSinceLastMacro >= MACRO_DEBOUNCE_MS) {
    const currBuffs = gameState.objectives.buffs || {}
    const prevBuffs = prevMacroState.buffs || {}
    if (prevBuffs.baron && !currBuffs.baron) eventTrigger = 'baron_buff_expired'
    if (prevBuffs.elder && !currBuffs.elder) eventTrigger = 'elder_buff_expired'
  }

  // 5分フォールバック（長時間イベントなし時の安全弁）
  if (!eventTrigger && timeSinceLastMacro >= MACRO_FALLBACK_MS) {
    eventTrigger = 'fallback_300s'
  }

  if (state.aiClient && state.aiEnabled && !state.macroPending && eventTrigger) {
    state.lastMacroTime = now
    // 次回比較用に状態保存
    if (gameState?.me) {
      state._prevMacroState = {
        gold: gameState.me.gold || 0,
        buffs: { ...(gameState.objectives?.buffs || {}) },
      }
    }
    macroLog(`Triggering macro advice (${eventTrigger})`)
    requestMacroAdvice(gameData, me, allies, enemies, eventTrigger)
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

    // .env からモデル設定を読み込み（プロバイダー別、ログは復元後に出力）
    const env = loadEnv()
    if (env.CLAUDE_MODEL) state.claudeModel = env.CLAUDE_MODEL
    if (env.CLAUDE_QUALITY_MODEL) state.claudeQualityModel = env.CLAUDE_QUALITY_MODEL
    if (env.GEMINI_MODEL) state.geminiModel = env.GEMINI_MODEL
    if (env.GEMINI_QUALITY_MODEL) state.geminiQualityModel = env.GEMINI_QUALITY_MODEL

    const _restoreModelOpts = (providerType) => {
      if (providerType === 'gemini') {
        return {
          ...(state.geminiModel && { model: state.geminiModel }),
          ...(state.geminiQualityModel && { qualityModel: state.geminiQualityModel }),
        }
      }
      return {
        ...(state.claudeModel && { model: state.claudeModel }),
        ...(state.claudeQualityModel && { qualityModel: state.claudeQualityModel }),
      }
    }
    const aiOpts = _restoreModelOpts()

    // プロバイダー復元 (Ollama or Anthropic)
    const savedProvider = loadSettings().provider
    if (savedProvider?.type === 'ollama') {
      const provider = new OllamaProvider({ baseUrl: savedProvider.baseUrl, model: savedProvider.model })
      state.aiClient = new AiClient(provider, aiOpts)
      console.log(`[Provider] Restored Ollama (model: ${savedProvider.model || 'auto'})`)

      // Ollama が起動していなければ自動起動
      const setup = new OllamaSetup(app.getPath('userData'))
      setup.checkStatus().then(async (s) => {
        if (s.installed && !s.running) {
          console.log('[OllamaSetup] Ollama not running, auto-starting...')
          await setup._startService()
          const ready = await setup._waitForReady(15000)
          console.log(`[OllamaSetup] Auto-start ${ready ? 'succeeded' : 'failed'}`)
        } else if (!s.installed) {
          console.log('[OllamaSetup] Ollama not installed — user needs to run setup from settings')
        }
      }).catch(() => {})
    } else if (savedProvider?.type === 'anthropic') {
      _stopOllamaIfRunning()
      // Anthropicプロバイダー: .env の ANTHROPIC_API_KEY を使用
      const key = env.ANTHROPIC_API_KEY
      if (key) {
        state.aiClient = new AiClient(new AnthropicProvider(key), aiOpts)
        console.log('[Provider] Restored Anthropic from .env')
        if (state.claudeModel) console.log(`[Config] model=${state.claudeModel}`)
        if (state.claudeQualityModel) console.log(`[Config] qualityModel=${state.claudeQualityModel}`)
      } else {
        console.log('[Provider] No ANTHROPIC_API_KEY in .env')
      }
    } else if (savedProvider?.type === 'gemini') {
      _stopOllamaIfRunning()
      const key = env.GEMINI_API_KEY
      if (key) {
        state.aiClient = new AiClient(new GeminiProvider(key), _restoreModelOpts('gemini'))
        console.log('[Provider] Restored Gemini from .env')
        if (state.geminiModel) console.log(`[Config] model=${state.geminiModel}`)
        if (state.geminiQualityModel) console.log(`[Config] qualityModel=${state.geminiQualityModel}`)
      } else {
        console.log('[Provider] No GEMINI_API_KEY in .env')
      }
    } else {
      // プロバイダー未設定 → Ollamaが起動していれば自動接続
      console.log('[Provider] No provider configured. Trying auto-detect Ollama...')
      const autoProvider = new OllamaProvider({})
      autoProvider.validate().then(async (ok) => {
        if (ok) {
          // モデル一覧から最適なモデルを選択して保存
          const models = await autoProvider.listModels()
          const qwen = models.find(m => m.name.includes('qwen'))
          const modelName = qwen?.name || models[0]?.name || 'qwen3.5:9b'
          autoProvider.defaultModel = modelName
          state.aiClient = new AiClient(autoProvider, aiOpts)
          saveSetting('provider', { type: 'ollama', baseUrl: autoProvider.baseUrl, model: modelName })
          console.log(`[Provider] Auto-detected Ollama (model: ${modelName})`)
        } else {
          // Ollamaも無い → .env の ANTHROPIC_API_KEY を試す
          const anthropicKey = env.ANTHROPIC_API_KEY
          if (anthropicKey) {
            state.aiClient = new AiClient(new AnthropicProvider(anthropicKey), aiOpts)
            console.log('[Provider] Fallback to Anthropic from .env')
          }
          if (!state.aiClient) {
            console.log('[Provider] No provider available. Use Settings to set up Ollama.')
          }
        }
      }).catch(() => {
        console.log('[Provider] Ollama auto-detect failed')
      })
    }

    // 保存済みランクを復元
    try {
      const rankFile = path.join(app.getPath('userData'), '.player-rank')
      const savedRank = fs.readFileSync(rankFile, 'utf-8').trim()
      if (savedRank && state.aiClient) {
        state.aiClient.setRank(savedRank)
        console.log(`[Rank] Restored: ${savedRank}`)
      }
    } catch { /* ランク未設定 → デフォルトなし */ }

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
