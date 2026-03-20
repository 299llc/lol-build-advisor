import { useState } from 'react'
import { Swords, ChevronDown, ChevronUp, AlertTriangle, Zap, Crosshair, CheckCircle, Loader2 } from 'lucide-react'

export function MatchupTip({ tip, loading, laningOver = false }) {
  const [manualToggle, setManualToggle] = useState(null)
  const expanded = manualToggle !== null ? manualToggle : !laningOver

  // tipもloadingもなければ何も出さない
  if (!tip && !loading) return null

  const opponent = tip?.opponent || (typeof loading === 'object' ? loading.opponent : null)

  return (
    <div className="rounded bg-lol-surface-light/50 border border-lol-blue/30 overflow-hidden">
      {/* ヘッダー */}
      <button
        onClick={() => tip && setManualToggle(!expanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-lol-surface-light/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Swords size={14} className="text-lol-blue shrink-0" />
          <span className="font-heading text-xs text-lol-blue tracking-wider">
            {opponent ? `VS ${opponent.toUpperCase()}` : 'MATCHUP'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 size={14} className="text-lol-blue animate-spin shrink-0" />}
          {tip && (
            expanded
              ? <ChevronUp size={12} className="text-lol-text-dim shrink-0" />
              : <ChevronDown size={12} className="text-lol-text-dim shrink-0" />
          )}
        </div>
      </button>

      {/* コンテンツ */}
      {tip && expanded ? (
        <div className="px-3 pb-2 flex flex-col gap-1.5">
          {/* Summary */}
          {tip.summary && (
            <p className="text-xs text-lol-text-light leading-snug">{tip.summary}</p>
          )}

          {/* Tips — やるべきこと */}
          {tip.tips?.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <CheckCircle size={11} className="text-lol-blue shrink-0" />
                <span className="text-[10px] font-bold text-lol-blue">やるべきこと</span>
              </div>
              <ul className="flex flex-col gap-0.5 pl-0.5">
                {tip.tips.map((t, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-lol-text-light">
                    <span className="text-lol-blue shrink-0 mt-0.5">-</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Playstyle / 勝ち筋 */}
          {tip.playstyle && (
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <Crosshair size={11} className="text-lol-blue shrink-0" />
                <span className="text-[10px] font-bold text-lol-blue">勝ち筋</span>
              </div>
              <div className="text-xs text-lol-text-light px-1.5 py-1 rounded bg-lol-blue/8 border border-lol-blue/15">
                {tip.playstyle}
              </div>
            </div>
          )}

          {/* Danger — 警戒すること */}
          {tip.danger && (
            <div className="flex items-start gap-1.5 text-xs">
              <AlertTriangle size={11} className="text-lol-red shrink-0 mt-0.5" />
              <span className="text-lol-red/90"><span className="font-bold">警戒</span> {tip.danger}</span>
            </div>
          )}

          {/* Power Spike — パワースパイク */}
          {tip.power_spike && (
            <div className="flex items-start gap-1.5 text-xs">
              <Zap size={11} className="text-lol-gold shrink-0 mt-0.5" />
              <span className="text-lol-gold/90"><span className="font-bold">パワースパイク</span> {tip.power_spike}</span>
            </div>
          )}
        </div>
      ) : !tip && loading ? (
        <div className="p-3 text-center">
          <p className="text-xs text-lol-text">マッチアップを分析中...</p>
        </div>
      ) : null}
    </div>
  )
}
