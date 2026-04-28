const { Worker } = require('bullmq');
const prisma = require('../utils/prisma');
const { publishToPlatform } = require('../services/publish.service');
const { getRedis, isRedisAvailable } = require('../utils/redis');

async function startPublishWorker() {
  if (!(await isRedisAvailable())) {
    console.warn('Redis unavailable - publish worker disabled');
    return null;
  }

  const worker = new Worker(
    'publish',
    async (job) => {
      const { postId, platformPostId, platform, content, userId } = job.data;

      // Mark as processing
      const processingResult = await prisma.platformPost.updateMany({
        where: { id: platformPostId },
        data: { status: 'PROCESSING', attempts: { increment: 1 } },
      });
      if (processingResult.count === 0) {
        console.warn(`Platform post not found for job ${job.id}; skipping`);
        return null;
      }

      // Attempt platform publish
      const result = await publishToPlatform(platform, content, userId);

      // Success — mark published
      await prisma.platformPost.updateMany({
        where: { id: platformPostId },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          errorMessage: null,
        },
      });

      // Update parent post status if all platform posts are done
      await _syncPostStatus(postId);

      return result;
    },
    {
      connection: getRedis(),
      concurrency: 5,
    }
  );

  worker.on('failed', async (job, err) => {
    console.error(`Job ${job.id} failed (attempt ${job.attemptsMade}):`, err.message);

    const { platformPostId, postId } = job.data;
    const isFinalAttempt = job.attemptsMade >= job.opts.attempts;

    if (isFinalAttempt) {
      const failedResult = await prisma.platformPost.updateMany({
        where: { id: platformPostId },
        data: {
          status: 'FAILED',
          errorMessage: err.message,
        },
      });
      if (failedResult.count === 0) {
        console.warn(`Platform post not found for failed job ${job.id}; skipping`);
        return;
      }
      await _syncPostStatus(postId);
    }
  });

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed — platform: ${job.data.platform}`);
  });

  console.log('Publish worker started');
  return worker;
}

// Set parent post status based on all platform_post results
async function _syncPostStatus(postId) {
  const platformPosts = await prisma.platformPost.findMany({
    where: { postId },
    select: { status: true },
  });

  const statuses = platformPosts.map((p) => p.status);
  const allDone = statuses.every((s) => ['PUBLISHED', 'FAILED', 'CANCELLED'].includes(s));

  if (!allDone) return;

  const anyPublished = statuses.some((s) => s === 'PUBLISHED');
  const allFailed = statuses.every((s) => s === 'FAILED');

  await prisma.post.update({
    where: { id: postId },
    data: { status: allFailed ? 'FAILED' : anyPublished ? 'PUBLISHED' : 'FAILED' },
  });
}

module.exports = { startPublishWorker };