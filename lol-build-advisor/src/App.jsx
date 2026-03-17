import { useState, useEffect } from 'react'
import { useGameData } from './hooks/useGameData'
import { TitleBar } from './components/TitleBar'
import { WaitingScreen } from './components/WaitingScreen'
import { ChampSelectScreen } from './components/ChampSelectScreen'
import { MainScreen } from './components/MainScreen'
import { SettingsDialog } from './components/SettingsDialog'
import { DebugPanel } from './components/DebugPanel'
import { CompactView } from './components/CompactView'

const isCompact = new URLSearchParams(window.location.search).has('compact')

export default function App() {
  const { status, gameData, coreBuild, aiSuggestion, aiLoading, positionSelectChamp, substituteItems, champSelectTeam, coaching, coachingLoading, substituteError, matchupTip, champSelectExtras, macroAdvice, macroLoading, objectivesStatus, ruleAlerts } = useGameData()
  const [showSettings, setShowSettings] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [isDev, setIsDev] = useState(false)
  const [compactOpen, setCompactOpen] = useState(false)

  useEffect(() => {
    window.electronAPI?.isDev().then(v => setIsDev(!!v))
    window.electronAPI?.getCompactStatus().then(v => setCompactOpen(!!v))
    const unsub = window.electronAPI?.onCompactStatus(v => setCompactOpen(!!v))
    return () => unsub?.()
  }, [])

  // コンパクトビューモード
  if (isCompact) {
    return (
      <CompactView
        status={status}
        gameData={gameData}
        coreBuild={coreBuild}
        aiSuggestion={aiSuggestion}
        aiLoading={aiLoading}
        substituteItems={substituteItems}
        macroAdvice={macroAdvice}
        macroLoading={macroLoading}
        champSelectExtras={champSelectExtras}
        matchupTip={matchupTip}
      />
    )
  }

  return (
    <div className="h-screen flex flex-col bg-lol-bg overflow-hidden">
      <TitleBar
        status={status}
        onSettings={() => setShowSettings(true)}
        onDebug={isDev ? () => setShowDebug(true) : null}
        compactOpen={compactOpen}
        onCompactView={() => window.electronAPI?.toggleCompactView()}
      />

      <div className="flex-1 overflow-hidden">
        {(status === 'ingame' || status === 'ended') && gameData ? (
          <MainScreen
            data={gameData}
            coreBuild={coreBuild}
            aiSuggestion={aiSuggestion}
            aiLoading={aiLoading}
            positionSelectChamp={positionSelectChamp}
            substituteItems={substituteItems}
            coaching={coaching}
            coachingLoading={coachingLoading}
            substituteError={substituteError}
            matchupTip={matchupTip}
            macroAdvice={macroAdvice}
            macroLoading={macroLoading}
            objectivesStatus={objectivesStatus}
            ruleAlerts={ruleAlerts}
          />
        ) : status === 'champselect' ? (
          <ChampSelectScreen suggestion={coreBuild} aiLoading={aiLoading} ddragon={gameData?.ddragon || champSelectExtras?.ddragon} team={champSelectTeam} extras={champSelectExtras} />
        ) : (
          <WaitingScreen />
        )}
      </div>

      {showSettings && (
        <SettingsDialog onClose={() => setShowSettings(false)} />
      )}
      {showDebug && (
        <DebugPanel onClose={() => setShowDebug(false)} />
      )}
    </div>
  )
}
