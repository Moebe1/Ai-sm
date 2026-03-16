# Chirp - Twitter Clone with LLM Moderation

A Twitter clone with a two-tier LLM moderation system that maximizes discourse quality through information asymmetry. Deployed on Cloudflare Workers.

## How It Works

### Tier 1: Hard Block (Hate Speech Filter)
Blocks posts containing bigotry, hate speech, slurs, personal attacks, threats of violence, or dehumanizing language. Blocked posts are never shown to anyone.

### Tier 2: Information Asymmetry (Discourse Quality)
Detects logical fallacies (ad hominem, straw man, false dichotomy, etc.), manipulation tactics (gaslighting, DARVO, sea-lioning, gish gallop), and bad faith arguments (whataboutism, moving goalposts).

**The key innovation:** The post author **cannot see** the moderation annotations on their own posts. Every other reader sees contextual warnings like:
- "This post may contain: appeal to emotion, false dichotomy"
- "This sentence could be manipulating the reader towards X conclusion"

This forces good discourse by equipping readers with critical analysis tools while preventing authors from gaming the system.

## Deploy to Cloudflare Workers

### Prerequisites
- Cloudflare account (free tier works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)
- Ollama Cloud API key from https://ollama.com/settings/keys

### Steps

```bash
# Install dependencies
npm install

# Login to Cloudflare
wrangler login

# Create D1 database
wrangler d1 create chirp-db
# Copy the database_id from the output into wrangler.toml

# Run database migration
npm run db:migrate:remote

# Set secrets
wrangler secret put OLLAMA_API_KEY
wrangler secret put SESSION_SECRET

# Deploy
npm run deploy
```

### Local Development

```bash
npm install
npm run db:migrate:local
npm run dev
# Open http://localhost:8787
```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `OLLAMA_API_KEY` | Ollama Cloud API key (set as secret) | (required) |
| `OLLAMA_BASE_URL` | Ollama API base URL | `https://ollama.com` |
| `OLLAMA_MODEL` | Model for moderation | `qwen3` |
| `SESSION_SECRET` | Cookie signing secret (set as secret) | `dev-secret-change-in-prod` |

## Tech Stack

- **Runtime:** Cloudflare Workers
- **Framework:** Hono
- **Database:** Cloudflare D1 (SQLite)
- **Auth:** PBKDF2 password hashing + HMAC-signed cookies
- **Moderation:** Ollama Cloud API (two-tier system)
- **Free tier:** 100k requests/day, 5M D1 reads/day
