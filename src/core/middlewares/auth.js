const jwt = require('jsonwebtoken');
const { prisma } = require('../../config/db');
const { getRedis } = require('../../config/redis');
const { loadEnv } = require('../../config/env');
const { AuthError, NotFoundError } = require('../exceptions');

const env = loadEnv();
const redis = getRedis(env.redisUrl);

async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      throw new AuthError('Access token required');
    }

    // Check if token is blacklisted
    const blacklisted = await redis.get(`bl:${token}`);
    if (blacklisted) {
      throw new AuthError('Token has been revoked');
    }

    // Verify token
    const decoded = jwt.verify(token, env.jwtSecret);
    
    // Get user with tenant information
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      include: { tenant: true },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        isActive: true,
        tenant: {
          select: {
            id: true,
            name: true,
            domain: true
          }
        }
      }
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (!user.isActive) {
      throw new AuthError('User account is inactive');
    }

    req.user = user;
    req.tenantId = user.tenantId;
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthError('Authentication required'));
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      return next(new AuthError('Insufficient permissions', 403));
    }

    next();
  };
}

function requireTenantAccess(req, res, next) {
  if (!req.user || !req.tenantId) {
    return next(new AuthError('Tenant access required'));
  }
  next();
}

module.exports = {
  authenticateToken,
  requireRole,
  requireTenantAccess
};
