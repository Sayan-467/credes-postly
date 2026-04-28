# Architecture — Postly

## System Overview

```
                         ┌─────────────────────────────────────────────────────┐
                         │                   API Server (Express)               │
                         │                                                       │
 User ──► Telegram Bot ──►  /webhook/telegram                                   │
              │          │       │                                               │
              │          │       ▼                                               │
              │          │  Bot Handlers ──► Redis Session Store (30min TTL)    │
              │          │       │                                               │
              │          │       ▼                                               │
 User ──► REST API ─────►  Content Service                                      │
                         │       │                                               │
                         │       ▼                                               │
                         │  AI Engine ──► Groq API (Llama 3.3 70B)             │
                         │            └─► Gemini API (1.5 Flash)               │
                         │       │                                               │
                         │       ▼                                               │
                         │  PostgreSQL ◄── Prisma ORM                          │
                         │  (posts, platform_posts saved)                       │
                         │       │                                               │
                         │       ▼                                               │
                         │  BullMQ Queue ──► Redis                              │
                         └───────┼─────────────────────────────────────────────┘
                                 │
                    ┌────────────▼───────────┐
                    │    Publish Worker       │
                    │  (concurrency: 5)       │
                    │                         │
                    │  TWITTER  ──► Mastodon  │
                    │  LINKEDIN ──► (stub)    │
                    │  INSTAGRAM──► (stub)    │
                    │  THREADS  ──► (stub)    │
                    └─────────────────────────┘
```

---

## How a Post Flows: Telegram Bot → AI → Queue → Platform

```
1. User sends /post to Telegram bot
2. Bot reads Redis session (key: bot:session:<chatId>)
3. Multi-step conversation: postType → platforms → tone → model → idea
4. Bot calls generatePreview() → AI engine → returns content per platform
5. Bot shows preview with inline confirm/edit/cancel keyboard
6. User confirms → bot calls generateAndPublish()
7. generateAndPublish():
   a. Calls AI engine for all platforms in parallel
   b. Creates Post record in PostgreSQL (status: QUEUED)
   c. Creates one PlatformPost record per platform (status: QUEUED)
   d. Calls enqueuePost() → BullMQ adds one job per platform
8. Publish worker picks up each job:
   a. Updates PlatformPost status → PROCESSING
   b. Calls publishToPlatform(platform, content, userId)
   c. On success: status → PUBLISHED, records publishedAt
   d. On failure: BullMQ retries (1s → 5s → 25s exponential backoff)
   e. After 3 failures: status → FAILED, errorMessage recorded
9. _syncPostStatus() checks all PlatformPosts:
   - If all done: sets parent Post status accordingly
   - Partial success (some PUBLISHED, some FAILED) → parent stays PUBLISHED
```

---

## Redis: Two Uses

### 1. Bot Session Storage
- Key: `bot:session:<telegramChatId>`
- Value: JSON `{ state, userId, postType, platforms, tone, model, idea, preview }`
- TTL: 1800 seconds (30 minutes of inactivity)
- Operations: GET on every message, SET after every state transition, DEL on cancel/complete

### 2. BullMQ Job Queue
- BullMQ uses Redis internally for job storage, delayed jobs, and retry tracking
- Separate from session keys — no prefix collision
- `maxRetriesPerRequest: null` required by BullMQ (set on Redis client)

---

## Schema Design Decisions

### Why a separate `platform_posts` table?
Each post can target 1–4 platforms. Each platform publish is an independent operation that can succeed or fail independently. Storing per-platform status, error messages, attempt counts, and published timestamps in a separate table (rather than JSON columns on `posts`) enables clean querying, retrying individual failed platforms, and accurate analytics.

### Why `refresh_tokens` as a DB table (not stateless)?
Stateless JWT refresh tokens cannot be revoked — if a token is stolen, it's valid until expiry (7 days). Storing refresh tokens in the DB allows instant revocation on logout and token rotation (old token revoked, new one issued on each refresh call).

### Indexes
- `users.email` — unique, used on every login
- `users.telegram_chat_id` — unique, used on every bot message
- `refresh_tokens.token` — exact match lookup on every refresh request
- `refresh_tokens.user_id` — cascade deletes, user-scoped queries
- `posts.user_id` — all post queries are user-scoped
- `posts.status` — filtered list queries (`?status=published`)
- `posts.publish_at` — scheduled job dispatch scanning
- `platform_posts.post_id` — joining platformPosts to parent post
- `platform_posts.status` — worker queries for retries

### Why Prisma over Knex?
Prisma's generated client provides type safety, readable relation queries, and automatic migration tracking. Knex requires manual type definitions and more boilerplate for the same result. For a greenfield project under time pressure, Prisma reduces bugs significantly.

---

## Handling Partial Failures

If a post targets 3 platforms and platform 2 fails:

```
PlatformPost[twitter]   → PUBLISHED ✅
PlatformPost[linkedin]  → FAILED ❌ (after 3 retries)
PlatformPost[instagram] → PUBLISHED ✅
Post.status             → PUBLISHED (at least one succeeded)
```

- The failed platform job records `errorMessage` in DB
- `POST /api/posts/:id/retry` resets only FAILED platform_posts to QUEUED and re-enqueues them
- The user can retry selectively without reposting to already-published platforms
- The Telegram bot reports per-platform status via `/status` command

---

## AI Provider Design

Both providers are abstracted behind a single `generateContent()` interface:

```
generateContent({ idea, postType, platforms, tone, language, model, userKeys })
  │
  ├── model === 'groq'   → Groq API (OpenAI-compatible SDK, baseURL override)
  └── model === 'gemini' → Google Generative AI SDK

Key fallback chain:
  1. User's own stored API key (decrypted from ai_keys table)
  2. Platform-level env var key (GROQ_API_KEY / GEMINI_API_KEY)
```

Per-platform prompts are enforced in the system prompt:
- Twitter/X: ≤280 chars, 2–3 hashtags, punchy opener
- LinkedIn: 800–1300 chars, always professional, 3–5 hashtags
- Instagram: caption + 10–15 hashtags, emoji-friendly
- Threads: ≤500 chars, conversational

Partial failure per platform is handled — if one platform's generation fails, others still return. The failed one records `content: null, error: "..."` in the response.

---

## Why Mastodon Instead of Twitter

Twitter/X removed free API write access in February 2023. The Basic plan is $100/month. Mastodon provides:
- Free access with no approval process
- A REST API structurally identical to what the queue/worker/publish pipeline needs
- Real, live post publishing demonstrating the full end-to-end flow

The architecture is platform-agnostic by design. Replacing Mastodon with Twitter requires changing one function in `publish.service.js`.