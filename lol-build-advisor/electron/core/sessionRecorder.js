/**
 * セッションレコーダー
 *
 * 試合中の全 IPC イベント (Main→Renderer) をタイムスタンプ付きで記録し、
 * JSON ファイルとして保存する。ブラウザテストモードで再生可能。
 *
 * 使い方 (main.js):
 *   const { SessionRecorder } = require('./core/sessionRecorder')
 *   const recorder = new SessionRecorder(app.getPath('userData'))
 *   // webContents.send を wrap する
 *   recorder.install(state.mainWindow.webContents)
 *   // 試合終了時
 *   recorder.save()  // → game-logs/session_2026-03-15_14-30-00.json
 */

const fs = require('fs')
const path = require('path')

// 記録対象チャネル（Main→Renderer）
const RECORD_CHANNELS = [
  'game:status',
  'game:data',
  'core:build',
  'ai:suggestion',
  'ai:loading',
  'matchup:tip',
  'macro:advice',
  'macro:loading',
  'coaching:result',
  'coaching:loading',
  'substitute:items',
  'substitute:error',
  'champselect:team',
  'champselect:extras',
  'position:select',
  'objectives:status',
]

class SessionRecorder {
  constructor(userDataPath) {
    this.userDataPath = userDataPath
    this.events = []
    this.startTime = 0
    this.recording = false
    this._originalSend = null
    this._webContents = null
  }

  /**
   * webContents.send をラップして記録を開始
   */
  install(webContents) {
    if (this._originalSend) return // 既にインストール済み

    this._webContents = webContents
    this._originalSend = webContents.send.bind(webContents)

    const self = this
    webContents.send = function (channel, ...args) {
      // 記録対象チャネルなら保存
      if (self.recording && RECORD_CHANNELS.includes(channel)) {
        self.events.push({
          t: Date.now() - self.startTime,
          ch: channel,
          data: args.length === 1 ? args[0] : args,
        })
      }
      // 元の send を実行
      return self._originalSend(channel, ...args)
    }

    console.log('[Recorder] Installed on webContents')
  }

  /**
   * アンインストール（元の send に戻す）
   */
  uninstall() {
    if (this._originalSend && this._webContents) {
      this._webContents.send = this._originalSend
      this._originalSend = null
      this._webContents = null
    }
  }

  /**
   * 記録開始
   */
  start() {
    this.events = []
    this.startTime = Date.now()
    this.recording = true
    console.log('[Recorder] Recording started')
  }

  /**
   * 記録停止
   */
  stop() {
    this.recording = false
    console.log(`[Recorder] Recording stopped. ${this.events.length} events captured`)
  }

  /**
   * 記録中かどうか
   */
  isRecording() {
    return this.recording
  }

  /**
   * 記録をファイルに保存
   * @returns {string|null} 保存先パス
   */
  save() {
    this.stop()

    if (this.events.length === 0) {
      console.log('[Recorder] No events to save')
      return null
    }

    const dir = path.join(this.userDataPath, 'game-logs')
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const now = new Date()
    const timestamp = now.toISOString()
      .replace(/T/, '_')
      .replace(/:/g, '-')
      .replace(/\.\d+Z/, '')
    const filename = `session_${timestamp}.json`
    const filepath = path.join(dir, filename)

    // メタデータ付きで保存
    const session = {
      version: 1,
      recordedAt: now.toISOString(),
      duration: this.events.length > 0
        ? this.events[this.events.length - 1].t
        : 0,
      eventCount: this.events.length,
      events: this.events,
    }

    fs.writeFileSync(filepath, JSON.stringify(session, null, 2), 'utf-8')
    console.log(`[Recorder] Saved ${this.events.length} events to ${filepath}`)

    return filepath
  }

  /**
   * 保存済みセッション一覧を取得
   * @returns {Array<{name, path, recordedAt, eventCount, duration}>}
   */
  listSessions() {
    const dir = path.join(this.userDataPath, 'game-logs')
    if (!fs.existsSync(dir)) return []

    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const filepath = path.join(dir, f)
          const raw = fs.readFileSync(filepath, 'utf-8')
          const session = JSON.parse(raw)
          return {
            name: f.replace('.json', ''),
            path: filepath,
            recordedAt: session.recordedAt,
            eventCount: session.eventCount || 0,
            duration: session.duration || 0,
          }
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
  }

  /**
   * セッションファイルを読み込む
   * @param {string} filepath
   * @returns {object|null}
   */
  static loadSession(filepath) {
    try {
      const raw = fs.readFileSync(filepath, 'utf-8')
      return JSON.parse(raw)
    } catch (err) {
      console.error(`[Recorder] Failed to load session: ${err.message}`)
      return null
    }
  }
}

module.exports = { SessionRecorder }
