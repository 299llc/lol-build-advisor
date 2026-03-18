import { GraduationCap, Loader2, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react'

// 定数スタイル（レンダーごとのオブジェクト再生成防止）
const STROKE_TRANSITION = { transition: 'stroke-dasharray 0.6s ease' }
const BAR_TRANSITION = { transition: 'width 0.6s ease' }

// グレード → 棒グラフ幅% & SVG色
const GRADE_BAR = {
  S: { pct: 100, color: '#C8AA6E' },
  A: { pct: 80,  color: '#4ade80' },
  B: { pct: 60,  color: '#0AC8B9' },
  C: { pct: 40,  color: '#facc15' },
  D: { pct: 20,  color: '#E84057' },
}

const GRADE_COLORS = {
  S: 'text-lol-gold',
  A: 'text-green-400',
  B: 'text-lol-blue',
  C: 'text-yellow-400',
  D: 'text-lol-red',
}

function getScoreInfo(score) {
  if (score >= 9) return { color: '#C8AA6E', textClass: 'text-lol-gold', label: '素晴らしい' }
  if (score >= 7) return { color: '#4ade80', textClass: 'text-green-400', label: '良い' }
  if (score >= 5) return { color: '#facc15', textClass: 'text-yellow-400', label: '普通' }
  if (score >= 3) return { color: '#fb923c', textClass: 'text-orange-400', label: '改善必要' }
  return { color: '#E84057', textClass: 'text-lol-red', label: '要練習' }
}

// SVGドーナツチャート
function DonutScore({ score, label }) {
  const info = getScoreInfo(score)
  const size = 72
  const stroke = 6
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const pct = Math.min(score / 10, 1)
  const dasharray = `${circumference * pct} ${circumference * (1 - pct)}`

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        {/* 背景リング */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="currentColor" strokeWidth={stroke}
          className="text-lol-surface-light/30"
        />
        {/* スコアアーク */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={info.color} strokeWidth={stroke}
          strokeDasharray={dasharray}
          strokeLinecap="round"
          style={STROKE_TRANSITION}
        />
      </svg>
      {/* 中央テキスト（SVGの上にオーバーレイ） */}
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className={`text-xl font-heading font-bold ${info.textClass}`}>{score}</span>
        <span className="text-[9px] text-lol-text/60">/10</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-[10px] text-lol-text">{label}</span>
        <span className={`text-[10px] font-medium ${info.textClass}`}>{info.label}</span>
      </div>
    </div>
  )
}

// 横棒グラフ付きセクション
function GradeBar({ section }) {
  const bar = GRADE_BAR[section.grade] || GRADE_BAR.C
  const gradeColor = GRADE_COLORS[section.grade] || GRADE_COLORS.C

  return (
    <div className="rounded bg-lol-surface-light/30 border border-lol-surface-light/20 overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-1">
        <span className="text-xs text-lol-text-light font-medium flex-1">{section.title}</span>
        <span className={`text-xs font-heading font-bold ${gradeColor}`}>{section.grade}</span>
      </div>
      {/* 棒グラフ */}
      <div className="mx-2 mb-1 h-1.5 rounded-full bg-lol-surface-light/20 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${bar.pct}%`, backgroundColor: bar.color, ...BAR_TRANSITION }}
        />
      </div>
      <p className="text-xs text-lol-text px-2 pb-1.5 leading-relaxed">{section.content}</p>
    </div>
  )
}

export function CoachingPanel({ coaching, loading }) {
  if (loading) {
    return (
      <div className="rounded border border-lol-gold/30 bg-lol-surface/80">
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-lol-gold/20">
          <GraduationCap size={14} className="text-lol-gold" />
          <span className="font-heading text-xs tracking-widest text-lol-gold">
            AI COACHING
          </span>
        </div>
        <div className="flex items-center justify-center gap-2 p-4">
          <Loader2 size={16} className="text-lol-gold animate-spin" />
          <span className="text-sm text-lol-text-light">試合を分析中...</span>
        </div>
      </div>
    )
  }

  if (!coaching) return null

  return (
    <div className="rounded border border-lol-gold/30 bg-lol-surface/80">
      {/* ヘッダー */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-lol-gold/20">
        <GraduationCap size={14} className="text-lol-gold" />
        <span className="font-heading text-xs tracking-widest text-lol-gold">
          AI COACHING
        </span>
      </div>

      <div className="p-2 space-y-2">
        {/* ドーナツスコア */}
        <div className="flex justify-center gap-8 py-2">
          <div className="relative">
            <DonutScore score={coaching.overall_score} label="総合" />
          </div>
          <div className="relative">
            <DonutScore score={coaching.build_score} label="ビルド" />
          </div>
        </div>

        {/* セクション（横棒グラフ付き） */}
        {coaching.sections?.map((section, i) => (
          <GradeBar key={i} section={section} />
        ))}

        {/* 良かった点 */}
        {coaching.good_points?.length > 0 && (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1 px-1">
              <TrendingUp size={12} className="text-green-400" />
              <span className="text-[11px] text-green-400 font-medium">GOOD</span>
            </div>
            {coaching.good_points.map((p, i) => (
              <div key={i} className="flex items-start gap-1.5 px-2 py-1 rounded bg-green-400/5 border border-green-400/15">
                <ChevronRight size={10} className="text-green-400 shrink-0 mt-0.5" />
                <p className="text-xs text-lol-text-light">{p}</p>
              </div>
            ))}
          </div>
        )}

        {/* 改善点 */}
        {coaching.improve_points?.length > 0 && (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1 px-1">
              <TrendingDown size={12} className="text-lol-red" />
              <span className="text-[11px] text-lol-red font-medium">IMPROVE</span>
            </div>
            {coaching.improve_points.map((p, i) => (
              <div key={i} className="flex items-start gap-1.5 px-2 py-1 rounded bg-lol-red/5 border border-lol-red/15">
                <ChevronRight size={10} className="text-lol-red shrink-0 mt-0.5" />
                <p className="text-xs text-lol-text-light">{p}</p>
              </div>
            ))}
          </div>
        )}

        {/* 次の試合へのアドバイス */}
        {coaching.next_game_advice && (
          <div className="px-2 py-1.5 rounded bg-lol-gold/5 border border-lol-gold/20">
            <p className="text-xs text-lol-text-light leading-relaxed">
              <span className="text-lol-gold font-medium">NEXT: </span>
              {coaching.next_game_advice}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
