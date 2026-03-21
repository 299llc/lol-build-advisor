import { useState } from 'react'
import { BarChart3, Target, Sparkles, Star, MessageCircle, Loader2, ChevronDown, ChevronUp, Clock, Search, AlertTriangle } from 'lucide-react'
import { ItemTooltip } from './ItemTooltip'

function StarRating({ count }) {
  return (
    <div className="flex gap-px shrink-0">
      {[...Array(count)].map((_, i) => (
        <Star key={i} size={10} className="text-lol-gold" fill="currentColor" />
      ))}
    </div>
  )
}

function getStars(count, total) {
  if (!count || !total) return 0
  const rate = count / total
  if (rate > 0.66) return 3
  if (rate > 0.33) return 2
  return 1
}

export function BuildPanel({
  coreBuild,
  coreBuildLoading,
  suggestion,
  substituteItems,
  ownedItemIds,
  ddragon,
  aiLoading,
  compact,
}) {
  const [showOthers, setShowOthers] = useState(false)
  const [showCandidates, setShowCandidates] = useState(false)
  const [autoExpanded, setAutoExpanded] = useState(false)

  // --- コアビルド ---
  const buildItems = coreBuild?.build_goal_names || coreBuild?.build_goal || []
  const buildImages = coreBuild?.build_goal_images || []
  const buildIds = coreBuild?.build_goal || []

  // --- AI提案 ---
  const recommended = suggestion?.recommended || []
  const reasoning = suggestion?.reasoning || ''
  const history = suggestion?.history || {}
  const totalCalls = suggestion?.totalCalls || 0

  const reasonMap = {}
  for (const r of recommended) {
    reasonMap[String(r.id)] = r.reason
  }
  for (const [id, h] of Object.entries(history)) {
    if (!reasonMap[id] && h.lastReason) {
      reasonMap[id] = h.lastReason
    }
  }

  const hasSubstitutes = substituteItems?.length > 0
  const notOwned = hasSubstitutes
    ? substituteItems.filter(item => !ownedItemIds?.has(String(item.id)))
    : []

  const sorted = [...notOwned]
    .sort((a, b) => {
      const countA = history[String(a.id)]?.count || 0
      const countB = history[String(b.id)]?.count || 0
      return countB - countA
    })
    .filter(item => totalCalls === 0 || (history[String(item.id)]?.count || 0) > 0)

  const sortedIds = new Set(sorted.map(item => String(item.id)))
  const others = notOwned.filter(item => !sortedIds.has(String(item.id)))

  // 星の多い順にソートしてトップ3
  const top3Ids = new Set(
    [...sorted]
      .filter(item => {
        const count = history[String(item.id)]?.count || 0
        return getStars(count, totalCalls) > 0
      })
      .sort((a, b) => {
        const starsA = getStars(history[String(a.id)]?.count || 0, totalCalls)
        const starsB = getStars(history[String(b.id)]?.count || 0, totalCalls)
        if (starsB !== starsA) return starsB - starsA
        return (history[String(b.id)]?.count || 0) - (history[String(a.id)]?.count || 0)
      })
      .slice(0, 3)
      .map(item => String(item.id))
  )

  const aiError = suggestion?.error
  const showAiSection = hasSubstitutes && (sorted.length > 0 || aiLoading || aiError)

  // レーン戦終了（15分）後にAI提案を自動展開
  const gameTime = suggestion?.gameTime || 0
  if (gameTime >= 900 && !autoExpanded && !showCandidates && sorted.length > 0) {
    setShowCandidates(true)
    setAutoExpanded(true)
  }

  return (
    <div className="rounded border border-lol-gold/30 bg-lol-surface/80">
      {/* ===== ヘッダー ===== */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-lol-gold/20">
        <div className="flex items-center gap-1.5">
          <BarChart3 size={14} className="text-lol-gold" />
          <span className="font-heading text-xs tracking-widest text-lol-gold">
            BUILD
          </span>
        </div>
        {(coreBuildLoading || aiLoading) && (
          <Loader2 size={14} className="text-lol-gold animate-spin" />
        )}
      </div>

      {/* ===== コアビルドセクション ===== */}
      <div className="p-2">
        {coreBuildLoading && !coreBuild && (
          <div className="flex items-center justify-center py-3 gap-2">
            <Loader2 size={14} className="text-lol-gold animate-spin" />
            <span className="text-xs text-lol-text">コアビルド取得中...</span>
          </div>
        )}

        {coreBuild && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Target size={11} className="text-lol-blue" />
              <span className="text-[11px] text-lol-blue font-medium tracking-wide">
                CORE BUILD
              </span>
            </div>
            {/* コアビルド: 横並びアイコン + 番号 */}
            <div className="flex items-center gap-1 px-1">
              {buildItems.map((item, i) => {
                const imgFile = buildImages[i]
                const imgUrl = ddragon && imgFile ? `${ddragon}/img/item/${imgFile}` : null
                const itemId = buildIds[i]
                const isOwned = ownedItemIds?.has(String(itemId))

                return (
                  <ItemTooltip key={i} itemId={itemId}>
                    <div className={`relative flex flex-col items-center cursor-default ${isOwned ? 'opacity-40' : ''}`}>
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt={item}
                          className="w-8 h-8 rounded border border-lol-gold/30"
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded border border-lol-gold/20 bg-lol-surface-light/30 flex items-center justify-center">
                          <span className="text-[10px] text-lol-text">{i + 1}</span>
                        </div>
                      )}
                      {isOwned && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-lol-blue text-xs font-bold">✓</span>
                        </div>
                      )}
                      {i < buildItems.length - 1 && (
                        <span className="absolute -right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-lol-gold/40">›</span>
                      )}
                    </div>
                  </ItemTooltip>
                )
              })}
            </div>
          </div>
        )}

        {!coreBuild && !coreBuildLoading && (
          <p className="text-xs text-lol-text text-center py-3">
            試合が始まるとOP.GGからコアビルドを自動取得します
          </p>
        )}
      </div>

      {/* 15分未満の注記 */}
      {!showAiSection && hasSubstitutes && (
        <div className="px-3 pb-2">
          <p className="text-[10px] text-lol-text/40">15分以降にAIが状況判断を開始します</p>
        </div>
      )}

      {/* ===== AI状況判断セクション ===== */}
      {showAiSection && (
        <div className="border-t border-lol-gold/15">
          {/* AI セクションヘッダー（クリックで開閉） */}
          <button
            onClick={() => setShowCandidates(v => !v)}
            className="flex items-center justify-between px-3 py-1 w-full hover:bg-lol-surface-light/20 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              {showCandidates ? <ChevronUp size={11} className="text-lol-accent" /> : <ChevronDown size={11} className="text-lol-accent" />}
              <Search size={11} className="text-lol-accent" />
              <span className="text-[11px] text-lol-accent font-medium tracking-wide">
                状況に応じた候補
              </span>
              <span className="text-[10px] text-lol-text/50 px-1 py-0.5 rounded bg-lol-accent/8 border border-lol-accent/15">
                AI
              </span>
              {!showCandidates && sorted.length > 0 && (
                <span className="text-[10px] text-lol-text/50">({sorted.length})</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {suggestion?.gameTime > 0 && (
                <div className="flex items-center gap-1">
                  <Clock size={10} className="text-lol-text/50" />
                  <span className="text-[10px] text-lol-text/50">
                    {Math.floor(suggestion.gameTime / 60)}:{Math.floor(suggestion.gameTime % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              )}
            </div>
          </button>

          {showCandidates && <div className="px-2 pb-2 space-y-1.5">
            {/* AIエラー */}
            {aiError && (
              <div className="flex items-start gap-1.5 px-2 py-1.5 rounded bg-lol-red/10 border border-lol-red/20">
                <AlertTriangle size={11} className="text-lol-red shrink-0 mt-0.5" />
                <p className="text-[11px] text-lol-red">AI エラー: {aiError}</p>
              </div>
            )}
            {/* AI判断理由 */}
            {!aiError && reasoning && (
              <div className="flex items-start gap-1.5 px-2 py-1.5 rounded bg-lol-accent/5 border border-lol-accent/15">
                <MessageCircle size={11} className="text-lol-accent shrink-0 mt-0.5" />
                <p className="text-[11px] text-lol-text-light leading-relaxed">{reasoning}</p>
              </div>
            )}

            {/* 候補アイテム一覧 */}
            <div className="space-y-0.5">
              {sorted.map(item => {
                const itemId = String(item.id)
                const count = history[itemId]?.count || 0
                const stars = getStars(count, totalCalls)
                const reason = reasonMap[itemId]
                const imgUrl = ddragon && item.image ? `${ddragon}/img/item/${item.image}` : null
                const isTop3 = top3Ids.has(itemId)

                return (
                  <ItemTooltip key={item.id} itemId={item.id}>
                    <div className={`flex items-center gap-2 px-2 py-1 rounded cursor-default transition-colors ${
                      isTop3
                        ? 'bg-lol-accent/8 border border-lol-accent/25'
                        : 'bg-lol-surface-light/30 hover:bg-lol-surface-light/50'
                    }`}>
                      {/* 検討ラベル */}
                      {isTop3 && (
                        <span className="text-[9px] text-lol-accent border border-lol-accent/30 rounded px-1 py-px shrink-0">
                          検討
                        </span>
                      )}
                      {imgUrl && (
                        <img
                          src={imgUrl}
                          alt={item.name}
                          className={`w-6 h-6 rounded-sm ${isTop3 ? '' : 'opacity-60'}`}
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      )}
                      <span className={`text-sm flex-1 ${
                        isTop3 ? 'text-lol-text-light font-medium' : 'text-lol-text'
                      }`}>
                        {item.name}
                      </span>
                      {stars > 0 && <StarRating count={stars} />}
                    </div>
                    {isTop3 && reason && (
                      <p className="text-[11px] text-lol-text px-2 pb-1 pl-8 -mt-0.5">{reason}</p>
                    )}
                  </ItemTooltip>
                )
              })}
            </div>

            {/* その他の候補 */}
            {!compact && others.length > 0 && (
              <div>
                <button
                  onClick={() => setShowOthers(v => !v)}
                  className="flex items-center gap-1 text-[10px] text-lol-text hover:text-lol-text-light transition-colors w-full"
                >
                  {showOthers ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  <span>その他の候補 ({others.length})</span>
                </button>
                {showOthers && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {others.map(item => {
                      const imgUrl = ddragon && item.image ? `${ddragon}/img/item/${item.image}` : null
                      return (
                        <ItemTooltip key={item.id} itemId={item.id}>
                          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-lol-surface-light/20 cursor-default hover:bg-lol-surface-light/40 transition-colors">
                            {imgUrl && (
                              <img
                                src={imgUrl}
                                alt={item.name}
                                className="w-4 h-4 rounded-sm opacity-50"
                                onError={(e) => { e.target.style.display = 'none' }}
                              />
                            )}
                            <span className="text-[10px] text-lol-text">{item.name}</span>
                          </div>
                        </ItemTooltip>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>}
        </div>
      )}
    </div>
  )
}
