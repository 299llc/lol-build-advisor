/**
 * Ollama 自動セットアップ
 * - インストール検出
 * - 自動ダウンロード＆インストール
 * - サービス起動
 * - モデル自動プル
 */
const { exec, spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const https = require('https')
const http = require('http')

const OLLAMA_API = 'http://localhost:11434'
const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download/OllamaSetup.exe'
const DEFAULT_MODEL = 'qwen3:4b'

class OllamaSetup {
  /**
   * @param {string} dataDir - app.getPath('userData')
   * @param {function} onProgress - 進捗コールバック ({ stage, message, percent? })
   */
  constructor(dataDir, onProgress) {
    this.dataDir = dataDir
    this.onProgress = onProgress || (() => {})
    this._pullAbort = null
  }

  /**
   * Ollama の状態を総合チェック
   * @returns {Promise<{ installed: boolean, running: boolean, models: string[] }>}
   */
  async checkStatus() {
    const running = await this._isRunning()
    if (running) {
      const models = await this._listModels()
      return { installed: true, running: true, models }
    }

    const installed = await this._isInstalled()
    return { installed, running: false, models: [] }
  }

  /**
   * フルセットアップ: 検出 → インストール → 起動 → モデルプル
   * @param {string} [model] - プルするモデル名 (デフォルト: qwen3:4b)
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async fullSetup(model = DEFAULT_MODEL) {
    try {
      // 1. 状態チェック
      this.onProgress({ stage: 'check', message: 'Ollamaの状態を確認中...' })
      let status = await this.checkStatus()

      // 2. 未インストール → ダウンロード＆インストール
      if (!status.installed) {
        this.onProgress({ stage: 'download', message: 'Ollamaをダウンロード中...', percent: 0 })
        const installerPath = await this._download()

        this.onProgress({ stage: 'install', message: 'Ollamaをインストール中...\n（インストーラーが表示されたら指示に従ってください）' })
        await this._install(installerPath)

        // インストール後少し待つ
        await this._sleep(3000)
        status = await this.checkStatus()
        if (!status.installed) {
          return { success: false, error: 'インストールが完了しませんでした。手動でインストールしてください。' }
        }
      }

      // 3. 未起動 → 起動
      if (!status.running) {
        this.onProgress({ stage: 'start', message: 'Ollamaを起動中...' })
        await this._startService()

        // 起動を待つ (最大30秒)
        const started = await this._waitForReady(30000)
        if (!started) {
          return { success: false, error: 'Ollamaの起動に失敗しました。手動で起動してください。' }
        }
        status = await this.checkStatus()
      }

      // 4. モデルがなければプル
      if (!status.models.some(m => m.startsWith(model.split(':')[0]))) {
        this.onProgress({ stage: 'pull', message: `モデル ${model} をダウンロード中...`, percent: 0 })
        await this._pullModel(model)
      }

      this.onProgress({ stage: 'done', message: 'セットアップ完了！' })
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  /**
   * モデルのみプル
   */
  async pullModel(model = DEFAULT_MODEL) {
    try {
      this.onProgress({ stage: 'pull', message: `モデル ${model} をダウンロード中...`, percent: 0 })
      await this._pullModel(model)
      this.onProgress({ stage: 'done', message: 'モデルのダウンロード完了！' })
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  cancelPull() {
    if (this._pullAbort) {
      this._pullAbort.abort()
      this._pullAbort = null
    }
  }

  // ── 内部メソッド ──

  async _isRunning() {
    try {
      const res = await fetch(`${OLLAMA_API}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      })
      return res.ok
    } catch {
      return false
    }
  }

  async _isInstalled() {
    return new Promise((resolve) => {
      // PATH 上の ollama を探す
      exec('where ollama', { timeout: 5000 }, (err, stdout) => {
        if (!err && stdout.trim()) {
          resolve(true)
          return
        }
        // 既定のインストール先をチェック
        const defaultPaths = [
          path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
          path.join(process.env.PROGRAMFILES || '', 'Ollama', 'ollama.exe'),
          path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe'),
        ]
        resolve(defaultPaths.some(p => fs.existsSync(p)))
      })
    })
  }

  _findOllamaExe() {
    const candidates = [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
      path.join(process.env.PROGRAMFILES || '', 'Ollama', 'ollama.exe'),
      path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe'),
    ]
    return candidates.find(p => fs.existsSync(p)) || 'ollama'
  }

  async _download() {
    const installerPath = path.join(this.dataDir, 'OllamaSetup.exe')

    // 既にダウンロード済みならスキップ
    if (fs.existsSync(installerPath)) {
      const stat = fs.statSync(installerPath)
      // 100MB以上ならダウンロード済みとみなす
      if (stat.size > 100 * 1024 * 1024) {
        return installerPath
      }
    }

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(installerPath)

      const request = (url) => {
        const lib = url.startsWith('https') ? https : http
        lib.get(url, (res) => {
          // リダイレクト追従
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            request(res.headers.location)
            return
          }

          if (res.statusCode !== 200) {
            reject(new Error(`ダウンロード失敗: HTTP ${res.statusCode}`))
            return
          }

          const totalSize = parseInt(res.headers['content-length'] || '0', 10)
          let downloaded = 0

          res.on('data', (chunk) => {
            downloaded += chunk.length
            if (totalSize > 0) {
              const percent = Math.round((downloaded / totalSize) * 100)
              this.onProgress({ stage: 'download', message: `Ollamaをダウンロード中... ${percent}%`, percent })
            }
          })

          res.pipe(file)
          file.on('finish', () => {
            file.close()
            resolve(installerPath)
          })
        }).on('error', (err) => {
          fs.unlink(installerPath, () => {})
          reject(new Error(`ダウンロードエラー: ${err.message}`))
        })
      }

      request(OLLAMA_DOWNLOAD_URL)
    })
  }

  async _install(installerPath) {
    return new Promise((resolve, reject) => {
      // サイレントインストール
      const proc = spawn(installerPath, ['/VERYSILENT', '/NORESTART'], {
        detached: true,
        stdio: 'ignore',
      })

      proc.on('error', (err) => {
        reject(new Error(`インストーラー起動失敗: ${err.message}`))
      })

      // インストーラーが終了するまで待つ (最大120秒)
      const timeout = setTimeout(() => {
        resolve() // タイムアウトしても進む
      }, 120000)

      proc.on('close', (code) => {
        clearTimeout(timeout)
        if (code === 0 || code === null) {
          resolve()
        } else {
          reject(new Error(`インストーラーがエラーコード ${code} で終了しました`))
        }
      })

      proc.unref()
    })
  }

  async _startService() {
    return new Promise((resolve) => {
      const ollamaExe = this._findOllamaExe()
      // ollama serve をバックグラウンドで起動
      const proc = spawn(ollamaExe, ['serve'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
      proc.unref()
      proc.on('error', () => {
        // Ollama app (GUI) が自動起動している場合もあるので無視
      })
      // 少し待ってから resolve
      setTimeout(resolve, 2000)
    })
  }

  async _waitForReady(timeoutMs = 30000) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (await this._isRunning()) return true
      await this._sleep(1000)
    }
    return false
  }

  async _pullModel(model) {
    this._pullAbort = new AbortController()

    const res = await fetch(`${OLLAMA_API}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
      signal: this._pullAbort.signal,
    })

    if (!res.ok) {
      throw new Error(`モデルプル失敗: HTTP ${res.status}`)
    }

    // ストリーミングレスポンスを読む
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const data = JSON.parse(line)
          if (data.total && data.completed) {
            const percent = Math.round((data.completed / data.total) * 100)
            this.onProgress({
              stage: 'pull',
              message: `モデル ${model} をダウンロード中... ${percent}%`,
              percent,
            })
          } else if (data.status) {
            this.onProgress({
              stage: 'pull',
              message: data.status,
            })
          }
        } catch {}
      }
    }

    this._pullAbort = null
  }

  async _listModels() {
    try {
      const res = await fetch(`${OLLAMA_API}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      })
      if (!res.ok) return []
      const data = await res.json()
      return (data.models || []).map(m => m.name)
    } catch {
      return []
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

module.exports = { OllamaSetup, DEFAULT_MODEL }
