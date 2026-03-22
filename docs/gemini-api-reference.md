# Gemini API リファレンス

調査日: 2026-03-22

---

## 1. モデル一覧

### Gemini 2.5 シリーズ（安定版）

| モデル | モデルID | コンテキスト | 最大出力 | 特徴 |
|--------|----------|-------------|---------|------|
| **2.5 Pro** | `gemini-2.5-pro` | 1M | 65,536 | 高度な推論・コーディング向け。思考デフォルトON |
| **2.5 Flash** | `gemini-2.5-flash` | 1M | 65,536 | 価格と性能のバランスが最良。思考対応 |
| **2.5 Flash-Lite** | `gemini-2.5-flash-lite` | 1M | 65,536 | 低コスト・高スループット。思考デフォルトOFF |

### Gemini 3 シリーズ（プレビュー）

| モデル | 特徴 |
|--------|------|
| **3.1 Pro Preview** | 最上位。思考は完全OFF不可だが `thinkingLevel` で調整可能 |
| **3 Flash Preview** | 高速・バランス型 |
| **3.1 Flash-Lite Preview** | 低コスト・高スループット |

### Gemini 2.0 シリーズ（非推奨）

| モデル | 状態 |
|--------|------|
| **2.0 Flash** | 非推奨。廃止予定 |

※ Gemini 3 Pro Preview も既に非推奨（3.1 Pro に置き換え）

---

## 2. 料金（1Mトークンあたり、JPY目安）

※ 換算レートは **1 USD = 159円** で概算。

### Gemini 2.5 Flash

| 項目 | 価格 |
|------|------|
| 入力 | 約48円 |
| 出力 | 約398円 |
| キャッシュ読取 | 約5円（**90%削減**） |
| キャッシュストレージ | 約159円 / 1,000,000 tokens / 時間 |

### Gemini 2.5 Flash-Lite

| 項目 | 価格 |
|------|------|
| 入力 | 約16円 |
| 出力 | 約64円 |
| キャッシュ読取 | 約2円（text / image / video） |
| キャッシュストレージ | 約159円 / 1,000,000 tokens / 時間 |

### Gemini 2.5 Pro

| 項目 | <= 200K | > 200K |
|------|---------|--------|
| 入力 | 約199円 | 約398円 |
| 出力 | 約1,590円 | 約2,385円 |
| キャッシュ読取 | 約20円（**90%削減**） | 約40円 |
| キャッシュストレージ | 約716円 / 1,000,000 tokens / 時間 | 約716円 / 1,000,000 tokens / 時間 |

### Gemini 3 シリーズ（プレビュー）

| 項目 | 3.1 Pro (<= 200K) | 3.1 Pro (> 200K) | 3 Flash | 3.1 Flash-Lite |
|------|--------------------|-------------------|---------|----------------|
| 入力 | 約318円 | 約636円 | 約80円 | 約40円 |
| 出力 | 約1,908円 | 約2,862円 | 約477円 | 約239円 |
| キャッシュ読取 | 約32円 | 約64円 | 約8円 | 約4円 |
| キャッシュストレージ | 約716円 / 1,000,000 tokens / 時間 | 約716円 / 1,000,000 tokens / 時間 | 約159円 / 1,000,000 tokens / 時間 | 約159円 / 1,000,000 tokens / 時間 |

### 無料枠

多くのモデルに無料枠あり。クレジットカード不要。ただし **Gemini 3.1 Pro Preview など一部モデルは無料枠なし**。レート制限も厳しめ（後述）。

---

## 3. キャッシュ（Context Caching）

### 2つの方式

#### 暗黙的キャッシュ（Implicit Caching）
- **デフォルトで有効**（設定不要）
- 同じ内容を繰り返し送ると自動でキャッシュヒット
- コスト削減は保証されない（ベストエフォート）
- **最適化**: 大きな共通コンテンツをプロンプトの先頭に配置し、短い間隔でリクエスト

