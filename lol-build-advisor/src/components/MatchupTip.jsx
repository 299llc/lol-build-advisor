import { useState } from 'react'
import { Swords, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'

export function MatchupTip({ tip, loading, laningOver = false }) {
  const [manualToggle, setManualToggle] = useState(null)
  const expanded = manualToggle !== null ? manualToggle : !laningOver

  if (!tip && !loading) return null

  const opponent = tip?.opponent || (typeof loading === 'object' ? loading.opponent : null)

  return (
    <div style={{ border: '1px solid rgba(10,200,185,0.3)', borderRadius: 6, background: 'rgba(10,20,40,0.5)', flexShrink: 0 }}>
      {/* ヘッダー */}
      <button
        onClick={() => tip && setManualToggle(!expanded)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Swords size={14} style={{ color: '#0AC8B9', flexShrink: 0 }} />
          <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 12, color: '#0AC8B9', letterSpacing: '0.1em' }}>
            {opponent ? `VS ${opponent.toUpperCase()}` : 'MATCHUP'}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {loading && <Loader2 size={14} style={{ color: '#0AC8B9', animation: 'spin 1s linear infinite' }} />}
          {tip && (expanded ? <ChevronUp size={12} style={{ color: '#888' }} /> : <ChevronDown size={12} style={{ color: '#888' }} />)}
        </span>
      </button>

      {/* コンテンツ */}
      {tip && expanded && (
        <div style={{ padding: '0 12px 10px', fontSize: 12, lineHeight: 1.6, color: '#ccc', userSelect: 'text', cursor: 'text', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
          {/* Summary */}
          {tip.summary && <p style={{ margin: '0 0 6px' }}>{tip.summary}</p>}

          {/* Tips */}
          {tip.tips?.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <p style={{ fontSize: 10, fontWeight: 'bold', color: '#0AC8B9', margin: '0 0 2px' }}>やるべきこと</p>
              {tip.tips.map((t, i) => (
                <p key={i} style={{ margin: '0 0 3px', paddingLeft: 8 }}>
                  <span style={{ color: '#0AC8B9' }}>- </span>{t}
                </p>
              ))}
            </div>
          )}

          {/* Playstyle */}
          {tip.playstyle && (
            <div style={{ marginBottom: 6 }}>
              <p style={{ fontSize: 10, fontWeight: 'bold', color: '#0AC8B9', margin: '0 0 2px' }}>勝ち筋</p>
              <p style={{ margin: 0, padding: '4px 6px', borderRadius: 4, background: 'rgba(10,200,185,0.08)', border: '1px solid rgba(10,200,185,0.15)' }}>
                {tip.playstyle}
              </p>
            </div>
          )}

          {/* Danger */}
          {tip.danger && (
            <p style={{ margin: '0 0 4px', color: 'rgba(232,64,87,0.9)' }}>
              <span style={{ fontWeight: 'bold' }}>⚠ 警戒</span> {tip.danger}
            </p>
          )}

          {/* Power Spike */}
          {tip.power_spike && (
            <p style={{ margin: 0, color: 'rgba(200,170,110,0.9)' }}>
              <span style={{ fontWeight: 'bold' }}>⚡ パワースパイク</span> {tip.power_spike}
            </p>
          )}
        </div>
      )}

      {!tip && loading && (
        <div style={{ padding: 12, textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: '#888', margin: 0 }}>マッチアップを分析中...</p>
        </div>
      )}
    </div>
  )
}
