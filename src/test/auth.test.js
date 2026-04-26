const request = require('supertest');
const app = require('../../src/app');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const testUser = {
  email: `test_${Date.now()}@example.com`,
  password: 'TestPass123!',
  name: 'Test User',
};

let accessToken;
let refreshToken;

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: testUser.email } });
  await prisma.$disconnect();
});

describe('POST /api/auth/register', () => {
  it('registers a new user and returns tokens', async () => {
    const res = await request(app).post('/api/auth/register').send(testUser);
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.user.email).toBe(testUser.email);
  });

  it('rejects duplicate email with 409', async () => {
    const res = await request(app).post('/api/auth/register').send(testUser);
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  it('returns tokens for valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: testUser.email,
      password: testUser.password,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('rejects wrong password with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: testUser.email,
      password: 'wrongpassword',
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns current user with valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(testUser.email);
  });

  it('rejects request with missing token — 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects request with invalid token — 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer this.is.not.valid');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates refresh token and returns new tokens', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    // New refresh token should differ from old one
    expect(res.body.data.refreshToken).not.toBe(refreshToken);
  });
});