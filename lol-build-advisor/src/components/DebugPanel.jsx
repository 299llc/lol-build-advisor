import { useState, useEffect } from 'react'
import { X, RefreshCw, Trash2, ChevronDown, ChevronRight, Copy, Check, Info, Send, MessageSquare } from 'lucide-react'

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async (e) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={handleCopy} className="text-lol-text hover:text-lol-gold" title="Copy">
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
    </button>
  )
}

const makeLabels = (base, label, color, bg) => ({
  [base]: { label, color, bg },
  [`${base}-step1`]: { label: `${label}①`, color, bg },
  [`${base}-step2`]: { label: `${label}②`, color, bg },
})
const TYPE_LABELS = {
  ...makeLabels('suggestion', 'BUILD', 'text-lol-gold', 'bg-lol-gold/10 border-lol-gold/20'),
  ...makeLabels('matchup', 'MATCHUP', 'text-purple-400', 'bg-purple-400/10 border-purple-400/20'),
  ...makeLabels('macro', 'MACRO', 'text-lol-blue', 'bg-lol-blue/10 border-lol-blue/20'),
  ...makeLabels('coaching', 'COACHING', 'text-green-400', 'bg-green-400/10 border-green-400/20'),
}

function formatResponse(text) {
  if (!text) return ''
  try {
    const parsed = JSON.parse(text)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return text
  }
}

export function DebugPanel({ onClose }) {
  const [logs, setLogs] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [debugState, setDebugState] = useState(null)

  const refresh = async () => {
    const data = await window.electronAPI?.getAiLogs()
    setLogs(data || [])
  }

  const clear = async () => {
    await window.electronAPI?.clearAiLogs()
    setLogs([])
  }

  const fetchState = async () => {
    const state = await window.electronAPI?.getDebugState()
    setDebugState(state || null)
  }

  useEffect(() => { refresh() }, [])

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-lol-surface border border-lol-gold/30 rounded-lg w-[95%] max-w-[600px] h-[80%] shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-lol-gold/20 shrink-0">
          <span className="font-heading text-xs text-lol-gold tracking-wider">AI DEBUG LOG</span>
          <div className="flex items-center gap-2">
            <button onClick={fetchState} className="text-lol-text hover:text-lol-gold" title="Current State">
              <Info size={14} />
            </button>
            <button onClick={refresh} className="text-lol-text hover:text-lol-blue" title="Refresh">
              <RefreshCw size={14} />
            </button>
            <button onClick={clear} className="text-lol-text hover:text-lol-red" title="Clear">
              <Trash2 size={14} />
            </button>
            <button onClick={onClose} className="text-lol-text hover:text-lol-text-light">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Logs */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {/* Current State */}
          {debugState && (
            <div className="rounded border border-lol-gold/50 bg-lol-bg">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[10px] font-heading tracking-wider text-lol-gold">CURRENT STATE</span>
                <div className="flex items-center gap-2">
                  <CopyButton text={JSON.stringify(debugState, null, 2)} />
                  <button onClick={() => setDebugState(null)} className="text-lol-text hover:text-lol-text-light">
                    <X size={12} />
                  </button>
                </div>
              </div>
              <pre className="text-[10px] text-lol-text-light bg-lol-surface rounded mx-2 mb-2 p-2 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto select-text cursor-text">
                {JSON.stringify(debugState, null, 2)}
              </pre>
            </div>
          )}

          {logs.length === 0 && !debugState && (
            <p className="text-xs text-lol-text text-center py-8">ログなし — AI提案をONにして試合を開始してください</p>
          )}

          {[...logs].reverse().map((log, i) => {
            const logKey = `${log.timestamp}-${log.type || i}`
            const isOpen = expanded === logKey
            const hasError = !!log.error
            const typeInfo = TYPE_LABELS[log.type] || { label: log.type?.toUpperCase() || '?', color: 'text-lol-text', bg: 'bg-lol-surface border-lol-gold-dim/30' }
            const requestText = [log.system, log.staticContext, log.userMessage || log.request].filter(Boolean).join('\n\n---\n\n')

            return (
              <div key={logKey} className={`rounded border ${hasError ? 'border-lol-red/30' : 'border-lol-gold-dim/30'} bg-lol-bg`}>
                {/* Summary row */}
                <button
                  onClick={() => setExpanded(isOpen ? null : logKey)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left"
                >
                  {isOpen ? <ChevronDown size={12} className="text-lol-text shrink-0" /> : <ChevronRight size={12} className="text-lol-text shrink-0" />}
                  {/* Type badge */}
                  <span className={`text-[9px] font-heading tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${typeInfo.bg} ${typeInfo.color}`}>
                    {typeInfo.label}
                  </span>
                  <span className="text-[10px] text-lol-text shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`text-[10px] shrink-0 ${hasError ? 'text-lol-red' : 'text-lol-blue'}`}>
                    {hasError ? 'ERROR' : `${log.durationMs}ms`}
                  </span>
                  {log.tokens && (
                    <span className="text-[10px] text-lol-text shrink-0">
                      in:{log.tokens.input} out:{log.tokens.output}
                    </span>
                  )}
                </button>

                {/* Expanded: Request → Response pair */}
                {isOpen && (
                  <div className="px-3 pb-3 space-y-2">
                    {/* REQUEST */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1">
                          <Send size={10} className="text-cyan-400" />
                          <span className="text-[10px] font-heading tracking-wider text-cyan-400">REQUEST</span>
                        </div>
                        <CopyButton text={requestText} />
                      </div>

                      {/* System prompt */}
                      {log.system && (
                        <div className="mb-1">
                          <span className="text-[9px] text-purple-400 font-heading tracking-wider">SYSTEM</span>
                          <pre className="text-[10px] text-lol-text-light bg-lol-surface rounded p-2 mt-0.5 overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto select-text cursor-text border-l-2 border-purple-400/30">
                            {log.system}
                          </pre>
                        </div>
                      )}

                      {/* User message */}
                      {(log.userMessage || log.request) && (
                        <div>
                          <span className="text-[9px] text-cyan-400 font-heading tracking-wider">USER</span>
                          <pre className="text-[10px] text-lol-text-light bg-lol-surface rounded p-2 mt-0.5 overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto select-text cursor-text border-l-2 border-cyan-400/30">
                            {log.userMessage || log.request}
                          </pre>
                        </div>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-2 py-0.5">
                      <div className="flex-1 h-px bg-lol-gold-dim/20" />
                      <span className="text-[9px] text-lol-text">↓</span>
                      <div className="flex-1 h-px bg-lol-gold-dim/20" />
                    </div>

                    {/* RESPONSE */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1">
                          <MessageSquare size={10} className={hasError ? 'text-lol-red' : 'text-lol-gold'} />
                          <span className={`text-[10px] font-heading tracking-wider ${hasError ? 'text-lol-red' : 'text-lol-gold'}`}>
                            RESPONSE
                          </span>
                        </div>
                        {log.response && <CopyButton text={log.response} />}
                      </div>

                      {hasError ? (
                        <pre className="text-[10px] text-lol-red/80 bg-lol-surface rounded p-2 whitespace-pre-wrap select-text cursor-text border-l-2 border-lol-red/30">
                          {log.error}
                        </pre>
                      ) : log.response ? (
                        <pre className="text-[10px] text-lol-text-light bg-lol-surface rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto select-text cursor-text border-l-2 border-lol-gold/30">
                          {formatResponse(log.response)}
                        </pre>
                      ) : (
                        <p className="text-[10px] text-lol-text italic px-2">レスポンスなし</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
