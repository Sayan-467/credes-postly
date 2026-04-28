const { getRedis } = require('../utils/redis');

const SESSION_TTL = 1800; // 30 minutes in seconds
const KEY_PREFIX = 'bot:session:';

function sessionKey(chatId) {
  return `${KEY_PREFIX}${chatId}`;
}

const defaultSession = () => ({
  state: 'IDLE',
  userId: null,
  postType: null,
  platforms: [],
  tone: null,
  model: null,
  idea: null,
  preview: null,
});

async function getSession(chatId) {
  const redis = getRedis();
  const raw = await redis.get(sessionKey(chatId));
  if (!raw) return defaultSession();
  try {
    return JSON.parse(raw);
  } catch {
    return defaultSession();
  }
}

async function setSession(chatId, data) {
  const redis = getRedis();
  await redis.setex(sessionKey(chatId), SESSION_TTL, JSON.stringify(data));
}

async function clearSession(chatId) {
  const redis = getRedis();
  await redis.del(sessionKey(chatId));
}

// Patch — update specific fields without overwriting whole session
async function patchSession(chatId, patch) {
  const session = await getSession(chatId);
  const updated = { ...session, ...patch };
  await setSession(chatId, updated);
  return updated;
}

module.exports = { getSession, setSession, clearSession, patchSession, defaultSession };