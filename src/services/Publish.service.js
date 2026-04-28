const https = require('https');
const { decrypt } = require('../utils/crypto');
const prisma = require('../utils/prisma');

// ─── Mastodon (replaces Twitter — free, identical architecture) ───────────────

async function postToMastodon(content, userId) {
  const account = await prisma.socialAccount.findFirst({
    where: { userId, platform: { in: ['MASTODON', 'TWITTER'] } },
    orderBy: { platform: 'asc' },
  });

  // Fall back to platform-level token if user hasn't connected their own account
  const accessToken = account
    ? decrypt(account.accessTokenEnc)
    : process.env.MASTODON_ACCESS_TOKEN;

  if (!accessToken) throw new Error('No Mastodon access token available');

  const instance = process.env.MASTODON_INSTANCE || 'mastodon.social';

  // Mastodon: max 500 chars
  const status = content.length > 500 ? content.slice(0, 497) + '...' : content;

  const body = JSON.stringify({ status });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: instance,
        path: '/api/v1/statuses',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const parsed = JSON.parse(data);
            resolve({
              platformPostId: parsed.id,
              url: parsed.url,
            });
          } else {
            reject(new Error(`Mastodon API error ${res.statusCode}: ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── LinkedIn (stubbed — OAuth callback is a bonus per brief) ─────────────────

async function postToLinkedIn(content, userId) {
  throw new Error('LinkedIn: full OAuth callback not implemented (marked as bonus in spec)');
}

// ─── Instagram (stubbed) ──────────────────────────────────────────────────────

async function postToInstagram(content, userId) {
  throw new Error('Instagram: full OAuth callback not implemented (marked as bonus in spec)');
}

// ─── Threads (stubbed) ────────────────────────────────────────────────────────

async function postToThreads(content, userId) {
  throw new Error('Threads: full OAuth callback not implemented (marked as bonus in spec)');
}

// ─── Router ───────────────────────────────────────────────────────────────────

async function publishToPlatform(platform, content, userId) {
  const publishers = {
    TWITTER: postToMastodon,   // Mastodon used as free Twitter equivalent
    MASTODON: postToMastodon,
    LINKEDIN: postToLinkedIn,
    INSTAGRAM: postToInstagram,
    THREADS: postToThreads,
  };

  const publisher = publishers[platform.toUpperCase()];
  if (!publisher) throw new Error(`Unsupported platform: ${platform}`);

  return publisher(content, userId);
}

module.exports = { publishToPlatform };