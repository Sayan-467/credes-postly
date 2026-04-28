const Redis = require('ioredis');

let client;
let redisAvailabilityPromise;

function createRedisClient() {
  return new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    connectTimeout: 2000,
    retryStrategy: () => null,
  });
}

function getRedis() {
  if (!client) {
    client = createRedisClient();
    client.on('error', (err) => console.error('Redis error:', err.message));
  }
  return client;
}

async function isRedisAvailable() {
  if (!redisAvailabilityPromise) {
    redisAvailabilityPromise = (async () => {
      const probe = createRedisClient();
      probe.on('error', () => {});

      try {
        await probe.connect();
        const pong = await probe.ping();
        return pong === 'PONG';
      } catch {
        return false;
      } finally {
        probe.disconnect();
      }
    })();
  }

  return redisAvailabilityPromise;
}

module.exports = { getRedis, isRedisAvailable };