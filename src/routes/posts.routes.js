const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { success, error } = require('../utils/response');
const {
  generateAndPublish, listPosts, getPostById, retryPost, cancelPost,
} = require('../services/content.service');

const router = express.Router();
router.use(authenticate);

// POST /api/posts/publish — generate + queue immediately
router.post('/publish', async (req, res, next) => {
  try {
    const { idea, post_type, platforms, tone, language = 'en', model } = req.body;
    if (!idea || !post_type || !platforms || !tone || !model) {
      return error(res, 'idea, post_type, platforms, tone, model are required', 400);
    }
    const result = await generateAndPublish({
      userId: req.user.userId, idea, postType: post_type, platforms, tone, language, model,
    });
    return success(res, result, 201);
  } catch (err) { next(err); }
});

// POST /api/posts/schedule — generate + queue at future time
router.post('/schedule', async (req, res, next) => {
  try {
    const { idea, post_type, platforms, tone, language = 'en', model, publish_at } = req.body;
    if (!publish_at) return error(res, 'publish_at is required for scheduling', 400);
    if (new Date(publish_at) <= new Date()) return error(res, 'publish_at must be in the future', 400);

    const result = await generateAndPublish({
      userId: req.user.userId, idea, postType: post_type, platforms, tone, language, model,
      publishAt: publish_at,
    });
    return success(res, result, 201);
  } catch (err) { next(err); }
});

// GET /api/posts — paginated list
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, platform, date_from, date_to } = req.query;
    const result = await listPosts({
      userId: req.user.userId,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50),
      status, platform,
      dateFrom: date_from,
      dateTo: date_to,
    });
    return success(res, result.posts, 200, result.meta);
  } catch (err) { next(err); }
});

// GET /api/posts/:id
router.get('/:id', async (req, res, next) => {
  try {
    const post = await getPostById(req.user.userId, req.params.id);
    return success(res, post);
  } catch (err) { next(err); }
});

// POST /api/posts/:id/retry
router.post('/:id/retry', async (req, res, next) => {
  try {
    const result = await retryPost(req.user.userId, req.params.id);
    return success(res, result);
  } catch (err) { next(err); }
});

// DELETE /api/posts/:id — cancel scheduled post
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await cancelPost(req.user.userId, req.params.id);
    return success(res, result);
  } catch (err) { next(err); }
});

module.exports = router;