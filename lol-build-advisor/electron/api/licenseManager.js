/**
 * ライセンスマネージャー
 * Gumroad ライセンスキー検証 + 試合数制限管理
 *
 * Free: 2試合/日 (ルールベースアラートのみ)
 * Pro: 無制限 (LLM分析 + ルールベースアラート)
 */
const fs = require('fs')
const path = require('path')

const GUMROAD_VERIFY_URL = 'https://api.gumroad.com/v2/licenses/verify'
const FREE_DAILY_LIMIT = 2
const LICENSE_CACHE_HOURS = 24

class LicenseManager {
  /**
   * @param {string} dataDir - app.getPath('userData')
   * @param {string} productId - Gumroad プロダクトID
   */
  constructor(dataDir, productId) {
    this.dataDir = dataDir
    this.productId = productId
    this.licensePath = path.join(dataDir, 'license.json')
    this.usagePath = path.join(dataDir, 'usage.json')
    this.cache = null
  }

  /**
   * ライセンス状態を取得
   * @returns {{ tier: 'free'|'pro', remainingGames: number, licenseKey?: string }}
   */
  getStatus() {
    const license = this._loadLicense()
    const usage = this._loadUsage()

    if (license?.valid) {
      return { tier: 'pro', remainingGames: Infinity, licenseKey: license.key }
    }

    const todayKey = new Date().toISOString().split('T')[0]
    const todayCount = usage[todayKey] || 0
    return {
      tier: 'free',
      remainingGames: Math.max(0, FREE_DAILY_LIMIT - todayCount),
    }
  }

  /**
   * 試合開始時に呼ぶ。制限チェック
   * @returns {{ allowed: boolean, tier: string, remaining: number }}
   */
  consumeGame() {
    const status = this.getStatus()

    if (status.tier === 'pro') {
      return { allowed: true, tier: 'pro', remaining: Infinity }
    }

    if (status.remainingGames <= 0) {
      return { allowed: false, tier: 'free', remaining: 0 }
    }

    // 使用量カウント
    const usage = this._loadUsage()
    const todayKey = new Date().toISOString().split('T')[0]
    usage[todayKey] = (usage[todayKey] || 0) + 1
    this._saveUsage(usage)

    return {
      allowed: true,
      tier: 'free',
      remaining: FREE_DAILY_LIMIT - usage[todayKey],
    }
  }

  /**
   * Gumroad ライセンスキーを検証
   * @param {string} licenseKey
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  async verifyLicense(licenseKey) {
    try {
      const res = await fetch(GUMROAD_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          product_id: this.productId,
          license_key: licenseKey,
        }),
        signal: AbortSignal.timeout(10000),
      })

      const data = await res.json()

      if (data.success) {
        const license = {
          key: licenseKey,
          valid: true,
          email: data.purchase?.email || '',
          verifiedAt: new Date().toISOString(),
          purchaseData: {
            id: data.purchase?.id,
            product_name: data.purchase?.product_name,
            created_at: data.purchase?.created_at,
          },
        }
        this._saveLicense(license)
        this.cache = license
        return { valid: true }
      }

      return { valid: false, error: data.message || 'ライセンスキーが無効です' }
    } catch (err) {
      // オフライン時: キャッシュがあれば許可
      const cached = this._loadLicense()
      if (cached?.valid && cached.key === licenseKey) {
        const cacheAge = Date.now() - new Date(cached.verifiedAt).getTime()
        if (cacheAge < LICENSE_CACHE_HOURS * 60 * 60 * 1000) {
          return { valid: true }
        }
      }
      return { valid: false, error: `検証に失敗しました: ${err.message}` }
    }
  }

  /**
   * ライセンスをクリア (Free に戻す)
   */
  clearLicense() {
    this.cache = null
    try { fs.unlinkSync(this.licensePath) } catch {}
  }

  _loadLicense() {
    if (this.cache) return this.cache
    try {
      const data = JSON.parse(fs.readFileSync(this.licensePath, 'utf-8'))
      this.cache = data
      return data
    } catch {
      return null
    }
  }

  _saveLicense(data) {
    try {
      fs.writeFileSync(this.licensePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch {}
  }

  _loadUsage() {
    try {
      const data = JSON.parse(fs.readFileSync(this.usagePath, 'utf-8'))
      // 古いエントリを削除 (7日以上前)
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 7)
      const cutoffKey = cutoff.toISOString().split('T')[0]
      for (const key of Object.keys(data)) {
        if (key < cutoffKey) delete data[key]
      }
      return data
    } catch {
      return {}
    }
  }

  _saveUsage(data) {
    try {
      fs.writeFileSync(this.usagePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch {}
  }
}

module.exports = { LicenseManager, FREE_DAILY_LIMIT }
