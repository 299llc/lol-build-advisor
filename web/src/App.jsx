import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import './App.css'

// ---- Data Dragon CDN ----
const DD = 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img'
const itemIcon = (id) => `${DD}/item/${id}.png`
const champIcon = (name) => `${DD}/champion/${name}.png`

// ---- アイコン (SVG インライン) ----
const IconSword = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" /><line x1="13" y1="19" x2="19" y2="13" />
    <line x1="16" y1="16" x2="20" y2="20" /><line x1="19" y1="21" x2="21" y2="19" />
  </svg>
)
const IconBrain = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.77-3.28A3 3 0 0 1 2 13a3 3 0 0 1 2.27-2.92A2.5 2.5 0 0 1 9.5 2Z"/>
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.77-3.28A3 3 0 0 0 22 13a3 3 0 0 0-2.27-2.92A2.5 2.5 0 0 0 14.5 2Z"/>
  </svg>
)
const IconShield = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
)
const IconTrophy = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
    <path d="M7 4h10v8a5 5 0 0 1-10 0V4z"/>
    <path d="M17 5h3v4a3 3 0 0 1-3 3"/><path d="M7 5H4v4a3 3 0 0 0 3 3"/>
  </svg>
)
const IconZap = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
)
const IconTarget = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
  </svg>
)
const IconClock = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)
const IconBarChart = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    <line x1="2" y1="20" x2="22" y2="20"/>
  </svg>
)
const IconCheck = (props) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const IconArrowRight = (props) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
)
const IconStore = (props) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
)

// ---- App Icon ----
const AppIcon = ({ size = 32 }) => (
  <img src={`${import.meta.env.BASE_URL}icon.png`} alt="ろるさぽくん" width={size} height={size} className="rounded" />
)

// ---- Navbar ----
function Navbar() {
  return (
    <nav aria-label="メインナビゲーション" className="fixed top-0 left-0 right-0 z-50 border-b" style={{ background: 'rgba(1,10,19,0.9)', backdropFilter: 'blur(12px)', borderColor: 'rgba(200,170,110,0.2)' }}>
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AppIcon size={32} />
          <span className="font-orbitron font-bold text-lg text-gold tracking-wider">ろるさぽくん</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm" style={{ color: '#94a3b8' }}>
          <a href="#features" className="hover:text-gold transition-colors">機能</a>
          <a href="#how" className="hover:text-gold transition-colors">使い方</a>
          <a href="#pricing" className="hover:text-gold transition-colors">料金</a>
          <a href="#faq" className="hover:text-gold transition-colors">FAQ</a>
        </div>
        <Button className="font-orbitron text-xs tracking-wider gap-2" style={{ background: 'linear-gradient(135deg, #C8AA6E, #9a7c4a)', color: '#010A13', fontWeight: 700 }}>
          <IconStore width={16} height={16} />
          Microsoft Store
        </Button>
      </div>
    </nav>
  )
}

