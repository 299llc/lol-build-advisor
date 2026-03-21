const { contextBridge, ipcRenderer } = require('electron')

// Electron環境フラグ（ブラウザテスト時との判別用）
contextBridge.exposeInMainWorld('__ELECTRON__', true)

contextBridge.exposeInMainWorld('electronAPI', {
  // ウィンドウ操作
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),

  // APIキー
  getApiKey: () => ipcRenderer.invoke('apikey:get'),
  setApiKey: (key) => ipcRenderer.invoke('apikey:set', key),
  validateApiKey: (key) => ipcRenderer.invoke('apikey:validate', key),

  // ポーリング
  startPolling: () => ipcRenderer.invoke('polling:start'),
  stopPolling: () => ipcRenderer.invoke('polling:stop'),

  // AI ON/OFF
  toggleAi: (enabled) => ipcRenderer.invoke('ai:toggle', enabled),
  getAiStatus: () => ipcRenderer.invoke('ai:status'),

  // デバッグ
  getAiLogs: () => ipcRenderer.invoke('ai:logs'),
  clearAiLogs: () => ipcRenderer.invoke('ai:clearLogs'),
  getDebugState: () => ipcRenderer.invoke('debug:state'),
  isDev: () => ipcRenderer.invoke('app:isDev'),

  // イベント購読
  onGameStatus: (cb) => {
    const handler = (_, status) => cb(status)
    ipcRenderer.on('game:status', handler)
    return () => ipcRenderer.removeListener('game:status', handler)
  },
  onGameData: (cb) => {
    const handler = (_, data) => cb(data)
    ipcRenderer.on('game:data', handler)
    return () => ipcRenderer.removeListener('game:data', handler)
  },
  onAiSuggestion: (cb) => {
    const handler = (_, suggestion) => cb(suggestion)
    ipcRenderer.on('ai:suggestion', handler)
    return () => ipcRenderer.removeListener('ai:suggestion', handler)
  },
  onAiLoading: (cb) => {
    const handler = (_, loading) => cb(loading)
    ipcRenderer.on('ai:loading', handler)
    return () => ipcRenderer.removeListener('ai:loading', handler)
  },
  // ポジション手動選択
  setPosition: (position) => ipcRenderer.invoke('position:set', position),
  onPositionSelect: (cb) => {
    const handler = (_, champName) => cb(champName)
    ipcRenderer.on('position:select', handler)
    return () => ipcRenderer.removeListener('position:select', handler)
  },

  // アイテム詳細
  getItemDetail: (itemId) => ipcRenderer.invoke('item:detail', itemId),

  // キャッシュ強制再取得
  refreshCache: () => ipcRenderer.invoke('cache:refresh'),

  // 観戦モード: プレイヤー選択
  selectSpectatorPlayer: (name) => ipcRenderer.invoke('spectator:select', name),

  onChampSelectTeam: (cb) => {
    const handler = (_, team) => cb(team)
    ipcRenderer.on('champselect:team', handler)
    return () => ipcRenderer.removeListener('champselect:team', handler)
  },
  onCoreBuild: (cb) => {
    const handler = (_, build) => cb(build)
    ipcRenderer.on('core:build', handler)
    return () => ipcRenderer.removeListener('core:build', handler)
  },
  onSubstituteItems: (cb) => {
    const handler = (_, items) => cb(items)
    ipcRenderer.on('substitute:items', handler)
    return () => ipcRenderer.removeListener('substitute:items', handler)
  },
  onSubstituteError: (cb) => {
    const handler = (_, msg) => cb(msg)
    ipcRenderer.on('substitute:error', handler)
    return () => ipcRenderer.removeListener('substitute:error', handler)
  },
  onMatchupTip: (cb) => {
    const handler = (_, tip) => cb(tip)
    ipcRenderer.on('matchup:tip', handler)
    return () => ipcRenderer.removeListener('matchup:tip', handler)
  },
  onMatchupLoading: (cb) => {
    const handler = (_, data) => cb(data)
    ipcRenderer.on('matchup:loading', handler)
    return () => ipcRenderer.removeListener('matchup:loading', handler)
  },
  onCoachingResult: (cb) => {
    const handler = (_, result) => cb(result)
    ipcRenderer.on('coaching:result', handler)
    return () => ipcRenderer.removeListener('coaching:result', handler)
  },
  onCoachingLoading: (cb) => {
    const handler = (_, loading) => cb(loading)
    ipcRenderer.on('coaching:loading', handler)
    return () => ipcRenderer.removeListener('coaching:loading', handler)
  },
  onChampSelectExtras: (cb) => {
    const handler = (_, extras) => cb(extras)
    ipcRenderer.on('champselect:extras', handler)
    return () => ipcRenderer.removeListener('champselect:extras', handler)
  },
  onMacroAdvice: (cb) => {
    const handler = (_, advice) => cb(advice)
    ipcRenderer.on('macro:advice', handler)
    return () => ipcRenderer.removeListener('macro:advice', handler)
  },
  onMacroLoading: (cb) => {
    const handler = (_, loading) => cb(loading)
    ipcRenderer.on('macro:loading', handler)
    return () => ipcRenderer.removeListener('macro:loading', handler)
  },
  onObjectivesStatus: (cb) => {
    const handler = (_, status) => cb(status)
    ipcRenderer.on('objectives:status', handler)
    return () => ipcRenderer.removeListener('objectives:status', handler)
  },

  // ルールベースアラート
  onRuleAlerts: (cb) => {
    const handler = (_, alerts) => cb(alerts)
    ipcRenderer.on('rule:alerts', handler)
    return () => ipcRenderer.removeListener('rule:alerts', handler)
  },

  // コンパクトビュー
  toggleCompactView: () => ipcRenderer.invoke('compact:toggle'),
  getCompactStatus: () => ipcRenderer.invoke('compact:status'),
  onCompactStatus: (cb) => {
    const handler = (_, status) => cb(status)
    ipcRenderer.on('compact:status', handler)
    return () => ipcRenderer.removeListener('compact:status', handler)
  },
  compactClose: () => ipcRenderer.send('compact:close'),
  compactSetPassthrough: (enabled) => ipcRenderer.send('compact:set-passthrough', enabled),

  // 前回試合結果
  getLastGame: () => ipcRenderer.invoke('lastgame:get'),

  // セッションレコーダー
  recorderList: () => ipcRenderer.invoke('recorder:list'),
  recorderLoad: (filepath) => ipcRenderer.invoke('recorder:load', filepath),
  recorderToggle: () => ipcRenderer.invoke('recorder:toggle'),
  recorderStatus: () => ipcRenderer.invoke('recorder:status'),

  // ゲームログ
  openGameLogFolder: () => ipcRenderer.invoke('gamelog:openFolder'),

  // プロバイダー切替 (Ollama / Anthropic / Bedrock / Gemini)
  setOllamaProvider: (opts) => ipcRenderer.invoke('provider:set-ollama', opts),
  setAnthropicProvider: () => ipcRenderer.invoke('provider:set-anthropic'),
  setBedrockProvider: () => ipcRenderer.invoke('provider:set-bedrock'),
  setGeminiProvider: () => ipcRenderer.invoke('provider:set-gemini'),
  getProvider: () => ipcRenderer.invoke('provider:get'),
  ollamaModels: (baseUrl) => ipcRenderer.invoke('ollama:models', baseUrl),
  ollamaValidate: (opts) => ipcRenderer.invoke('ollama:validate', opts),

  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Ollama 自動セットアップ
  ollamaCheckStatus: () => ipcRenderer.invoke('ollama:check-status'),
  ollamaFullSetup: (model) => ipcRenderer.invoke('ollama:full-setup', model),
  ollamaPullModel: (model) => ipcRenderer.invoke('ollama:pull-model', model),
  ollamaDeleteModel: (model) => ipcRenderer.invoke('ollama:delete-model', model),
  // ランク設定
  setPlayerRank: (rank) => ipcRenderer.invoke('player:set-rank', rank),
  getPlayerRank: () => ipcRenderer.invoke('player:get-rank'),
  ollamaStartService: () => ipcRenderer.invoke('ollama:start-service'),
  onOllamaSetupProgress: (cb) => {
    const handler = (_, progress) => cb(progress)
    ipcRenderer.on('ollama:setup-progress', handler)
    return () => ipcRenderer.removeListener('ollama:setup-progress', handler)
  },
})
