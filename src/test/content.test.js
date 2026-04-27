const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/utils/prisma');

let accessToken;
const testUser = {
  email: `content_test_${Date.now()}@example.com`,
  password: 'TestPass123!',
  name: 'Content Tester',
};

beforeAll(async () => {
  const res = await request(app).post('/api/auth/register').send(testUser);
  accessToken = res.body.data.accessToken;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: testUser.email } });
  await prisma.$disconnect();
});

describe('POST /api/content/generate — input validation', () => {
  it('rejects missing idea with 422', async () => {
    const res = await request(app)
      .post('/api/content/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ post_type: 'announcement', platforms: ['twitter'], tone: 'professional', model: 'groq' });
    expect(res.status).toBe(422);
  });

  it('rejects idea over 500 chars with 422', async () => {
    const res = await request(app)
      .post('/api/content/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        idea: 'a'.repeat(501),
        post_type: 'announcement',
        platforms: ['twitter'],
        tone: 'professional',
        model: 'groq',
      });
    expect(res.status).toBe(422);
  });

  it('rejects invalid platform with 422', async () => {
    const res = await request(app)
      .post('/api/content/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        idea: 'Test idea',
        post_type: 'announcement',
        platforms: ['facebook'], // not supported
        tone: 'professional',
        model: 'groq',
      });
    expect(res.status).toBe(422);
  });

  it('rejects unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/content/generate').send({
      idea: 'Test idea',
      post_type: 'announcement',
      platforms: ['twitter'],
      tone: 'professional',
      model: 'groq',
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/posts — post listing', () => {
  it('returns empty list for new user', async () => {
    const res = await request(app)
      .get('/api/posts')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toHaveProperty('total');
  });

  it('supports pagination params', async () => {
    const res = await request(app)
      .get('/api/posts?page=1&limit=5')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(5);
  });
});

describe('GET /api/dashboard/stats', () => {
  it('returns stats object for authenticated user', async () => {
    const res = await request(app)
      .get('/api/dashboard/stats')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('total_posts');
    expect(res.body.data).toHaveProperty('success_rate');
    expect(res.body.data).toHaveProperty('by_platform');
  });
});