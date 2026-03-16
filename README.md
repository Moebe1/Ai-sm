# Chirp - Twitter Clone with LLM Moderation

A lightweight Twitter clone with a two-tier LLM moderation system powered by Ollama Cloud.

## Moderation System

### Tier 1: Hate Speech Filter (Hard Block)
Blocks posts containing bigotry, hate speech, slurs, threats of violence, or dehumanizing language. Blocked posts are never shown.

### Tier 2: Logical Fallacy Detection (Soft Flag)
Flags posts containing logical fallacies (ad hominem, straw man, false dichotomy, etc.), manipulation tactics (gaslighting, DARVO, sea-lioning), or information asymmetry exploitation (misleading statistics, cherry-picked data). Flagged posts are still shown but with a context label.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your Ollama Cloud API key
npm start
```

Open http://localhost:3000, create an account, and start posting.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `OLLAMA_API_KEY` | Your Ollama Cloud API key | (required) |
| `OLLAMA_BASE_URL` | Ollama API base URL | `https://ollama.com` |
| `OLLAMA_MODEL` | Model to use for moderation | `qwen3` |
| `SESSION_SECRET` | Express session secret | `dev-secret-change-in-prod` |
| `PORT` | Server port | `3000` |

## Tech Stack

- **Backend:** Node.js, Express
- **Database:** SQLite (via better-sqlite3)
- **Views:** EJS templates
- **Moderation:** Ollama Cloud API (two-tier system)
