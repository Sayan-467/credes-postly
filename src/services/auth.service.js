const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 12;

async function register({ email, password, name }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const err = new Error('Email already registered');
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: { email, passwordHash, name },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  const tokens = await _issueTokens(user.id);
  return { user, ...tokens };
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  const tokens = await _issueTokens(user.id);
  const { passwordHash, ...safeUser } = user;
  return { user: safeUser, ...tokens };
}

async function refresh(rawToken) {
  let payload;
  try {
    payload = verifyRefreshToken(rawToken);
  } catch {
    const err = new Error('Invalid or expired refresh token');
    err.statusCode = 401;
    throw err;
  }

  // Verify token exists in DB and is not revoked
  const stored = await prisma.refreshToken.findUnique({ where: { token: rawToken } });
  if (!stored || stored.revoked || stored.expiresAt < new Date()) {
    const err = new Error('Refresh token is invalid or revoked');
    err.statusCode = 401;
    throw err;
  }

  // Rotate — revoke old, issue new
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });
  return _issueTokens(payload.userId);
}

async function logout(rawToken) {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({
    where: { token: rawToken },
    data: { revoked: true },
  });
}

async function getMe(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, bio: true, defaultTone: true, defaultLanguage: true, createdAt: true },
  });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  return user;
}

// Private helpers 

async function _issueTokens(userId) {
  const accessToken = signAccessToken({ userId });
  // Include a unique token id so rapid re-issuance never produces identical JWTs.
  const refreshToken = signRefreshToken({ userId, tokenId: randomUUID() });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId, expiresAt },
  });

  return { accessToken, refreshToken };
}

module.exports = { register, login, refresh, logout, getMe };