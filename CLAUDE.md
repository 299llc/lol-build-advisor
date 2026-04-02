# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 必須ルール

- **既存コードに手を加える際は、`docs/` 配下の要件定義書（`要件書.md`）と設計書（`基本設計書.md`、`マクロアドバイス設計書.md`、`マネタイズ設計書.md`）を必ず事前に読み込むこと。** 仕様の背景や制約を理解せずにコードを変更してはならない。

## プロジェクト概要

**ろるさぽくん** — League of Legends の試合中に AI がリアルタイムでビルド提案・対面対策・試合後コーチングを提供する Windows デスクトップアプリ。モノレポ構成で、Electron アプリ本体・LP サイト・AWS インフラの 3 プロジェクトを管理する。

## リポジトリ構成

| ディレクトリ | 概要 | 技術スタック |
|---|---|---|
| `lol-build-advisor/` | Electron デスクトップアプリ本体 | Electron 33, React 19, Vite 6, Tailwind CSS 4 |
| `web/` | LP（ランディングページ）サイト | React 19, Vite 8, Tailwind CSS 4, GitHub Pages |
| `cdk/` | AWS インフラ（Gemini API プロキシ） | AWS CDK, Lambda (Node 22), Secrets Manager |
| `docs/` | 設計書・ストア掲載情報・Riot 規約準拠レポート | Markdown |

各サブプロジェクトの詳細は `lol-build-advisor/CLAUDE.md` を参照。

## 開発コマンド

### Electron アプリ（`lol-build-advisor/`）

```bash
cd lol-build-advisor

npm run dev                    # Renderer (Vite) のみ起動
npm run electron:dev           # Electron + Vite 同時起動（フル開発モード）
npm run electron:build         # ポータブル exe ビルド
npm run electron:build:store   # Microsoft Store 用 APPX ビルド

# AI テスト
npm run test:ai                # 全プロバイダーテスト
npm run test:ai:bedrock        # Bedrock プロバイダーのみ
npm run test:coaching          # コーチング機能テスト（verbose）
npm run test:coaching:validate # コーチング出力バリデーションのみ
npm run test:app-like          # アプリ風フローテスト
```

### LP サイト（`web/`）

```bash
cd web

npm run dev       # 開発サーバー (Vite)
npm run build     # プロダクションビルド → dist/
npm run preview   # ビルド結果プレビュー
```

`main` ブランチへの push 時に `web/**` 変更があれば GitHub Actions で GitHub Pages に自動デプロイ。

### AWS インフラ（`cdk/`）

```bash
cd cdk

npm run build         # TypeScript コンパイル
npm run build:lambda  # Lambda 関数を esbuild でバンドル
npm run deploy        # CDK デプロイ (ap-northeast-1)
npm run diff          # 変更差分の確認
```

## アーキテクチャ全体像

```
[LoL Client]                    [OP.GG]        [Data Dragon CDN]
    ↓ localhost:2999                ↓                  ↓
[Electron Main Process] ←───── データ取得 ──────────────┘
    ↓ DiffDetector (イベント検知)
    ↓ ContextBuilder (コンテキスト構築)
    ↓ AiClient (プロバイダー抽象化)
    ↓         ↓              ↓              ↓
[Gemini]  [Claude]      [Bedrock]      [Ollama]
    ↓ (Lambda Proxy)
[AWS Lambda] → [Gemini API]
    ↓
[Electron Renderer (React)] ← IPC でリアルタイム表示
```

### AI プロバイダー構成

本番環境は **Gemini** (Lambda Proxy 経由)。モデルは `.env` で機能別に指定する。未設定時はエラー（フォールバックなし）。

```env
# .env の構成例（lol-build-advisor/.env）
GEMINI_PROXY_URL=https://...lambda-url.../
GEMINI_APP_SECRET=...
GEMINI_SUGGESTION_MODEL=gemini-2.5-flash-lite
GEMINI_MATCHUP_MODEL=gemini-2.5-flash
GEMINI_MACRO_MODEL=gemini-2.5-flash-lite
GEMINI_COACHING_MODEL=gemini-2.5-flash
```

### AI 機能と呼び出しタイミング

| 機能 | トリガー | デバウンス |
|---|---|---|
| ビルド提案 (`suggestion.js`) | アイテム完成/デス/ゴールド閾値/90秒 | 90秒 |
| マッチアップ Tip (`matchup.js`) | 試合開始時に1回 | — |
| マクロアドバイス (`macro.js`) | オブジェクト/キル（Phase 2、現在無効） | 30-90秒 |
| コーチング (`coaching.js`) | 試合終了後に1回 | — |

### データフロー詳細

1. `liveClient.js` が 3 秒ごとに Riot Live Client Data API をポーリング
2. `diffDetector.js` がアイテム購入・キルデス・フェーズ遷移を検知
3. `preprocessor.js` が生データをゲーム状態に正規化（フェーズ判定、脅威分析、構成解析）
4. `contextBuilder.js` が静的コンテキスト（試合開始時）+ 動的コンテキスト（毎回）を構築
5. `aiClient.js` がプロバイダー経由で AI を呼び出し
6. `postprocessor.js` がレスポンスをバリデーション（不正アイテム除去、信頼度チェック）
7. IPC で Renderer に送信

## 重要な設計上の制約

- **AI モデル指定は必須**: `.env` でプロバイダー別にモデルを明示設定する。デフォルトモデルのフォールバックは存在しない
- **Riot API 準拠**: Live Client Data API（localhost:2999）のみ使用。Vanguard 互換確認済み
- **課金方式**: Microsoft Store サブスクリプション。BYOK（ユーザー自身の API キー）方式は採用しない
- **フィーチャーフラグ**: `FEATURE_MACRO_ENABLED` (`electron/core/config.js`) でマクロ機能を制御
- **Gemini Lambda Proxy**: レート制限 30 req/min/IP、`X-App-Secret` ヘッダーで認証

## デザインテーマ

LoL クライアント風ダークテーマ。LP サイト・Electron アプリで共通。

| 要素 | 色 |
|---|---|
| 背景 | `#010A13` |
| サーフェス | `#0A1428` / `#0A1E32` |
| ゴールドアクセント | `#C8AA6E` |
| ブルーアクセント | `#0AC8B9` |
| 警告 | `#E84057` |
| フォント（見出し） | Orbitron |
| フォント（本文） | Noto Sans JP |

## デプロイ

| 対象 | 方法 |
|---|---|
| LP サイト | `git push` → GitHub Actions → GitHub Pages (`299llc.github.io/lolsupkun/`) |
| デスクトップアプリ | `npm run electron:build:store` → APPX → Microsoft Partner Center 手動アップロード |
| AWS インフラ | `cd cdk && npm run deploy` |
