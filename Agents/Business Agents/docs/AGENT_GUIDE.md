# Day4ai Agent System — User Guide

## Quick Start

**Talk to an agent:** Type a message in any C-suite channel in Discord.

| Channel | Agent | Best For |
|---------|-------|----------|
| `#chief-of-staff` | 👔 CoS | Status updates, task tracking, daily ops, priorities |
| `#chief-automation-officer` | ⚙️ CAO | Technical specs, automation ideas, infra questions |
| `#chief-strategy-officer` | 📊 CSO | Business strategy, market analysis, challenging ideas |
| `#c-suite-roundtable` | 🏛️ All 3 | Get all perspectives + CSO synthesis on a single topic |

---

## How It Works

```
You type in Discord
  → Discord Bot picks up the message
  → Sends to n8n webhook with conversation history
  → n8n routes to Gemini 2.5 Flash
  → Response sent back to Discord
```

**Memory:** Each agent remembers your last 20 messages per channel. Conversations persist across sessions via PostgreSQL.

**Roundtable:** When you post in `#c-suite-roundtable`, all 3 agents respond in sequence, then the CSO reviews everyone's answers and provides a final synthesis highlighting disagreements.

---

## Agent Personalities

### 👔 Chief of Staff
- **Style:** Professional, concise, actionable
- **Ends with:** ACTION ITEMS (always)
- **Flags:** Risks, blockers, overdue tasks
- **Knows about:** All ventures, infrastructure status, GitHub activity

### ⚙️ Chief Automation Officer
- **Style:** Technical, solution-oriented, pragmatic
- **Provides:** Concrete implementation steps, code specs, cost estimates
- **Knows about:** Full tech stack (Docker, n8n, PostgreSQL, Qdrant, Nginx, Tailscale)

### 📊 Chief Strategy Officer
- **Style:** Analytical, challenging — plays devil's advocate
- **Uses:** SWOT analysis, TAM frameworks, scenario planning (best/likely/worst)
- **Will:** Challenge your assumptions, rank ideas by effort-to-impact

---

## Automated Workflows

| Workflow | Schedule | What It Does | Cost |
|----------|----------|-------------|------|
| Daily Briefing | 8:00 AM PT daily | CoS generates morning summary with GitHub activity → posts to `#daily-briefings` | ~$0.001/day |

---

## GitHub Repos Connected

All agents are aware of:
- **dnd-sim4fun** — D&D Sim4Fun game
- **openclaw-daybot** — OpenClaw/ClawDeploy
- **Root4VPS** — VPS configuration

Daily Briefing fetches last 3 commits per repo automatically.

---

## Tips

- **Be specific** — "What should I focus on today?" works, but "Compare FairScreen GTM cost vs benefit of spending 2 more weeks on features" gets you a much better answer
- **Use the roundtable** for big decisions — you get 3 perspectives + synthesis
- **Ask follow-ups** — memory means agents remember your conversation context
- **Tag agents by name** in roundtable if you want a specific one to elaborate
