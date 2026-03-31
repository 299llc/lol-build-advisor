import './App.css'

export default function Privacy() {
  return (
    <main className="min-h-screen px-6 py-24" style={{ background: '#010A13', color: '#e2e8f0' }}>
      <article className="max-w-3xl mx-auto">
        <a href={import.meta.env.BASE_URL} className="inline-flex items-center gap-2 mb-8 text-sm hover:opacity-80 transition-opacity" style={{ color: '#C8AA6E' }}>
          ← トップに戻る
        </a>

        <h1 className="font-orbitron font-bold text-3xl mb-2" style={{ color: '#C8AA6E' }}>プライバシーポリシー</h1>
        <p className="text-sm mb-10" style={{ color: '#475569' }}>最終更新日: 2026年3月30日</p>

        <div className="space-y-8 text-sm leading-relaxed" style={{ color: '#94a3b8' }}>

          <section>
            <h2 className="font-bold text-lg mb-3" style={{ color: '#e2e8f0' }}>1. はじめに</h2>
            <p>
              合同会社299（以下「当社」）は、「ろるさぽくん」（以下「本アプリ」）の利用者（以下「ユーザー」）の
              プライバシーを尊重し、個人情報の保護に努めます。
              本プライバシーポリシーは、本アプリにおける情報の収集、利用、管理について定めるものです。
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-3" style={{ color: '#e2e8f0' }}>2. 収集する情報</h2>
            <p className="mb-3">本アプリは以下の情報を取得する場合があります。</p>
            <ul className="list-disc list-inside space-y-2">
              <li><span style={{ color: '#e2e8f0' }}>ゲームプレイデータ:</span> League of Legends のゲーム内情報（チャンピオン、アイテム、スコア等）</li>
              <li><span style={{ color: '#e2e8f0' }}>アプリ設定情報:</span> ユーザーが本アプリ内で設定した項目</li>
            </ul>
            <p className="mt-3">
              本アプリはユーザーの氏名、メールアドレス、住所、電話番号等の個人情報を収集しません。
              また、アカウント登録やログインは不要です。
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-3" style={{ color: '#e2e8f0' }}>3. 情報の利用目的</h2>
            <p className="mb-3">収集した情報は、以下の目的にのみ使用します。</p>
            <ul className="list-disc list-inside space-y-2">
              <li>AIによるゲームアドバイスの生成・提供</li>
              <li>アプリの機能改善およびサービスの向上</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-3" style={{ color: '#e2e8f0' }}>4. 第三者への提供</h2>
            <p className="mb-3">
              当社はユーザーの情報を第三者に販売、貸与、または共有することはありません。
              ただし、AIアドバイスの生成のために、個人を特定しない形でゲームプレイデータを
              外部AIサービスに送信する場合があります。
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-3" style={{ color: '#e2e8f0' }}>5. データの保存</h2>
            <p>
              本アプリが保存するデータは、原則としてユーザーのPC上（ローカル）に保存されます。
              当社のサーバーにユーザーの個人データを永続的に保存することはありません。
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-3" style={{ color: '#e2e8f0' }}>6. Cookieおよびトラッキング</h2>
            <p>
              本アプリはCookie、トラッキングツール、アクセス解析ツールを使用しません。
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-3" style={{ color: '#e2e8f0' }}>7. 児童のプライバシー</h2>
            <p>
              本アプリは13歳未満の児童を対象としていません。
              13歳未満の方は保護者の同意なく本アプリを利用しないでください。
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-3" style={{ color: '#e2e8f0' }}>8. セキュリティ</h2>
            <p>
              当社はユーザーの情報を保護するために合理的な技術的・組織的措置を講じます。
              ただし、インターネットを通じたデータ送信は完全な安全性を保証するものではありません。
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-3" style={{ color: '#e2e8f0' }}>9. ポリシーの変更</h2>
            <p>
              当社は本ポリシーを必要に応じて更新する場合があります。
              重要な変更がある場合は、アプリ内またはウェブサイト上でお知らせします。
              変更後も本アプリを継続して利用した場合、変更後のポリシーに同意したものとみなします。
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-3" style={{ color: '#e2e8f0' }}>10. お問い合わせ</h2>
            <p>
              本ポリシーに関するお問い合わせは、以下までご連絡ください。
            </p>
            <p className="mt-3" style={{ color: '#C8AA6E' }}>
              合同会社299<br />
              メール: support@299llc.com
            </p>
          </section>

          <section className="pt-4" style={{ borderTop: '1px solid rgba(200,170,110,0.15)' }}>
            <h2 className="font-bold text-lg mb-3" style={{ color: '#e2e8f0' }}>免責事項</h2>
            <p className="text-xs" style={{ color: '#475569' }}>
              ろるさぽくん isn't endorsed by Riot Games and doesn't reflect the views or opinions of
              Riot Games or anyone officially involved in producing or managing Riot Games properties.
              Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
            </p>
          </section>

        </div>
      </article>
    </main>
  )
}
