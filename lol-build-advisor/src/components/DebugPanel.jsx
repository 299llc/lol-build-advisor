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
  [`${base}-step1`]: { label: `${label} STEP1`, color, bg },
  [`${base}-step2`]: { label: `${label} STEP2`, color, bg },
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

function shortId(value) {
  if (!value || typeof value !== 'string') return '-'
  if (value.length <= 18) return value
  return `${value.slice(0, 8)}...${value.slice(-8)}`
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

        {logs.some(l => l.tokens) && (() => {
          const totalIn = logs.reduce((s, l) => s + (l.tokens?.input || 0), 0)
          const totalOut = logs.reduce((s, l) => s + (l.tokens?.output || 0), 0)
          const totalCache = logs.reduce((s, l) => s + (l.tokens?.cache_read || 0), 0)
          const hitRate = totalIn > 0 ? Math.round(totalCache / totalIn * 100) : 0
          return (
            <div className="flex items-center gap-3 px-4 py-1.5 border-b border-lol-gold/10 text-[10px] shrink-0">
              <span className="text-lol-text">calls:<span className="text-lol-text-light">{logs.filter(l => l.tokens).length}</span></span>
              <span className="text-lol-text">in:<span className="text-lol-text-light">{(totalIn / 1000).toFixed(1)}k</span></span>
              <span className="text-lol-text">out:<span className="text-lol-text-light">{(totalOut / 1000).toFixed(1)}k</span></span>
              <span className={`${hitRate > 0 ? 'text-green-400' : 'text-lol-text'}`}>
                cache:<span className={hitRate > 0 ? 'text-green-400' : 'text-lol-text-light'}>{hitRate}%</span>
              </span>
            </div>
          )
        })()}

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
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
            <p className="text-xs text-lol-text text-center py-8">ログはまだありません。AI を動かしてから再読み込みしてください。</p>
          )}

          {[...logs].reverse().map((log, i) => {
            const logKey = `${log.timestamp}-${log.type || i}`
            const isOpen = expanded === logKey
            const hasError = !!log.error
            const typeInfo = TYPE_LABELS[log.type] || { label: log.type?.toUpperCase() || '?', color: 'text-lol-text', bg: 'bg-lol-surface border-lol-gold-dim/30' }
            const requestText = [log.system, log.staticContext, log.userMessage || log.request].filter(Boolean).join('\n\n---\n\n')

            return (
              <div key={logKey} className={`rounded border ${hasError ? 'border-lol-red/30' : 'border-lol-gold-dim/30'} bg-lol-bg`}>
                <button
                  onClick={() => setExpanded(isOpen ? null : logKey)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left"
                >
                  {isOpen ? <ChevronDown size={12} className="text-lol-text shrink-0" /> : <ChevronRight size={12} className="text-lol-text shrink-0" />}
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
                      {log.tokens.cache_read > 0 && (
                        <span className="text-green-400"> cache:{Math.round(log.tokens.cache_read / Math.max(log.tokens.input, 1) * 100)}%</span>
                      )}
                    </span>
                  )}
                  {log.sessionInfo?.mode === 'interactions' && (
                    <span
                      className={`text-[10px] shrink-0 ${log.sessionInfo.continued ? 'text-green-400' : 'text-lol-blue'}`}
                      title={`kind=${log.sessionInfo.kind} previous=${log.sessionInfo.previousInteractionId || '-'} current=${log.sessionInfo.interactionId || '-'}`}
                    >
                      {log.sessionInfo.kind}:{log.sessionInfo.continued ? '継続' : '新規'}
                    </span>
                  )}
                  {log.model && (
                    <span className="text-[10px] shrink-0 text-lol-gold" title={log.model}>
                      {log.model}
                    </span>
                  )}
                </button>

                {isOpen && (
                  <div className="px-3 pb-3 space-y-2">
                    {log.sessionInfo && (
                      <div className="rounded border border-lol-blue/30 bg-lol-blue/5 px-3 py-2">
                        <div className="flex items-center gap-1 mb-1">
                          <MessageSquare size={10} className="text-lol-blue" />
                          <span className="text-[10px] font-heading tracking-wider text-lol-blue">SESSION</span>
                        </div>
                        <div className="mb-1 text-[10px] text-lol-text-light">
                          model: <span className="text-lol-gold">{log.sessionInfo.model || log.model || '-'}</span>
                        </div>
                        {log.sessionInfo.mode === 'interactions' ? (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-lol-text-light">
                            <span>種別: <span className="text-lol-blue">{log.sessionInfo.kind || '-'}</span></span>
                            <span>状態: <span className={log.sessionInfo.continued ? 'text-green-400' : 'text-lol-blue'}>{log.sessionInfo.continued ? '継続' : '新規'}</span></span>
                            <span className="col-span-2">previous_interaction_id: <span className="text-lol-blue" title={log.sessionInfo.previousInteractionId || '-'}>{shortId(log.sessionInfo.previousInteractionId)}</span></span>
                            <span className="col-span-2">current_interaction_id: <span className="text-lol-blue" title={log.sessionInfo.interactionId || '-'}>{shortId(log.sessionInfo.interactionId)}</span></span>
                          </div>
                        ) : (
                          <div className="flex gap-3 text-[10px] text-lol-text-light">
                            <span>ターン: <span className="text-lol-blue">{log.sessionInfo.turns}</span></span>
                            <span>メッセージ数: <span className="text-lol-blue">{log.sessionInfo.totalMessages}</span></span>
                            <span>フェーズ: <span className="text-lol-blue">{log.sessionInfo.phase === 'early' ? '序盤' : log.sessionInfo.phase === 'mid' ? '中盤' : '終盤'}</span></span>
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1">
                          <Send size={10} className="text-cyan-400" />
                          <span className="text-[10px] font-heading tracking-wider text-cyan-400">REQUEST</span>
                        </div>
                        <CopyButton text={requestText} />
                      </div>

                      {log.system && (
                        <div className="mb-1">
                          <span className="text-[9px] text-purple-400 font-heading tracking-wider">SYSTEM</span>
                          <pre className="text-[10px] text-lol-text-light bg-lol-surface rounded p-2 mt-0.5 overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto select-text cursor-text border-l-2 border-purple-400/30">
                            {log.system}
                          </pre>
                        </div>
                      )}

                      {(log.userMessage || log.request) && (
                        <div>
                          <span className="text-[9px] text-cyan-400 font-heading tracking-wider">USER</span>
                          <pre className="text-[10px] text-lol-text-light bg-lol-surface rounded p-2 mt-0.5 overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto select-text cursor-text border-l-2 border-cyan-400/30">
                            {log.userMessage || log.request}
                          </pre>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 py-0.5">
                      <div className="flex-1 h-px bg-lol-gold-dim/20" />
                      <span className="text-[9px] text-lol-text">/</span>
                      <div className="flex-1 h-px bg-lol-gold-dim/20" />
                    </div>

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
