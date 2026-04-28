# Postly — Multi-Platform AI Content Publishing Engine

> Backend intern candidate task — Credes TechLabs

**Live API Base URL:** `https://YOUR-RAILWAY-APP.up.railway.app`  
**Telegram Bot:** `@YourBotUsername`

---

## What It Does

A user drops a raw idea into the Telegram bot, picks target platforms and AI model, and the system generates platform-specific content and publishes it automatically — no dashboard needed for the core publish flow.

```
User → Telegram Bot → API Server → AI Engine (Groq / Gemini)
                                 → BullMQ Queue (Redis)
                                 → Platform APIs (Mastodon + scaffolded others)
                                 ↓
                           PostgreSQL (users, posts, accounts, jobs)
```

---

## Local Setup

### Prerequisites
- Docker + Docker Compose
- Node.js 18+

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/postly.git
cd postly
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in all values in `.env` (see table below).

### 3. Start everything

```bash
docker-compose up -d
```

This spins up the app, PostgreSQL, and Redis in one command.

### 4. Run migrations

```bash
npx prisma migrate dev
```

### 5. Verify

```bash
curl http://localhost:3000/health
# → { "status": "ok" }
```

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `REDIS_URL` | Redis connection string | ✅ |
| `JWT_ACCESS_SECRET` | Min 32 chars, signs access tokens | ✅ |
| `JWT_REFRESH_SECRET` | Min 32 chars, signs refresh tokens | ✅ |
| `ENCRYPTION_KEY` | Exactly 32 chars, AES-256 key for stored secrets | ✅ |
| `TELEGRAM_BOT_TOKEN` | From @BotFather | ✅ |
| `TELEGRAM_WEBHOOK_URL` | Your deployed URL + `/webhook/telegram` | ✅ (prod) |
| `GROQ_API_KEY` | Free at console.groq.com | ✅ |
| `GROQ_MODEL` | Default: `llama-3.3-70b-versatile` | ✅ |
| `GEMINI_API_KEY` | Free at aistudio.google.com | ✅ |
| `GEMINI_MODEL` | Default: `gemini-1.5-flash` | ✅ |
| `MASTODON_ACCESS_TOKEN` | Free at mastodon.social → Settings → Development | ✅ |
| `MASTODON_INSTANCE` | Default: `mastodon.social` | ✅ |

---

## Telegram Bot Setup

### Get a bot token

1. Open Telegram → search `@BotFather`
2. Send `/newbot` → follow prompts
3. Copy the token → set as `TELEGRAM_BOT_TOKEN`

### Link your account to the bot

```
1. POST /api/auth/login  → copy accessToken
2. Send /link <accessToken> to your bot in Telegram
```

### Set webhook (production only)

After deploying, run:

```bash
TELEGRAM_WEBHOOK_URL=https://your-app.up.railway.app/webhook/telegram \
node scripts/set-webhook.js
```

### Bot commands

| Command | Description |
|---|---|
| `/start` | Welcome message + account link check |
| `/link <token>` | Link your Postly account |
| `/post` | Start the multi-step publishing flow |
| `/status` | View last 5 posts and platform statuses |
| `/accounts` | View connected social accounts |
| `/help` | List all commands |

---

## API Documentation

Full Postman collection → see `postman_collection.json` in this repo.

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | None | Register with email, password, name |
| POST | `/api/auth/login` | None | Returns access_token + refresh_token |
| POST | `/api/auth/refresh` | None | Refresh token rotation |
| POST | `/api/auth/logout` | None | Revoke refresh token |
| GET | `/api/auth/me` | Bearer | Current user profile |

### User

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/user/profile` | Bearer | Get profile |
| PUT | `/api/user/profile` | Bearer | Update name, bio, tone, language |
| POST | `/api/user/social-accounts` | Bearer | Connect a social account |
| GET | `/api/user/social-accounts` | Bearer | List connected accounts |
| DELETE | `/api/user/social-accounts/:id` | Bearer | Disconnect account |
| PUT | `/api/user/ai-keys` | Bearer | Store encrypted Groq/Gemini API keys |

### Content & Posts

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/content/generate` | Bearer | Generate content preview (no publish) |
| POST | `/api/posts/publish` | Bearer | Generate + publish immediately |
| POST | `/api/posts/schedule` | Bearer | Generate + schedule for future |
| GET | `/api/posts` | Bearer | Paginated post history |
| GET | `/api/posts/:id` | Bearer | Single post + per-platform status |
| POST | `/api/posts/:id/retry` | Bearer | Retry failed platform jobs |
| DELETE | `/api/posts/:id` | Bearer | Cancel scheduled post |

### Dashboard

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/dashboard/stats` | Bearer | Total posts, success rate, per-platform stats |

### Response envelope

All responses follow this structure:

```json
{
  "data": {},
  "meta": { "total": 10, "page": 1, "limit": 10 },
  "error": { "message": "...", "details": [] }
}
```

---

## Running Tests

```bash
npm test
```

Covers: auth middleware (valid/expired/missing token), refresh token rotation, content validation, post listing, dashboard stats.

---

## Deployment (Railway)

1. Push repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add PostgreSQL plugin → copy `DATABASE_URL` to env vars
4. Add Redis plugin → copy `REDIS_URL` to env vars
5. Set all other env vars from `.env.example`
6. Set `NODE_ENV=production`
7. Deploy — Railway uses `railway.toml` automatically
8. Run `node scripts/set-webhook.js` to register Telegram webhook

---

## Known Limitations

- Twitter/X API write access requires a $100/month plan (removed free tier Feb 2023). **Mastodon** is used as a free, architecturally identical alternative. Swapping back to Twitter requires changing one function in `publish.service.js`.
- LinkedIn, Instagram, Threads posting stubs are present — full OAuth callback is marked as a bonus in the spec.
- Scheduled posts use BullMQ delayed jobs — accuracy depends on worker uptime.