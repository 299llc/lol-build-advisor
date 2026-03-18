// LCU (League Client Update) API クライアント
// チャンピオンセレクト等、ゲーム開始前のデータ取得用
const https = require('https')
const fs = require('fs')
const path = require('path')

class LcuClient {
  constructor() {
    this.port = null
    this.password = null
    this.connected = false
  }

  // lockfileからLCU認証情報を取得
  async connect() {
    const lockfile = await this._findLockfile()
    if (!lockfile) { this.connected = false; return false }

    try {
      const content = fs.readFileSync(lockfile, 'utf-8')
      // format: processName:pid:port:password:protocol
      const parts = content.split(':')
      this.port = parts[2]
      this.password = parts[3]
      this.connected = true
      return true
    } catch {
      this.connected = false
      return false
    }
  }

  _findLockfile() {
    // Windows標準パス + 環境変数
    const candidates = [
      'C:\\Riot Games\\League of Legends\\lockfile',
      'D:\\Riot Games\\League of Legends\\lockfile',
      path.join(process.env.LOCALAPPDATA || '', 'Riot Games', 'League of Legends', 'lockfile'),
    ]

    // プロセスから探す (Windows: wmic)
    for (const p of candidates) {
      if (fs.existsSync(p)) return p
    }

    // cmdline引数から探す
    return this._findLockfileFromProcess()
  }

  async _findLockfileFromProcess() {
    return new Promise((resolve) => {
      const { exec } = require('child_process')
      exec('wmic process where "name=\'LeagueClientUx.exe\'" get CommandLine /format:list', { timeout: 3000 }, (err, stdout) => {
        if (err || !stdout) return resolve(null)
        const match = stdout.match(/--install-directory=([^\s"]+)/i)
        if (match) {
          const lockPath = path.join(match[1], 'lockfile')
          if (fs.existsSync(lockPath)) return resolve(lockPath)
        }
        resolve(null)
      })
    })
  }

  // LCU APIへのGETリクエスト
  async get(endpoint) {
    if (!this.connected) {
      const ok = await this.connect()
      if (!ok) return null
    }

    return new Promise((resolve) => {
      const auth = Buffer.from('riot:' + this.password).toString('base64')
      const req = https.get(`https://127.0.0.1:${this.port}${endpoint}`, {
        rejectUnauthorized: false,
        headers: { 'Authorization': 'Basic ' + auth }
      }, (res) => {
        let data = ''
        res.on('data', (chunk) => data += chunk)
        res.on('end', () => {
          try { resolve(JSON.parse(data)) } catch { resolve(null) }
        })
      })
      req.on('error', () => { this.connected = false; resolve(null) })
      req.setTimeout(3000, () => { req.destroy(); resolve(null) })
    })
  }

  // チャンピオンセレクト情報取得
  async getChampSelect() {
    return this.get('/lol-champ-select/v1/session')
  }

  // ゲームフロー状態 (None, Lobby, ChampSelect, InProgress, etc)
  async getGameflowPhase() {
    return this.get('/lol-gameflow/v1/gameflow-phase')
  }

  // サモナー情報（自分）
  async getCurrentSummoner() {
    return this.get('/lol-summoner/v1/current-summoner')
  }

  // ランク情報取得
  async getRankedStats() {
    return this.get('/lol-ranked/v1/current-ranked-stats')
  }

  /**
   * ソロランクのティアを取得（例: "GOLD", "PLATINUM", "DIAMOND"）
   * @returns {string|null} ティア文字列 or null
   */
  async getSoloRankTier() {
    try {
      const stats = await this.getRankedStats()
      const soloQ = stats?.queueMap?.RANKED_SOLO_5x5
      if (soloQ && soloQ.tier && soloQ.tier !== 'NA') {
        return soloQ.tier  // "IRON", "BRONZE", "SILVER", "GOLD", etc.
      }
      return null
    } catch {
      return null
    }
  }
}

module.exports = { LcuClient }
