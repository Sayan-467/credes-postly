const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/utils/prisma');

let accessToken;
let createdPostId;

const testUser = {
  email: `queue_test_${Date.now()}@example.com`,
  password: 'TestPass123!',
  name: 'Queue Tester',
};

beforeAll(async () => {
  const res = await request(app).post('/api/auth/register').send(testUser);
  accessToken = res.body.data.accessToken;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: testUser.email } });
  await prisma.$disconnect();
});

describe('POST /api/posts/publish — queue job creation', () => {
  it('creates a post record and platform_post records in DB', async () => {
    // NOTE: This test mocks the AI call by checking DB state.
    // To run without live AI keys, you can stub ai.service in your test setup.
    // Skipping if no AI keys configured.
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'gsk_...') {
      console.warn('Skipping queue test — GROQ_API_KEY not set');
      return;
    }

    const res = await request(app)
      .post('/api/posts/publish')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        idea: 'Testing the queue system end to end',
        post_type: 'announcement',
        platforms: ['twitter'],
        tone: 'professional',
        language: 'en',
        model: 'groq',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.post).toHaveProperty('id');
    expect(res.body.data.post.status).toBe('QUEUED');
    expect(res.body.data.post.platformPosts).toHaveLength(1);
    expect(res.body.data.post.platformPosts[0].platform).toBe('TWITTER');

    createdPostId = res.body.data.post.id;

    // Verify it actually exists in DB (integration test)
    const dbPost = await prisma.post.findUnique({
      where: { id: createdPostId },
      include: { platformPosts: true },
    });
    expect(dbPost).not.toBeNull();
    expect(dbPost.platformPosts).toHaveLength(1);
  });

  it('returns 404 for non-existent post ID', async () => {
    const res = await request(app)
      .get('/api/posts/non-existent-uuid-1234')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it('cannot cancel an already published post', async () => {
    if (!createdPostId) return;

    // Manually set to PUBLISHED in DB for this test
    await prisma.post.update({
      where: { id: createdPostId },
      data: { status: 'PUBLISHED' },
    });

    const res = await request(app)
      .delete(`/api/posts/${createdPostId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(400);
  });
});