// ---- Hero ----
function Hero() {
  return (
    <section className="hero-bg min-h-screen flex flex-col items-center justify-center text-center px-6 pt-24 pb-20 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-5 blur-3xl" style={{ background: '#0AC8B9' }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-5 blur-3xl" style={{ background: '#C8AA6E' }} />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto">
        <Badge className="mb-6 px-4 py-1.5 text-xs tracking-widest font-orbitron" style={{ background: 'rgba(10,200,185,0.15)', color: '#0AC8B9', border: '1px solid rgba(10,200,185,0.4)' }}>
          AI POWERED · REAL-TIME · EARLY ACCESS
        </Badge>

        <h1 className="font-orbitron font-black mb-6 leading-tight" style={{ fontSize: 'clamp(2.2rem, 5.5vw, 4.5rem)', lineHeight: 1.1 }}>
          <span className="shimmer-text">試合中にAIが</span>
          <br />
          <span style={{ color: '#e2e8f0' }}>リアルタイムで</span>
          <br />
          <span className="shimmer-text">勝ちに導く</span>
        </h1>

        <p className="text-lg md:text-xl mb-10 max-w-2xl mx-auto leading-relaxed" style={{ color: '#94a3b8', fontWeight: 300 }}>
          League of Legends の試合中、<span style={{ color: '#0AC8B9' }}>AI</span> がビルド提案・対面対策・試合後コーチングを<br className="hidden md:block" />
          リアルタイムで提供。ビルドに悩む時間はもう終わり。
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button size="lg" className="font-orbitron font-bold text-sm tracking-wider px-8 h-14 glow-gold gap-2" style={{ background: 'linear-gradient(135deg, #C8AA6E, #9a7c4a)', color: '#010A13', minWidth: 220 }}>
            <IconStore width={18} height={18} />
            Microsoft Storeで入手
          </Button>
          <a href="#features">
            <Button size="lg" variant="outline" className="font-orbitron text-sm tracking-wider px-8 h-14 gap-2" style={{ borderColor: 'rgba(200,170,110,0.4)', color: '#C8AA6E', background: 'transparent' }}>
              機能を見る
              <IconArrowRight />
            </Button>
          </a>
        </div>

        <p className="mt-5 text-xs" style={{ color: '#475569' }}>
          Windows 10/11 対応 · Early Access中はAI無制限 · Vanguard 互換確認済み
        </p>
      </div>

      {/* モックUI — 大きめに表示 */}
      <div className="relative z-10 mt-12 max-w-2xl w-full mx-auto animate-float">
        <div className="rounded-xl overflow-hidden border" style={{ background: '#0A1428', borderColor: 'rgba(200,170,110,0.3)', boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(200,170,110,0.1)' }}>
          <div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: '#010A13', borderColor: 'rgba(200,170,110,0.2)' }}>
            <div className="flex items-center gap-2">
              <AppIcon size={18} />
              <span className="font-orbitron text-xs text-gold tracking-wider">ろるさぽくん</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: '#0AC8B9' }}>● LIVE</span>
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ background: '#4a5568' }} />
                <div className="w-3 h-3 rounded-full" style={{ background: '#4a5568' }} />
                <div className="w-3 h-3 rounded-full" style={{ background: '#E84057' }} />
              </div>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="rounded-lg p-3 border" style={{ background: '#0A1E32', borderColor: 'rgba(10,200,185,0.3)' }}>
              <div className="flex items-center gap-2 mb-2">
                <IconBrain width={14} height={14} style={{ color: '#0AC8B9' }} />
                <span className="text-xs font-bold font-orbitron" style={{ color: '#0AC8B9' }}>AI ビルド提案</span>
                <Badge style={{ background: 'rgba(200,170,110,0.2)', color: '#C8AA6E', border: 'none', fontSize: 10, padding: '1px 6px' }}>優勢</Badge>
              </div>
              <div className="flex gap-2">
                {[{ id: 3078, name: "Trinity Force" }, { id: 3053, name: "Sterak's" }, { id: 3742, name: "Dead Man's" }].map((item, i) => (
                  <div key={i} className="flex-1 rounded p-2 text-center" style={{ background: i === 0 ? 'rgba(200,170,110,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${i === 0 ? 'rgba(200,170,110,0.4)' : 'rgba(255,255,255,0.1)'}` }}>
                    <img src={itemIcon(item.id)} alt={item.name} className="w-8 h-8 rounded mx-auto mb-1" />
                    <span style={{ fontSize: 9, color: i === 0 ? '#C8AA6E' : '#94a3b8' }}>{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg p-3 border" style={{ background: '#0A1E32', borderColor: 'rgba(200,170,110,0.2)' }}>
              <div className="flex items-center gap-2 mb-1">
                <IconTarget width={14} height={14} style={{ color: '#C8AA6E' }} />
                <span className="text-xs font-bold font-orbitron text-gold">マッチアップTip</span>
              </div>
              <p className="text-xs" style={{ color: '#94a3b8' }}>Lv6前に有利トレードを仕掛けよう。相手のultがない間がチャンス。</p>
            </div>
            <div className="flex gap-2 text-xs">
              {[{ name: 'Garen', champ: 'Garen', kda: '5/1/3', color: '#0AC8B9' }, { name: 'Jinx', champ: 'Jinx', kda: '8/2/5', color: '#C8AA6E' }, { name: 'Thresh', champ: 'Thresh', kda: '1/0/9', color: '#94a3b8' }].map((p, i) => (
                <div key={i} className="flex-1 rounded p-2 flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <img src={champIcon(p.champ)} alt={p.name} className="w-6 h-6 rounded-full" />
                  <div>
                    <div className="font-bold font-orbitron" style={{ color: p.color, fontSize: 10 }}>{p.name}</div>
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>{p.kda}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ---- Early Access Banner ----
function EarlyAccessBanner() {
  return (
    <section className="py-14 px-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(10,200,185,0.12), rgba(200,170,110,0.12))', borderBottom: '1px solid rgba(10,200,185,0.2)' }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10 blur-3xl" style={{ background: '#0AC8B9' }} />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-10 blur-3xl" style={{ background: '#C8AA6E' }} />
      </div>
      <div className="max-w-4xl mx-auto text-center relative z-10">
        <div className="inline-block mb-4 px-5 py-2 rounded-full font-orbitron font-bold text-sm tracking-wider animate-pulse" style={{ background: 'rgba(10,200,185,0.25)', color: '#0AC8B9', border: '2px solid rgba(10,200,185,0.5)', boxShadow: '0 0 20px rgba(10,200,185,0.2)' }}>
          EARLY ACCESS 限定特典
        </div>
        <h2 className="font-orbitron font-bold text-2xl md:text-3xl mb-4" style={{ color: '#e2e8f0' }}>
          <span style={{ color: '#0AC8B9' }}>今だけ</span>、すべてのAI機能が<span style={{ color: '#C8AA6E' }}>無制限</span>
        </h2>
        <p className="text-sm mb-8 max-w-xl mx-auto leading-relaxed" style={{ color: '#94a3b8' }}>
          正式リリース後、Freeプランには1日5回の制限が入ります。<br />
          Early Access中にインストールした方は、制限なしでAI機能を使い放題。
        </p>
        <div className="inline-flex items-center gap-8 px-8 py-4 rounded-xl" style={{ background: 'rgba(1,10,19,0.7)', border: '1px solid rgba(200,170,110,0.3)', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
          <div className="text-center">
            <div className="font-orbitron font-bold text-xl" style={{ color: '#475569', textDecoration: 'line-through' }}>1日5回</div>
            <div className="text-xs mt-1" style={{ color: '#475569' }}>正式リリース後</div>
          </div>
          <div className="text-4xl font-black animate-pulse" style={{ color: '#C8AA6E', textShadow: '0 0 20px rgba(200,170,110,0.5)' }}>→</div>
          <div className="text-center">
            <div className="font-orbitron font-black text-2xl text-glow-gold" style={{ color: '#C8AA6E' }}>無制限</div>
            <div className="text-xs mt-1 font-bold" style={{ color: '#0AC8B9' }}>Early Access 限定</div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ---- Social Proof ----
function SocialProof() {
  const stats = [
    { value: '3種', label: 'AIアナリシス', sub: 'ビルド・マッチアップ・コーチング' },
    { value: '3秒', label: 'リアルタイム更新', sub: '試合データを3秒ごとに取得' },
    { value: '無制限', label: 'Early Access特典', sub: '今だけAI機能が使い放題' },
    { value: '0円', label: 'Early Access', sub: '今なら全機能無料' },
  ]
  return (
    <section className="py-16 border-b" style={{ background: '#0A1428', borderColor: 'rgba(200,170,110,0.15)' }}>
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s, i) => (
            <div key={i} className="text-center">
              <div className="font-orbitron font-black text-3xl md:text-4xl text-gold mb-1 text-glow-gold">{s.value}</div>
              <div className="font-bold text-sm mb-1" style={{ color: '#e2e8f0' }}>{s.label}</div>
              <div className="text-xs" style={{ color: '#475569' }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---- Problem ----
function Problem() {
  const problems = [
    { icon: '😰', title: 'ビルド迷子', desc: '相手の構成に合わせてビルドを変えるべきなのに、毎回同じビルドをコピー。タンクに対してもAP積んでたり…' },
    { icon: '💀', title: '対面に毎回負ける', desc: '同じチャンプを相手にするたびにやられる。そのチャンプに対してどう立ち回るべきか知らない。' },
    { icon: '📉', title: '何が悪かったかわからない', desc: '試合に負けても原因がわからない。感覚でプレイし続けて同じミスを繰り返してしまう。' },
  ]
  return (
    <section className="py-24 px-6" style={{ background: '#010A13' }}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <Badge className="mb-4 text-xs tracking-widest font-orbitron" style={{ background: 'rgba(232,64,87,0.15)', color: '#E84057', border: '1px solid rgba(232,64,87,0.3)' }}>PAIN POINTS</Badge>
          <h2 className="font-orbitron font-bold text-3xl md:text-4xl mb-4" style={{ color: '#e2e8f0' }}>こんな経験、ない？</h2>
          <p style={{ color: '#94a3b8' }}>多くのLoLプレイヤーが抱えるこれらの悩みを、AIが解決します。</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {problems.map((p, i) => (
            <Card key={i} className="card-hover border" style={{ background: '#0A1428', borderColor: 'rgba(232,64,87,0.2)' }}>
              <CardContent className="p-6">
                <div className="text-4xl mb-4">{p.icon}</div>
                <h3 className="font-orbitron font-bold text-lg mb-3" style={{ color: '#E84057' }}>{p.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>{p.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---- Feature Showcase ----
function FeatureBlock({ badge, icon, title, desc, points, reverse, accentColor = '#C8AA6E', mockContent }) {
  const rgb = accentColor === '#C8AA6E' ? '200,170,110' : '10,200,185'
  return (
    <div className={`flex flex-col ${reverse ? 'md:flex-row-reverse' : 'md:flex-row'} gap-12 items-center py-20`}>
      <div className="flex-1 space-y-5">
        <Badge className="text-xs tracking-widest font-orbitron" style={{ background: `rgba(${rgb},0.15)`, color: accentColor, border: `1px solid rgba(${rgb},0.35)` }}>{badge}</Badge>
        <div className="flex items-center gap-3">
          <span style={{ color: accentColor }}>{icon}</span>
          <h3 className="font-orbitron font-bold text-2xl md:text-3xl" style={{ color: '#e2e8f0' }}>{title}</h3>
        </div>
        <p className="text-base leading-relaxed" style={{ color: '#94a3b8' }}>{desc}</p>
        <ul className="space-y-2">
          {points.map((pt, i) => (
            <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#e2e8f0' }}>
              <span className="mt-0.5 shrink-0" style={{ color: accentColor }}><IconCheck /></span>
              {pt}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex-1 w-full">
        <div className="rounded-xl border p-5" style={{ background: '#0A1E32', borderColor: `rgba(${rgb},0.3)`, boxShadow: `0 10px 40px rgba(0,0,0,0.4), 0 0 30px rgba(${rgb},0.12)` }}>
          {mockContent}
        </div>
      </div>
    </div>
  )
}

function Features() {
  return (
    <section id="features" className="py-8 px-6 border-t border-b" style={{ background: '#010A13', borderColor: 'rgba(200,170,110,0.1)' }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center pt-16 mb-4">
          <Badge className="mb-4 text-xs tracking-widest font-orbitron" style={{ background: 'rgba(200,170,110,0.15)', color: '#C8AA6E', border: '1px solid rgba(200,170,110,0.3)' }}>FEATURES</Badge>
          <h2 className="font-orbitron font-bold text-3xl md:text-4xl" style={{ color: '#e2e8f0' }}>AIが試合全体をサポート</h2>
        </div>
        <div className="gold-divider my-8" />

        {/* Feature 1: AIアイテム提案 */}
        <FeatureBlock
          badge="AI BUILD SUGGESTION"
          icon={<IconSword />}
          title="リアルタイムAIビルド提案"
          desc="試合中の戦況をリアルタイムで分析し、AIが最適なアイテムを提案。優勢時は攻撃的に、劣勢時は防御的なビルドを自動切り替え。"
          points={['敵構成に合わせたカウンターアイテムを自動提案', 'OP.GGの統計データとAI分析のハイブリッド', 'アイテム購入・キル発生のたびに即時更新', '提案理由も表示されるから判断力が身につく']}
          mockContent={
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-3">
                <IconBrain width={14} height={14} style={{ color: '#0AC8B9' }} />
                <span className="text-xs font-bold font-orbitron" style={{ color: '#0AC8B9' }}>AI ITEM SUGGESTION</span>
                <Badge style={{ background: 'rgba(200,170,110,0.2)', color: '#C8AA6E', border: 'none', fontSize: 10, padding: '1px 6px' }}>優勢 +4K</Badge>
              </div>
              {[{ id: 3053, name: "Sterak's Gage", reason: '敵のバーストに対抗 — 集団戦での生存力UP', stars: 5 }, { id: 3078, name: 'Trinity Force', reason: 'コアビルド完成でスパイク — 1v1性能が大幅向上', stars: 4 }, { id: 6333, name: "Death's Dance", reason: '対AD3人構成 — ダメージの30%を軽減', stars: 3 }].map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: i === 0 ? 'rgba(200,170,110,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${i === 0 ? 'rgba(200,170,110,0.3)' : 'rgba(255,255,255,0.07)'}` }}>
                  <img src={itemIcon(item.id)} alt={item.name} className="w-10 h-10 rounded shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold" style={{ color: '#C8AA6E' }}>{item.name}</div>
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>{item.reason}</div>
                  </div>
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, si) => (
                      <div key={si} className="w-2 h-2 rounded-full" style={{ background: si < item.stars ? '#C8AA6E' : 'rgba(200,170,110,0.2)' }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          }
        />

        <div className="gold-divider" />

        {/* Feature 2: チャンプセレクト分析 */}
        <FeatureBlock
          reverse
          badge="CHAMP SELECT"
          icon={<IconShield />}
          accentColor="#0AC8B9"
          title="チャンプセレクト分析"
          desc="チャンピオン選択中にチーム構成を自動分析。試合が始まる前から対策を立てられます。"
          points={['味方・敵チームのAD/AP比率・CC・回復を一目で把握', 'OP.GGからコアビルド・推奨ルーン・スキルオーダーを自動取得', '対面マッチアップTipで有利な立ち回りを事前に確認', 'ロード画面の間に試合のゲームプランが立てられる']}
          mockContent={
            <div className="space-y-3">
              <div className="text-xs font-bold mb-2 font-orbitron" style={{ color: '#0AC8B9' }}>CHAMP SELECT · TEAM ANALYSIS</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg border" style={{ background: 'rgba(10,200,185,0.08)', borderColor: 'rgba(10,200,185,0.2)' }}>
                  <div className="text-xs font-bold mb-2" style={{ color: '#0AC8B9' }}>味方チーム</div>
                  <div className="flex gap-1 mb-2">
                    {['Garen', 'LeeSin', 'Ahri', 'Jinx', 'Lulu'].map(c => (
                      <img key={c} src={champIcon(c)} alt={c} className="w-7 h-7 rounded-full border" style={{ borderColor: 'rgba(10,200,185,0.3)' }} />
                    ))}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {['CC: 3', 'タンク: 1', 'AD 55%'].map(t => <span key={t} className="px-1.5 py-0.5 rounded" style={{ background: 'rgba(10,200,185,0.15)', color: '#0AC8B9', fontSize: 9 }}>{t}</span>)}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border" style={{ background: 'rgba(232,64,87,0.08)', borderColor: 'rgba(232,64,87,0.2)' }}>
                  <div className="text-xs font-bold mb-2" style={{ color: '#E84057' }}>敵チーム</div>
                  <div className="flex gap-1 mb-2">
                    {['Darius', 'Amumu', 'Zed', 'Caitlyn', 'Thresh'].map(c => (
                      <img key={c} src={champIcon(c)} alt={c} className="w-7 h-7 rounded-full border" style={{ borderColor: 'rgba(232,64,87,0.3)' }} />
                    ))}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {['回復: 1', 'CC: 4', 'AP 40%'].map(t => <span key={t} className="px-1.5 py-0.5 rounded" style={{ background: 'rgba(232,64,87,0.15)', color: '#E84057', fontSize: 9 }}>{t}</span>)}
                  </div>
                </div>
              </div>
              <div className="p-2.5 rounded-lg border" style={{ background: 'rgba(200,170,110,0.06)', borderColor: 'rgba(200,170,110,0.2)' }}>
                <div className="text-xs font-bold mb-2" style={{ color: '#C8AA6E' }}>推奨コアビルド (OP.GG)</div>
                <div className="flex gap-2 items-center">
                  {[3078, 3053, 3742, 3156].map((id) => (
                    <img key={id} src={itemIcon(id)} alt="" className="w-9 h-9 rounded border" style={{ borderColor: 'rgba(200,170,110,0.25)' }} />
                  ))}
                  <span className="text-xs ml-2" style={{ color: '#475569' }}>勝率 54.2%</span>
                </div>
              </div>
            </div>
          }
        />

        <div className="gold-divider" />

        {/* Feature 3: 試合後AIコーチング */}
        <FeatureBlock
          badge="POST-GAME COACHING"
          icon={<IconTrophy />}
          title="試合後AIコーチング"
          desc="試合終了後、AIが試合全体を振り返り。セクション別のスコアと具体的な改善点で、毎試合確実に成長できます。"
          points={['レーニング・CS管理・ビルド・マクロの4項目を10点満点で評価', '良かったプレイと改善点を具体的にフィードバック', 'デス原因の分析と次回の対策を提示', '試合を振り返る習慣が自然と身につく']}
          mockContent={
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold font-orbitron" style={{ color: '#C8AA6E' }}>POST-GAME COACHING</span>
                <Badge style={{ background: 'rgba(10,200,185,0.2)', color: '#0AC8B9', border: 'none', fontSize: 10 }}>VICTORY · 28:34</Badge>
              </div>
              <div className="flex items-center gap-4 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <img src={champIcon('Jinx')} alt="Jinx" className="w-12 h-12 rounded-full border-2" style={{ borderColor: '#C8AA6E' }} />
                <div>
                  <div className="font-orbitron font-bold text-sm" style={{ color: '#C8AA6E' }}>Jinx · ADC</div>
                  <div className="text-xs" style={{ color: '#0AC8B9' }}>8 / 2 / 5 · CS 234 (8.4/min)</div>
                </div>
                <div className="ml-auto text-center">
                  <div className="font-orbitron font-black text-2xl" style={{ color: '#C8AA6E' }}>7.8</div>
                  <div className="text-xs" style={{ color: '#475569' }}>総合</div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                {[{ label: 'レーニング', score: '8.5', color: '#0AC8B9' }, { label: 'CS管理', score: '8.0', color: '#0AC8B9' }, { label: 'ビルド', score: '7.5', color: '#C8AA6E' }, { label: 'マクロ', score: '6.5', color: '#C8AA6E' }].map((s, i) => (
                  <div key={i} className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="font-orbitron font-bold text-base" style={{ color: s.color }}>{s.score}</div>
                    <div style={{ fontSize: 9, color: '#475569' }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <div className="p-2.5 rounded-lg" style={{ background: 'rgba(10,200,185,0.06)', border: '1px solid rgba(10,200,185,0.15)' }}>
                  <div className="text-xs font-bold mb-1" style={{ color: '#0AC8B9' }}>Good</div>
                  <p style={{ color: '#94a3b8', fontSize: 10 }}>レーニングフェーズで安定してCSを確保し、2キルを獲得。対面のCaitlynに対して射程差を理解した立ち回りができていました。</p>
                </div>
                <div className="p-2.5 rounded-lg" style={{ background: 'rgba(232,64,87,0.06)', border: '1px solid rgba(232,64,87,0.15)' }}>
                  <div className="text-xs font-bold mb-1" style={{ color: '#E84057' }}>改善点</div>
                  <p style={{ color: '#94a3b8', fontSize: 10 }}>14分のドラゴンファイトで合流が20秒遅れ、チームが4v5で戦闘。サイドウェーブの処理を早めにしてオブジェクトに寄る意識を持ちましょう。</p>
                </div>
              </div>
            </div>
          }
        />
      </div>
    </section>
  )
}

// ---- Feature Grid ----
function FeatureGrid() {
  const items = [
    { icon: <IconTarget style={{ color: '#C8AA6E' }} />, title: '対面の攻略法がすぐわかる', desc: '試合開始時に対面チャンプとの戦い方をAIが解説。有利なタイミングと注意点を把握してからレーンに出られます。' },
    { icon: <IconBarChart style={{ color: '#0AC8B9' }} />, title: '全員のKDAが一目でわかる', desc: '味方・敵10人のKDA・レベル・アイテムをチャンピオンアイコン付きで常時表示。誰がFedしているか瞬時に把握。' },
    { icon: <IconClock style={{ color: '#C8AA6E' }} />, title: 'オブジェクトを取り逃さない', desc: 'ドラゴン・バロン・ヴォイドグラブ・ヘラルドの状態を秒単位で追跡。スポーンタイミングを逃しません。' },
    { icon: <IconZap style={{ color: '#0AC8B9' }} />, title: '試合中の操作を邪魔しない', desc: 'コンパクトなオーバーレイで画面を占領しません。チラ見するだけで必要な情報が手に入ります。' },
    { icon: <IconShield style={{ color: '#C8AA6E' }} />, title: 'Vanguard互換で安心', desc: 'Riot公式のLive Client Data APIのみ使用。Vanguardとの互換性を実機確認済みで、安心して使えます。' },
    { icon: <IconStore style={{ color: '#0AC8B9' }} />, title: 'インストールも更新もかんたん', desc: 'Microsoft Storeからワンクリックでインストール。アップデートも自動で、常に最新版が使えます。' },
  ]
  return (
    <section className="py-24 px-6" style={{ background: '#0A1428' }}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="font-orbitron font-bold text-2xl md:text-3xl mb-4" style={{ color: '#e2e8f0' }}>その他の機能</h2>
          <p className="text-sm" style={{ color: '#94a3b8' }}>細部にもLoLプレイヤーへの配慮が詰まっています</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item, i) => {
            const highlight = i === 0 || i === 2
            return (
              <Card key={i} className="card-hover" style={{ background: '#010A13', border: `1px solid ${highlight ? 'rgba(200,170,110,0.35)' : 'rgba(200,170,110,0.15)'}`, boxShadow: highlight ? '0 0 20px rgba(200,170,110,0.06)' : 'none' }}>
                <CardContent className="p-5">
                  <div className="mb-3">{item.icon}</div>
                  <h3 className="font-bold mb-2 text-sm" style={{ color: '#e2e8f0' }}>{item.title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>{item.desc}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ---- How it works ----
function HowItWorks() {
  const steps = [
    { icon: <IconStore width={28} height={28} style={{ color: '#C8AA6E' }} />, title: 'Microsoft Storeからインストール', desc: 'Microsoft Storeで「ろるさぽくん」を検索してインストール。ログインもアカウント作成も不要。' },
    { icon: <IconZap width={28} height={28} style={{ color: '#0AC8B9' }} />, title: 'LoLを起動して試合スタート', desc: 'あとはLoLを起動するだけ。チャンプセレクトから試合終了まで、AIが自動でサポートします。' },
  ]
  return (
    <section id="how" className="py-24 px-6" style={{ background: '#010A13' }}>
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-16">
          <Badge className="mb-4 text-xs tracking-widest font-orbitron" style={{ background: 'rgba(200,170,110,0.15)', color: '#C8AA6E', border: '1px solid rgba(200,170,110,0.3)' }}>HOW IT WORKS</Badge>
          <h2 className="font-orbitron font-bold text-3xl md:text-4xl" style={{ color: '#e2e8f0' }}>2ステップで始められる</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-12">
          {steps.map((step, i) => (
            <div key={i} className="text-center">
              <div className="w-20 h-20 rounded-full mx-auto mb-5 flex items-center justify-center relative" style={{ background: '#0A1428', border: '2px solid rgba(200,170,110,0.4)' }}>
                {step.icon}
                <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-orbitron font-bold" style={{ background: '#C8AA6E', color: '#010A13' }}>
                  {i + 1}
                </div>
              </div>
              <h3 className="font-bold text-base mb-3" style={{ color: '#e2e8f0' }}>{step.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---- Pricing ----
function Pricing() {
  return (
    <section id="pricing" className="py-24 px-6 border-t border-b" style={{ background: '#0A1428', borderColor: 'rgba(200,170,110,0.1)' }}>
      <div className="max-w-3xl mx-auto text-center">
        <Badge className="mb-4 text-xs tracking-widest font-orbitron" style={{ background: 'rgba(200,170,110,0.15)', color: '#C8AA6E', border: '1px solid rgba(200,170,110,0.3)' }}>PRICING</Badge>
        <h2 className="font-orbitron font-bold text-3xl md:text-4xl mb-4" style={{ color: '#e2e8f0' }}>料金プラン</h2>
        <p className="mb-10" style={{ color: '#94a3b8' }}>Early Access期間中はAI機能が無制限で無料。<br />正式リリース後にFree/Proの2プランに移行します。</p>
        <div className="grid md:grid-cols-2 gap-6">
          {/* Free */}
          <Card className="border text-left" style={{ background: '#010A13', borderColor: 'rgba(200,170,110,0.3)' }}>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="font-orbitron text-lg text-gold">Free</CardTitle>
                <Badge style={{ background: 'rgba(10,200,185,0.2)', color: '#0AC8B9', border: 'none' }}>Early Access: 無制限</Badge>
              </div>
              <div className="mt-2">
                <span className="font-orbitron font-black text-4xl text-gold">¥0</span>
                <span className="text-sm ml-2" style={{ color: '#94a3b8' }}>/月</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {['AI機能1日5回まで', 'アイテム提案・マッチアップTip', '試合後AIコーチング', 'チャンプセレクト分析'].map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm" style={{ color: '#e2e8f0' }}>
                  <span style={{ color: '#0AC8B9' }}><IconCheck /></span>{f}
                </div>
              ))}
              <div className="pt-2 px-4 py-3 rounded-lg text-sm text-center font-bold animate-pulse" style={{ background: 'rgba(10,200,185,0.15)', color: '#0AC8B9', border: '2px solid rgba(10,200,185,0.5)', boxShadow: '0 0 15px rgba(10,200,185,0.15)' }}>
                Early Access中は回数制限なし
              </div>
              <Button className="w-full mt-4 font-orbitron text-sm font-bold gap-2" style={{ background: 'linear-gradient(135deg, #C8AA6E, #9a7c4a)', color: '#010A13' }}>
                <IconStore width={16} height={16} />Storeで入手
              </Button>
            </CardContent>
          </Card>

          {/* Pro */}
          <Card className="border text-left" style={{ background: '#010A13', borderColor: 'rgba(200,170,110,0.3)' }}>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="font-orbitron text-lg text-gold">Pro</CardTitle>
                <Badge style={{ background: 'rgba(200,170,110,0.2)', color: '#C8AA6E', border: 'none' }}>正式リリース後</Badge>
              </div>
              <div className="mt-2">
                <span className="font-orbitron font-black text-4xl text-gold">¥980</span>
                <span className="text-sm ml-2" style={{ color: '#94a3b8' }}>/月</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {['AI機能 無制限', 'アイテム提案・マッチアップTip', '試合後AIコーチング', 'チャンプセレクト分析'].map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm" style={{ color: '#e2e8f0' }}>
                  <span style={{ color: '#C8AA6E' }}><IconCheck /></span>{f}
                </div>
              ))}
              <div className="pt-2 px-3 py-2 rounded-lg text-xs text-center" style={{ background: 'rgba(200,170,110,0.1)', color: '#C8AA6E', border: '1px solid rgba(200,170,110,0.3)' }}>
                Microsoft Storeサブスクリプション
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}

// ---- FAQ ----
function FAQ() {
  const faqs = [
    { q: '無料で使えますか？', a: 'はい。Early Access期間中はAI機能が回数制限なしで無料です。正式リリース後はFreeプラン（1日5回まで）とProプラン（¥980/月、無制限）の2プランになります。' },
    { q: 'アカウント登録は必要ですか？', a: 'いいえ。Microsoft Storeからインストールするだけで使い始められます。ログインやアカウント作成は不要です。' },
    { q: 'Riot VanguardやアンチチートがElectronをブロックしませんか？', a: '実機テストで動作確認済みです。現時点でVanguardによるブロックは確認されていません。LoLはボーダーレスウィンドウモードでのプレイを推奨します（排他フルスクリーンではオーバーレイが表示されません）。' },
    { q: 'AIの提案精度はどのくらいですか？', a: 'OP.GGのコアビルドデータ＋戦況（KDA・アイテム・敵構成・試合時間）を組み合わせてAIが判断します。状況に応じた提案が得られますが、最終的なビルド判断はプレイヤーが行ってください。' },
    { q: 'Early Accessはいつまでですか？', a: '終了時期は未定です。正式リリースに移行する際は事前にお知らせします。Early Access中にインストールしていただければ、移行後もスムーズにご利用いただけます。' },
  ]
  return (
    <section id="faq" className="py-24 px-6" style={{ background: '#010A13' }}>
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-16">
          <Badge className="mb-4 text-xs tracking-widest font-orbitron" style={{ background: 'rgba(200,170,110,0.15)', color: '#C8AA6E', border: '1px solid rgba(200,170,110,0.3)' }}>FAQ</Badge>
          <h2 className="font-orbitron font-bold text-3xl md:text-4xl" style={{ color: '#e2e8f0' }}>よくある質問</h2>
        </div>
        <Accordion type="single" collapsible className="space-y-3">
          {faqs.map((faq, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="border rounded-lg px-5" style={{ background: '#0A1428', borderColor: 'rgba(200,170,110,0.2)' }}>
              <AccordionTrigger className="text-sm font-bold text-left hover:no-underline py-4" style={{ color: '#e2e8f0' }}>
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm pb-4 leading-relaxed" style={{ color: '#94a3b8' }}>
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}

// ---- Final CTA ----
function FinalCTA() {
  return (
    <section className="py-28 px-6 text-center relative overflow-hidden" style={{ background: '#0A1428' }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full opacity-10" style={{ background: 'radial-gradient(ellipse at center top, #C8AA6E, transparent 70%)' }} />
      </div>
      <div className="relative z-10 max-w-2xl mx-auto">
        <h2 className="font-orbitron font-black text-3xl md:text-5xl mb-6 text-glow-gold" style={{ color: '#C8AA6E' }}>
          今すぐ<br />ランクを上げよう
        </h2>
        <p className="text-lg mb-6" style={{ color: '#94a3b8' }}>
          ビルドに悩む時間を、プレイに使おう。<br />AIがチャンプセレクトから試合終了まで全力サポート。
        </p>
        <div className="inline-block mb-8 px-5 py-2 rounded-full text-sm font-bold" style={{ background: 'rgba(10,200,185,0.15)', color: '#0AC8B9', border: '1px solid rgba(10,200,185,0.4)' }}>
          Early Access 限定 — 今ならAI機能が無制限で無料
        </div>
        <Button size="lg" className="font-orbitron font-bold text-base tracking-wider px-12 h-16 glow-gold gap-2" style={{ background: 'linear-gradient(135deg, #C8AA6E, #9a7c4a)', color: '#010A13', minWidth: 260 }}>
          <IconStore width={20} height={20} />
          Microsoft Storeで入手
        </Button>
        <p className="mt-4 text-xs" style={{ color: '#475569' }}>Windows 10/11 · Early Access中はAI無制限 · Vanguard互換確認済み</p>
      </div>
    </section>
  )
}

// ---- Footer ----
function Footer() {
  return (
    <footer className="border-t py-10 px-6" style={{ background: '#010A13', borderColor: 'rgba(200,170,110,0.15)' }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-3">
            <AppIcon size={28} />
            <span className="font-orbitron font-bold text-gold">ろるさぽくん</span>
          </div>
          <div className="flex gap-8 text-sm" style={{ color: '#475569' }}>
            <a href="#features" className="hover:text-gold transition-colors">機能</a>
            <a href="#how" className="hover:text-gold transition-colors">使い方</a>
            <a href="#pricing" className="hover:text-gold transition-colors">料金</a>
            <a href="#faq" className="hover:text-gold transition-colors">FAQ</a>
            <a href={`${import.meta.env.BASE_URL}privacy`} className="hover:text-gold transition-colors">プライバシーポリシー</a>
          </div>
        </div>
        <div className="gold-divider mb-6" />
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs" style={{ color: '#334155' }}>
          <p>© 2026 合同会社299. All rights reserved.</p>
          <p className="text-center md:text-right leading-relaxed">
            ろるさぽくん は League of Legends の公式 Live Client Data API を使用しています。<br />
            Riot Games によって認定・後援・または具体的に承認されたものではなく、Riot Games はその責任を負いません。
          </p>
        </div>
      </div>
    </footer>
  )
}

// ---- App ----
export default function App() {
  return (
    <div className="min-h-screen" style={{ background: '#010A13' }}>
      <Navbar />
      <main>
        <Hero />
        <EarlyAccessBanner />
        <SocialProof />
        <Problem />
        <Features />
        <FeatureGrid />
        <HowItWorks />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}