#### 明示的キャッシュ（Explicit Caching）
- 手動でキャッシュを作成・管理
- コスト削減が**保証される**

### 最小トークン数

| モデル | 最小トークン数 |
|--------|---------------|
| 2.5 Flash / 3 Flash | **1,024** |
| 2.5 Pro / 3.1 Pro | **4,096** |

※ 2026-03-22 時点で、公式キャッシュページでは `2.5 Flash-Lite` / `3.1 Flash-Lite` の最小トークン数は明記を確認できず。

### TTL（有効期限）
- デフォルト: 1時間
- 任意に設定可能
- 更新・手動削除可能

### コスト構造
キャッシュ利用時の課金は3要素:
1. **キャッシュ読取**: 通常入力の約10%（= 90%削減）
2. **ストレージ**: TTL期間分、分単位で按分
3. **非キャッシュ入力 + 出力**: 通常料金

---

## 4. レート制限

レート制限は RPM（リクエスト/分）、TPM（トークン/分）、RPD（リクエスト/日）の3次元で制御される。

具体的な数値はティアやモデルにより変動するため、最新の制限値は [Google AI Studio のレート制限ページ](https://aistudio.google.com/rate-limit) で確認すること。

### ティア構成
| ティア | 条件 |
|--------|------|
| 無料枠 | クレジットカード不要。レート制限が厳しい |
| Tier 1 | 課金アカウント有効化 |
| Tier 2 | 累計利用額 $250超 + 支払い成功から30日以上 |
| Tier 3 | 累計利用額 $1,000超 + 支払い成功から30日以上 |

---

## 5. 思考機能（Thinking）

### 制御方法

**Gemini 2.5**: `thinkingBudget`（トークン数で指定）

| モデル | デフォルト | 範囲 | 無効化 |
|--------|-----------|------|--------|
| 2.5 Pro | 動的（-1） | 128〜32,768 | **不可** |
| 2.5 Flash | 動的（-1） | 0〜24,576 | `= 0` |
| 2.5 Flash-Lite | OFF（0） | 512〜24,576 | `= 0` |

**Gemini 3**: `thinkingLevel`（レベルで指定）

| レベル | 説明 |
|--------|------|
| `minimal` | ほぼ思考なし（Flash / Flash-Lite 系で利用） |
| `low` | レイテンシ/コスト最小化 |
| `medium` | バランス型 |
| `high` | 高い推論深度 |

### コスト
- **思考トークンは出力トークンと同じ料金で課金される**
- `response.usage_metadata.thoughts_token_count` で確認可能

### 設定例

```python
from google.genai import types

# 思考を無効化（2.5 Flash）
config = types.GenerateContentConfig(
    thinking_config=types.ThinkingConfig(thinking_budget=0)
)

# 思考を制限（2.5 Flash）
config = types.GenerateContentConfig(
    thinking_config=types.ThinkingConfig(thinking_budget=4096)
)
```

---

## 6. JSON出力（Structured Output）

### 設定方法

`response_mime_type` を `"application/json"` に設定し、SDKの型スキーマを使う場合は `response_schema`、JSON Schema を直接渡す場合は `response_json_schema` を指定。

```python
from google import genai
from google.genai import types

client = genai.Client()

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="入力テキスト",
    config=types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema={
            "type": "object",
            "properties": {
                "action": {"type": "string"},
                "reason": {"type": "string"},
                "confidence": {"type": "string", "enum": ["high", "medium", "low"]}
            },
            "required": ["action", "reason", "confidence"]
        }
    )
)
```

### サポートされる型
`string`, `number`, `integer`, `boolean`, `object`, `array`, `null`

型プロパティ: `enum`, `format`, `minimum`, `maximum`, `required`, `items`, `minItems`, `maxItems`

---

## 7. 認証

### APIキー認証

Google AI Studio (https://aistudio.google.com) でワンクリック生成。

```bash
# 環境変数（SDKが自動検出）
export GEMINI_API_KEY="your-api-key"

# REST API
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents": [{"parts": [{"text": "Hello"}]}]}'
```

```powershell
# PowerShell
$env:GEMINI_API_KEY = "your-api-key"
```

```python
from google import genai

# 環境変数から自動読み込み
client = genai.Client()

# または明示指定
client = genai.Client(api_key="your-api-key")
```

---

## 8. Interactions API（ステートフル会話）

### 概要

`Interactions API` は、会話履歴を Gemini 側に保持しながら継続ターンを扱える API。

- `previous_interaction_id` を渡すと前回の会話履歴を引き継げる
- 会話履歴は継承されるが、`model` や `system_instruction` などの設定は毎ターン再指定が必要
- デフォルトでは `store=true` で保存される

### 継承ルールの要点

- 継承される:
  会話履歴
- 毎ターン再送が必要:
  `model`, `system_instruction`, `tools`, `generation_config`
- 注意:
  `input` が `function_result` の場合は `tools` を送らない

### 保持期間

- 無料枠:
  1日
- 有料枠:
  55日

※ 1試合単位の履歴保持が目的なら、無料枠の 1 日保持でも十分。

### ろるさぽくんでの使いどころ

- **ビルド提案**:
  試合中に継続更新するため、試合ごとに 1 interaction を持つ構成と相性が良い
- **マクロアドバイス**:
  前回アドバイスとの一貫性を保ちやすいため、試合ごとに 1 interaction を持つ構成が自然
- **マッチアップTip / 試合後コーチング**:
  単発処理なので `generateContent` のままで十分

### 設計上の示唆

- 試合開始時に interaction を作成する
- 試合中は `previous_interaction_id` で継続する
- 試合終了でその試合セッションを閉じる
- 継続系では `previous_advice` を毎回手動で積み直す必要性が下がる

---

## ろるさぽくんでの活用ポイント

### モデル選択
- **Gemini 2.5 Flash** が最適。コスト・速度・品質のバランスが最良
- Flash-Lite もキャッシュ対応。ただし品質重視なら Flash、最安重視なら Flash-Lite で使い分け

### 継続系のセッション管理
- **ビルド提案** と **マクロアドバイス** は `Interactions API` を使って試合単位の会話セッションを持たせる
- **マッチアップTip** と **試合後コーチング** は単発なので `generateContent` を使う
- 1試合の履歴だけ保持できればよいため、保持期間は設計上の制約になりにくい

### キャッシュ戦略
- 静的コンテキスト（チャンピオン情報・ゲーム知識）を明示的キャッシュで保存 → 入力コスト90%削減
- 2.5 Flash は最小1,024トークン。Flash-Lite の最小値は公式キャッシュページで明記未確認
- TTLを試合時間（30-40分）に設定し、試合終了時に削除

### 思考の無効化
- `thinkingBudget=0` で思考を無効化 → 出力トークンのコスト削減 + レイテンシ短縮
- アイテム提案やマクロアドバイスは候補から選ぶだけなので思考不要

### コスト試算（1試合あたり、Gemini 2.5 Flash-Lite）
- 前提:
  静的コンテキスト約5Kトークンを明示的キャッシュ化し、1試合で20回呼び出す
- 前提:
  1回あたりの動的入力を約1Kトークン、出力を約200トークンとする
- 動的入力コスト:
  20回 × 1Kトークン × 約16円 / 1Mトークン = 約0.3円
- 出力コスト:
  20回 × 200トークン × 約64円 / 1Mトークン = 約0.3円
- キャッシュ読取コスト:
  20回 × 5Kトークン × 約2円 / 1Mトークン = 約0.2円
- キャッシュ保存コスト:
  5Kトークンを40分保持しても約0.5円
- 合計:
  約1.3円 / 試合
