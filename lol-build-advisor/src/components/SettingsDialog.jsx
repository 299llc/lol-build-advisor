import { useState, useEffect } from 'react'
import { X, Loader2, RefreshCw, FolderOpen, Zap, FileText, Scale, Crown, Wrench, Layers, Infinity, Gift } from 'lucide-react'
import { LegalDialog } from './LegalDialog'

export function SettingsDialog({ onClose, isDev }) {
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState(null)
  const [legalPage, setLegalPage] = useState(null) // 'privacy' | 'disclaimer' | null

  // オーバーレイ自動表示設定
  const [autoOverlay, setAutoOverlay] = useState(false)

  useEffect(() => {
    window.electronAPI?.getAutoOverlay?.().then(v => setAutoOverlay(!!v))
  }, [])

  const handleAutoOverlayChange = async (checked) => {
    setAutoOverlay(checked)
    await window.electronAPI?.setAutoOverlay?.(checked)
  }

  // デバッグ設定
  const [skipTimeLimit, setSkipTimeLimit] = useState(false)

  useEffect(() => {
    if (isDev) {
      window.electronAPI?.getDebugSettings?.().then(s => {
        if (s?.skipTimeLimit) setSkipTimeLimit(true)
      })
    }
  }, [isDev])

  const handleSkipTimeLimitChange = async (checked) => {
    setSkipTimeLimit(checked)
    await window.electronAPI?.setDebugSettings?.({ skipTimeLimit: checked })
  }

  // TODO: 課金基盤整備後に実ロジックへ差し替え
  // 初期リリースは無制限開放。次期リリースで有料プラン導入予定。

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
          {/* ── 初期リリース特典バナー ── */}
          <div className="relative overflow-hidden p-3 rounded bg-gradient-to-r from-lol-blue/15 to-lol-gold/10 border border-lol-blue/30">
            <div className="flex items-start gap-2.5">
              <div className="shrink-0 mt-0.5 p-1.5 rounded-full bg-lol-blue/20">
                <Gift size={14} className="text-lol-blue" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold tracking-wider text-lol-gold bg-lol-gold/15 px-1.5 py-0.5 rounded">
                    EARLY ACCESS
                  </span>
                </div>
                <p className="text-xs text-lol-text-light leading-relaxed">
                  初期リリース特典として<br />
                  <span className="text-lol-blue font-bold flex items-center gap-1 mt-0.5">
                    <Infinity size={14} />
                    AI利用回数が無制限!
                  </span>
                </p>
                <p className="text-[10px] text-lol-text/50 leading-relaxed">
                  今後のアップデートで有料プランを導入予定です。今のうちにたくさんご活用ください!
                </p>
              </div>
            </div>
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

          {/* オーバーレイ自動表示 */}
          <div className="flex items-center justify-between py-2 px-3 rounded bg-lol-bg border border-lol-gold-dim/30">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <Layers size={14} className="text-lol-text" />
                <span className="text-xs text-lol-text-light">オーバーレイ自動表示</span>
              </div>
              <span className="text-[10px] text-lol-text ml-6">試合開始時に自動で表示し、終了時に閉じる</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoOverlay}
              onClick={() => handleAutoOverlayChange(!autoOverlay)}
              className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors duration-200 ${autoOverlay ? 'bg-lol-blue' : 'bg-lol-surface-light'}`}
            >
              <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transform transition-transform duration-200 mt-0.5 ${autoOverlay ? 'translate-x-3.5 ml-0' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* ── 開発者メニュー（デバッグ時のみ） ── */}
          {isDev && (
            <div className="space-y-2 p-3 rounded bg-lol-bg border border-lol-red/20">
              <span className="text-xs text-lol-red flex items-center gap-1.5">
                <Wrench size={12} />
                開発者メニュー
              </span>
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <FolderOpen size={12} className="text-lol-text" />
                    <span className="text-[11px] text-lol-text-light">ゲームログ</span>
                  </div>
                  <span className="text-[10px] text-lol-text ml-5">試合ごとの詳細デバッグログ</span>
                </div>
                <button
                  onClick={() => window.electronAPI?.openGameLogFolder()}
                  className="px-2 py-1 text-[11px] rounded border border-lol-red/20 text-lol-text-light hover:bg-lol-red/10 hover:text-lol-red transition-colors flex items-center gap-1"
                >
                  <FolderOpen size={11} />
                  フォルダを開く
                </button>
              </div>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-[11px] text-lol-text-light">15分待たずにビルド提案を開始</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={skipTimeLimit}
                  onClick={() => handleSkipTimeLimitChange(!skipTimeLimit)}
                  className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors duration-200 ${skipTimeLimit ? 'bg-lol-blue' : 'bg-lol-surface-light'}`}
                >
                  <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transform transition-transform duration-200 mt-0.5 ${skipTimeLimit ? 'translate-x-3.5 ml-0' : 'translate-x-0.5'}`} />
                </button>
              </label>
            </div>
          )}

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
