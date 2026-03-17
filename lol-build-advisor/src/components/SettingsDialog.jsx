import { useState, useEffect } from 'react'
import { X, Check, Loader2, AlertCircle, Brain, Pin, RefreshCw, FolderOpen, Cpu, Shield, ChevronDown, Download, Play, Zap } from 'lucide-react'

function OllamaSetupWizard({ onComplete }) {
  const [status, setStatus] = useState(null) // { installed, running, models }
  const [checking, setChecking] = useState(true)
  const [setupRunning, setSetupRunning] = useState(false)
  const [progress, setProgress] = useState(null) // { stage, message, percent? }
  const [error, setError] = useState(null)

  useEffect(() => {
    checkStatus()
    const unsub = window.electronAPI?.onOllamaSetupProgress?.(setProgress)
    return () => unsub?.()
  }, [])

  const checkStatus = async () => {
    setChecking(true)
    setError(null)
    try {
      const s = await window.electronAPI?.ollamaCheckStatus()
      setStatus(s)
    } catch {
      setStatus({ installed: false, running: false, models: [] })
    }
    setChecking(false)
  }

  const runFullSetup = async () => {
    setSetupRunning(true)
    setError(null)
    const result = await window.electronAPI?.ollamaFullSetup('qwen3:4b')
    setSetupRunning(false)
    setProgress(null)
    if (result?.success) {
      await checkStatus()
      onComplete?.()
    } else {
      setError(result?.error || 'セットアップに失敗しました')
    }
  }

  const startService = async () => {
    setSetupRunning(true)
    setError(null)
    const result = await window.electronAPI?.ollamaStartService()
    setSetupRunning(false)
    if (result?.success) {
      await checkStatus()
    } else {
      setError('Ollamaの起動に失敗しました')
    }
  }

  const pullModel = async () => {
    setSetupRunning(true)
    setError(null)
    const result = await window.electronAPI?.ollamaPullModel('qwen3:4b')
    setSetupRunning(false)
    setProgress(null)
    if (result?.success) {
      await checkStatus()
    } else {
      setError(result?.error || 'モデルのダウンロードに失敗しました')
    }
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center gap-2 py-4">
        <Loader2 size={14} className="animate-spin text-lol-blue" />
        <span className="text-xs text-lol-text-light">Ollamaの状態を確認中...</span>
      </div>
    )
  }

  const hasModel = status?.models?.some(m => m.includes('qwen3'))

  // セットアップ中の進捗表示
  if (setupRunning && progress) {
    return (
      <div className="space-y-3 py-2">
        <div className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin text-lol-blue" />
          <span className="text-xs text-lol-text-light">{progress.message}</span>
        </div>
        {progress.percent != null && (
          <div className="w-full bg-lol-surface-light rounded-full h-1.5">
            <div
              className="bg-lol-blue h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        )}
      </div>
    )
  }

  // 全てOK
  if (status?.installed && status?.running && hasModel) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Check size={14} className="text-lol-accent" />
        <span className="text-xs text-lol-accent">Ollama準備完了 (qwen3モデル利用可能)</span>
        <button onClick={checkStatus} className="ml-auto text-lol-text hover:text-lol-text-light">
          <RefreshCw size={10} />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* ステータス表示 */}
      <div className="space-y-1">
        <StatusItem label="Ollama インストール" ok={status?.installed} />
        <StatusItem label="Ollama 起動中" ok={status?.running} />
        <StatusItem label="AIモデル (qwen3)" ok={hasModel} />
      </div>

      {error && (
        <p className="text-[11px] text-lol-red flex items-center gap-1">
          <AlertCircle size={10} />
          {error}
        </p>
      )}

      {/* アクションボタン */}
      {!status?.installed ? (
        <button
          onClick={runFullSetup}
          disabled={setupRunning}
          className="w-full py-2 text-xs rounded bg-lol-blue/20 text-lol-blue border border-lol-blue/30 hover:bg-lol-blue/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Download size={14} />
          ワンクリックセットアップ
          <span className="text-[10px] text-lol-text">(Ollama + AIモデル)</span>
        </button>
      ) : !status?.running ? (
        <button
          onClick={startService}
          disabled={setupRunning}
          className="w-full py-2 text-xs rounded bg-lol-blue/20 text-lol-blue border border-lol-blue/30 hover:bg-lol-blue/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Play size={14} />
          Ollamaを起動
        </button>
      ) : !hasModel ? (
        <button
          onClick={pullModel}
          disabled={setupRunning}
          className="w-full py-2 text-xs rounded bg-lol-blue/20 text-lol-blue border border-lol-blue/30 hover:bg-lol-blue/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Download size={14} />
          AIモデルをダウンロード (qwen3:4b ~2.6GB)
        </button>
      ) : null}

      {setupRunning && !progress && (
        <div className="flex items-center justify-center gap-2 py-2">
          <Loader2 size={12} className="animate-spin text-lol-blue" />
          <span className="text-[11px] text-lol-text">処理中...</span>
        </div>
      )}
    </div>
  )
}

