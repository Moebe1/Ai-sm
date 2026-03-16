# CLAUDE.md — Chirp

## Project Overview

Chirp is a Twitter clone with a two-tier LLM moderation system deployed on Cloudflare Workers. It uses an "information asymmetry" approach: post authors cannot see moderation annotations on their own posts, but all other readers see contextual warnings about logical fallacies and manipulation tactics (Community Notes-style).

## Tech Stack

- **Runtime:** Cloudflare Workers (serverless)
- **Framework:** Hono v4
- **Database:** Cloudflare D1 (SQLite-based)
- **Auth:** PBKDF2 password hashing + HMAC-signed cookies
- **LLM Moderation:** Ollama Cloud API (default model: gemini-3-flash-preview:cloud)
- **Language:** Plain JavaScript (no TypeScript, no build step)

## Repository Structure

```
src/index.js          # Main Hono app (Cloudflare Workers entry point, ~720 lines)
server.js             # Express.js alternative for local dev
lib/db.js             # Database init (Express version, better-sqlite3)
lib/moderation.js     # Two-tier moderation logic (Express version)
views/                # EJS templates (Express version only)
  partials/           # Shared header/footer
public/css/style.css  # Twitter-inspired dark theme CSS
migrations/0001_init.sql  # D1 schema (users, tweets, likes, follows)
wrangler.toml         # Cloudflare Workers config
```

**Primary codebase:** `src/index.js` — contains the entire Hono/Workers app (routes, auth, moderation, HTML rendering).

**Express version** (`server.js`, `lib/`, `views/`) is a secondary local development option and is not the production deployment target.

## Commands

```bash
npm run dev                # Start local dev server (Wrangler)
npm run deploy             # Deploy to Cloudflare Workers
npm run db:migrate:local   # Run D1 migrations locally
npm run db:migrate:remote  # Run D1 migrations on remote D1
```

## Architecture

### Two-Tier Moderation System

- **Tier 1 (Hard Block):** Filters hate speech, slurs, threats, dehumanizing language. Blocked posts are hidden entirely.
- **Tier 2 (Soft Flag):** Detects logical fallacies, manipulation tactics, bad faith arguments. Flagged posts show collapsible Community Notes-style annotations visible to everyone except the author.
- Moderation runs asynchronously via `executionCtx.waitUntil()` after post creation.
- A background sweep on timeline load re-checks any posts still in `pending` status.
- Moderation statuses: `pending`, `approved`, `flagged`, `blocked`, `unmoderated`

### Database Schema (4 tables)

- `users` — accounts with PBKDF2-hashed passwords
- `tweets` — posts with `moderation_status`, `moderation_tier1` (JSON), `moderation_tier2` (JSON)
- `likes` — user-tweet like relationships
- `follows` — user-user follow relationships

### Authentication

- PBKDF2 with 100,000 iterations for password hashing
- HMAC-SHA256 signed cookies for sessions
- Session middleware applied to all routes

### Key Routes

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/login`, `/register` | Authentication |
| GET | `/logout` | End session |
| GET | `/` | Timeline (triggers background moderation sweep) |
| POST | `/tweet` | Create post (triggers async moderation) |
| POST | `/like/:id` | Like/unlike a post |
| GET | `/user/:username` | User profile |
| POST | `/follow/:id` | Follow/unfollow |
| GET | `/moderation` | View all flagged posts |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OLLAMA_API_KEY` | Ollama Cloud API key | Yes (secret) |
| `SESSION_SECRET` | Cookie signing secret | Yes (secret) |
| `OLLAMA_BASE_URL` | Ollama API endpoint (default: `https://ollama.com`) | No |
| `OLLAMA_MODEL` | LLM model for moderation | No |

Secrets are set via `wrangler secret put <NAME>` or `.dev.vars` locally.

## Code Conventions

- Pure JavaScript, no TypeScript
- No linter or formatter configured — maintain consistent style with existing code
- No test framework — no automated tests exist
- No CI/CD pipelines
- All HTML is rendered inline in `src/index.js` (no template engine in Workers version)
- CSS uses a dark theme inspired by Twitter/X

## Important Design Decisions

1. **Information asymmetry:** Authors must NOT see moderation annotations on their own posts. This is intentional to prevent gaming the system. Respect this in any UI changes.
2. **Async moderation:** Posts are created immediately and moderated in the background. Never block post creation on moderation results.
3. **Self-contained Workers app:** `src/index.js` is intentionally a single file containing routes, auth, moderation, and HTML rendering. This simplifies Cloudflare Workers deployment.
4. **D1 binding:** The database is accessed via the `DB` binding in `wrangler.toml`, not a connection string.
