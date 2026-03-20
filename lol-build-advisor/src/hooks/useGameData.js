import { useState, useEffect } from 'react'

export function useGameData() {
  const [status, setStatus] = useState('waiting') // waiting | ingame
  const [gameData, setGameData] = useState(null)
  const [coreBuild, setCoreBuild] = useState(null)
  const [aiSuggestion, setAiSuggestion] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [positionSelectChamp, setPositionSelectChamp] = useState(null)
  const [substituteItems, setSubstituteItems] = useState([])
  const [champSelectTeam, setChampSelectTeam] = useState([])
  const [coaching, setCoaching] = useState(null)
  const [coachingLoading, setCoachingLoading] = useState(false)
  const [substituteError, setSubstituteError] = useState(null)
  const [matchupTip, setMatchupTip] = useState(null)
  const [matchupLoading, setMatchupLoading] = useState(false)
  const [champSelectExtras, setChampSelectExtras] = useState(null)
  const [macroAdvice, setMacroAdvice] = useState(null)
  const [macroLoading, setMacroLoading] = useState(false)
  const [objectivesStatus, setObjectivesStatus] = useState(null)
  const [ruleAlerts, setRuleAlerts] = useState([])

  useEffect(() => {
    if (!window.electronAPI) return

    // 前回の試合結果を復元
    window.electronAPI.getLastGame?.().then(lastGame => {
      if (lastGame && lastGame.gameData) {
        setStatus('ended')
        setGameData({ ...lastGame.gameData, ended: true })
        if (lastGame.coaching) setCoaching(lastGame.coaching)
      }
    }).catch(() => {})

    const unsubs = [
      window.electronAPI.onGameStatus((newStatus) => {
        setStatus(prev => {
          // ingameに切り替わったら古いコーチング結果をクリア
          if (newStatus === 'ingame' && prev !== 'ingame') {
            setCoaching(null)
          }
          return newStatus
        })
      }),
      window.electronAPI.onGameData(setGameData),
      window.electronAPI.onAiSuggestion(setAiSuggestion),
      window.electronAPI.onAiLoading(setAiLoading),
      window.electronAPI.onCoreBuild?.(setCoreBuild),
      window.electronAPI.onPositionSelect?.(setPositionSelectChamp),
      window.electronAPI.onSubstituteItems?.(setSubstituteItems),
      window.electronAPI.onChampSelectTeam?.(setChampSelectTeam),
      window.electronAPI.onMatchupTip?.(setMatchupTip),
      window.electronAPI.onMatchupLoading?.(setMatchupLoading),
      window.electronAPI.onCoachingResult?.(setCoaching),
      window.electronAPI.onCoachingLoading?.(setCoachingLoading),
      window.electronAPI.onSubstituteError?.(setSubstituteError),
      window.electronAPI.onChampSelectExtras?.(setChampSelectExtras),
      window.electronAPI.onMacroAdvice?.(setMacroAdvice),
      window.electronAPI.onMacroLoading?.(setMacroLoading),
      window.electronAPI.onObjectivesStatus?.(setObjectivesStatus),
      window.electronAPI.onRuleAlerts?.(setRuleAlerts),
    ]
    return () => unsubs.forEach(fn => fn?.())
  }, [])

  return { status, gameData, coreBuild, aiSuggestion, aiLoading, positionSelectChamp, substituteItems, champSelectTeam, coaching, coachingLoading, substituteError, matchupTip, matchupLoading, champSelectExtras, macroAdvice, macroLoading, objectivesStatus, ruleAlerts }
}
