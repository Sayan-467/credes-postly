const { Worker } = require('bullmq');
const { PrismaClient } = require('@prisma/client');
const { publishToPlatform } = require('../services/publish.service');
const { getRedis } = require('../utils/redis');

const prisma = new PrismaClient();

function startPublishWorker() {
  const worker = new Worker(
    'publish',
    async (job) => {
      const { postId, platformPostId, platform, content, userId } = job.data;

      // Mark as processing
      await prisma.platformPost.update({
        where: { id: platformPostId },
        data: { status: 'PROCESSING', attempts: { increment: 1 } },
      });

      // Attempt platform publish
      const result = await publishToPlatform(platform, content, userId);

      // Success — mark published
      await prisma.platformPost.update({
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
      await prisma.platformPost.update({
        where: { id: platformPostId },
        data: {
          status: 'FAILED',
          errorMessage: err.message,
        },
      });
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