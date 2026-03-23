# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

League of Legends の試合中にリアルタイムの戦況データを取得し、AI分析（アイテム提案/マッチアップTip/試合後コーチング）で最適なビルド・戦略を提案する Electron デスクトップアプリ。

### フィーチャーフラグ

- **`FEATURE_MACRO_ENABLED`** (`electron/core/config.js`): マクロアドバイス機能の有効/無効。Phase 2 で `true` にする。`false` の場合、`electron/features/macro.js` は読み込まれず、マクロ関連の AI 呼び出し・IPC 送信は一切行われない。UI コンポーネント（`MacroAdvice.jsx`）はコードに残るがデータが来ないため非表示になる。

## 開発コマンド

```bash
# Renderer (Vite) のみ起動（UIのみ確認）
npm run dev

# Electron + Vite 同時起動（フル開発モード）
npm run electron:dev

# プロダクションビルド（Vite ビルド → electron-builder）
npm run electron:build
```

## アーキテクチャ

### プロセス構成（Electron）

- **Main Process** (`electron/main.js`): エントリポイント。状態管理 (`state` オブジェクト)、IPC ハンドラ、3秒間隔ポーリング、AI呼び出し制御
- **Core** (`electron/core/`): 共通ロジック。設定定数、チャンプ分析、オブジェクトタイマー、AIプロンプト
- **Features** (`electron/features/`): フィーチャーフラグで制御される機能モジュール（現在: `macro.js`）
- **API** (`electron/api/`): 外部API連携。Claude API、OP.GG、Data Dragon、Live Client Data、LCU
- **Preload** (`electron/preload.js`): `contextBridge` で `window.electronAPI` を公開
- **Renderer** (`src/`): React + Tailwind CSS v4。Vite でビルドし `dist/` に出力

### データフロー

```
LoL Client (port 2999) → LiveClientPoller (3秒ポーリング)
  → DiffDetector (アイテム購入/キルデス/2分経過で発火、10秒デバウンス)
  → ContextBuilder (静的+動的コンテキスト)
  → ClaudeApiClient (Haiku: 提案/マッチアップ、Sonnet: コーチング、マクロはPhase 2)
  → IPC で Renderer に送信
```

### Main Process のモジュール構成

#### `electron/core/` — 共通ロジック

| モジュール | 役割 |
|---|---|
| `config.js` | 定数・設定値（タイマー、閾値、カウンターアイテム等） |
| `championAnalysis.js` | スキル説明から特性を検出 (`detectFlags`, `extractTraits`) |
| `objectiveTracker.js` | オブジェクトタイマー計算、マクロコンテキスト構築 |
| `prompts.js` | 4種のAIプロンプト定義 |

#### `electron/api/` — 外部API連携

| モジュール | 役割 |
|---|---|
| `aiClient.js` | AI クライアント。共通 `_callApi()` メソッドで4種のAI呼び出しを統一 |
| `contextBuilder.js` | ゲームデータを AI 用プロンプトに変換（静的/動的分離） |
| `diffDetector.js` | 差分検知。AI 呼び出しトリガー判定 |
| `liveClient.js` | Riot Live Client Data API (localhost:2999) からゲームデータ取得 |
| `lcuClient.js` | LCU WebSocket (league-connect) でゲームフロー検知 |
| `opggClient.js` | OP.GG からコアビルド・カウンターアイテム取得 |
| `patchData.js` | Data Dragon からパッチ情報をキャッシュ |

### Renderer の構成 (`src/`)

- `App.jsx`: ルートコンポーネント。ステータスに応じて画面切替
- `hooks/useGameData.js`: IPC イベントを React state にマッピング
- `components/`: MainScreen, ChampSelectScreen, WaitingScreen, AiSuggestion, MacroAdvice, MatchupTip, CoachingPanel, BuildRecommendation, TeamList, KillBar, ItemTooltip, TitleBar, SettingsDialog, DebugPanel

### IPC チャネル一覧

| チャネル | 方向 | 用途 |
|---|---|---|
| `apikey:get/set/validate` | R→M | API キー管理 |
| `polling:start/stop` | R→M | ポーリング制御 |
| `ai:toggle/status` | R→M | AI ON/OFF 切替 |
| `ontop:toggle/status` | R→M | 最前面表示切替 |
| `position:set` | R→M | ポジション手動選択 |
| `spectator:select` | R→M | 観戦モード対象選択 |
| `cache:refresh` | R→M | Data Dragon キャッシュ再取得 |
| `game:status` | M→R | 試合状態 (`waiting`/`champselect`/`ingame`/`ended`) |
| `game:data` | M→R | ゲームスナップショット |
| `core:build` | M→R | コアビルド (OP.GG) |
| `ai:suggestion` | M→R | AIアイテム提案 |
| `ai:loading` | M→R | AI 問い合わせ中フラグ |
| `matchup:tip` | M→R | マッチアップTip |
| `macro:advice` | M→R | マクロアドバイス（Phase 2、`FEATURE_MACRO_ENABLED` で制御） |
| `macro:loading` | M→R | マクロ問い合わせ中フラグ（Phase 2） |
| `coaching:result` | M→R | 試合後コーチング結果 |
| `coaching:loading` | M→R | コーチング問い合わせ中フラグ |
| `substitute:items` | M→R | 入れ替え候補アイテム一覧 |
| `champselect:team` | M→R | チャンプセレクトチーム構成 |
| `champselect:extras` | M→R | サモナースペル・ルーン・スキルオーダー |
| `position:select` | M→R | ポジション選択要求 |

## 重要な設計上の制約

- **セキュリティ**: `contextIsolation: true`, `nodeIntegration: false`。Renderer から直接 Node.js API やネットワークアクセスは不可
- **API キー保存先**: `app.getPath('userData')/.api-key` にプレーンテキスト保存
- **Live Client Data API**: 自己署名SSL証明書のため `rejectUnauthorized: false` が必要。試合中のみ
- **ウィンドウ**: フレームレス、`alwaysOnTop` (level: `screen-saver`)、420x700px
- **Claude API レスポンス**: JSON を `text.match(/\{[\s\S]*\}/)` で抽出してパース
- **状態管理**: `electron/main.js` の `state` オブジェクトに集約（グローバル変数なし）

## デザインテーマ

LoLクライアント風ダークテーマ。背景 `#010A13`、サーフェス `#0A1428`/`#0A1E32`、ゴールドアクセント `#C8AA6E`、ブルーアクセント `#0AC8B9`、警告 `#E84057`。フォントは Orbitron (見出し) + Noto Sans JP (本文)。
