import { useState } from 'react'
import { Swords, ChevronDown, ChevronUp, Loader2, TrendingUp, TrendingDown, Minus, Users, Target } from 'lucide-react'

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

// チーム戦略表示
function TeamStrategyContent({ strategy, powerCurve }) {
  if (!strategy) return null
  const isMid = strategy._phase === 'mid'
  const accentColor = isMid ? '#C8AA6E' : '#0AC8B9'

  return (
    <div style={{ padding: '0 12px 10px', fontSize: 12, lineHeight: 1.6, color: '#ccc', userSelect: 'text', cursor: 'text', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
      {powerCurve && <PowerCurveBar powerCurve={powerCurve} />}
      {/* 中盤: objective_priority, your_role, rotation, watch_out */}
      {isMid && (
        <>
          {strategy.objective_priority && (
            <div style={{ marginBottom: 6 }}>
              <p style={{ fontSize: 10, fontWeight: 'bold', color: accentColor, margin: '0 0 2px' }}>次のオブジェクト</p>
              <p style={{ margin: 0, padding: '4px 6px', borderRadius: 4, background: 'rgba(200,170,110,0.08)', border: '1px solid rgba(200,170,110,0.15)' }}>
                {strategy.objective_priority}
              </p>
            </div>
          )}
          {strategy.your_role && (
            <div style={{ marginBottom: 6 }}>
              <p style={{ fontSize: 10, fontWeight: 'bold', color: '#0AC8B9', margin: '0 0 2px' }}>あなたの動き</p>
              <p style={{ margin: 0, padding: '4px 6px', borderRadius: 4, background: 'rgba(10,200,185,0.08)', border: '1px solid rgba(10,200,185,0.15)' }}>
                {strategy.your_role}
              </p>
            </div>
          )}
          {strategy.rotation && (
            <p style={{ margin: '0 0 6px' }}><span style={{ fontWeight: 'bold', color: accentColor }}>🗺 ローテ </span>{strategy.rotation}</p>
          )}
        </>
      )}

      {/* 終盤: win_condition, teamfight, your_role, closing, watch_out */}
      {!isMid && (
        <>
          {strategy.win_condition && (
            <div style={{ marginBottom: 6 }}>
              <p style={{ fontSize: 10, fontWeight: 'bold', color: accentColor, margin: '0 0 2px' }}>勝利条件</p>
              <p style={{ margin: 0, padding: '4px 6px', borderRadius: 4, background: 'rgba(10,200,185,0.08)', border: '1px solid rgba(10,200,185,0.15)' }}>
                {strategy.win_condition}
              </p>
            </div>
          )}
          {strategy.teamfight && (
            <div style={{ marginBottom: 6 }}>
              <p style={{ fontSize: 10, fontWeight: 'bold', color: '#C8AA6E', margin: '0 0 2px' }}>集団戦</p>
              <p style={{ margin: '0 0 3px' }}>{strategy.teamfight}</p>
            </div>
          )}
          {strategy.your_role && (
            <div style={{ marginBottom: 6 }}>
              <p style={{ fontSize: 10, fontWeight: 'bold', color: '#0AC8B9', margin: '0 0 2px' }}>あなたの役割</p>
              <p style={{ margin: 0, padding: '4px 6px', borderRadius: 4, background: 'rgba(10,200,185,0.08)', border: '1px solid rgba(10,200,185,0.15)' }}>
                {strategy.your_role}
              </p>
            </div>
          )}
          {strategy.closing && (
            <p style={{ margin: '0 0 6px' }}><span style={{ fontWeight: 'bold', color: '#C8AA6E' }}>🏆 </span>{strategy.closing}</p>
          )}
        </>
      )}

      {strategy.watch_out && (
        <p style={{ margin: '0 0 4px', color: 'rgba(232,64,87,0.9)' }}>
          <span style={{ fontWeight: 'bold' }}>⚠ 警戒</span> {strategy.watch_out}
        </p>
      )}
    </div>
  )
}

export function MatchupTip({ tip, loading, laningOver = false, teamStrategy, teamStrategyLoading }) {
  const [manualToggle, setManualToggle] = useState(null)
  const [showMatchup, setShowMatchup] = useState(false)

  // チーム戦略が来たらそちらを優先表示
  const hasStrategy = !!teamStrategy
  const showStrategy = laningOver && hasStrategy && !showMatchup
  const expanded = manualToggle !== null ? manualToggle : (showStrategy ? true : !laningOver)

  if (!tip && !loading && !teamStrategy && !teamStrategyLoading) return null

  const opponent = tip?.opponent || (typeof loading === 'object' ? loading.opponent : null)
  const opponentPartner = tip?.opponentPartner || (typeof loading === 'object' ? loading.opponentPartner : null)

  const strategyPhaseLabel = teamStrategy?._phase === 'late' ? 'LATE GAME' : 'MID GAME'
  const StrategyIcon = teamStrategy?._phase === 'late' ? Target : Users
  const strategyColor = teamStrategy?._phase === 'late' ? '#0AC8B9' : '#C8AA6E'

  // ヘッダーの内容を切り替え
  const headerLabel = showStrategy
    ? `${strategyPhaseLabel} STRATEGY`
    : opponent ? `VS ${opponent.toUpperCase()}${opponentPartner ? ` & ${opponentPartner.toUpperCase()}` : ''}` : 'MATCHUP'
  const headerColor = showStrategy ? strategyColor : '#0AC8B9'
  const HeaderIcon = showStrategy ? StrategyIcon : Swords

  return (
    <div style={{ border: `1px solid ${showStrategy ? `${strategyColor}50` : 'rgba(10,200,185,0.3)'}`, borderRadius: 6, background: 'rgba(10,20,40,0.5)', flexShrink: 0 }}>
      {/* ヘッダー */}
      <button
        onClick={() => {
          if (showStrategy || tip) setManualToggle(!expanded)
        }}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <HeaderIcon size={14} style={{ color: headerColor, flexShrink: 0 }} />
          <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 12, color: headerColor, letterSpacing: '0.1em' }}>
            {headerLabel}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {(loading || teamStrategyLoading) && <Loader2 size={14} style={{ color: headerColor, animation: 'spin 1s linear infinite' }} />}
          {/* 切り替えボタン */}
          {laningOver && hasStrategy && tip && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowMatchup(!showMatchup); setManualToggle(true) }}
              style={{ fontSize: 9, color: '#888', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 3, padding: '1px 5px', cursor: 'pointer' }}
            >
              {showMatchup ? '戦略' : '対面'}
            </button>
          )}
          {(showStrategy || tip) && (expanded ? <ChevronUp size={12} style={{ color: '#888' }} /> : <ChevronDown size={12} style={{ color: '#888' }} />)}
        </span>
      </button>

      {/* チーム戦略コンテンツ */}
      {showStrategy && expanded && <TeamStrategyContent strategy={teamStrategy} powerCurve={tip?.power_curve} />}

      {/* マッチアップTipコンテンツ */}
      {!showStrategy && tip && expanded && (
        <div style={{ padding: '0 12px 10px', fontSize: 12, lineHeight: 1.6, color: '#ccc', userSelect: 'text', cursor: 'text', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
          {tip.power_curve && <PowerCurveBar powerCurve={tip.power_curve} />}
          {tip.power_spike && (
            <p style={{ margin: '0 0 6px', color: 'rgba(200,170,110,0.9)' }}>
              {!tip.power_curve && <span style={{ fontWeight: 'bold' }}>⚡ パワースパイク </span>}
              {tip.power_spike}
            </p>
          )}
          {tip.summary && <p style={{ margin: '0 0 6px' }}>{tip.summary}</p>}
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
          {tip.playstyle && (
            <div style={{ marginBottom: 6 }}>
              <p style={{ fontSize: 10, fontWeight: 'bold', color: '#0AC8B9', margin: '0 0 2px' }}>勝ち筋</p>
              <p style={{ margin: 0, padding: '4px 6px', borderRadius: 4, background: 'rgba(10,200,185,0.08)', border: '1px solid rgba(10,200,185,0.15)' }}>
                {tip.playstyle}
              </p>
            </div>
          )}
          {tip.danger && (
            <p style={{ margin: '0 0 4px', color: 'rgba(232,64,87,0.9)' }}>
              <span style={{ fontWeight: 'bold' }}>⚠ 警戒</span> {tip.danger}
            </p>
          )}
        </div>
      )}

      {/* ローディング */}
      {!tip && !teamStrategy && (loading || teamStrategyLoading) && (
        <div style={{ padding: 12, textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
            {teamStrategyLoading ? 'チーム戦略を分析中...' : 'マッチアップを分析中...'}
          </p>
        </div>
      )}
    </div>
  )
}
