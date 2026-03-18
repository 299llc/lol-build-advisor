import { Settings, Minus, X, Bug, PanelTop } from 'lucide-react'

export function TitleBar({ status, onSettings, onDebug, onCompactView, compactOpen }) {
  return (
    <div className="drag-region flex items-center justify-between px-3 py-2 bg-lol-surface border-b border-lol-gold-dim/30">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${status === 'ingame' ? 'bg-lol-blue' : status === 'ended' ? 'bg-lol-red' : 'bg-lol-gold animate-pulse'}`} />
        <span className="font-heading text-sm text-lol-gold tracking-wider">
          ろるさぽくん
        </span>
      </div>

      <div className="no-drag flex items-center gap-1">
        {onCompactView && (
          <button
            onClick={onCompactView}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors ${
              compactOpen
                ? 'border-lol-blue/60 bg-lol-blue/30 text-lol-blue'
                : 'border-lol-blue/30 bg-lol-blue/10 text-lol-blue hover:bg-lol-blue/20'
            }`}
            title={compactOpen ? 'オーバーレイを閉じる' : 'オーバーレイを開く（ゲーム上に重ねて表示）'}
          >
            <PanelTop size={12} />
            <span className="text-[10px] font-medium tracking-wide">OVERLAY</span>
          </button>
        )}
        {onDebug && (
          <button
            onClick={onDebug}
            className="p-1 rounded hover:bg-lol-surface-light text-lol-text hover:text-lol-blue transition-colors"
            title="AI Debug Log"
          >
            <Bug size={14} />
          </button>
        )}
        <button
          onClick={onSettings}
          className="p-1 rounded hover:bg-lol-surface-light text-lol-text hover:text-lol-gold transition-colors"
        >
          <Settings size={14} />
        </button>
        <button
          onClick={() => window.electronAPI?.minimize()}
          className="p-1 rounded hover:bg-lol-surface-light text-lol-text hover:text-lol-text-light transition-colors"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => window.electronAPI?.close()}
          className="p-1 rounded hover:bg-lol-red/20 text-lol-text hover:text-lol-red transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
