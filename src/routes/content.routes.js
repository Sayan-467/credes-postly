const express = require('express');
const { body, validationResult } = require('express-validator');
const { generatePreview } = require('../services/content.service');
const { authenticate } = require('../middleware/auth.middleware');
const { success, error } = require('../utils/response');

const router = express.Router();
router.use(authenticate);

const VALID_PLATFORMS = ['twitter', 'linkedin', 'instagram', 'threads', 'mastodon'];
const VALID_POST_TYPES = ['announcement', 'thread', 'story', 'promotional', 'educational', 'opinion'];
const VALID_TONES = ['professional', 'casual', 'witty', 'authoritative', 'friendly'];
const VALID_MODELS = ['groq', 'gemini'];

router.post(
  '/generate',
  [
    body('idea').isString().isLength({ min: 1, max: 500 }).withMessage('idea must be 1-500 characters'),
    body('post_type').isIn(VALID_POST_TYPES),
    body('platforms').isArray({ min: 1 }).withMessage('platforms must be a non-empty array'),
    body('platforms.*').isIn(VALID_PLATFORMS),
    body('tone').isIn(VALID_TONES),
    body('language').optional().isString().isLength({ min: 2, max: 5 }),
    body('model').isIn(VALID_MODELS),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return error(res, 'Validation failed', 422, errors.array());

    try {
      const { idea, post_type, platforms, tone, language = 'en', model } = req.body;
      const result = await generatePreview({
        userId: req.user.userId,
        idea,
        postType: post_type,
        platforms,
        tone,
        language,
        model,
      });
      return success(res, result);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;