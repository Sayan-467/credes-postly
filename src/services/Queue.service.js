const { Queue } = require('bullmq');
const { getRedis } = require('../utils/redis');

const QUEUE_NAME = 'publish';

let publishQueue;

function getPublishQueue() {
  if (!publishQueue) {
    publishQueue = new Queue(QUEUE_NAME, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000, // 1s → 5s → 25s
        },
        removeOnComplete: false,
        removeOnFail: false,
      },
    });
  }
  return publishQueue;
}

/**
 * Enqueue one job per platform for a post.
 * @param {object} post - Post record from DB (with platformPosts included)
 * @param {Date|null} publishAt - null = immediate
 */
async function enqueuePost(post, publishAt = null) {
  const queue = getPublishQueue();
  const delay = publishAt ? Math.max(0, new Date(publishAt) - Date.now()) : 0;

  const jobs = post.platformPosts.map((pp) => ({
    name: `publish:${pp.platform.toLowerCase()}`,
    data: {
      postId: post.id,
      platformPostId: pp.id,
      platform: pp.platform,
      content: pp.content,
      userId: post.userId,
    },
    opts: { delay },
  }));

  await queue.addBulk(jobs);
}

module.exports = { getPublishQueue, enqueuePost };