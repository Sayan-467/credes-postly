const { getRedis } = require('../utils/redis');

const SESSION_TTL = 1800; // 30 minutes in seconds
const KEY_PREFIX = 'bot:session:';
const memorySessions = new Map();

let useRedis;

async function shouldUseRedis() {
  if (useRedis === undefined) {
    const { isRedisAvailable } = require('../utils/redis');
    useRedis = await isRedisAvailable();
    if (!useRedis) {
      console.warn('Redis unavailable - using in-memory Telegram sessions');
    }
  }

  return useRedis;
}

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
  if (!(await shouldUseRedis())) {
    return memorySessions.get(sessionKey(chatId)) || defaultSession();
  }

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
  if (!(await shouldUseRedis())) {
    memorySessions.set(sessionKey(chatId), data);
    return data;
  }

  const redis = getRedis();
  await redis.setex(sessionKey(chatId), SESSION_TTL, JSON.stringify(data));
  return data;
}

async function clearSession(chatId) {
  if (!(await shouldUseRedis())) {
    memorySessions.delete(sessionKey(chatId));
    return;
  }

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