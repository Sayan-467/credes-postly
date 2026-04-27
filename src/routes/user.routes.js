const express = require('express');
const { body } = require('express-validator');
const userService = require('../services/user.service');
const { authenticate } = require('../middleware/auth.middleware');
const { success, error } = require('../utils/response');

const router = express.Router();

// All user routes are protected
router.use(authenticate);

// GET /api/user/profile
router.get('/profile', async (req, res, next) => {
  try {
    const user = await userService.getProfile(req.user.userId);
    return success(res, user);
  } catch (err) { next(err); }
});

// PUT /api/user/profile
router.put('/profile', async (req, res, next) => {
  try {
    const updated = await userService.updateProfile(req.user.userId, req.body);
    return success(res, updated);
  } catch (err) { next(err); }
});

// POST /api/user/social-accounts
router.post('/social-accounts', async (req, res, next) => {
  try {
    const { platform, accessToken, refreshToken, handle } = req.body;
    if (!platform || !accessToken) return error(res, 'platform and accessToken are required', 400);
    const account = await userService.addSocialAccount(req.user.userId, { platform, accessToken, refreshToken, handle });
    return success(res, account, 201);
  } catch (err) { next(err); }
});

// GET /api/user/social-accounts
router.get('/social-accounts', async (req, res, next) => {
  try {
    const accounts = await userService.getSocialAccounts(req.user.userId);
    return success(res, accounts);
  } catch (err) { next(err); }
});

// DELETE /api/user/social-accounts/:id
router.delete('/social-accounts/:id', async (req, res, next) => {
  try {
    await userService.deleteSocialAccount(req.user.userId, req.params.id);
    return success(res, { message: 'Account disconnected' });
  } catch (err) { next(err); }
});

// PUT /api/user/ai-keys
router.put('/ai-keys', async (req, res, next) => {
  try {
    const { groqKey, geminiKey } = req.body;
    if (!groqKey && !geminiKey) return error(res, 'Provide at least one API key (groqKey or geminiKey)', 400);
    const result = await userService.storeAiKeys(req.user.userId, { groqKey, geminiKey });
    return success(res, result);
  } catch (err) { next(err); }
});

module.exports = router;