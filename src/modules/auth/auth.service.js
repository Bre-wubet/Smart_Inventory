const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { prisma } = require('../../config/db');
const { getRedis } = require('../../config/redis');
const { loadEnv } = require('../../config/env');
const { AuthError, NotFoundError } = require('../../core/exceptions');

const env = loadEnv();
const redis = getRedis(env.redisUrl);

async function register({ email, password, name, tenantId }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AuthError('Email already in use', 400);
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email, password: hash, name, tenantId } });
  return { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId, role: user.role };
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AuthError('Invalid credentials', 401);
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) throw new AuthError('Invalid credentials', 401);
  const token = jwt.sign({ sub: user.id, tenantId: user.tenantId, role: user.role }, env.jwtSecret, { expiresIn: '8h' });
  return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

async function logout(token) {
  const decoded = jwt.decode(token);
  if (!decoded || !decoded.exp) return;
  const ttl = Math.max(decoded.exp - Math.floor(Date.now() / 1000), 1);
  await redis.set(`bl:${token}`, '1', { EX: ttl });
}

async function me(token) {
  const blacklisted = await redis.get(`bl:${token}`);
  if (blacklisted) throw new AuthError('Token revoked');
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, name: true, role: true, tenantId: true } });
    if (!user) throw new NotFoundError('User not found');
    return user;
  } catch (err) {
    throw new AuthError('Invalid token');
  }
}

module.exports = { register, login, logout, me };


