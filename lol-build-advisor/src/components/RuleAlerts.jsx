import { AlertTriangle, Target, Skull, TrendingUp, TrendingDown, Swords, Shield, Eye, DollarSign, Users, Zap } from 'lucide-react'

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
  plate_ending: Shield,
  numerical_advantage: Users,
  recall_timing: DollarSign,
  ward_critical: Eye,
  ward_warning: Eye,
  teamfight_push: Zap,
}

const ALERT_COLORS = {
  cs_critical: 'border-lol-red/40 bg-lol-red/10',
  cs_warning: 'border-yellow-500/40 bg-yellow-500/10',
  death: 'border-lol-red/40 bg-lol-red/10',
  level_disadvantage: 'border-yellow-500/40 bg-yellow-500/10',
  level_advantage: 'border-lol-blue/40 bg-lol-blue/10',
  fed_warning: 'border-yellow-500/40 bg-yellow-500/10',
  enemy_fed: 'border-lol-red/40 bg-lol-red/10',
  plate_ending: 'border-lol-gold/40 bg-lol-gold/10',
  numerical_advantage: 'border-lol-blue/40 bg-lol-blue/10',
  recall_timing: 'border-lol-gold/40 bg-lol-gold/10',
  ward_critical: 'border-lol-red/40 bg-lol-red/10',
  ward_warning: 'border-yellow-500/40 bg-yellow-500/10',
  teamfight_push: 'border-lol-blue/40 bg-lol-blue/10',
}

function getIconAndColor(type) {
  for (const [key, Icon] of Object.entries(ALERT_ICONS)) {
    if (type.startsWith(key)) return { Icon, color: ALERT_COLORS[key] || 'border-lol-gold/40 bg-lol-gold/10' }
  }
  return { Icon: AlertTriangle, color: 'border-lol-gold/40 bg-lol-gold/10' }
}

export function RuleAlerts({ alerts, prominent }) {
  if (!alerts || alerts.length === 0) return null

  // 通常モードは最大3件、prominentモードは全件表示
  const visible = prominent ? alerts : alerts.slice(0, 3)

  if (prominent) {
    return (
      <div className="space-y-2">
        {visible.map((alert, i) => {
          const { Icon, color } = getIconAndColor(alert.type)
          return (
            <div key={`${alert.type}-${i}`} className={`px-4 py-3 rounded-lg border-2 ${color}`}>
              <div className="flex items-start gap-3">
                <Icon size={20} className="text-lol-text-light mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-lol-text-light">{alert.title}</p>
                  <p className="text-xs text-lol-text leading-relaxed mt-0.5">{alert.desc}</p>
                  {alert.warning && (
                    <p className="text-[11px] text-lol-red mt-1">{alert.warning}</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

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
