import { useState, useEffect } from 'react'
import { formatTime } from '@/lib/utils'
import { TeamList } from './TeamList'
import { BuildPanel } from './BuildPanel'
import { CoachingPanel } from './CoachingPanel'
import { KillBar } from './KillBar'
import { MatchupTip } from './MatchupTip'
import { MacroAdvice } from './MacroAdvice'
import { RuleAlerts } from './RuleAlerts'
import { Clock, Eye, MapPin, Loader2, AlertTriangle, Target } from 'lucide-react'

const POSITIONS = [
  { value: 'TOP', label: 'TOP' },
  { value: 'JUNGLE', label: 'JG' },
  { value: 'MIDDLE', label: 'MID' },
  { value: 'BOTTOM', label: 'BOT' },
  { value: 'UTILITY', label: 'SUP' },
]

function PositionSelect() {
  const [selected, setSelected] = useState(null)

  const handleSelect = (value) => {
    setSelected(value)
    window.electronAPI?.setPosition(value)
  }

  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5 rounded bg-lol-surface-light/50 border border-lol-gold/20">
      {selected ? (
        <div className="flex items-center justify-center gap-2 py-1">
          <Loader2 size={14} className="text-lol-gold animate-spin" />
          <span className="text-xs text-lol-text-light">
            {POSITIONS.find(p => p.value === selected)?.label} のコアビルドを取得中...
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5">
            <MapPin size={14} className="text-lol-gold shrink-0" />
            <span className="text-xs text-lol-text-light">ポジションを取得できませんでした。選択してください</span>
          </div>
          <div className="flex gap-1 justify-center">
            {POSITIONS.map(pos => (
              <button
                key={pos.value}
                onClick={() => handleSelect(pos.value)}
                className="px-2 py-0.5 text-xs rounded border border-lol-gold-dim/30 text-lol-text-light hover:bg-lol-gold/20 hover:text-lol-gold hover:border-lol-gold/50 transition-colors"
              >
                {pos.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function SpectatorSelect({ allPlayers, currentName, coreBuildReady }) {
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (loading && coreBuildReady) {
      setLoading(false)
    }
  }, [loading, coreBuildReady])

  const handleChange = (name) => {
    if (name === currentName) return
    setLoading(true)
    window.electronAPI?.selectSpectatorPlayer(name)
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded bg-lol-surface-light/50 border border-lol-gold/20">
      <Eye size={14} className="text-lol-gold" />
      <span className="text-xs text-lol-gold font-medium">SPECTATOR</span>
      {loading ? (
        <div className="flex-1 flex items-center justify-center gap-2">
          <Loader2 size={14} className="text-lol-gold animate-spin" />
          <span className="text-xs text-lol-text-light">データ取得中...</span>
        </div>
      ) : (
        <select
          className="flex-1 text-sm bg-lol-surface border border-lol-surface-light/50 rounded px-1.5 py-0.5 text-lol-text-light outline-none"
          value={currentName}
          onChange={(e) => handleChange(e.target.value)}
        >
          {allPlayers.map(p => (
            <option key={p.summonerName} value={p.summonerName}>
              {p.championName || p.enName} ({p.summonerName})
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

const POSITION_ORDER = { TOP: 0, JUNGLE: 1, MIDDLE: 2, BOTTOM: 3, UTILITY: 4 }
function sortByPosition(players) {
  return [...players].sort((a, b) =>
    (POSITION_ORDER[a.position] ?? 5) - (POSITION_ORDER[b.position] ?? 5)
  )
}

function ObjectivesPanel({ objectives }) {
  if (!objectives) return null
  const items = [
    { key: 'dragon', label: objectives.dragon },
    { key: 'baron', label: objectives.baron },
    { key: 'voidgrub', label: objectives.voidgrub },
    { key: 'herald', label: objectives.herald },
  ]
  return (
    <div className="px-2 py-1.5 rounded bg-lol-surface-light/30 border border-lol-gold/10">
      <div className="flex items-center gap-1.5 mb-1">
        <Target size={12} className="text-lol-gold" />
        <span className="font-heading text-[10px] text-lol-gold tracking-wider">OBJECTIVES</span>
        <span className="text-[10px] text-lol-text/50 ml-auto">{Math.floor(objectives.gameTime / 60)}:{String(objectives.gameTime % 60).padStart(2, '0')}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        {items.map(({ key, label }) => (
          <span key={key} className={`text-[10px] leading-tight ${label.includes('取得可能') ? 'text-lol-accent' : label.includes('終了') ? 'text-lol-text/30' : label.includes('未出現') || label.includes('リスポーン待ち') ? 'text-lol-text/50' :'text-lol-text-light'}`}>
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

export function MainScreen({ data, coreBuild, aiSuggestion, aiLoading, positionSelectChamp, substituteItems, coaching, coachingLoading, substituteError, matchupTip, matchupLoading, macroAdvice, macroLoading, compact, objectivesStatus, ruleAlerts, skillOrder }) {
  const { players, gameData: gd, activePlayer, myTeamSide, ddragon, ended, isSpectator, allPlayers } = data
  const { me, allies, enemies } = players || {}
  const gameTime = gd?.gameTime || 0
  const allyIsLeft = myTeamSide === 'ORDER'

  const allAllies = me ? [me, ...(allies || [])] : allies || []
  const allyKills = allAllies.reduce((s, p) => s + (p.scores?.kills || 0), 0)
  const enemyKills = (enemies || []).reduce((s, p) => s + (p.scores?.kills || 0), 0)

  const leftTeam = sortByPosition(allyIsLeft ? allAllies : enemies || [])
  const rightTeam = sortByPosition(allyIsLeft ? enemies || [] : allAllies)
  const leftKills = allyIsLeft ? allyKills : enemyKills
  const rightKills = allyIsLeft ? enemyKills : allyKills

  // 試合終了後のコーチング（フル幅で上に表示）
  if (ended) {
    return (
      <div className="flex flex-col gap-2 p-3 h-full overflow-y-auto">
        {(coaching || coachingLoading) && (
          <CoachingPanel coaching={coaching} loading={coachingLoading} />
        )}
        <div className="text-center py-1 px-3 rounded bg-lol-red/20 border border-lol-red/30">
          <span className="font-heading text-xs text-lol-red tracking-wider">GAME ENDED</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <KillBar leftKills={leftKills} rightKills={rightKills} allyIsLeft={allyIsLeft} />
            <TeamList label={allyIsLeft ? 'ALLY' : 'ENEMY'} players={leftTeam} isAlly={allyIsLeft} myName={me?.summonerName} ddragon={ddragon} side="left" />
            <TeamList label={allyIsLeft ? 'ENEMY' : 'ALLY'} players={rightTeam} isAlly={!allyIsLeft} myName={me?.summonerName} ddragon={ddragon} side="right" />
          </div>
          <div className="space-y-2">
            <BuildPanel
              coreBuild={coreBuild}
              coreBuildLoading={false}
              suggestion={aiSuggestion}
              substituteItems={substituteItems}
              ownedItemIds={new Set((me?.items || []).map(i => String(i.itemID)))}
              ddragon={ddragon}
              aiLoading={false}
              compact={false}
            />
          </div>
        </div>
        {/* 試合終了後の広告 */}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 h-full p-2 gap-2 overflow-hidden">
      {/* ===== 左カラム: チーム情報 ===== */}
      <div className="flex flex-col gap-1.5 overflow-y-auto overflow-x-hidden min-w-0">
        {/* ポジション選択・観戦モード */}
        {positionSelectChamp && !coreBuild && <PositionSelect />}
        {isSpectator && allPlayers?.length > 0 && (
          <SpectatorSelect allPlayers={allPlayers} currentName={me?.summonerName || ''} coreBuildReady={!!coreBuild} />
        )}

        {/* タイマー + キルバー */}
        <div className="flex items-center justify-center gap-2 py-0.5">
          <Clock size={13} className="text-lol-gold" />
          <span className="font-heading text-sm text-lol-gold tracking-wider">
            {formatTime(gameTime)}
          </span>
        </div>

        <KillBar leftKills={leftKills} rightKills={rightKills} allyIsLeft={allyIsLeft} />

        {/* スキルオーダー */}
        {skillOrder?.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 py-0.5">
            {skillOrder.map((skill, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  skill === 'Q' ? 'bg-blue-500/30 text-blue-400' :
                  skill === 'W' ? 'bg-green-500/30 text-green-400' :
                  skill === 'E' ? 'bg-yellow-500/30 text-yellow-400' :
                  'bg-red-500/30 text-red-400'
                }`}>
                  {skill}
                </span>
                {i < skillOrder.length - 1 && (
                  <span className="text-[9px] text-lol-text-light">＞</span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* チーム一覧 */}
        <TeamList label={allyIsLeft ? 'ALLY' : 'ENEMY'} players={leftTeam} isAlly={allyIsLeft} myName={me?.summonerName} ddragon={ddragon} side="left" />
        <TeamList label={allyIsLeft ? 'ENEMY' : 'ALLY'} players={rightTeam} isAlly={!allyIsLeft} myName={me?.summonerName} ddragon={ddragon} side="right" />

        {/* オブジェクト状況 */}
        {objectivesStatus && <ObjectivesPanel objectives={objectivesStatus} />}
      </div>

      {/* ===== 右カラム: AI情報 ===== */}
      <div className="flex flex-col gap-1.5 overflow-y-auto overflow-x-hidden min-w-0">
        {/* 対面アドバイス（レーン戦終了後は自動折りたたみ） */}
        <MatchupTip tip={matchupTip} loading={matchupLoading} laningOver={gameTime >= 900} />

        {/* ビルドパネル */}
        <BuildPanel
          coreBuild={coreBuild}
          coreBuildLoading={aiLoading && !coreBuild}
          suggestion={aiSuggestion}
          substituteItems={substituteItems}
          ownedItemIds={new Set((me?.items || []).map(i => String(i.itemID)))}
          ddragon={ddragon}
          aiLoading={aiLoading}
          compact={false}
        />

        {/* ルールベースアラート */}
        <RuleAlerts alerts={ruleAlerts} />

        {/* マクロアドバイス（常に表示） */}
        <MacroAdvice advice={macroAdvice} loading={macroLoading} />
      </div>
    </div>
  )
}
