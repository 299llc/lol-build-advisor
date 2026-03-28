import { Swords, Shield, Zap, Target, AlertTriangle, Users, Flame, BookOpen } from 'lucide-react'
import { BuildRecommendation } from './BuildRecommendation'

// サモナースペルID → 名前・Data Dragon画像名
const SPELL_MAP = {
  1: { name: 'クレンズ', img: 'SummonerBoost' },
  3: { name: 'イグゾースト', img: 'SummonerExhaust' },
  4: { name: 'フラッシュ', img: 'SummonerFlash' },
  6: { name: 'ゴースト', img: 'SummonerHaste' },
  7: { name: 'ヒール', img: 'SummonerHeal' },
  11: { name: 'スマイト', img: 'SummonerSmite' },
  12: { name: 'テレポート', img: 'SummonerTeleport' },
  14: { name: 'イグナイト', img: 'SummonerDot' },
  21: { name: 'バリア', img: 'SummonerBarrier' },
  32: { name: 'マーク', img: 'SummonerSnowball' },
}

// タグ→日本語ラベル
const TAG_LABELS = {
  Fighter: 'ファイター',
  Tank: 'タンク',
  Mage: 'メイジ',
  Assassin: 'アサシン',
  Marksman: 'マークスマン',
  Support: 'サポート',
}

// タグの色
const TAG_COLORS = {
  Fighter: 'text-orange-400',
  Tank: 'text-green-400',
  Mage: 'text-blue-400',
  Assassin: 'text-red-400',
  Marksman: 'text-yellow-400',
  Support: 'text-teal-400',
}

// チーム構成を分析
function analyzeTeamComp(team) {
  if (!team || team.length === 0) return null

  const picked = team.filter(p => p.enName !== 'Unknown')
  if (picked.length === 0) return null

  // タグ集計
  const tagCount = {}
  for (const p of picked) {
    for (const tag of p.tags) {
      tagCount[tag] = (tagCount[tag] || 0) + 1
    }
  }

  // ダメージタイプ分析
  // Marksman/Fighter → 主にAD, Mage → AP, Assassin → 混在
  const adChamps = picked.filter(p =>
    p.tags.includes('Marksman') || (p.tags.includes('Fighter') && !p.tags.includes('Mage'))
  ).length
  const apChamps = picked.filter(p =>
    p.tags.includes('Mage')
  ).length

  // 構成の特徴と不足を判定
  const traits = []
  const warnings = []

  // フロントライン
  const hasTank = (tagCount.Tank || 0) >= 1
  const hasFighter = (tagCount.Fighter || 0) >= 1
  if (hasTank) traits.push('タンクあり')
  if (!hasTank && !hasFighter) warnings.push('フロントライン不足')

  // ダメージバランス
  if (adChamps > 0 && apChamps > 0) {
    traits.push(`AD/APバランス良好`)
  } else if (adChamps >= 3 && apChamps === 0) {
    warnings.push('AP不足 (全員AD寄り)')
  } else if (apChamps >= 3 && adChamps === 0) {
    warnings.push('AD不足 (全員AP寄り)')
  }

  // エンゲージ/CC
  if (hasTank || (tagCount.Support || 0) >= 1) {
    traits.push('CC/エンゲージあり')
  } else {
    warnings.push('CC/エンゲージ不足')
  }

  // 耐久力
  if ((tagCount.Tank || 0) + (tagCount.Fighter || 0) >= 2) {
    traits.push('耐久力あり')
  }

  // アサシン多め
  if ((tagCount.Assassin || 0) >= 2) {
    traits.push('アサシン多め (序盤重視)')
  }

  return { picked, tagCount, adChamps, apChamps, traits, warnings }
}

function TeamMember({ member, ddragon }) {
  const ddBase = ddragon || DDRAGON_FALLBACK
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded bg-lol-surface-light/30">
      {member.enName && member.enName !== 'Unknown' && (
        <img
          src={`${ddBase}/img/champion/${member.enName}.png`}
          alt={member.jaName}
          className="w-6 h-6 rounded"
          onError={(e) => { e.target.style.display = 'none' }}
        />
      )}
      <span className={`text-sm flex-1 ${member.isMe ? 'text-lol-gold font-medium' : 'text-lol-text-light'}`}>
        {member.jaName}
      </span>
      <div className="flex gap-1">
        {member.tags.map(tag => (
          <span key={tag} className={`text-[10px] ${TAG_COLORS[tag] || 'text-lol-text'}`}>
            {TAG_LABELS[tag] || tag}
          </span>
        ))}
      </div>
    </div>
  )
}

