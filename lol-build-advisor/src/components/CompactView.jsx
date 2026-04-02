import { useState, useEffect, useRef } from 'react'
import { X, Lock, Unlock, Navigation, Loader2, AlertTriangle, Target, Skull, TrendingUp, TrendingDown, Swords, Shield, Eye, DollarSign, Users, Zap } from 'lucide-react'

function formatGameTime(seconds) {
  if (seconds == null || seconds <= 0) return null
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ドラッグハンドル + ロック/閉じるボタン
function CompactTitleBar({ status, locked, onToggleLock }) {
  return (
    <div className={`flex items-center justify-between px-3 py-1 ${locked ? '' : 'drag-region'}`}>
      <div className={`w-2 h-2 rounded-full ${status === 'ingame' ? 'bg-lol-blue' : status === 'ended' ? 'bg-lol-red' : 'bg-lol-gold animate-pulse'}`} />
      <div className="flex items-center gap-1">
        <button
          onMouseEnter={() => locked && window.electronAPI?.compactSetPassthrough?.(false)}
          onMouseLeave={() => locked && window.electronAPI?.compactSetPassthrough?.(true)}
          onClick={onToggleLock}
          className={`no-drag p-0.5 rounded transition-colors ${locked ? 'text-lol-blue' : 'text-white/30 hover:text-white/60'}`}
          title={locked ? 'ロック解除（移動/リサイズ可）' : 'ロック（クリックスルー）'}
          style={{ pointerEvents: 'auto' }}
        >
          {locked ? <Lock size={10} /> : <Unlock size={10} />}
        </button>
        {!locked && (
          <button
            onClick={() => window.electronAPI?.compactClose()}
            className="no-drag p-0.5 rounded text-white/30 hover:text-lol-red hover:bg-white/10 transition-colors"
          >
            <X size={10} />
          </button>
        )}
      </div>
    </div>
  )
}

// コアビルド + AI提案（アイコンのみ統合表示）
function CompactItems({ coreBuild, suggestion, substituteItems, ownedItemIds, ddragon, skillOrder }) {
  // コアビルドアイテム
  const coreNames = coreBuild?.build_goal_names || []
  const coreImages = coreBuild?.build_goal_images || []
  const coreIds = (coreBuild?.build_goal || []).map(String)

  // AI提案アイテム（コアと重複しないもの、トップ3）
  const history = suggestion?.history || {}
  const totalCalls = suggestion?.totalCalls || 0
  const coreIdSet = new Set(coreIds)
  const aiItems = (!suggestion || suggestion.error) ? [] :
    [...(substituteItems || [])]
      .filter(item => !ownedItemIds?.has(String(item.id)) && !coreIdSet.has(String(item.id)))
      .filter(item => (history[String(item.id)]?.count || 0) > 0)
      .sort((a, b) => (history[String(b.id)]?.count || 0) - (history[String(a.id)]?.count || 0))
      .slice(0, 3)

  if (coreNames.length === 0 && aiItems.length === 0) return null

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* コアビルド + AI提案 (左寄せ) */}
      <div className="flex items-center gap-1 flex-wrap flex-1">
      {coreNames.map((item, i) => {
        const imgUrl = ddragon && coreImages[i] ? `${ddragon}/img/item/${coreImages[i]}` : null
        const isOwned = ownedItemIds?.has(String(coreIds[i]))
        return (
          <div key={`core-${i}`} className={`relative ${isOwned ? 'opacity-30' : ''}`}>
            {imgUrl ? (
              <img src={imgUrl} alt={item} className="w-7 h-7 rounded border border-white/20"
                onError={(e) => { e.target.style.display = 'none' }} />
            ) : (
              <div className="w-7 h-7 rounded border border-white/10 bg-white/5 flex items-center justify-center">
                <span className="text-[9px] text-white/40">{i + 1}</span>
              </div>
            )}
            {isOwned && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lol-blue text-[10px] font-bold">✓</span>
              </div>
            )}
          </div>
        )
      })}
      {/* 区切り */}
      {coreNames.length > 0 && aiItems.length > 0 && (
        <div className="w-px h-5 bg-white/15 mx-0.5" />
      )}
      {/* AI提案 */}
      {aiItems.map(item => {
        const imgUrl = ddragon && item.image ? `${ddragon}/img/item/${item.image}` : null
        return (
          <div key={`ai-${item.id}`} className="relative">
            {imgUrl ? (
              <img src={imgUrl} alt={item.name} className="w-7 h-7 rounded border border-lol-blue/40"
                onError={(e) => { e.target.style.display = 'none' }} />
            ) : (
              <div className="w-7 h-7 rounded border border-lol-blue/30 bg-white/5 flex items-center justify-center">
                <span className="text-[9px] text-white/40">AI</span>
              </div>
            )}
          </div>
        )
      })}
      </div>
      {/* スキルオーダー (右寄せ) */}
      {skillOrder?.length > 0 && (
        <div className="flex items-center gap-0.5 shrink-0">
          {skillOrder.map((skill, i) => (
            <span key={i} className={`text-[8px] font-bold px-1 py-0.5 rounded ${
              skill === 'Q' ? 'bg-blue-500/30 text-blue-400' :
              skill === 'W' ? 'bg-green-500/30 text-green-400' :
              skill === 'E' ? 'bg-yellow-500/30 text-yellow-400' :
              'bg-red-500/30 text-red-400'
            }`}>{skill}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// マクロアドバイス（アクションのみ）
function CompactMacro({ advice, loading }) {
  const hasError = advice?.error
  const hasData = advice && !hasError

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Navigation size={10} className="text-lol-blue/80" />
        <span className="text-[10px] text-lol-blue/80 font-heading tracking-wider">MACRO</span>
        {advice?.gameTime > 0 && (
          <span className="text-[9px] text-white/30 ml-auto">{formatGameTime(advice.gameTime)}</span>
        )}
        {loading && <Loader2 size={10} className="text-lol-blue/60 animate-spin ml-auto" />}
      </div>
      {hasError ? (
        <div className="flex items-start gap-1 px-1 py-1 rounded bg-red-500/10">
          <AlertTriangle size={10} className="text-red-400/80 shrink-0 mt-0.5" />
          <p className="text-[10px] text-red-400/80">{advice.error}</p>
        </div>
      ) : hasData ? (
        <div className="px-1.5 py-1 rounded bg-white/5 space-y-0.5">
          <p className="text-[11px] text-white/90 font-medium leading-snug">{advice.title || advice.action_short || advice.action}</p>
          {advice.desc && (
            <p className="text-[10px] text-white/55 leading-snug">{advice.desc}</p>
          )}
        </div>
      ) : (
        <p className="text-[10px] text-white/30 px-1">待機中...</p>
      )}
    </div>
  )
}

// スキルオーダー（チャンプセレクト時）
function CompactSkillOrder({ extras }) {
  const skills = extras?.skills
  if (!skills?.order) return null

  return (
    <div className="space-y-1">
      <span className="text-[10px] text-lol-gold/80 font-heading tracking-wider">SKILL ORDER</span>
      <div className="flex items-center gap-1.5">
        {skills.order.map((skill, i) => (
          <div key={i} className="flex items-center gap-0.5">
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
              i === 0 ? 'bg-lol-gold/20 text-lol-gold border border-lol-gold/30' :
              i === 1 ? 'bg-lol-blue/15 text-lol-blue border border-lol-blue/25' :
              'bg-white/5 text-white/50 border border-white/10'
            }`}>
              {skill}
            </span>
            {i < skills.order.length - 1 && (
              <span className="text-[10px] text-white/30">＞</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// 対面情報（最小限）
function CompactMatchup({ tip }) {
  if (!tip) return null
  return (
    <div className="space-y-1">
      <span className="text-[10px] text-lol-blue/80 font-heading tracking-wider">VS {tip.opponent?.toUpperCase()}</span>
      {tip.summary && (
        <p className="text-[10px] text-white/60 leading-snug px-1">{tip.summary}</p>
      )}
    </div>
  )
}

const COMPACT_ALERT_ICONS = {
  cs_critical: TrendingDown, cs_warning: TrendingDown,
  obj_available: Target, obj_soon: Target, obj_imminent: Target, obj_now: Target,
  death: Skull, level_advantage: TrendingUp, level_disadvantage: TrendingDown,
  fed_warning: AlertTriangle, enemy_fed: Swords, plate_ending: Shield,
  numerical_advantage: Users, recall_timing: DollarSign,
  ward_critical: Eye, ward_warning: Eye, teamfight_push: Zap,
}

const COMPACT_ALERT_COLORS = {
  cs_critical: 'border-lol-red/40 bg-lol-red/10', cs_warning: 'border-yellow-500/40 bg-yellow-500/10',
  death: 'border-lol-red/40 bg-lol-red/10', level_disadvantage: 'border-yellow-500/40 bg-yellow-500/10',
  level_advantage: 'border-lol-blue/40 bg-lol-blue/10', fed_warning: 'border-yellow-500/40 bg-yellow-500/10',
  enemy_fed: 'border-lol-red/40 bg-lol-red/10', plate_ending: 'border-lol-gold/40 bg-lol-gold/10',
  numerical_advantage: 'border-lol-blue/40 bg-lol-blue/10', recall_timing: 'border-lol-gold/40 bg-lol-gold/10',
  ward_critical: 'border-lol-red/40 bg-lol-red/10', ward_warning: 'border-yellow-500/40 bg-yellow-500/10',
  teamfight_push: 'border-lol-blue/40 bg-lol-blue/10',
}

function getCompactAlertStyle(type) {
  for (const [key, Icon] of Object.entries(COMPACT_ALERT_ICONS)) {
    if (type.startsWith(key)) return { Icon, color: COMPACT_ALERT_COLORS[key] || 'border-lol-gold/40 bg-lol-gold/10' }
  }
  return { Icon: AlertTriangle, color: 'border-lol-gold/40 bg-lol-gold/10' }
}

// ルールアラート（1件ずつローテーション表示）
function CompactAlerts({ alerts }) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [visible, setVisible] = useState(true)
  const timerRef = useRef(null)
  const alertCount = alerts?.length || 0

  useEffect(() => {
    setCurrentIdx(0)
    setVisible(true)
  }, [alertCount])

  useEffect(() => {
    if (alertCount <= 1) return
    timerRef.current = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setCurrentIdx(prev => (prev + 1) % alertCount)
        setVisible(true)
      }, 300)
    }, 4000)
    return () => clearInterval(timerRef.current)
  }, [alertCount])

  if (!alerts || alerts.length === 0) return null

  const alert = alerts[currentIdx % alertCount]
  if (!alert) return null
  const { Icon, color } = getCompactAlertStyle(alert.type)

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 px-0.5">
        <AlertTriangle size={9} className="text-lol-gold" />
        <span className="text-[9px] text-lol-gold font-heading tracking-wider">ALERTS</span>
        {alertCount > 1 && (
          <span className="text-[8px] text-white/30 ml-auto">{(currentIdx % alertCount) + 1}/{alertCount}</span>
        )}
      </div>
      <div
        className={`px-2 py-1.5 rounded border transition-opacity duration-300 ${color} ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="flex items-start gap-1.5">
          <Icon size={11} className="text-lol-text-light mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-lol-text-light leading-snug">{alert.title}</p>
            <p className="text-[9px] text-white/60 leading-snug">{alert.desc}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function OverlayGuide({ onDismiss }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="text-center">
        <span className="font-heading text-xs text-lol-gold tracking-wider">OVERLAY GUIDE</span>
      </div>
      <div className="space-y-2.5 text-[11px] text-white/80 leading-relaxed">
        <div className="flex items-start gap-2">
          <div className="shrink-0 mt-0.5 p-1 rounded bg-white/10">
            <Unlock size={12} className="text-white/60" />
          </div>
          <p>
            右上の<span className="text-lol-blue font-bold">ロックボタン</span>でウィンドウの移動・リサイズができます。
            好みの位置に配置してください。
          </p>
        </div>
        <div className="flex items-start gap-2">
          <div className="shrink-0 mt-0.5 p-1 rounded bg-white/10">
            <Lock size={12} className="text-lol-blue" />
          </div>
          <p>
            位置が決まったら<span className="text-lol-blue font-bold">ロック</span>しましょう。
            ロック中はゲーム操作の邪魔にならず、クリックがすり抜けます。
          </p>
        </div>
        <div className="px-2 py-1.5 rounded bg-lol-gold/10 border border-lol-gold/20">
          <p className="text-[10px] text-lol-gold">
            試合中はロック状態で使うのがおすすめです
          </p>
        </div>
      </div>
      <button
        onClick={onDismiss}
        className="w-full py-1.5 rounded bg-lol-blue/20 border border-lol-blue/30 text-xs text-lol-blue hover:bg-lol-blue/30 transition-colors"
      >
        OK
      </button>
    </div>
  )
}

const GUIDE_SHOWN_KEY = 'overlay-guide-shown'

export function CompactView({ status, gameData, coreBuild, aiSuggestion, aiLoading, substituteItems, macroAdvice, macroLoading, champSelectExtras, matchupTip, ruleAlerts, embedded = false }) {
  const [locked, setLocked] = useState(true)
  const [showGuide, setShowGuide] = useState(() => {
    try { return !localStorage.getItem(GUIDE_SHOWN_KEY) } catch { return true }
  })
  const ddragon = gameData?.ddragon
  const me = gameData?.players?.me
  const ownedItemIds = new Set((me?.items || []).map(i => String(i.itemID)))
  const isIngame = status === 'ingame' || status === 'ended'
  const isChampSelect = status === 'champselect'

  // Electron専用: body/html の背景を透明にしてウィンドウ透過を有効にする
  useEffect(() => {
    if (embedded) return
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [embedded])

  const toggleLock = () => {
    const next = !locked
    setLocked(next)
    if (next) {
      // ロック: クリックスルー有効
      window.electronAPI?.compactSetPassthrough?.(true)
    } else {
      // アンロック: 通常操作
      window.electronAPI?.compactSetPassthrough?.(false)
    }
  }

  const dismissGuide = () => {
    setShowGuide(false)
    try { localStorage.setItem(GUIDE_SHOWN_KEY, '1') } catch {}
  }

  return (
    <div className={`${embedded ? 'h-full' : 'h-screen'} flex flex-col overflow-hidden rounded-lg`} style={{ background: 'rgba(1, 10, 19, 0.75)', pointerEvents: (!embedded && locked && !showGuide) ? 'none' : undefined }}>
      {!embedded && <CompactTitleBar status={status} locked={locked} onToggleLock={toggleLock} />}

      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-2 space-y-2.5">
        {showGuide && !embedded ? (
          <OverlayGuide onDismiss={dismissGuide} />
        ) : isIngame ? (
          <>
            <CompactItems
              coreBuild={coreBuild}
              suggestion={aiSuggestion}
              substituteItems={substituteItems}
              ownedItemIds={ownedItemIds}
              ddragon={ddragon}
              skillOrder={champSelectExtras?.skills?.order}
            />
            {(macroAdvice || macroLoading) && <CompactMacro advice={macroAdvice} loading={macroLoading} />}
            <CompactAlerts alerts={ruleAlerts} />
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-[10px] text-white/30">試合開始を待っています...</p>
          </div>
        )}
      </div>
    </div>
  )
}
