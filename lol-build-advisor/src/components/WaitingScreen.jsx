import { Swords } from 'lucide-react'
import { AdBanner } from './AdBanner'

export function WaitingScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
      <div className="w-16 h-16 flex items-center justify-center rounded-full border-2 border-lol-gold/20 bg-lol-gold/5">
        <Swords size={32} className="text-lol-gold/60" />
      </div>

      <div className="text-center space-y-2">
        <p className="font-heading text-base text-lol-gold tracking-wider">
          試合を検出中...
        </p>
        <p className="text-sm text-lol-text">
          LoLクライアントを起動して試合を開始してください
        </p>
      </div>

      <div className="mt-8 p-3 rounded border border-lol-gold-dim/20 bg-lol-surface/50 max-w-xs">
        <p className="text-xs text-lol-text leading-relaxed">
          💡 ボーダーレスウィンドウモードでプレイすると、
          オーバーレイが正しく表示されます。
          LoL設定 → ビデオ → ウィンドウモード → ボーダーレス
        </p>
      </div>

      {/* 広告バナー */}
      <AdBanner className="mt-4 w-full max-w-xs" />
    </div>
  )
}