function StatusItem({ label, ok }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className={`w-2 h-2 rounded-full ${ok ? 'bg-lol-accent' : 'bg-lol-red'}`} />
      <span className={`text-[11px] ${ok ? 'text-lol-text-light' : 'text-lol-text'}`}>{label}</span>
      <span className={`text-[10px] ml-auto ${ok ? 'text-lol-accent' : 'text-lol-red'}`}>
        {ok ? 'OK' : '未完了'}
      </span>
    </div>
  )
}

export function SettingsDialog({ onClose }) {
  const [aiOn, setAiOn] = useState(false)
  const [onTop, setOnTop] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState(null)

  // プロバイダー設定 (現在はローカルLLMのみ)
  const [providerType, setProviderType] = useState('ollama')
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434')
  const [ollamaModel, setOllamaModel] = useState('')
  const [ollamaModels, setOllamaModels] = useState([])
  const [ollamaStatus, setOllamaStatus] = useState('idle') // idle, checking, connected, error
  const [providerSaved, setProviderSaved] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // ライセンス
  const [licenseKey, setLicenseKey] = useState('')
  const [licenseStatus, setLicenseStatus] = useState(null)
  const [licenseVerifying, setLicenseVerifying] = useState(false)
  const [licenseError, setLicenseError] = useState('')

  useEffect(() => {
    window.electronAPI?.getAiStatus().then(on => setAiOn(!!on))
    window.electronAPI?.getOnTopStatus().then(on => setOnTop(!!on))

    // プロバイダー復元
    window.electronAPI?.getProvider().then(p => {
      if (p?.baseUrl) setOllamaUrl(p.baseUrl)
      if (p?.model) setOllamaModel(p.model)
      if (p?.type === 'ollama') setOllamaStatus('connected')
    })

    // ライセンス状態
    window.electronAPI?.getLicenseStatus().then(s => {
      if (s) setLicenseStatus(s)
    })
  }, [])

  const handleAiToggle = async () => {
    const next = !aiOn
    await window.electronAPI?.toggleAi(next)
    setAiOn(next)
  }

  // Ollama 接続テスト
  const checkOllama = async () => {
    setOllamaStatus('checking')
    try {
      const models = await window.electronAPI?.ollamaModels(ollamaUrl)
      if (models && models.length > 0) {
        setOllamaModels(models)
        setOllamaStatus('connected')
        if (!ollamaModel) setOllamaModel(models[0].name)
      } else {
        setOllamaStatus('error')
      }
    } catch {
      setOllamaStatus('error')
    }
  }

  // Ollama プロバイダー保存
  const saveOllamaProvider = async () => {
    const result = await window.electronAPI?.setOllamaProvider({
      baseUrl: ollamaUrl,
      model: ollamaModel || undefined,
    })
    if (result?.success) {
      setProviderSaved(true)
      setTimeout(() => setProviderSaved(false), 2000)
    }
  }

  // セットアップ完了時に自動接続
  const handleSetupComplete = async () => {
    await checkOllama()
    if (ollamaModels.length > 0 || ollamaStatus === 'connected') {
      await saveOllamaProvider()
    }
  }

  // ライセンス検証
  const verifyLicense = async () => {
    if (!licenseKey.trim()) return
    setLicenseVerifying(true)
    setLicenseError('')
    const result = await window.electronAPI?.verifyLicense(licenseKey.trim())
    setLicenseVerifying(false)
    if (result?.valid) {
      const s = await window.electronAPI?.getLicenseStatus()
      setLicenseStatus(s)
      setLicenseKey('')
    } else {
      setLicenseError(result?.error || '検証に失敗しました')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-lol-surface border border-lol-gold/30 rounded-lg w-[360px] shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-lol-gold/20">
          <span className="font-heading text-xs text-lol-gold tracking-wider">SETTINGS</span>
          <button onClick={onClose} className="text-lol-text hover:text-lol-text-light">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 最前面 ON/OFF トグル */}
          <div className="flex items-center justify-between py-2 px-3 rounded bg-lol-bg border border-lol-gold-dim/30">
            <div className="flex items-center gap-2">
              <Pin size={14} className={onTop ? 'text-lol-gold' : 'text-lol-text'} />
              <span className="text-xs text-lol-text-light">常に最前面に表示</span>
            </div>
            <button
              onClick={async () => { const next = !onTop; await window.electronAPI?.toggleOnTop(next); setOnTop(next) }}
              className={`relative w-10 h-5 rounded-full transition-colors ${onTop ? 'bg-lol-gold' : 'bg-lol-surface-light'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${onTop ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* AI ON/OFF トグル */}
          <div className="flex items-center justify-between py-2 px-3 rounded bg-lol-bg border border-lol-gold-dim/30">
            <div className="flex items-center gap-2">
              <Brain size={14} className={aiOn ? 'text-lol-blue' : 'text-lol-text'} />
              <span className="text-xs text-lol-text-light">AIビルド提案</span>
            </div>
            <button
              onClick={handleAiToggle}
              className={`relative w-10 h-5 rounded-full transition-colors ${aiOn ? 'bg-lol-blue' : 'bg-lol-surface-light'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${aiOn ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* ── ローカルLLM (Ollama) セットアップ ── */}
          <div className="space-y-2 p-3 rounded bg-lol-bg border border-lol-blue/20">
            <div className="flex items-center justify-between">
              <span className="text-xs text-lol-text-light flex items-center gap-1.5">
                <Zap size={12} className="text-lol-blue" />
                ローカルAI セットアップ
              </span>
            </div>

            <OllamaSetupWizard onComplete={handleSetupComplete} />

            {/* 詳細設定（折りたたみ） */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-[10px] text-lol-text hover:text-lol-text-light flex items-center gap-1"
            >
              <ChevronDown size={10} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              詳細設定
            </button>

            {showAdvanced && (
              <div className="space-y-2 pt-1 border-t border-lol-blue/10">
                <div className="space-y-1">
                  <label className="text-[11px] text-lol-text">Ollama URL</label>
                  <div className="flex gap-2">
                    <input
                      value={ollamaUrl}
                      onChange={e => { setOllamaUrl(e.target.value); setOllamaStatus('idle') }}
                      className="flex-1 px-2 py-1.5 bg-lol-surface border border-lol-gold-dim/30 rounded text-xs text-lol-text-light focus:outline-none focus:border-lol-blue/50"
                    />
                    <button
                      onClick={checkOllama}
                      disabled={ollamaStatus === 'checking'}
                      className="px-2 py-1 text-xs rounded border border-lol-blue/30 text-lol-blue hover:bg-lol-blue/20 disabled:opacity-40"
                    >
                      {ollamaStatus === 'checking' ? <Loader2 size={12} className="animate-spin" /> : '接続'}
                    </button>
                  </div>
                </div>

                {ollamaStatus === 'connected' && (
                  <div className="space-y-1">
                    <label className="text-[11px] text-lol-text">モデル</label>
                    <div className="relative">
                      <select
                        value={ollamaModel}
                        onChange={e => setOllamaModel(e.target.value)}
                        className="w-full px-2 py-1.5 bg-lol-surface border border-lol-gold-dim/30 rounded text-xs text-lol-text-light focus:outline-none focus:border-lol-blue/50 appearance-none"
                      >
                        {ollamaModels.map(m => (
                          <option key={m.name} value={m.name}>
                            {m.name} ({(m.size / 1e9).toFixed(1)}GB)
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={12} className="absolute right-2 top-2 text-lol-text pointer-events-none" />
                    </div>
                  </div>
                )}

                {ollamaStatus === 'error' && (
                  <p className="text-[11px] text-lol-red flex items-center gap-1">
                    <AlertCircle size={10} />
                    接続できません。
                  </p>
                )}

                {ollamaStatus === 'connected' && (
                  <button
                    onClick={saveOllamaProvider}
                    className="w-full py-1.5 text-xs rounded bg-lol-blue/20 text-lol-blue border border-lol-blue/30 hover:bg-lol-blue/30 transition-colors flex items-center justify-center gap-1"
                  >
                    {providerSaved ? <Check size={12} /> : <Cpu size={12} />}
                    {providerSaved ? '保存しました' : '設定を保存'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── ライセンス ── */}
          <div className="space-y-2 p-3 rounded bg-lol-bg border border-lol-gold-dim/30">
            <div className="flex items-center justify-between">
              <span className="text-xs text-lol-text flex items-center gap-1.5">
                <Shield size={12} />
                ライセンス
              </span>
              <span className={`text-[11px] px-2 py-0.5 rounded ${licenseStatus?.tier === 'pro' ? 'bg-lol-gold/20 text-lol-gold' : 'bg-lol-surface-light text-lol-text'}`}>
                {licenseStatus?.tier === 'pro' ? 'Pro' : 'Free'}
              </span>
            </div>

            {licenseStatus?.tier === 'pro' ? (
              <div className="space-y-1">
                <p className="text-[11px] text-lol-gold">Pro ライセンス有効 - 無制限</p>
                <button
                  onClick={async () => {
                    await window.electronAPI?.clearLicense()
                    setLicenseStatus({ tier: 'free', remainingGames: 2 })
                  }}
                  className="text-[10px] text-lol-text hover:text-lol-red transition-colors"
                >
                  ライセンスを解除
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-lol-text">
                  本日の残り試合: <span className="text-lol-blue font-bold">{licenseStatus?.remainingGames ?? 2}</span> / 2
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={licenseKey}
                    onChange={e => { setLicenseKey(e.target.value); setLicenseError('') }}
                    placeholder="ライセンスキー"
                    className="flex-1 px-2 py-1.5 bg-lol-surface border border-lol-gold-dim/30 rounded text-xs text-lol-text-light placeholder:text-lol-text/30 focus:outline-none focus:border-lol-gold/50"
                  />
                  <button
                    onClick={verifyLicense}
                    disabled={!licenseKey.trim() || licenseVerifying}
                    className="px-3 py-1.5 text-xs rounded bg-lol-gold/20 text-lol-gold border border-lol-gold/30 hover:bg-lol-gold/30 disabled:opacity-40 transition-colors"
                  >
                    {licenseVerifying ? <Loader2 size={12} className="animate-spin" /> : '認証'}
                  </button>
                </div>
                {licenseError && (
                  <p className="text-[11px] text-lol-red">{licenseError}</p>
                )}
              </div>
            )}
          </div>

          {/* キャッシュ再取得 */}
          <div className="flex items-center justify-between py-2 px-3 rounded bg-lol-bg border border-lol-gold-dim/30">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <RefreshCw size={14} className="text-lol-text" />
                <span className="text-xs text-lol-text-light">データキャッシュ</span>
              </div>
              <span className="text-[10px] text-lol-text ml-6">チャンピオン・アイテム・スキル情報</span>
            </div>
            <button
              onClick={async () => {
                setRefreshing(true)
                setRefreshResult(null)
                const r = await window.electronAPI?.refreshCache()
                setRefreshing(false)
                setRefreshResult(r?.success ? `v${r.version} 取得完了` : '取得失敗')
                setTimeout(() => setRefreshResult(null), 3000)
              }}
              disabled={refreshing}
              className="px-2 py-1 text-xs rounded border border-lol-gold-dim/30 text-lol-text-light hover:bg-lol-gold/20 hover:text-lol-gold transition-colors disabled:opacity-40 flex items-center gap-1"
            >
              {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {refreshing ? '取得中...' : '再取得'}
            </button>
          </div>
          {refreshResult && (
            <p className="text-[11px] text-lol-blue text-center">{refreshResult}</p>
          )}

          {/* ゲームログ */}
          <div className="flex items-center justify-between py-2 px-3 rounded bg-lol-bg border border-lol-gold-dim/30">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <FolderOpen size={14} className="text-lol-text" />
                <span className="text-xs text-lol-text-light">ゲームログ</span>
              </div>
              <span className="text-[10px] text-lol-text ml-6">試合ごとの詳細デバッグログ</span>
            </div>
            <button
              onClick={() => window.electronAPI?.openGameLogFolder()}
              className="px-2 py-1 text-xs rounded border border-lol-gold-dim/30 text-lol-text-light hover:bg-lol-gold/20 hover:text-lol-gold transition-colors flex items-center gap-1"
            >
              <FolderOpen size={12} />
              フォルダを開く
            </button>
          </div>

          {/* バージョン情報 & 免責表記 */}
          <div className="pt-2 border-t border-lol-gold-dim/20 text-center space-y-2">
            <p className="text-[10px] text-lol-text/50">
              ろるさぽくん v{__APP_VERSION__}
            </p>
            <p className="text-[9px] text-lol-text/30 leading-relaxed">
              ろるさぽくん isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
