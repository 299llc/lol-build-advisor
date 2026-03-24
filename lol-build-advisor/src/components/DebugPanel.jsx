import { useState, useEffect } from 'react'
import { X, RefreshCw, Trash2, ChevronDown, ChevronRight, Copy, Check, Info, Send, MessageSquare, FileText } from 'lucide-react'

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

// プロンプトテキスト内の【静的情報】【動的情報】セクションを色分け表示
function PromptText({ text }) {
  if (!text) return null
  // 【静的情報...】〜次の【...】まで / 【動的情報...】〜次の【...】まで を検出して色分け
  const segments = []
  const regex = /【(静的情報[^】]*)】|【(動的情報[^】]*)】/g
  let lastIdx = 0
  let currentType = null  // 'static' | 'dynamic' | null
  let match

  // セクションヘッダーの位置を全て収集
  const headers = []
  const headerRegex = /【[^】]+】/g
  let hm
  while ((hm = headerRegex.exec(text)) !== null) {
    headers.push(hm.index)
  }

  while ((match = regex.exec(text)) !== null) {
    // 前のセクションを閉じる
    if (lastIdx < match.index) {
      segments.push({ type: currentType, text: text.slice(lastIdx, match.index) })
    }
    // このヘッダーから次の大セクションヘッダーまでの範囲を決定
    currentType = match[1] ? 'static' : 'dynamic'
    lastIdx = match.index
  }
  // 残りのテキスト
  if (lastIdx < text.length) {
    segments.push({ type: currentType, text: text.slice(lastIdx) })
  }
  // 色分けがない場合はそのまま表示
  if (segments.length <= 1 && !currentType) {
    return (
      <pre className="text-[10px] text-lol-text-light bg-lol-bg rounded p-2 mt-0.5 whitespace-pre-wrap max-h-32 overflow-y-auto select-text cursor-text border-l-2 border-cyan-400/30">
        {text}
      </pre>
    )
  }
  return (
    <pre className="text-[10px] text-lol-text-light bg-lol-bg rounded p-2 mt-0.5 whitespace-pre-wrap max-h-48 overflow-y-auto select-text cursor-text border-l-2 border-cyan-400/30">
      {segments.map((seg, i) => {
        if (seg.type === 'static') {
          return <span key={i} className="bg-amber-400/8 border-l-2 border-amber-400/40 pl-1 -ml-1 block">{seg.text.split('\n').map((line, li) => {
            if (line.match(/【静的情報/)) return <span key={li} className="text-amber-400 font-bold">{line}{'\n'}</span>
            return <span key={li}>{line}{li < seg.text.split('\n').length - 1 ? '\n' : ''}</span>
          })}</span>
        }
        if (seg.type === 'dynamic') {
          return <span key={i} className="bg-lol-blue/8 border-l-2 border-lol-blue/40 pl-1 -ml-1 block">{seg.text.split('\n').map((line, li) => {
            if (line.match(/【動的情報/)) return <span key={li} className="text-lol-blue font-bold">{line}{'\n'}</span>
            return <span key={li}>{line}{li < seg.text.split('\n').length - 1 ? '\n' : ''}</span>
          })}</span>
        }
        return <span key={i}>{seg.text}</span>
      })}
    </pre>
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
  const [promptPreview, setPromptPreview] = useState(null)
  const [previewExpanded, setPreviewExpanded] = useState(null)
  const [previewRole, setPreviewRole] = useState('')
  const [previewPhase, setPreviewPhase] = useState({}) // { build: 'bootstrap'|'update', macro: 'bootstrap'|'update' }

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

  const fetchPromptPreview = async (role) => {
    const data = await window.electronAPI?.getPromptPreview(role || undefined)
    setPromptPreview(data || null)
  }

  useEffect(() => { refresh(); fetchPromptPreview() }, [])

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-lol-surface border border-lol-gold/30 rounded-lg w-[95%] max-w-[600px] h-[80%] shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-lol-gold/20 shrink-0">
          <span className="font-heading text-xs text-lol-gold tracking-wider">AI DEBUG LOG</span>
          <div className="flex items-center gap-2">
            <button onClick={fetchPromptPreview} className="text-lol-text hover:text-purple-400" title="Prompt Preview">
              <FileText size={14} />
            </button>
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

          {promptPreview && (
            <div className="rounded border border-purple-400/30 bg-lol-bg">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[10px] font-heading tracking-wider text-purple-400">PROMPT PREVIEW</span>
                <div className="flex items-center gap-2">
                  {promptPreview.detectedRole !== '未検出' && (
                    <span className="text-[9px] text-lol-text">検出: <span className="text-lol-blue">{promptPreview.detectedRole}</span></span>
                  )}
                  <select
                    value={previewRole}
                    onChange={(e) => {
                      setPreviewRole(e.target.value)
                      fetchPromptPreview(e.target.value || undefined)
                    }}
                    className="px-1.5 py-0.5 text-[10px] bg-lol-surface border border-lol-gold-dim/30 rounded text-lol-gold focus:outline-none focus:border-purple-400/50"
                  >
                    <option value="">自動検出</option>
                    <option value="TOP">TOP</option>
                    <option value="JG">JG</option>
                    <option value="MID">MID</option>
                    <option value="ADC">ADC</option>
                    <option value="SUP">SUP</option>
                  </select>
                  <button onClick={() => setPromptPreview(null)} className="text-lol-text hover:text-lol-text-light">
                    <X size={12} />
                  </button>
                </div>
              </div>
              <div className="px-3 pb-3 space-y-1.5">
                {[
                  { key: 'build', label: 'BUILD', color: 'text-lol-gold', border: 'border-lol-gold/30', badgeBg: 'bg-lol-gold/10 border-lol-gold/30' },
                  { key: 'matchup', label: 'MATCHUP', color: 'text-purple-400', border: 'border-purple-400/30', badgeBg: 'bg-purple-400/10 border-purple-400/30' },
                  { key: 'coaching', label: 'COACHING', color: 'text-green-400', border: 'border-green-400/30', badgeBg: 'bg-green-400/10 border-green-400/30' },
                ].map(({ key, label, color, border, badgeBg }) => {
                  const data = promptPreview[key]
                  if (!data) return null
                  const isOpen = previewExpanded === key
                  const sp = data.sendPattern
                  return (
                    <div key={key} className={`rounded border ${border} bg-lol-surface`}>
                      <button
                        onClick={() => setPreviewExpanded(isOpen ? null : key)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left"
                      >
                        {isOpen ? <ChevronDown size={10} className="text-lol-text" /> : <ChevronRight size={10} className="text-lol-text" />}
                        <span className={`text-[10px] font-heading tracking-wider ${color}`}>{label}</span>
                        {sp && (
                          <span className={`text-[8px] px-1.5 py-0.5 rounded border ${sp.type === 'recurring' ? 'bg-lol-blue/10 border-lol-blue/30 text-lol-blue' : 'bg-amber-400/10 border-amber-400/30 text-amber-400'}`}>
                            {sp.label}
                          </span>
                        )}
                        <span className="text-[10px] text-lol-text ml-auto">{(data.knowledgeChars / 1000).toFixed(1)}k chars</span>
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-2 space-y-1.5">
                          {sp?.detail && (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-lol-bg/50 border border-lol-gold-dim/20">
                              <Info size={10} className="text-lol-text shrink-0" />
                              <span className="text-[9px] text-lol-text">{sp.detail}</span>
                            </div>
                          )}
                          <div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] text-lol-blue font-heading tracking-wider">KNOWLEDGE</span>
                                {sp?.knowledgeLabel && (
                                  <span className="text-[8px] px-1 py-0.5 rounded bg-lol-blue/10 text-lol-blue/70">{sp.knowledgeLabel}</span>
                                )}
                              </div>
                              <CopyButton text={data.knowledge} />
                            </div>
                            <pre className="text-[10px] text-lol-text-light bg-lol-bg rounded p-2 mt-0.5 whitespace-pre-wrap max-h-48 overflow-y-auto select-text cursor-text border-l-2 border-lol-blue/30">
                              {data.knowledge}
                            </pre>
                          </div>
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] text-cyan-400 font-heading tracking-wider">PROMPT</span>
                              <CopyButton text={data.prompt} />
                            </div>
                            <PromptText text={data.prompt} />
                          </div>
                          {data.examplePayloads && (
                            <div>
                              <div className="flex items-center gap-1 mb-1">
                                <span className="text-[9px] text-lol-gold font-heading tracking-wider">USER MESSAGE</span>
                                <div className="flex ml-auto">
                                  {[
                                    { id: 'bootstrap', label: '初回', desc: '静的+動的' },
                                    { id: 'update', label: '2回目以降', desc: '動的のみ' },
                                  ].map(({ id, label, desc }) => (
                                    <button
                                      key={id}
                                      onClick={() => setPreviewPhase(p => ({ ...p, [key]: id }))}
                                      className={`px-2 py-0.5 text-[9px] border ${
                                        (previewPhase[key] || 'bootstrap') === id
                                          ? 'bg-lol-gold/15 border-lol-gold/40 text-lol-gold'
                                          : 'bg-lol-surface border-lol-gold-dim/20 text-lol-text hover:text-lol-text-light'
                                      } ${id === 'bootstrap' ? 'rounded-l' : 'rounded-r border-l-0'}`}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {(() => {
                                const phase = previewPhase[key] || 'bootstrap'
                                const payload = data.examplePayloads[phase]
                                if (!payload) return null
                                const json = JSON.stringify(payload, null, 2)
                                return (
                                  <div className="relative">
                                    <div className="absolute top-1 right-1"><CopyButton text={json} /></div>
                                    <pre className="text-[10px] bg-lol-bg rounded p-2 whitespace-pre-wrap max-h-56 overflow-y-auto select-text cursor-text border-l-2 border-lol-gold/30">
                                      {json.split('\n').map((line, li) => {
                                        // static_context行をハイライト
                                        if (line.includes('"static_context"')) return <span key={li} className="text-amber-400">{line}{'\n'}</span>
                                        // dynamic_context行をハイライト
                                        if (line.includes('"dynamic_context"')) return <span key={li} className="text-lol-blue">{line}{'\n'}</span>
                                        // update_type行をハイライト
                                        if (line.includes('"update_type"')) return <span key={li} className="text-cyan-400">{line}{'\n'}</span>
                                        // static_context内のキーは黄色系
                                        if (phase === 'bootstrap' && (line.includes('"enemy_skills"') || line.includes('"enemy_healing"') || line.includes('"enemy_cc_level"') || line.includes('"core_build"'))) {
                                          return <span key={li} className="text-amber-300/80">{line}{'\n'}</span>
                                        }
                                        return <span key={li} className="text-lol-text-light">{line}{'\n'}</span>
                                      })}
                                    </pre>
                                    <div className="flex items-center gap-2 mt-1 px-1">
                                      {phase === 'bootstrap' ? (
                                        <>
                                          <span className="inline-flex items-center gap-1 text-[8px]"><span className="w-2 h-2 rounded-sm bg-amber-400/30 border border-amber-400/50" /> static_context — 初回のみ送信</span>
                                          <span className="inline-flex items-center gap-1 text-[8px]"><span className="w-2 h-2 rounded-sm bg-lol-blue/30 border border-lol-blue/50" /> dynamic_context — 毎回更新</span>
                                        </>
                                      ) : (
                                        <span className="text-[8px] text-lol-text">static_context は会話履歴に残っているため省略。dynamic_context のみ送信</span>
                                      )}
                                    </div>
                                  </div>
                                )
                              })()}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {logs.length === 0 && !debugState && !promptPreview && (
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
                  {log.type === 'macro' && log.sessionInfo?.trigger && (
                    <span className="text-[10px] shrink-0 text-cyan-400" title={log.sessionInfo.trigger}>
                      trigger:{log.sessionInfo.trigger}
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
                            {log.sessionInfo.trigger && (
                              <span className="col-span-2">trigger: <span className="text-cyan-400">{log.sessionInfo.trigger}</span></span>
                            )}
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
