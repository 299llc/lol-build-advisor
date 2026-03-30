import { useState, useRef, useCallback, useEffect } from 'react'

const SCENARIO_LABELS = {
  'waiting': '待機中',
  'champselect': 'チャンプセレクト',
  'ingame-early': '試合序盤 (6分)',
  'ingame-mid': '試合中盤 (18分)',
  'ingame-late': '試合終盤 (26分)',
  'ended': '試合終了',
  'position-select': 'ポジション選択',
}

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${String(sec).padStart(2, '0')}`
}

function SessionPlayer() {
  const [session, setSession] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(4)
  const fileRef = useRef(null)

  // 再生状態の監視
  useEffect(() => {
    if (!session) return
    const test = window.__test
    if (!test) return
    test.getReplayState().onProgress = (elapsed, total) => {
      setProgress(elapsed)
      setDuration(total)
      setPlaying(test.getReplayState().playing)
    }
    return () => {
      test.getReplayState().onProgress = null
    }
  }, [session])

  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const sess = await window.__test.importSessionFile(file)
      setSession(sess)
      setDuration(sess.duration || 0)
      setProgress(0)
      setPlaying(false)
      console.log(`[SessionPlayer] Loaded: ${sess.eventCount} events, ${formatTime(sess.duration)}`)
    } catch (err) {
      alert(err.message)
    }
  }, [])

  const handlePlay = () => {
    if (!session) return
    window.__test.replaySession(session, speed)
    setPlaying(true)
  }

  const handlePause = () => {
    window.__test.pauseReplay()
    setPlaying(false)
  }

  const handleResume = () => {
    window.__test.resumeReplay()
    setPlaying(true)
  }

  const handleStop = () => {
    window.__test.stopReplay()
    setPlaying(false)
    setProgress(0)
  }

  const handleSeek = (e) => {
    const val = parseInt(e.target.value)
    window.__test.seekReplay(val)
    setProgress(val)
  }

  const handleSpeedChange = (newSpeed) => {
    setSpeed(newSpeed)
    // 再生中なら速度変更を反映
    if (playing && session) {
      window.__test.stopReplay()
      window.__test.getReplayState().session = session
      window.__test.replaySession(session, newSpeed)
      window.__test.seekReplay(progress)
    }
  }

  return (
    <div className="mt-2 border-t border-purple-600 pt-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] text-purple-300 font-bold">SESSION REPLAY:</span>
        <button
          onClick={() => fileRef.current?.click()}
          className="px-2 py-0.5 text-[10px] rounded bg-purple-800 border border-purple-600 text-purple-200 hover:bg-purple-700"
          data-testid="session-import"
        >
          📁 ファイル読込
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileSelect}
        />
        {session && (
          <span className="text-[10px] text-purple-400">
            {session.eventCount}イベント / {formatTime(session.duration)}
          </span>
        )}
      </div>

      {session && (
        <div className="space-y-1">
          {/* 再生コントロール */}
          <div className="flex items-center gap-2">
            {!playing ? (
              <button
                onClick={progress > 0 ? handleResume : handlePlay}
                className="px-2 py-0.5 text-[10px] rounded bg-green-700 text-white hover:bg-green-600"
                data-testid="session-play"
              >
                ▶ {progress > 0 ? '再開' : '再生'}
              </button>
            ) : (
              <button
                onClick={handlePause}
                className="px-2 py-0.5 text-[10px] rounded bg-yellow-700 text-white hover:bg-yellow-600"
                data-testid="session-pause"
              >
                ⏸ 一時停止
              </button>
            )}
            <button
              onClick={handleStop}
              className="px-2 py-0.5 text-[10px] rounded bg-red-700 text-white hover:bg-red-600"
              data-testid="session-stop"
            >
              ⏹ 停止
            </button>

            {/* 速度 */}
            <div className="flex items-center gap-1 ml-2">
              {[1, 2, 4, 8, 16].map(s => (
                <button
                  key={s}
                  onClick={() => handleSpeedChange(s)}
                  className={`px-1.5 py-0.5 text-[9px] rounded ${
                    speed === s
                      ? 'bg-purple-500 text-white'
                      : 'bg-purple-800 text-purple-300 hover:bg-purple-700'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* タイムライン */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-purple-400 w-10 text-right">{formatTime(progress)}</span>
            <input
              type="range"
              min={0}
              max={duration}
              value={progress}
              onChange={handleSeek}
              className="flex-1 h-1 accent-purple-400"
              data-testid="session-timeline"
            />
            <span className="text-[9px] text-purple-400 w-10">{formatTime(duration)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export function ScenarioSelector() {
  const [current, setCurrent] = useState(null)
  const [collapsed, setCollapsed] = useState(false)
  const scenarios = window.__test?.scenarios || []

  const handleLoad = (name) => {
    // 再生中なら停止
    window.__test?.stopReplay?.()
    window.__test?.loadScenario(name)
    setCurrent(name)
  }

  if (collapsed) {
    return (
      <div className="bg-purple-900/95 px-2 py-1 flex justify-end shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="px-2 py-0.5 text-[10px] bg-purple-600 text-white rounded"
          data-testid="scenario-toggle"
        >
          TEST
        </button>
      </div>
    )
  }

  return (
    <div className="bg-purple-900/95 border-b-2 border-purple-400 px-3 py-2 shrink-0" data-testid="scenario-panel">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-purple-300 font-bold shrink-0">SCENARIO:</span>
        {scenarios.map(name => (
          <button
            key={name}
            onClick={() => handleLoad(name)}
            data-testid={`scenario-${name}`}
            className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${
              current === name
                ? 'bg-purple-500 border-purple-300 text-white'
                : 'bg-purple-800 border-purple-600 text-purple-200 hover:bg-purple-700'
            }`}
          >
            {SCENARIO_LABELS[name] || name}
          </button>
        ))}
        <button
          onClick={() => setCollapsed(true)}
          className="ml-auto text-[10px] text-purple-400 hover:text-purple-200"
        >
          Hide
        </button>
      </div>
      {current && (
        <div className="text-[10px] text-purple-400 mt-1">
          Active: {current} ({SCENARIO_LABELS[current] || ''})
        </div>
      )}

      {/* セッション再生パネル */}
      <SessionPlayer />
    </div>
  )
}
