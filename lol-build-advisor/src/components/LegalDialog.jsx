import { X, ChevronLeft } from 'lucide-react'

export function LegalDialog({ page, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
      <div className="bg-lol-surface border border-lol-gold/30 rounded-lg w-[360px] shadow-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-lol-gold/20 shrink-0">
          <button onClick={onClose} className="text-lol-text hover:text-lol-text-light flex items-center gap-1">
            <ChevronLeft size={14} />
            <span className="text-[11px]">戻る</span>
          </button>
          <span className="font-heading text-xs text-lol-gold tracking-wider">
            {page === 'privacy' ? 'PRIVACY POLICY' : 'LEGAL'}
          </span>
          <button onClick={onClose} className="text-lol-text hover:text-lol-text-light">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto text-[11px] text-lol-text-light leading-relaxed space-y-4">
          {page === 'privacy' && <PrivacyPolicy />}
          {page === 'disclaimer' && <Disclaimer />}
        </div>
      </div>
    </div>
  )
}

function PrivacyPolicy() {
  return (
    <>
      <h2 className="text-xs text-lol-gold font-heading tracking-wider">プライバシーポリシー</h2>
      <p className="text-[10px] text-lol-text/50">最終更新日: 2026年3月20日</p>

      <Section title="1. はじめに">
        「ろるさぽくん」（以下「本アプリ」）は、299LLC が提供する League of Legends 向けのリアルタイムアドバイスツールです。本ポリシーでは、本アプリが取り扱う情報について説明します。
      </Section>

      <Section title="2. 収集する情報">
        <p>本アプリは以下の情報を取得します：</p>
        <ul className="list-disc ml-4 mt-1 space-y-1">
          <li><strong>試合中のゲームデータ</strong> — Riot Games Live Client Data API（localhost:2999）を通じて、現在の試合情報（チャンピオン、アイテム、キル/デス、ゲーム時間等）を取得します。これはお使いのPC上でローカルに処理されます。</li>
          <li><strong>チャンピオンセレクト情報</strong> — LCU API を通じて、チャンピオン選択画面の情報を取得します。</li>
          <li><strong>サモナー名</strong> — 試合中のプレイヤー識別のために使用します。</li>
          <li><strong>ライセンスキー</strong> — Pro版をご利用の場合、ライセンス認証のために保存されます。</li>
        </ul>
      </Section>

      <Section title="3. 情報の利用目的">
        <ul className="list-disc ml-4 space-y-1">
          <li>試合中のリアルタイムアドバイス生成</li>
          <li>アイテムビルドの推奨</li>
          <li>マッチアップ・マクロ戦略の提案</li>
          <li>試合後の振り返りコーチング</li>
        </ul>
      </Section>

      <Section title="4. AI処理について">
        <p>本アプリはAIモデルを使用してアドバイスを生成します：</p>
        <ul className="list-disc ml-4 mt-1 space-y-1">
          <li><strong>ローカルモード（Ollama）</strong> — すべてのデータはお使いのPC上で処理されます。外部サーバーへの送信は行われません。</li>
          <li><strong>クラウドモード</strong> — 試合データがAIサービスプロバイダー（Anthropic / AWS Bedrock）に送信されます。送信されるデータは試合に関する情報のみで、個人を特定する情報は含まれません。</li>
        </ul>
      </Section>

      <Section title="5. データの保存">
        <ul className="list-disc ml-4 space-y-1">
          <li><strong>ゲームログ</strong> — 試合ごとのデバッグログがローカルに保存されます。設定画面からフォルダを開いて確認・削除できます。</li>
          <li><strong>設定情報</strong> — AIモデル設定、ウィンドウ設定等がローカルに保存されます。</li>
          <li><strong>外部サーバーへの永続的なデータ保存は行いません。</strong></li>
        </ul>
      </Section>

      <Section title="6. 第三者サービス">
        <p>本アプリは以下の第三者サービスを利用します：</p>
        <ul className="list-disc ml-4 mt-1 space-y-1">
          <li><strong>Riot Games API</strong> — ゲームデータの取得（ローカルAPI）</li>
          <li><strong>Data Dragon（Riot Games CDN）</strong> — チャンピオン・アイテムの静的データ取得</li>
          <li><strong>OP.GG</strong> — 推奨ビルド情報の取得</li>
          <li><strong>Ollama</strong> — ローカルAI推論エンジン（任意）</li>
        </ul>
      </Section>

      <Section title="7. データの共有">
        本アプリは、ユーザーの個人情報を第三者に販売、貸与、または共有しません。
      </Section>

      <Section title="8. お子様のプライバシー">
        本アプリは13歳未満のお子様を対象としていません。
      </Section>

      <Section title="9. ポリシーの変更">
        本ポリシーは予告なく変更される場合があります。重要な変更がある場合は、アプリのアップデートを通じてお知らせします。
      </Section>

      <Section title="10. お問い合わせ">
        本ポリシーに関するご質問は、GitHub リポジトリの Issue またはアプリ配布ページからお問い合わせください。
      </Section>
    </>
  )
}

function Disclaimer() {
  return (
    <>
      <h2 className="text-xs text-lol-gold font-heading tracking-wider">免責事項</h2>

      <Section title="Riot Games に関する免責事項">
        ろるさぽくん isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
      </Section>

      <Section title="本アプリについて">
        <ul className="list-disc ml-4 space-y-1">
          <li>本アプリは League of Legends の試合中にアドバイスを提供するサードパーティツールです。</li>
          <li>AIによるアドバイスは参考情報であり、最適なプレイを保証するものではありません。</li>
          <li>本アプリの使用によって生じたいかなる損害についても、開発者は責任を負いません。</li>
          <li>本アプリはゲームの操作を自動化する機能を持たず、不正ツール（チート・ボット・スクリプト）には該当しません。</li>
        </ul>
      </Section>

      <Section title="知的財産権">
        League of Legends、およびゲーム内のチャンピオン名、アイテム名、画像等の知的財産権は Riot Games, Inc. に帰属します。本アプリはこれらを Riot Games の利用規約に基づいて使用しています。
      </Section>
    </>
  )
}

function Section({ title, children }) {
  return (
    <div className="space-y-1">
      <h3 className="text-[11px] text-lol-text-light font-bold">{title}</h3>
      <div className="text-[10px] text-lol-text leading-relaxed">{children}</div>
    </div>
  )
}
