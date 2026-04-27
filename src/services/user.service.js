const { PrismaClient } = require('@prisma/client');
const { encrypt, decrypt } = require('../utils/crypto');

const prisma = new PrismaClient();

async function updateProfile(userId, data) {
  const { name, bio, defaultTone, defaultLanguage } = data;
  return prisma.user.update({
    where: { id: userId },
    data: { name, bio, defaultTone, defaultLanguage },
    select: { id: true, email: true, name: true, bio: true, defaultTone: true, defaultLanguage: true },
  });
}

async function getProfile(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, bio: true, defaultTone: true, defaultLanguage: true, createdAt: true },
  });
}

// ─── Social accounts ──────────────────────────────────────────────────────────

async function addSocialAccount(userId, { platform, accessToken, refreshToken, handle }) {
  const accessTokenEnc = encrypt(accessToken);
  const refreshTokenEnc = refreshToken ? encrypt(refreshToken) : null;

  return prisma.socialAccount.upsert({
    where: { userId_platform: { userId, platform: platform.toUpperCase() } },
    update: { accessTokenEnc, refreshTokenEnc, handle },
    create: { userId, platform: platform.toUpperCase(), accessTokenEnc, refreshTokenEnc, handle },
    select: { id: true, platform: true, handle: true, connectedAt: true },
  });
}

async function getSocialAccounts(userId) {
  const accounts = await prisma.socialAccount.findMany({
    where: { userId },
    select: { id: true, platform: true, handle: true, connectedAt: true },
  });
  return accounts;
}

async function deleteSocialAccount(userId, accountId) {
  const account = await prisma.socialAccount.findFirst({
    where: { id: accountId, userId },
  });
  if (!account) {
    const err = new Error('Social account not found');
    err.statusCode = 404;
    throw err;
  }
  await prisma.socialAccount.delete({ where: { id: accountId } });
}

// ─── AI keys ─────────────────────────────────────────────────────────────────

async function storeAiKeys(userId, { groqKey, geminiKey }) {
  const data = {};
  if (groqKey) data.groqKeyEnc = encrypt(groqKey);
  if (geminiKey) data.geminiKeyEnc = encrypt(geminiKey);

  await prisma.aiKey.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });

  return { message: 'API keys stored securely' };
}

// Used internally by AI engine — not exposed via API
async function getDecryptedAiKeys(userId) {
  const keys = await prisma.aiKey.findUnique({ where: { userId } });
  if (!keys) return { groqKey: null, geminiKey: null };
  return {
    groqKey: keys.groqKeyEnc ? decrypt(keys.groqKeyEnc) : null,
    geminiKey: keys.geminiKeyEnc ? decrypt(keys.geminiKeyEnc) : null,
  };
}

module.exports = {
  updateProfile, getProfile,
  addSocialAccount, getSocialAccounts, deleteSocialAccount,
  storeAiKeys, getDecryptedAiKeys,
};