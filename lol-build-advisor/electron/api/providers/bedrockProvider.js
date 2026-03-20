/**
 * AWS Bedrock プロバイダー
 * AWS Bedrock 経由で Claude を呼び出す
 *
 * 認証方式:
 *   1. APIキー方式: BEDROCK_API_KEY + Bearer認証
 *   2. IAM方式: accessKeyId + secretAccessKey で SigV4 署名
 *
 * cross-region inference profile を使用:
 *   - us.anthropic.claude-haiku-4-5-20251001-v1:0
 */

const crypto = require('crypto')

// Anthropic モデル名 → Bedrock cross-region inference profile ID のマッピング
const MODEL_MAP = {
  'claude-haiku-4-5-20251001': 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
}

// モデルIDからURLパスとSigV4署名用パスを生成
// SigV4ではパスセグメントを二重エンコードする必要がある
function buildPaths(bedrockModel) {
  const encoded = encodeURIComponent(bedrockModel)
  return {
    urlPath: `/model/${encoded}/invoke`,
    sigPath: `/model/${encodeURIComponent(encoded)}/invoke`,
  }
}

class BedrockProvider {
  /**
   * @param {object} opts
   * @param {string} [opts.apiKey] - Bedrock APIキー (ABSK... 形式)
   * @param {string} [opts.region] - AWS リージョン
   * @param {string} [opts.accessKeyId] - IAM Access Key ID
   * @param {string} [opts.secretAccessKey] - IAM Secret Access Key
   */
  constructor({ apiKey, region, accessKeyId, secretAccessKey }) {
    this.region = region || 'us-east-1'
    this.apiKey = apiKey || null
    this.accessKeyId = accessKeyId || null
    this.secretAccessKey = secretAccessKey || null
    this.type = 'bedrock'
  }

  async sendMessage({ model, maxTokens, temperature = 0, system, messages, signal }) {
    const bedrockModel = MODEL_MAP[model] || model
    const endpoint = `https://bedrock-runtime.${this.region}.amazonaws.com`
    const { urlPath, sigPath } = buildPaths(bedrockModel)

    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      temperature,
      system: Array.isArray(system) ? system : [{ type: 'text', text: system }],
      messages
    })

    const headers = this.accessKeyId && this.secretAccessKey
      ? await this._signRequest('POST', sigPath, body, endpoint)
      : this._apiKeyHeaders()

    const res = await fetch(`${endpoint}${urlPath}`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body,
      signal
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      throw new Error(`Bedrock HTTP ${res.status}: ${errBody.substring(0, 200)}`)
    }

    const data = await res.json()
    return {
      text: data.content?.[0]?.text || '',
      usage: data.usage ? {
        input: data.usage.input_tokens,
        output: data.usage.output_tokens,
        cache_read: data.usage.cache_read_input_tokens || 0,
        cache_creation: data.usage.cache_creation_input_tokens || 0
      } : null,
      stopReason: data.stop_reason,
      _meta: { model: bedrockModel }
    }
  }

  async validate() {
    try {
      const bedrockModel = MODEL_MAP['claude-haiku-4-5-20251001']
      const endpoint = `https://bedrock-runtime.${this.region}.amazonaws.com`
      const { urlPath, sigPath } = buildPaths(bedrockModel)
      const body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'hi' }]
      })

      const headers = this.accessKeyId && this.secretAccessKey
        ? await this._signRequest('POST', sigPath, body, endpoint)
        : this._apiKeyHeaders()

      const res = await fetch(`${endpoint}${urlPath}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body
      })
      // 200 = 成功, 429 = レート制限（認証は成功）
      return res.ok || res.status === 429
    } catch {
      return false
    }
  }

  // APIキー認証: Bearer トークン
  _apiKeyHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
    }
  }

  // AWS Signature V4 署名 (IAM認証用)
  async _signRequest(method, canonicalPath, body, endpoint) {
    const host = new URL(endpoint).host
    const now = new Date()
    const dateStamp = now.toISOString().replace(/[-:]/g, '').substring(0, 8)
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
    const service = 'bedrock'
    const credentialScope = `${dateStamp}/${this.region}/${service}/aws4_request`

    const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`
    const signedHeaders = 'host;x-amz-date'
    const payloadHash = crypto.createHash('sha256').update(body || '').digest('hex')

    const canonicalRequest = [
      method, canonicalPath, '', canonicalHeaders, signedHeaders, payloadHash
    ].join('\n')

    const stringToSign = [
      'AWS4-HMAC-SHA256', amzDate, credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    ].join('\n')

    const signingKey = this._getSignatureKey(dateStamp, this.region, service)
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex')

    return {
      'Host': host,
      'X-Amz-Date': amzDate,
      'Authorization': `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
    }
  }

  _getSignatureKey(dateStamp, region, service) {
    let key = Buffer.from('AWS4' + this.secretAccessKey, 'utf-8')
    for (const part of [dateStamp, region, service, 'aws4_request']) {
      key = crypto.createHmac('sha256', key).update(part).digest()
    }
    return key
  }
}

module.exports = { BedrockProvider }