const DDRAGON_FALLBACK = 'https://ddragon.leagueoflegends.com/cdn/16.5.1'

function SpellIcon({ id, ddragon }) {
  const info = SPELL_MAP[Number(id)] || SPELL_MAP[id]
  if (!info) return <span className="text-xs text-lol-text">ID:{id}</span>
  const base = ddragon || DDRAGON_FALLBACK
  return (
    <div className="flex items-center gap-1">
      <img
        src={`${base}/img/spell/${info.img}.png`}
        alt={info.name}
        className="w-6 h-6 rounded border border-lol-gold/30"
      />
      <span className="text-xs text-lol-text-light">{info.name}</span>
    </div>
  )
}

const SKILL_COLORS = {
  Q: { bg: 'bg-blue-500/80', text: 'text-blue-400', border: 'border-blue-500/40' },
  W: { bg: 'bg-green-500/80', text: 'text-green-400', border: 'border-green-500/40' },
  E: { bg: 'bg-yellow-500/80', text: 'text-yellow-400', border: 'border-yellow-500/40' },
  R: { bg: 'bg-red-500/80', text: 'text-red-400', border: 'border-red-500/40' },
}

function SkillOrderGrid({ tree }) {
  const skills = ['Q', 'W', 'E', 'R']
  return (
    <div className="rounded bg-lol-surface-light/30 overflow-hidden">
      {/* ヘッダー (レベル1-18) */}
      <div className="grid grid-cols-[20px_repeat(18,1fr)]">
        <div className="h-4" />
        {Array.from({ length: 18 }, (_, i) => (
          <div key={i} className="h-4 flex items-center justify-center">
            <span className="text-[8px] text-lol-text">{i + 1}</span>
          </div>
        ))}
      </div>
      {/* スキル行 */}
      {skills.map(skill => {
        const colors = SKILL_COLORS[skill]
        return (
          <div key={skill} className="grid grid-cols-[20px_repeat(18,1fr)]">
            <div className={`h-5 flex items-center justify-center ${colors.text} text-[10px] font-bold`}>
              {skill}
            </div>
            {Array.from({ length: 18 }, (_, i) => {
              const isActive = tree[i] === skill
              return (
                <div key={i} className="h-5 flex items-center justify-center p-px">
                  {isActive ? (
                    <div className={`w-full h-full rounded-sm ${colors.bg} flex items-center justify-center`}>
                      <span className="text-[8px] text-white font-bold">{skill}</span>
                    </div>
                  ) : (
                    <div className="w-full h-full rounded-sm bg-lol-surface/40" />
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

export function ChampSelectScreen({ suggestion, aiLoading, ddragon, team, extras }) {
  const analysis = analyzeTeamComp(team)
  const me = team?.find(m => m.isMe)
  const ddBase = ddragon || DDRAGON_FALLBACK

  return (
    <div className="flex flex-col gap-3 py-3 h-full overflow-y-auto">
      <div className="flex flex-col gap-3 px-4">
      <div className="py-2 px-3 rounded bg-lol-blue/10 border border-lol-blue/30">
        <div className="flex items-center justify-center gap-2">
          <Swords size={16} className="text-lol-blue" />
          <span className="font-heading text-[13px] text-lol-blue tracking-wider">
            CHAMPION SELECT
          </span>
        </div>
        {me && me.enName !== 'Unknown' && (
          <div className="flex items-center justify-center gap-3 mt-2">
            <img
              src={`${ddBase}/img/champion/${me.enName}.png`}
              alt={me.jaName}
              className="w-12 h-12 rounded-lg border-2 border-lol-gold/50"
              onError={(e) => { e.target.style.display = 'none' }}
            />
            <div>
              <div className="text-sm font-medium text-lol-gold">{me.jaName}</div>
              <div className="flex gap-1 mt-0.5">
                {me.tags?.map(tag => (
                  <span key={tag} className={`text-[10px] ${TAG_COLORS[tag] || 'text-lol-text'}`}>
                    {TAG_LABELS[tag] || tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* おすすめスペル・スキルオーダー */}
      {extras && (extras.summonerSpells?.length > 0 || extras.skills || extras.runes) && (
        <div className="rounded border border-lol-blue/30 bg-lol-surface/80">
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-lol-blue/20">
            <BookOpen size={14} className="text-lol-blue" />
            <span className="font-heading text-xs tracking-widest text-lol-blue">
              RECOMMENDED
            </span>
          </div>
          <div className="p-2 space-y-2">
            {/* サモナースペル */}
            {extras.summonerSpells?.length > 0 && (
              <div>
                <div className="text-[10px] text-lol-text mb-1">サモナースペル</div>
                <div className="space-y-0.5">
                  {extras.summonerSpells.slice(0, 3).map((sp, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1 rounded bg-lol-surface-light/30">
                      <div className="flex items-center gap-1.5">
                        {sp.ids.map(id => (
                          <SpellIcon key={id} id={id} ddragon={ddragon} />
                        ))}
                      </div>
                      <span className="text-[10px] text-lol-text ml-auto whitespace-nowrap">
                        勝率{sp.winRate}% / 選択率{sp.pickRate}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* スキルオーダー */}
            {extras.skills && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-lol-text">スキルオーダー</span>
                  <span className="text-[10px] text-lol-text">選択率{extras.skills.pickRate}%</span>
                </div>
                {/* スキル優先度 */}
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-lol-surface-light/30 mb-1">
                  {extras.skills.order.map((skill, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold px-2 py-1 rounded ${
                        skill === 'Q' ? 'bg-blue-500/30 text-blue-400' :
                        skill === 'W' ? 'bg-green-500/30 text-green-400' :
                        skill === 'E' ? 'bg-yellow-500/30 text-yellow-400' :
                        'bg-red-500/30 text-red-400'
                      }`}>
                        {skill}
                      </span>
                      {i < extras.skills.order.length - 1 && (
                        <span className="text-[10px] text-lol-text-light">＞</span>
                      )}
                    </span>
                  ))}
                </div>
                {/* レベル別グリッド */}
                {extras.skills.tree && (
                  <SkillOrderGrid tree={extras.skills.tree} />
                )}
              </div>
            )}

            {/* ルーン */}
            {extras.runes && (
              <div>
                <div className="text-[10px] text-lol-text mb-1">ルーン</div>
                <div className="px-2 py-1 rounded bg-lol-surface-light/30 space-y-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-lol-gold font-medium">{extras.runes.primaryPage}</span>
                    <span className="text-[10px] text-lol-text">:</span>
                    {extras.runes.primaryRunes.map((r, i) => (
                      <span key={i} className="text-[10px] text-lol-text-light">{r}{i < extras.runes.primaryRunes.length - 1 ? ' /' : ''}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-green-400 font-medium">{extras.runes.secondaryPage}</span>
                    <span className="text-[10px] text-lol-text">:</span>
                    {extras.runes.secondaryRunes.map((r, i) => (
                      <span key={i} className="text-[10px] text-lol-text-light">{r}{i < extras.runes.secondaryRunes.length - 1 ? ' /' : ''}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 味方構成 */}
      {analysis && (
        <div className="rounded border border-lol-gold/30 bg-lol-surface/80">
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-lol-gold/20">
            <Users size={14} className="text-lol-gold" />
            <span className="font-heading text-xs tracking-widest text-lol-gold">
              TEAM COMPOSITION
            </span>
          </div>

          <div className="p-2 space-y-2">
            {/* メンバー一覧 */}
            <div className="space-y-0.5">
              {analysis.picked.map(m => (
                <TeamMember key={m.championId} member={m} ddragon={ddragon} />
              ))}
            </div>

            {/* 構成の特徴 */}
            {analysis.traits.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {analysis.traits.map(t => (
                  <span key={t} className="text-[11px] px-1.5 py-0.5 rounded bg-lol-blue/10 border border-lol-blue/20 text-lol-blue">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* 注意点 */}
            {analysis.warnings.length > 0 && (
              <div className="space-y-1">
                {analysis.warnings.map(w => (
                  <div key={w} className="flex items-center gap-1.5 px-2 py-1 rounded bg-lol-red/10 border border-lol-red/20">
                    <AlertTriangle size={12} className="text-lol-red shrink-0" />
                    <span className="text-xs text-lol-red">{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <BuildRecommendation
        suggestion={suggestion}
        loading={aiLoading}
        ddragon={ddragon}
      />

      {!suggestion && !aiLoading && !analysis && (
        <p className="text-sm text-lol-text text-center">
          チャンピオンをピックするとコアビルドを表示します
        </p>
      )}
      </div>
    </div>
  )
}
