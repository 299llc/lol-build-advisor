/**
 * ブラウザテスト用 window.electronAPI モック
 *
 * Electron IPC を EventEmitter パターンでシミュレートする。
 * window.__test.loadScenario(name) でシナリオを切り替え可能。
 */

const listeners = {}

function on(channel, cb) {
  if (!listeners[channel]) listeners[channel] = []
  listeners[channel].push(cb)
  return () => {
    listeners[channel] = listeners[channel].filter(fn => fn !== cb)
  }
}

function emit(channel, data) {
  // preload.js と同様: handler = (_, val) => cb(val) なので cb(data) で直接呼ぶ
  ;(listeners[channel] || []).forEach(cb => cb(data))
}

// シナリオ定義を動的 import で読み込む
const scenarioModules = import.meta.glob('./fixtures/*.json', { eager: true })
const scenarios = {}
for (const [path, mod] of Object.entries(scenarioModules)) {
  const name = path.replace('./fixtures/', '').replace('.json', '')
  scenarios[name] = mod.default || mod
}

function loadScenario(name) {
  const scenario = scenarios[name]
  if (!scenario) {
    console.warn(`[MockAPI] Unknown scenario: ${name}. Available: ${Object.keys(scenarios).join(', ')}`)
    return
  }
  console.log(`[MockAPI] Loading scenario: ${name}`)

  // 全チャネルをリセット
  emit('game:status', 'waiting')
  emit('game:data', null)
  emit('core:build', null)
  emit('ai:suggestion', null)
  emit('ai:loading', false)
  emit('matchup:tip', null)
  emit('substitute:items', [])
  emit('substitute:error', null)
  emit('macro:advice', null)
  emit('macro:loading', false)
  emit('coaching:result', null)
  emit('coaching:loading', false)
  emit('position:select', null)
  emit('champselect:team', [])
  emit('champselect:extras', null)
  emit('objectives:status', null)

  // シナリオデータを順次発火（少し遅延を入れてReactに反映させる）
  setTimeout(() => {
    const s = scenario
    if (s.status) emit('game:status', s.status)
    if (s.gameData) emit('game:data', s.gameData)
    if (s.coreBuild) emit('core:build', s.coreBuild)
    if (s.aiSuggestion) emit('ai:suggestion', s.aiSuggestion)
    if (s.aiLoading !== undefined) emit('ai:loading', s.aiLoading)
    if (s.matchupTip) emit('matchup:tip', s.matchupTip)
    if (s.substituteItems) emit('substitute:items', s.substituteItems)
    if (s.substituteError) emit('substitute:error', s.substituteError)
    if (s.macroAdvice) emit('macro:advice', s.macroAdvice)
    if (s.macroLoading !== undefined) emit('macro:loading', s.macroLoading)
    if (s.coaching) emit('coaching:result', s.coaching)
    if (s.coachingLoading !== undefined) emit('coaching:loading', s.coachingLoading)
    if (s.positionSelectChamp) emit('position:select', s.positionSelectChamp)
    if (s.champSelectTeam) emit('champselect:team', s.champSelectTeam)
    if (s.champSelectExtras) emit('champselect:extras', s.champSelectExtras)
    if (s.objectivesStatus) emit('objectives:status', s.objectivesStatus)
  }, 50)
}

// window.electronAPI モック
const mockAPI = {
  // ウィンドウ操作（no-op）
  minimize: () => {},
  close: () => {},

  // APIキー（モック）
  getApiKey: () => Promise.resolve('test-key-mock'),
  setApiKey: () => Promise.resolve(true),
  validateApiKey: () => Promise.resolve(true),

  // ポーリング（no-op）
  startPolling: () => Promise.resolve(),
  stopPolling: () => Promise.resolve(),

  // AI
  toggleAi: () => Promise.resolve(true),
  getAiStatus: () => Promise.resolve(true),

  // デバッグ
  getAiLogs: () => Promise.resolve([]),
  clearAiLogs: () => Promise.resolve(),
  getDebugState: () => Promise.resolve({}),
  isDev: () => Promise.resolve(true),

  // ポジション
  setPosition: (pos) => { console.log(`[MockAPI] setPosition: ${pos}`); return Promise.resolve() },

  // アイテム詳細
  getItemDetail: () => Promise.resolve(null),

  // キャッシュ
  refreshCache: () => Promise.resolve(),

  // 観戦
  selectSpectatorPlayer: (name) => { console.log(`[MockAPI] selectSpectatorPlayer: ${name}`); return Promise.resolve(true) },

  // イベント購読
  onGameStatus: (cb) => on('game:status', cb),
  onGameData: (cb) => on('game:data', cb),
  onAiSuggestion: (cb) => on('ai:suggestion', cb),
  onAiLoading: (cb) => on('ai:loading', cb),
  onCoreBuild: (cb) => on('core:build', cb),
  onPositionSelect: (cb) => on('position:select', cb),
  onSubstituteItems: (cb) => on('substitute:items', cb),
  onSubstituteError: (cb) => on('substitute:error', cb),
  onMatchupTip: (cb) => on('matchup:tip', cb),
  onCoachingResult: (cb) => on('coaching:result', cb),
  onCoachingLoading: (cb) => on('coaching:loading', cb),
  onChampSelectTeam: (cb) => on('champselect:team', cb),
  onChampSelectExtras: (cb) => on('champselect:extras', cb),
  onMacroAdvice: (cb) => on('macro:advice', cb),
  onMacroLoading: (cb) => on('macro:loading', cb),
  onObjectivesStatus: (cb) => on('objectives:status', cb),

  // コンパクトビュー（ブラウザモードでは何もしない）
  openCompactView: () => Promise.resolve(),
  toggleCompactView: () => Promise.resolve(false),
  getCompactStatus: () => Promise.resolve(false),
  onCompactStatus: () => () => {},
  compactMinimize: () => {},
  compactClose: () => {},

  // レコーダー（ブラウザモードではno-op）
  recorderToggle: () => Promise.resolve({ recording: false }),
  recorderStatus: () => Promise.resolve({ recording: false }),
  recorderList: () => Promise.resolve([]),
  recorderLoad: () => Promise.resolve(null),

  // 前回試合結果（ブラウザモードでは空）
  getLastGame: () => Promise.resolve(null),
}

