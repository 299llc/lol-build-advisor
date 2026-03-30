import { useState } from 'react'
import { Swords, ChevronDown, ChevronUp, Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react'

// パワーカーブバー
function PowerCurveBar({ powerCurve }) {
  if (!powerCurve?.win_rates) return null
  const { win_rates, trend } = powerCurve
  const phases = [
    { label: '序盤', key: 'early', rate: win_rates.early },
    { label: '中盤', key: 'mid', rate: win_rates.mid },
    { label: '終盤', key: 'late', rate: win_rates.late },
  ].filter(p => p.rate !== null)

  if (phases.length === 0) return null

  const getColor = (rate) => {
    if (rate >= 53) return '#4ade80'   // green
    if (rate >= 50) return '#0AC8B9'   // teal
    if (rate >= 47) return '#facc15'   // yellow
    return '#E84057'                   // red
  }

  const TrendIcon = trend === 'scaling' ? TrendingUp : trend === 'early_dominant' ? TrendingDown : Minus
  const trendLabel = trend === 'scaling' ? 'スケーリング型' : trend === 'early_dominant' ? '序盤型' : '安定型'
  const trendColor = trend === 'scaling' ? '#4ade80' : trend === 'early_dominant' ? '#facc15' : '#888'

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 'bold', color: '#C8AA6E' }}>⚡ パワーカーブ</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: trendColor }}>
          <TrendIcon size={10} />
          {trendLabel}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 2, height: 24 }}>
        {phases.map(p => (
          <div
            key={p.key}
            style={{
              flex: 1, borderRadius: 3, position: 'relative',
              background: `${getColor(p.rate)}20`,
              border: `1px solid ${getColor(p.rate)}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 9, color: '#888' }}>{p.label}</span>
            <span style={{ fontSize: 10, fontWeight: 'bold', color: getColor(p.rate), marginLeft: 3 }}>
              {p.rate}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MatchupTip({ tip, loading, laningOver = false }) {
  const [manualToggle, setManualToggle] = useState(null)
  const expanded = manualToggle !== null ? manualToggle : !laningOver

  if (!tip && !loading) return null

  const opponent = tip?.opponent || (typeof loading === 'object' ? loading.opponent : null)
  const opponentPartner = tip?.opponentPartner || (typeof loading === 'object' ? loading.opponentPartner : null)

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
            {opponent ? `VS ${opponent.toUpperCase()}${opponentPartner ? ` & ${opponentPartner.toUpperCase()}` : ''}` : 'MATCHUP'}
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
          {/* Power Curve (統計ベース) */}
          {tip.power_curve && <PowerCurveBar powerCurve={tip.power_curve} />}

          {/* Power Spike (AIテキスト) */}
          {tip.power_spike && (
            <p style={{ margin: '0 0 6px', color: 'rgba(200,170,110,0.9)' }}>
              {!tip.power_curve && <span style={{ fontWeight: 'bold' }}>⚡ パワースパイク </span>}
              {tip.power_spike}
            </p>
          )}

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
