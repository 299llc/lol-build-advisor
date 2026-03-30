# Riot Developer Portal — Application Details

## Application Name
ろるさぽくん (LoL Sapo-kun)

## Description
ろるさぽくん is a real-time AI coaching overlay for League of Legends on Windows. It reads game data from the local Live Client Data API and LCU API, then provides contextual advice through a compact desktop overlay that does not interfere with gameplay.

### Core Features
- **AI Item Suggestions**: Analyzes the current game state (team composition, KDA, gold difference, game time) and recommends optimal items using AI combined with OP.GG build statistics.
- **Matchup Tips**: At game start, provides lane-specific tips against the opposing champion — favorable trade timings, abilities to watch out for, and playstyle adjustments.
- **Post-Game AI Coaching**: After the match ends, AI reviews the entire game and provides a scored evaluation across laning, CS management, build choices, and macro decisions, with specific improvement suggestions.
- **Champ Select Analysis**: During champion select, automatically analyzes both team compositions (AD/AP ratio, CC, healing) and pre-loads recommended builds from OP.GG.

### How It Works
1. The app reads game data from the **Live Client Data API** (localhost:2999) and **LCU API** (local League Client).
2. Game state is sent to **Google Gemini AI** (via our server-side proxy) for analysis. **No personal identifiers** (summoner name, Riot ID) are sent to the AI — only game state data (champions, items, KDA, gold, game time).
3. AI-generated advice is displayed in a compact overlay on the user's screen.
4. The player makes all decisions — the app only provides suggestions with reasoning.

### APIs Used
- **Live Client Data API** (localhost:2999): Read-only game data (champions, items, KDA, game time, team composition)
- **LCU API** (local): Champ select information, game flow phase, summoner info for player identification within the match
- **OP.GG MCP API**: Champion build statistics (core builds, runes, skill order, win rates)
- **Data Dragon CDN**: Static champion/item images and data

### What This App Does NOT Do
- Does NOT automate any in-game actions (no scripts, no macros, no auto-play)
- Does NOT use Riot API keys (all data comes from local APIs)
- Does NOT de-anonymize players beyond what is shown in-game
- Does NOT modify game files or memory
- Does NOT provide unfair hidden information — all data is derived from publicly available in-game state

### Monetization
- **Free plan**: AI features up to 5 times per day (currently unlimited during Early Access)
- **Pro plan**: ¥980/month for unlimited AI features (via Microsoft Store subscription)
- The free tier ensures all players have access to the tool regardless of payment

### Compliance
- Built as a coaching/assistant tool, not a "game-solving" tool — similar in category to Blitz.gg, Porofessor, Mobalytics
- All advice is suggestive; final decisions remain with the player
- Riot Games disclaimer is displayed in the app and on the website

### Links
- **Website**: https://299llc.github.io/lolsupkun/
- **Privacy Policy**: https://299llc.github.io/lolsupkun/#/privacy
- **Microsoft Store**: (pending submission)

## Developer
299 LLC (合同会社299)
Contact: support@299llc.com
