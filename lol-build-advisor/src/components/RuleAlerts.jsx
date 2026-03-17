import { AlertTriangle, Target, Skull, TrendingUp, TrendingDown, Swords } from 'lucide-react'

const ALERT_ICONS = {
  cs_critical: TrendingDown,
  cs_warning: TrendingDown,
  obj_available: Target,
  obj_soon: Target,
  obj_imminent: Target,
  obj_now: Target,
  death: Skull,
  level_advantage: TrendingUp,
  level_disadvantage: TrendingDown,
  fed_warning: AlertTriangle,
  enemy_fed: Swords,
}

const ALERT_COLORS = {
  cs_critical: 'border-lol-red/40 bg-lol-red/10',
  cs_warning: 'border-yellow-500/40 bg-yellow-500/10',
  death: 'border-lol-red/40 bg-lol-red/10',
  level_disadvantage: 'border-yellow-500/40 bg-yellow-500/10',
  level_advantage: 'border-lol-blue/40 bg-lol-blue/10',
  fed_warning: 'border-yellow-500/40 bg-yellow-500/10',
  enemy_fed: 'border-lol-red/40 bg-lol-red/10',
}

function getIconAndColor(type) {
  for (const [key, Icon] of Object.entries(ALERT_ICONS)) {
    if (type.startsWith(key)) return { Icon, color: ALERT_COLORS[key] || 'border-lol-gold/40 bg-lol-gold/10' }
  }
  return { Icon: AlertTriangle, color: 'border-lol-gold/40 bg-lol-gold/10' }
}

export function RuleAlerts({ alerts }) {
  if (!alerts || alerts.length === 0) return null

  // 最大3件表示
  const visible = alerts.slice(0, 3)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 px-1">
        <AlertTriangle size={10} className="text-lol-gold" />
        <span className="text-[10px] text-lol-gold font-heading tracking-wider">ALERTS</span>
      </div>
      {visible.map((alert, i) => {
        const { Icon, color } = getIconAndColor(alert.type)
        return (
          <div key={`${alert.type}-${i}`} className={`px-3 py-2 rounded border ${color}`}>
            <div className="flex items-start gap-2">
              <Icon size={14} className="text-lol-text-light mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-lol-text-light">{alert.title}</p>
                <p className="text-[11px] text-lol-text leading-snug">{alert.desc}</p>
                {alert.warning && (
                  <p className="text-[10px] text-lol-red mt-0.5">{alert.warning}</p>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