// ── セッション再生エンジン ──────────────────────────
let replayState = {
  session: null,
  timers: [],
  playing: false,
  speed: 1,
  startTime: 0,
  pauseTime: 0,
  elapsed: 0,
  onProgress: null,
}

function replaySession(session, speed = 1) {
  stopReplay()
  if (!session?.events?.length) return

  replayState.session = session
  replayState.speed = speed
  replayState.playing = true
  replayState.startTime = Date.now()
  replayState.elapsed = 0

  // 全チャネルをリセット
  loadScenario('waiting')

  setTimeout(() => {
    scheduleEvents(0, speed)
  }, 100)

  console.log(`[Replay] Started: ${session.eventCount} events, duration ${Math.round(session.duration / 1000)}s, speed ${speed}x`)
}

function scheduleEvents(fromTime, speed) {
  const { session } = replayState
  if (!session) return

  for (const event of session.events) {
    if (event.t < fromTime) continue
    const delay = (event.t - fromTime) / speed
    const timer = setTimeout(() => {
      if (!replayState.playing) return
      emit(event.ch, event.data)
      replayState.elapsed = event.t
      if (replayState.onProgress) {
        replayState.onProgress(event.t, session.duration)
      }
    }, delay)
    replayState.timers.push(timer)
  }

  // 再生完了
  const endDelay = (session.duration - fromTime) / speed
  const endTimer = setTimeout(() => {
    replayState.playing = false
    console.log('[Replay] Finished')
    if (replayState.onProgress) {
      replayState.onProgress(session.duration, session.duration)
    }
  }, endDelay + 100)
  replayState.timers.push(endTimer)
}

function stopReplay() {
  replayState.timers.forEach(t => clearTimeout(t))
  replayState.timers = []
  replayState.playing = false
  replayState.session = null
}

function pauseReplay() {
  if (!replayState.playing) return
  replayState.timers.forEach(t => clearTimeout(t))
  replayState.timers = []
  replayState.playing = false
  replayState.pauseTime = Date.now()
  console.log(`[Replay] Paused at ${Math.round(replayState.elapsed / 1000)}s`)
}

function resumeReplay() {
  if (replayState.playing || !replayState.session) return
  replayState.playing = true
  scheduleEvents(replayState.elapsed, replayState.speed)
  console.log(`[Replay] Resumed from ${Math.round(replayState.elapsed / 1000)}s`)
}

function seekReplay(timeMs) {
  if (!replayState.session) return
  const savedSession = replayState.session
  const wasPlaying = replayState.playing
  stopReplay()
  replayState.session = savedSession // restore after stopReplay nulls it

  // timeMs までのイベントを一気に発火
  loadScenario('waiting')
  setTimeout(() => {
    const session = replayState.session
    if (!session) return
    for (const event of session.events) {
      if (event.t <= timeMs) {
        emit(event.ch, event.data)
      }
    }
    replayState.elapsed = timeMs
    if (replayState.onProgress) {
      replayState.onProgress(timeMs, session.duration)
    }
    // 再生中だった場合は続きを再生
    if (wasPlaying) {
      replayState.playing = true
      scheduleEvents(timeMs, replayState.speed)
    }
  }, 50)
}

// セッションJSONファイルのインポート（ブラウザ用 FileReader経由）
function importSessionFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const session = JSON.parse(e.target.result)
        resolve(session)
      } catch (err) {
        reject(new Error('セッションファイルの解析に失敗しました'))
      }
    }
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'))
    reader.readAsText(file)
  })
}

export function installMockAPI() {
  window.electronAPI = mockAPI

  // Playwright / コンソールからアクセス可能なテストAPI
  window.__test = {
    loadScenario,
    emit,
    scenarios: Object.keys(scenarios),
    // セッション再生
    replaySession,
    stopReplay,
    pauseReplay,
    resumeReplay,
    seekReplay,
    importSessionFile,
    getReplayState: () => replayState,
  }

  console.log(`[MockAPI] Installed. Scenarios: ${Object.keys(scenarios).join(', ')}`)
  console.log('[MockAPI] Usage: window.__test.loadScenario("ingame-mid")')
  console.log('[MockAPI] Replay: window.__test.importSessionFile(file).then(s => window.__test.replaySession(s))')
}
