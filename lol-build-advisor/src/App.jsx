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
  const { status, gameData, coreBuild, aiSuggestion, aiLoading, positionSelectChamp, substituteItems, champSelectTeam, coaching, coachingLoading, substituteError, matchupTip, matchupLoading, champSelectExtras, macroAdvice, macroLoading, objectivesStatus, ruleAlerts } = useGameData()
  const [showSettings, setShowSettings] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [showOverlayPreview, setShowOverlayPreview] = useState(false)
  const [isDev, setIsDev] = useState(false)
  const [compactOpen, setCompactOpen] = useState(false)
  // Electron環境判定: preload.jsにはopenCompactViewがあるがmockAPIにもある
  // → __ELECTRON__ グローバルフラグで判定（Electron main processが設定する）
  const isElectron = !!window.__ELECTRON__

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
        onCompactView={() => {
          if (isElectron) {
            window.electronAPI.toggleCompactView()
          } else {
            setShowOverlayPreview(v => !v)
          }
        }}
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
            matchupLoading={matchupLoading}
            macroAdvice={macroAdvice}
            macroLoading={macroLoading}
            objectivesStatus={objectivesStatus}
            ruleAlerts={ruleAlerts}
            skillOrder={champSelectExtras?.skills?.order}
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
      {/* ブラウザ用オーバーレイプレビュー */}
      {showOverlayPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-end pr-4 bg-black/60" onClick={() => setShowOverlayPreview(false)}>
          <div className="w-[300px] h-[70vh] max-h-[550px] rounded-lg overflow-hidden shadow-2xl border border-lol-gold/20" onClick={e => e.stopPropagation()}>
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
              embedded
            />
          </div>
        </div>
      )}
    </div>
  )
}
