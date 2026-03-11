# Day4ai Operations Runbook

## Infrastructure Overview

| Component | Location | Access |
|-----------|----------|--------|
| VPS | Hostinger `srv1401848` | `ssh root@100.66.18.50` (via Tailscale) |
| n8n UI | https://agents.day4ai.tech | `travis.day1@gmail.com` / `blXYJQeeVeJKmj5qo6roHQ` |
| Docker stack | `/opt/day4ai/` | `docker compose` commands |
| Env vars | `/opt/day4ai/.env` | Contains all API keys and passwords |
| Discord | DAY4AI server | Bot: `DAY4AI AGENT#4304` |

---

## Common Operations

### Check Service Status
```bash
ssh root@100.66.18.50
cd /opt/day4ai
docker compose ps
```

### Restart All Services
```bash
cd /opt/day4ai && docker compose restart
```

### Restart a Single Service
```bash
docker compose restart discord-bot   # just the bot
docker compose restart n8n           # just n8n
```

### Rebuild Discord Bot (after code changes)
```bash
cd /opt/day4ai && docker compose up -d --build discord-bot
```

### View Bot Logs
```bash
docker logs day4ai-discord-bot --tail 50
docker logs day4ai-discord-bot -f   # live follow
```

### View n8n Logs
```bash
docker logs day4ai-n8n --tail 50
```

---

## Workflows

### Agent Chat Router
- **Purpose:** Routes Discord messages to the correct agent prompt → Gemini → response
- **Trigger:** Webhook `POST /webhook/agent-chat`
- **Manage:** https://agents.day4ai.tech → Workflows

### Daily Briefing
- **Purpose:** 8 AM PT morning summary with GitHub activity → posts to `#daily-briefings`
- **Trigger:** Schedule (cron)
- **Disable:** Open workflow in n8n UI → toggle "Active" off

---

## Key Files on VPS

| File | Purpose |
|------|---------|
| `/opt/day4ai/docker-compose.yml` | All service definitions |
| `/opt/day4ai/.env` | API keys, passwords |
| `/opt/day4ai/discord-bot/bot.js` | Discord bot source code |
| `/opt/day4ai/discord-bot/package.json` | Bot dependencies |
| `/opt/day4ai/discord-bot/Dockerfile` | Bot container build |

---

## API Keys

| Key | Location | Rotated? |
|-----|----------|----------|
| `GEMINI_API_KEY` | `.env` | No |
| `DISCORD_BOT_TOKEN` | `.env` | No |
| `ANTHROPIC_API_KEY` | `.env` | No (unused currently) |
| `POSTGRES_PASSWORD` | `.env` | No |
| n8n API Key | n8n UI → Settings → API | No |

### To Rotate an API Key
1. Generate new key from provider (Google AI Studio, Discord Dev Portal, etc.)
2. Update `/opt/day4ai/.env`
3. Restart affected services: `docker compose restart`
4. If n8n workflows reference the key, update them in n8n UI or redeploy

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Bot not responding | `docker logs day4ai-discord-bot --tail 20` — check for errors |
| n8n workflow errors | Check https://agents.day4ai.tech → Executions |
| SSH won't connect | Tailscale re-auth needed — check `tailscale status` |
| Agent responses cut off | Increase `maxOutputTokens` in n8n workflow (currently 4096) |
| Memory not working | Check `docker logs day4ai-discord-bot` for `[Memory]` errors |
| SSL certificate expired | `certbot renew && systemctl restart nginx` |

---

## Database

### Connect to PostgreSQL
```bash
docker exec -it day4ai-postgres psql -U n8n
```

### View Memory Table
```sql
SELECT agent_name, user_id, role, LEFT(content, 50), created_at
FROM agent_memory ORDER BY created_at DESC LIMIT 20;
```

### Clear Memory for an Agent
```sql
DELETE FROM agent_memory WHERE agent_name = 'chief-of-staff';
```

### Clear All Memory
```sql
TRUNCATE agent_memory;
```

---

## Monthly Maintenance

- [ ] Check SSL cert expiry: `certbot certificates`
- [ ] Review API costs: Google AI Studio dashboard + Anthropic dashboard
- [ ] Pull latest Docker images: `docker compose pull && docker compose up -d`
- [ ] Review n8n execution logs for failures
- [ ] Verify Daily Briefing is posting to `#daily-briefings`
