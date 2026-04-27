const { PrismaClient } = require('@prisma/client');
const { generateContent } = require('./ai.service');
const { getDecryptedAiKeys } = require('./user.service');
const { enqueuePost } = require('./queue.service');

const prisma = new PrismaClient();

/**
 * Generate content only (no DB save) — used by bot for preview
 */
async function generatePreview({ userId, idea, postType, platforms, tone, language, model }) {
  const userKeys = await getDecryptedAiKeys(userId);
  return generateContent({ idea, postType, platforms, tone, language, model, userKeys });
}

/**
 * Generate content, save post + platform_posts to DB, enqueue jobs
 */
async function generateAndPublish({ userId, idea, postType, platforms, tone, language, model, publishAt = null }) {
  const userKeys = await getDecryptedAiKeys(userId);

  // Generate content for all platforms
  const { generated, model_used, tokens_used } = await generateContent({
    idea, postType, platforms, tone, language, model, userKeys,
  });

  // Save post to DB
  const post = await prisma.post.create({
    data: {
      userId,
      idea,
      postType: postType.toUpperCase(),
      tone,
      language,
      modelUsed: model_used,
      status: 'QUEUED',
      publishAt: publishAt ? new Date(publishAt) : null,
      platformPosts: {
        create: platforms.map((platform) => ({
          platform: platform.toUpperCase(),
          content: generated[platform]?.content || '',
          status: 'QUEUED',
        })),
      },
    },
    include: { platformPosts: true },
  });

  // Enqueue one BullMQ job per platform
  await enqueuePost(post, publishAt);

  return { post, generated, model_used, tokens_used };
}

/**
 * GET /api/posts — paginated list with filters
 */
async function listPosts({ userId, page = 1, limit = 10, status, platform, dateFrom, dateTo }) {
  const where = { userId };
  if (status) where.status = status.toUpperCase();
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo);
  }

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      include: { platformPosts: { select: { platform: true, status: true, publishedAt: true, errorMessage: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.post.count({ where }),
  ]);

  return { posts, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
}

async function getPostById(userId, postId) {
  const post = await prisma.post.findFirst({
    where: { id: postId, userId },
    include: { platformPosts: true },
  });
  if (!post) {
    const err = new Error('Post not found');
    err.statusCode = 404;
    throw err;
  }
  return post;
}

async function retryPost(userId, postId) {
  const post = await getPostById(userId, postId);
  const failedPPs = post.platformPosts.filter((pp) => pp.status === 'FAILED');

  if (!failedPPs.length) {
    const err = new Error('No failed platform jobs to retry');
    err.statusCode = 400;
    throw err;
  }

  // Reset failed platform posts to QUEUED
  await prisma.platformPost.updateMany({
    where: { postId, status: 'FAILED' },
    data: { status: 'QUEUED', errorMessage: null },
  });
  await prisma.post.update({ where: { id: postId }, data: { status: 'QUEUED' } });

  // Re-enqueue only failed ones
  const retryPost = { ...post, platformPosts: failedPPs };
  await enqueuePost(retryPost);

  return { message: `Retrying ${failedPPs.length} failed platform job(s)` };
}

async function cancelPost(userId, postId) {
  const post = await getPostById(userId, postId);

  if (post.status === 'PUBLISHED') {
    const err = new Error('Cannot cancel an already published post');
    err.statusCode = 400;
    throw err;
  }

  await prisma.platformPost.updateMany({
    where: { postId, status: { in: ['QUEUED', 'PROCESSING'] } },
    data: { status: 'CANCELLED' },
  });
  await prisma.post.update({ where: { id: postId }, data: { status: 'CANCELLED' } });

  return { message: 'Post cancelled' };
}

module.exports = { generatePreview, generateAndPublish, listPosts, getPostById, retryPost, cancelPost };