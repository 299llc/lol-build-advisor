---
name: cost-gemini
description: Gemini API のコスト試算を行う。ろるさぽくんの AI 呼び出しパターンに基づき、1試合あたり・月間のAPI費用を見積もる
disable-model-invocation: true
allowed-tools: Read, Grep, Bash(wc *)
argument-hint: "[matches_per_day (default: 5)]"
---

# Gemini API コスト試算スキル

ろるさぽくんプロジェクトの AI 呼び出しパターンに基づいて Gemini API のコストを試算してください。

## 引数

- `$0`: 1日あたりの試合数（デフォルト: 5）

## 試算手順

### 1. 最新のコード実態を確認

以下のファイルを読んで、現在の実装における **maxTokens**, **デバウンス間隔**, **RAG知識テキストサイズ** を確認すること:

- `lol-build-advisor/electron/api/aiClient.js` — maxTokens, モデル名, RAG知識選択ロジック
- `lol-build-advisor/electron/core/config.js` — デバウンス間隔, フィーチャーフラグ
- `lol-build-advisor/electron/core/prompts.js` — プロンプトサイズ
- `lol-build-advisor/electron/core/knowledge/game.js` — 知識テキストサイズ（`wc -c` で確認）
- `lol-build-advisor/electron/features/suggestion.js` — suggestion トリガー条件・デバウンス
- `lol-build-advisor/electron/features/macro.js` — macro トリガー条件（FEATURE_MACRO_ENABLED を確認）
- `lol-build-advisor/electron/main.js` — FREE_MATCHES_PER_DAY, coaching/matchup の呼び出し箇所

### 2. AI呼び出し関数ごとのトークン使用量を推定

各関数について input tokens と output tokens を推定する。
日本語テキストは **1文字 ≈ 0.5〜0.7 token**（Gemini tokenizer）として計算。

| 関数 | モデル | 用途 | 頻度(1試合あたり) |
|------|--------|------|-------------------|
| getSuggestion | env `GEMINI_SUGGESTION_MODEL` → `GEMINI_MODEL` → デフォルト | アイテム提案 | コード実態から推定（デバウンス・トリガー条件を加味） |
| getMatchupTip | env `GEMINI_MATCHUP_MODEL` → `GEMINI_QUALITY_MODEL` → デフォルト | レーン対面アドバイス | 1回/試合 |
| getMacroAdvice | env `GEMINI_MACRO_MODEL` → flash-lite (ハードコード) | マクロアドバイス | FEATURE_MACRO_ENABLED の値を確認。false なら 0回 |
| getCoaching | env `GEMINI_COACHING_MODEL` → `GEMINI_QUALITY_MODEL` → デフォルト | 試合後コーチング | 1回/試合 |

`.env` を読んで実際に使用されるモデルを特定すること。

各関数の input tokens 推定内訳:
- **System prompt**: プロンプトテキスト文字数 × 0.6 (日本語token係数)
- **RAG知識テキスト**: 関数ごとに異なる知識テキストを使用（buildItemKnowledgeText, buildLaningKnowledgeText 等）。コードを読んで実際のサイズを確認
- **championKnowledge**: 10体分のスキル情報（試合開始時に生成）。おおよそ推定
- **matchContext**: 静的コンテキスト（チーム構成等）
- **User message**: 動的コンテキスト（ゲーム状態JSON）

### 3. Gemini コンテキストキャッシュの効果を計算

Gemini の明示的キャッシュ (CachedContent API) が適用される条件:
- system テキストが 4000文字以上（MIN_CACHE_CHARS）
- TTL: 3600秒（1時間）
- キャッシュヒット時は input token 料金が 1/10 になる

**キャッシュ効果の前提**:
- getSuggestion: 2回目以降はキャッシュヒット（同一試合中、systemは同じ）
- getMatchupTip: 1回のみなのでキャッシュ効果なし
- getMacroAdvice: 2回目以降はキャッシュヒット
- getCoaching: 1回のみなのでキャッシュ効果なし
- キャッシュストレージ: $1.00 / 1M tokens / hour

### 4. 料金表（2026年3月時点）

| モデル | Input ($/1M tokens) | Output ($/1M tokens) | Cache Input ($/1M tokens) | Cache Storage ($/1M tokens/hr) |
|--------|---------------------|----------------------|---------------------------|-------------------------------|
| gemini-2.5-flash | $0.30 | $2.50 | $0.03 | $1.00 |
| gemini-2.5-flash-lite | $0.10 | $0.40 | $0.01 | $1.00 |

### 5. 出力フォーマット

以下の形式でマークダウンテーブルとして出力すること:

```
## Gemini API コスト試算

### 前提条件
- 試合数: X 試合/日
- 平均試合時間: 25〜30分
- モデル: gemini-2.5-flash (suggestion/matchup/coaching), gemini-2.5-flash-lite (macro)
- FEATURE_MACRO_ENABLED: true/false

### 1試合あたりのトークン使用量

| 関数 | 呼出回数 | Input tokens | Output tokens | モデル |
|------|----------|-------------|---------------|--------|
| suggestion | X回 | X | X | flash |
| matchup | 1回 | X | X | flash |
| macro | X回 | X | X | flash-lite |
| coaching | 1回 | X | X | flash |
| **合計** | | **X** | **X** | |

### キャッシュ効果

| 項目 | キャッシュなし | キャッシュあり | 削減率 |
|------|--------------|--------------|--------|
| suggestion input cost | $X | $X | X% |
| ...

### コスト試算

| 期間 | キャッシュなし | キャッシュあり |
|------|--------------|--------------|
| 1試合 | $X (¥X) | $X (¥X) |
| 1日 (X試合) | $X (¥X) | $X (¥X) |
| 1ヶ月 (30日) | $X (¥X) | $X (¥X) |

※ 為替レート: $1 = ¥150 で計算
```

### 6. 注意事項

- 推定値であることを明記すること
- キャッシュストレージコストも含めること（1試合≈1時間のキャッシュ保持）
- 無料枠（FREE_MATCHES_PER_DAY）がある場合はその旨を記載
- Gemini API の Free tier（RPM/RPD制限あり）と Paid tier の両方について言及
- `FEATURE_MACRO_ENABLED` が false の場合、マクロコストは 0 として計算
