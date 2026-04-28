# AI Usage — Postly

This document records every significant use of AI assistance during development, as required by the Credes AI usage policy.

---

## Tool Used

**Claude (Anthropic)** — used throughout as a development assistant for scaffolding, architecture review, and debugging.

---

## Usage Log

### 1. Project Architecture & Schema Design
**Task:** Deciding the table structure, specifically whether `platform_posts` should be a separate table or JSON columns on `posts`.

**AI assistance:** Asked Claude to compare the two approaches for a system requiring per-platform retries and status tracking.

**What I validated:** The separate table approach is clearly correct — JSON columns can't be indexed or queried cleanly per row. I reviewed the schema field by field and added the `telegram_chat_id` field myself after deciding the bot link flow needed it.

**Changes I made:** Added `@@index` directives after reviewing PostgreSQL query patterns. Chose `uuid` over auto-increment for all IDs to avoid enumeration attacks.

---

### 2. BullMQ Queue Architecture
**Task:** Setting up per-platform jobs with exponential backoff and DB status sync.

**AI assistance:** Scaffolded the `queue.service.js` and `publish.worker.js` structure.

**What I validated:** Reviewed BullMQ docs to confirm `maxRetriesPerRequest: null` is required on the Redis client for BullMQ to function. Understood and validated the `_syncPostStatus()` logic — specifically the partial failure case (some PUBLISHED, some FAILED → parent stays PUBLISHED).

**Changes I made:** Added the `concurrency: 5` setting after reading BullMQ docs on worker throughput. Added the `removeOnComplete: false` option deliberately to preserve job history for the dashboard.

---

### 3. Telegram Bot Conversation State Machine
**Task:** Building the multi-step stateful flow with Redis session storage.

**AI assistance:** Scaffolded the session store (`session.js`), keyboard builders (`keyboards.js`), and handler structure (`handlers.js`).

**What I validated:** Traced through every state transition manually (IDLE → AWAITING_POST_TYPE → AWAITING_PLATFORMS → ... → AWAITING_CONFIRMATION). Verified the multi-select platform toggle logic — the `patchSession` pattern correctly merges state without losing earlier selections.

**Changes I made:** Added the `patchSession` helper myself — the initial scaffold used `setSession` everywhere which would overwrite the whole session on partial updates. Added the `/link` command flow after realising there was no way to connect a Telegram chat to a user account.

---

### 4. AI Engine Prompt Architecture
**Task:** Writing platform-specific system prompts that enforce character limits and content rules.

**AI assistance:** Generated initial prompt templates for all 4 platforms.

**What I validated:** Tested each prompt against the spec requirements. LinkedIn prompt originally didn't say "always professional regardless of tone setting" — I added that constraint explicitly after reading the spec again. Validated that the `enforceCharLimit` function correctly handles the Twitter 280-char hard limit as a safety net after generation.

**Changes I made:** Added the partial failure loop — the initial scaffold threw if any platform failed. I changed it to catch per-platform and return `{ content: null, error: "..." }` so one broken platform doesn't kill the whole request.

---

### 5. Auth System
**Task:** JWT access + refresh token rotation with DB-stored refresh tokens.

**AI assistance:** Scaffolded `auth.service.js` and the middleware.

**What I validated:** Verified the rotation logic — old token is marked `revoked: true` before issuing a new one (not after), preventing a race condition where two requests with the same refresh token could both succeed. Confirmed bcrypt cost factor 12 is set correctly.

**Changes I made:** Added the `expiresAt` check in the refresh handler — the initial scaffold only checked `revoked` but not whether the token had naturally expired in the DB.

---

### 6. API Provider Switch (Twitter → Mastodon, OpenAI/Anthropic → Groq/Gemini)
**Task:** Replacing paid APIs with free equivalents.

**AI assistance:** Suggested Groq + Gemini as free alternatives, explained Mastodon as a free Twitter equivalent.

**What I validated:** Confirmed Groq's OpenAI-compatible API by reading their docs — the `baseURL` override on the OpenAI SDK is the correct approach. Verified Mastodon's `/api/v1/statuses` endpoint structure independently.

**Changes I made:** Used Node's built-in `https` module for Mastodon instead of adding an HTTP client dependency — keeping the dependency footprint minimal.

---

## Summary

AI was used to move faster on code I already understood — scaffolding boilerplate, suggesting patterns, and surfacing edge cases. Every significant decision (schema design, retry logic, session state management, partial failure handling) was reviewed, understood, and often modified before being committed. The commit history reflects real iterative development, not a paste of generated output.