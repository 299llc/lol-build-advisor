import { useState, useEffect } from 'react'
import { X, Check, Loader2, AlertCircle, RefreshCw, FolderOpen, ChevronDown, Download, Play, Zap, Trash2, FileText, Scale, Cloud, Monitor } from 'lucide-react'
import { LegalDialog } from './LegalDialog'

// ダウンロード可能なモデル一覧
const AVAILABLE_MODELS = [
  { id: 'qwen3.5:0.8b', label: 'Qwen3.5 0.8B', desc: '超軽量', sizeBytes: 0.6e9, vram: '2GB+' },
  { id: 'qwen3.5:2b', label: 'Qwen3.5 2B', desc: '軽量', sizeBytes: 1.5e9, vram: '3GB+' },
  { id: 'qwen3.5:4b', label: 'Qwen3.5 4B', desc: '高速', sizeBytes: 2.7e9, vram: '4GB+' },
  { id: 'qwen3.5:9b', label: 'Qwen3.5 9B', desc: '高品質（推奨）', sizeBytes: 6.6e9, vram: '8GB+' },
  { id: 'qwen3.5:27b', label: 'Qwen3.5 27B', desc: '最高精度', sizeBytes: 17e9, vram: '24GB+' },
]

// インストール済みモデルとAVAILABLE_MODELSのマッチング (名前一致 or 同ファミリ+近似サイズ)
function findInstalledModel(ollamaModels, am) {
  return ollamaModels.find(m => {
    if (m.name === am.id) return true
    // qwen3.5:latest と qwen3.5:9b のようなケース → ベース名+サイズで判定
    const base = am.id.split(':')[0]
    if (m.name.startsWith(base) && Math.abs(m.size - am.sizeBytes) / am.sizeBytes < 0.3) return true
    return false
  })
}

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
    const result = await window.electronAPI?.ollamaFullSetup('qwen3.5:9b')
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
      setError('AIエンジンの起動に失敗しました')
    }
  }

  const pullModel = async () => {
    setSetupRunning(true)
    setError(null)
    const result = await window.electronAPI?.ollamaPullModel('qwen3.5:9b')
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
        <span className="text-xs text-lol-text-light">AIの状態を確認中...</span>
      </div>
    )
  }

  const hasModel = status?.models?.some(m => m.includes('qwen'))

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
        <span className="text-xs text-lol-accent">AI準備完了</span>
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
        <StatusItem label="AIエンジン" ok={status?.installed} />
        <StatusItem label="AIエンジン起動中" ok={status?.running} />
        <StatusItem label="AIモデル" ok={hasModel} />
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
          <span className="text-[10px] text-lol-text">(AIエンジン + モデル)</span>
        </button>
      ) : !status?.running ? (
        <button
          onClick={startService}
          disabled={setupRunning}
          className="w-full py-2 text-xs rounded bg-lol-blue/20 text-lol-blue border border-lol-blue/30 hover:bg-lol-blue/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Play size={14} />
          AIエンジンを起動
        </button>
      ) : !hasModel ? (
        <button
          onClick={pullModel}
          disabled={setupRunning}
          className="w-full py-2 text-xs rounded bg-lol-blue/20 text-lol-blue border border-lol-blue/30 hover:bg-lol-blue/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Download size={14} />
          AIモデルをダウンロード (~6.6GB)
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
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState(null)
  const [legalPage, setLegalPage] = useState(null) // 'privacy' | 'disclaimer' | null

  // プロバイダー設定
  const [providerType, setProviderType] = useState('ollama') // 'ollama' | 'cloud'
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434')
  const [ollamaModel, setOllamaModel] = useState('')
  const [activeModel, setActiveModel] = useState('') // 現在使用中のモデル名
  const [ollamaModels, setOllamaModels] = useState([])
  const [ollamaStatus, setOllamaStatus] = useState('connected')
  const [showModelManager, setShowModelManager] = useState(false)
  const [pullingModel, setPullingModel] = useState(null) // ダウンロード中のモデルID
  const [pullProgress, setPullProgress] = useState(null)

  // クラウドプロバイダー設定
  const [cloudSubType, setCloudSubType] = useState('bedrock') // 'bedrock' | 'anthropic' | 'gemini'
  const [cloudStatus, setCloudStatus] = useState(null) // 'connected' | 'error' | 'validating' | null

  useEffect(() => {
    window.electronAPI?.getAiStatus().then(on => setAiOn(!!on))
    // プロバイダー復元
    window.electronAPI?.getProvider().then(p => {
      if (p?.type === 'bedrock') {
        setProviderType('cloud')
        setCloudSubType('bedrock')
        setCloudStatus('connected')
      } else if (p?.type === 'anthropic') {
        setProviderType('cloud')
        setCloudSubType('anthropic')
        setCloudStatus('connected')
      } else if (p?.type === 'gemini') {
        setProviderType('cloud')
        setCloudSubType('gemini')
        setCloudStatus('connected')
      } else {
        setProviderType('ollama')
      }
      if (p?.baseUrl) setOllamaUrl(p.baseUrl)
      const model = p?.model || (p?.type === 'ollama' ? 'qwen3.5:9b' : '')
      if (model) { setOllamaModel(model); setActiveModel(model) }
      if (p?.type === 'ollama' || !p?.type) {
        setOllamaStatus('connected')
        const url = p?.baseUrl || 'http://localhost:11434'
        window.electronAPI?.ollamaModels(url).then(models => {
          if (models?.length > 0) {
            setOllamaModels(models)
            if (model && !models.some(m => m.name === model)) {
              setOllamaModel(models[0].name)
            }
          }
        }).catch(() => {})
      }
    })

    // モデルDL進捗
    const unsubProgress = window.electronAPI?.onOllamaSetupProgress?.(setPullProgress)
    return () => unsubProgress?.()
  }, [])

  const handleAiToggle = async () => {
    const next = !aiOn
    await window.electronAPI?.toggleAi(next)
    setAiOn(next)
  }

  // モデル追加ダウンロード
  const pullNewModel = async (modelId) => {
    setPullingModel(modelId)
    setPullProgress(null)
    const result = await window.electronAPI?.ollamaPullModel(modelId)
    setPullingModel(null)
    setPullProgress(null)
    if (result?.success) {
      // モデル一覧を再取得
      const models = await window.electronAPI?.ollamaModels(ollamaUrl)
      if (models?.length > 0) setOllamaModels(models)
    }
  }

  // モデルを削除
  const deleteModel = async (modelId) => {
    await window.electronAPI?.ollamaDeleteModel?.(modelId)
    const models = await window.electronAPI?.ollamaModels(ollamaUrl)
    if (models) setOllamaModels(models)
    // 削除したのが使用中なら先頭に切り替え
    if (activeModel === modelId && models?.length > 0) {
      setActiveModel(models[0].name)
      setOllamaModel(models[0].name)
      await window.electronAPI?.setOllamaProvider({ baseUrl: ollamaUrl, model: models[0].name })
    }
  }

  // セットアップ完了時にモデル一覧取得
  const handleSetupComplete = async () => {
    try {
      const models = await window.electronAPI?.ollamaModels(ollamaUrl)
      if (models?.length > 0) {
        setOllamaModels(models)
        setOllamaStatus('connected')
        if (!ollamaModel) setOllamaModel(models[0].name)
        await window.electronAPI?.setOllamaProvider({ baseUrl: ollamaUrl, model: models[0].name })
      }
    } catch {}
  }

  // プロバイダー切り替え
  const switchProvider = async (type) => {
    setProviderType(type)
    if (type === 'cloud') {
      connectCloud(cloudSubType)
    }
  }

  // クラウドサブタイプ接続
  const connectCloud = async (subType) => {
    setCloudSubType(subType)
    setCloudStatus('validating')
    if (subType === 'bedrock') {
      const result = await window.electronAPI?.setBedrockProvider()
      setCloudStatus(result?.success ? 'connected' : 'error')
    } else if (subType === 'anthropic') {
      const result = await window.electronAPI?.setAnthropicProvider()
      setCloudStatus(result?.success ? 'connected' : 'error')
    } else if (subType === 'gemini') {
      const result = await window.electronAPI?.setGeminiProvider()
      setCloudStatus(result?.success ? 'connected' : 'error')
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
          {/* ── AI セットアップ ── */}
          <div className="space-y-2 p-3 rounded bg-lol-bg border border-lol-blue/20">
            <div className="flex items-center justify-between">
              <span className="text-xs text-lol-text-light flex items-center gap-1.5">
                <Zap size={12} className="text-lol-blue" />
                AI セットアップ
              </span>
            </div>

            <OllamaSetupWizard onComplete={handleSetupComplete} />

            {/* モデル選択＋管理 */}
            {ollamaStatus === 'connected' && (
              <div className="space-y-2 pt-1 border-t border-lol-blue/10">
                {/* 使用モデル選択 */}
                {ollamaModels.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-lol-text">使用モデル</label>
                    <div className="relative">
                      <select
                        value={activeModel}
                        onChange={async (e) => {
                          const model = e.target.value
                          setActiveModel(model)
                          setOllamaModel(model)
                          await window.electronAPI?.setOllamaProvider({ baseUrl: ollamaUrl, model })
                        }}
                        className="w-full px-2 py-1.5 bg-lol-surface border border-lol-gold-dim/30 rounded text-[11px] text-lol-text-light focus:outline-none focus:border-lol-blue/50 appearance-none pr-6"
                      >
                        {ollamaModels.map(m => {
                          const known = AVAILABLE_MODELS.find(am => findInstalledModel([m], am))
                          return (
                            <option key={m.name} value={m.name}>
                              {known ? `${known.label} (${(m.size / 1e9).toFixed(1)}GB)` : `${m.name} (${(m.size / 1e9).toFixed(1)}GB)`}
                            </option>
                          )
                        })}
                      </select>
                      <ChevronDown size={10} className="absolute right-2 top-2.5 text-lol-text pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* モデルDL一覧 */}
                <button
                  onClick={() => setShowModelManager(!showModelManager)}
                  className="text-[10px] text-lol-text hover:text-lol-text-light flex items-center gap-1"
                >
                  <ChevronDown size={10} className={`transition-transform ${showModelManager ? 'rotate-180' : ''}`} />
                  モデルを追加・管理
                </button>

                {showModelManager && (
                  <div className="space-y-1.5">
                    {AVAILABLE_MODELS.map(am => {
                      const matchedModel = findInstalledModel(ollamaModels, am)
                      const installed = !!matchedModel
                      const isPulling = pullingModel === am.id
                      const isActive = matchedModel && (activeModel === matchedModel.name)
                      return (
                        <div key={am.id} className={`flex items-center gap-2 px-2 py-1.5 rounded text-[11px] ${isActive ? 'bg-lol-blue/10 border border-lol-blue/30' : 'bg-lol-surface border border-lol-gold-dim/20'}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-lol-text-light font-medium">{am.label}</span>
                              {isActive && <span className="text-[9px] text-lol-blue">使用中</span>}
                            </div>
                            <span className="text-[9px] text-lol-text/50">{am.desc} / 利用想定メモリ {am.vram}</span>
                          </div>
                          {isPulling ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <Loader2 size={10} className="animate-spin text-lol-blue" />
                              <span className="text-[9px] text-lol-blue">
                                {pullProgress?.percent != null ? `${pullProgress.percent}%` : 'DL中...'}
                              </span>
                            </div>
                          ) : installed ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <Check size={10} className="text-lol-accent" />
                              {!isActive && ollamaModels.length > 1 && (
                                <button
                                  onClick={() => deleteModel(matchedModel.name)}
                                  className="text-lol-text/30 hover:text-lol-red transition-colors"
                                  title="削除"
                                >
                                  <Trash2 size={10} />
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => pullNewModel(am.id)}
                              disabled={!!pullingModel}
                              className="px-2 py-0.5 text-[10px] rounded bg-lol-blue/20 text-lol-blue border border-lol-blue/30 hover:bg-lol-blue/30 disabled:opacity-40 transition-colors shrink-0"
                            >
                              DL
                            </button>
                          )}
                        </div>
                      )
                    })}
                    {pullingModel && pullProgress?.percent != null && (
                      <div className="w-full bg-lol-surface-light rounded-full h-1">
                        <div
                          className="bg-lol-blue h-1 rounded-full transition-all duration-300"
                          style={{ width: `${pullProgress.percent}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* ── プロバイダー選択 ── */}
          <div className="space-y-2 p-3 rounded bg-lol-bg border border-lol-gold-dim/30">
            <span className="text-xs text-lol-text-light">AIプロバイダー</span>
            <div className="flex gap-2">
              <button
                onClick={() => switchProvider('ollama')}
                className={`flex-1 py-2 text-xs rounded border transition-colors flex items-center justify-center gap-1.5 ${
                  providerType === 'ollama'
                    ? 'bg-lol-blue/20 text-lol-blue border-lol-blue/40'
                    : 'bg-lol-surface text-lol-text border-lol-gold-dim/30 hover:border-lol-blue/30'
                }`}
              >
                <Monitor size={12} />
                ローカル (Free)
              </button>
              <button
                onClick={() => switchProvider('cloud')}
                className={`flex-1 py-2 text-xs rounded border transition-colors flex items-center justify-center gap-1.5 ${
                  providerType === 'cloud'
                    ? 'bg-lol-gold/20 text-lol-gold border-lol-gold/40'
                    : 'bg-lol-surface text-lol-text border-lol-gold-dim/30 hover:border-lol-gold/30'
                }`}
              >
                <Cloud size={12} />
                クラウド (Pro)
              </button>
            </div>
            {providerType === 'cloud' && (
              <div className="space-y-2 pt-1">
                {/* サブタイプ切り替え */}
                <div className="flex gap-1">
                  <button
                    onClick={() => connectCloud('bedrock')}
                    className={`flex-1 py-1 text-[10px] rounded transition-colors ${
                      cloudSubType === 'bedrock'
                        ? 'bg-lol-gold/15 text-lol-gold border border-lol-gold/30'
                        : 'text-lol-text border border-lol-gold-dim/20 hover:border-lol-gold/20'
                    }`}
                  >
                    Bedrock (AWS)
                  </button>
                  <button
                    onClick={() => connectCloud('anthropic')}
                    className={`flex-1 py-1 text-[10px] rounded transition-colors ${
                      cloudSubType === 'anthropic'
                        ? 'bg-lol-gold/15 text-lol-gold border border-lol-gold/30'
                        : 'text-lol-text border border-lol-gold-dim/20 hover:border-lol-gold/20'
                    }`}
                  >
                    Anthropic API
                  </button>
                  <button
                    onClick={() => connectCloud('gemini')}
                    className={`flex-1 py-1 text-[10px] rounded transition-colors ${
                      cloudSubType === 'gemini'
                        ? 'bg-lol-gold/15 text-lol-gold border border-lol-gold/30'
                        : 'text-lol-text border border-lol-gold-dim/20 hover:border-lol-gold/20'
                    }`}
                  >
                    Gemini
                  </button>
                </div>

                {/* Bedrock ステータス */}
                {cloudSubType === 'bedrock' && (
                  <div className="flex items-center gap-2 px-1">
                    <div className={`w-2 h-2 rounded-full ${cloudStatus === 'connected' ? 'bg-lol-accent' : cloudStatus === 'error' ? 'bg-lol-red' : cloudStatus === 'validating' ? 'bg-lol-blue animate-pulse' : 'bg-lol-text/30'}`} />
                    <span className="text-[11px] text-lol-text-light">
                      {cloudStatus === 'connected' ? 'Bedrock (AWS) 接続済み' : cloudStatus === 'error' ? 'Bedrock 接続失敗 — .env を確認してください' : cloudStatus === 'validating' ? '接続確認中...' : '未接続'}
                    </span>
                  </div>
                )}

                {/* Anthropic ステータス */}
                {cloudSubType === 'anthropic' && (
                  <div className="flex items-center gap-2 px-1">
                    <div className={`w-2 h-2 rounded-full ${cloudStatus === 'connected' ? 'bg-lol-accent' : cloudStatus === 'error' ? 'bg-lol-red' : cloudStatus === 'validating' ? 'bg-lol-blue animate-pulse' : 'bg-lol-text/30'}`} />
                    <span className="text-[11px] text-lol-text-light">
                      {cloudStatus === 'connected' ? 'Anthropic API 接続済み' : cloudStatus === 'error' ? 'Anthropic 接続失敗 — .env を確認してください' : cloudStatus === 'validating' ? '接続確認中...' : '未接続'}
                    </span>
                  </div>
                )}

                {/* Gemini ステータス */}
                {cloudSubType === 'gemini' && (
                  <div className="flex items-center gap-2 px-1">
                    <div className={`w-2 h-2 rounded-full ${cloudStatus === 'connected' ? 'bg-lol-accent' : cloudStatus === 'error' ? 'bg-lol-red' : cloudStatus === 'validating' ? 'bg-lol-blue animate-pulse' : 'bg-lol-text/30'}`} />
                    <span className="text-[11px] text-lol-text-light">
                      {cloudStatus === 'connected' ? 'Gemini API 接続済み' : cloudStatus === 'error' ? 'Gemini 接続失敗 — .env を確認してください' : cloudStatus === 'validating' ? '接続確認中...' : '未接続'}
                    </span>
                  </div>
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

          {/* バージョン情報 & 法的情報 */}
          <div className="pt-2 border-t border-lol-gold-dim/20 text-center space-y-2">
            <p className="text-[10px] text-lol-text/50">
              ろるさぽくん v{__APP_VERSION__}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setLegalPage('privacy')}
                className="text-[10px] text-lol-text/40 hover:text-lol-blue transition-colors flex items-center gap-1"
              >
                <FileText size={10} />
                プライバシーポリシー
              </button>
              <span className="text-lol-text/20">|</span>
              <button
                onClick={() => setLegalPage('disclaimer')}
                className="text-[10px] text-lol-text/40 hover:text-lol-blue transition-colors flex items-center gap-1"
              >
                <Scale size={10} />
                免責事項
              </button>
            </div>
            <p className="text-[9px] text-lol-text/30 leading-relaxed">
              ろるさぽくん isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
            </p>
          </div>
        </div>
      </div>

      {legalPage && (
        <LegalDialog page={legalPage} onClose={() => setLegalPage(null)} />
      )}
    </div>
  )
}
