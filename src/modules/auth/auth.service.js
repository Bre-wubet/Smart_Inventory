const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { prisma } = require('../../config/db');
const { getRedis } = require('../../config/redis');
const { loadEnv } = require('../../config/env');
const { AuthError, NotFoundError, ValidationError } = require('../../core/exceptions');
const { SECURITY } = require('../../core/constants');

const env = loadEnv();
const redis = getRedis(env.redisUrl);

async function register({ email, password, name, tenantId, role = 'STAFF' }) {
  // Validate password strength
  validatePasswordStrength(password);
  
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AuthError('Email already in use', 400);
  
  // Check tenant exists
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError('Tenant not found');
  
  const hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ 
    data: { 
      email, 
      password: hash, 
      name, 
      tenantId,
      role,
      isActive: true,
      lastLoginAt: null
    } 
  });
  
  // Log registration event
  await logAuthEvent('USER_REGISTERED', user.id, { email, tenantId });
  
  return { 
    id: user.id, 
    email: user.email, 
    name: user.name, 
    tenantId: user.tenantId, 
    role: user.role 
  };
}

async function login({ email, password, rememberMe = false }) {
  // Check rate limiting
  await checkRateLimit(email);
  
  const user = await prisma.user.findUnique({ 
    where: { email },
    include: { tenant: true }
  });
  
  if (!user) {
    await recordFailedLogin(email);
    throw new AuthError('Invalid credentials', 401);
  }
  
  if (!user.isActive) {
    throw new AuthError('Account is inactive', 401);
  }
  
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    await recordFailedLogin(email);
    throw new AuthError('Invalid credentials', 401);
  }
  
  // Generate tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  
  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });
  
  // Store refresh token
  await storeRefreshToken(user.id, refreshToken, rememberMe);
  
  // Log successful login
  await logAuthEvent('USER_LOGIN', user.id, { email, rememberMe });
  
  // Clear failed login attempts
  await clearFailedLogins(email);
  
  return { 
    accessToken, 
    refreshToken,
    user: { 
      id: user.id, 
      email: user.email, 
      name: user.name, 
      role: user.role,
      tenant: user.tenant
    } 
  };
}

async function logout(token, refreshToken) {
  const decoded = jwt.decode(token);
  if (!decoded || !decoded.exp) return;
  
  const ttl = Math.max(decoded.exp - Math.floor(Date.now() / 1000), 1);
  
  // Blacklist access token
  await redis.set(`bl:${token}`, '1', { EX: ttl });
  
  // Revoke refresh token
  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }
  
  // Log logout event
  if (decoded.sub) {
    await logAuthEvent('USER_LOGOUT', decoded.sub, {});
  }
}

async function refreshAccessToken(refreshToken) {
  const decoded = jwt.verify(refreshToken, env.jwtSecret);
  
  // Check if refresh token is valid
  const isValid = await redis.get(`rt:${refreshToken}`);
  if (!isValid) {
    throw new AuthError('Invalid refresh token', 401);
  }
  
  const user = await prisma.user.findUnique({
    where: { id: decoded.sub },
    include: { tenant: true }
  });
  
  if (!user || !user.isActive) {
    throw new AuthError('User not found or inactive', 401);
  }
  
  // Generate new tokens
  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);
  
  // Revoke old refresh token and store new one
  await revokeRefreshToken(refreshToken);
  await storeRefreshToken(user.id, newRefreshToken, false);
  
  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenant: user.tenant
    }
  };
}

async function me(token) {
  const blacklisted = await redis.get(`bl:${token}`);
  if (blacklisted) throw new AuthError('Token revoked');
  
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await prisma.user.findUnique({ 
      where: { id: payload.sub },
      include: { tenant: true },
      select: { 
        id: true, 
        email: true, 
        name: true, 
        role: true, 
        tenantId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            domain: true,
            metadata: true
          }
        }
      } 
    });
    
    if (!user) throw new NotFoundError('User not found');
    
    return user;
  } catch (err) {
    throw new AuthError('Invalid token');
  }
}

async function requestPasswordReset(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Don't reveal if email exists
    return { message: 'If the email exists, a reset link has been sent' };
  }
  
  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 3600000); // 1 hour
  
  // Store reset token in Redis
  await redis.set(`reset:${resetToken}`, user.id, { EX: 3600 });
  
  // Log password reset request
  await logAuthEvent('PASSWORD_RESET_REQUESTED', user.id, { email });
  
  // In a real application, send email here
  console.log(`Password reset token for ${email}: ${resetToken}`);
  
  return { message: 'If the email exists, a reset link has been sent' };
}

async function resetPassword(token, newPassword) {
  validatePasswordStrength(newPassword);
  
  const userId = await redis.get(`reset:${token}`);
  if (!userId) {
    throw new AuthError('Invalid or expired reset token', 400);
  }
  
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError('User not found');
  }
  
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword }
  });
  
  // Revoke reset token
  await redis.del(`reset:${token}`);
  
  // Revoke all refresh tokens for security
  await revokeAllUserRefreshTokens(userId);
  
  // Log password reset
  await logAuthEvent('PASSWORD_RESET', userId, {});
  
  return { message: 'Password reset successfully' };
}

async function changePassword(userId, currentPassword, newPassword) {
  validatePasswordStrength(newPassword);
  
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  
  const isValid = await bcrypt.compare(currentPassword, user.password);
  if (!isValid) {
    throw new AuthError('Current password is incorrect', 400);
  }
  
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword }
  });
  
  // Log password change
  await logAuthEvent('PASSWORD_CHANGED', userId, {});
  
  // Revoke all refresh tokens for security
  await revokeAllUserRefreshTokens(userId);
}

function validatePasswordStrength(password) {
  const { 
    PASSWORD_MIN_LENGTH, 
    PASSWORD_REQUIRE_UPPERCASE, 
    PASSWORD_REQUIRE_LOWERCASE, 
    PASSWORD_REQUIRE_NUMBERS, 
    PASSWORD_REQUIRE_SYMBOLS 
  } = SECURITY;
  
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new ValidationError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
  }
  
  if (PASSWORD_REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
    throw new ValidationError('Password must contain at least one uppercase letter');
  }
  
  if (PASSWORD_REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
    throw new ValidationError('Password must contain at least one lowercase letter');
  }
  
  if (PASSWORD_REQUIRE_NUMBERS && !/\d/.test(password)) {
    throw new ValidationError('Password must contain at least one number');
  }
  
  if (PASSWORD_REQUIRE_SYMBOLS && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    throw new ValidationError('Password must contain at least one special character');
  }
}

function generateAccessToken(user) {
  return jwt.sign(
    { 
      sub: user.id, 
      tenantId: user.tenantId, 
      role: user.role,
      type: 'access'
    }, 
    env.jwtSecret, 
    { expiresIn: `${SECURITY.SESSION_TIMEOUT_HOURS}h` }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { 
      sub: user.id, 
      tenantId: user.tenantId,
      type: 'refresh'
    }, 
    env.jwtSecret, 
    { expiresIn: `${SECURITY.REFRESH_TOKEN_EXPIRY_DAYS}d` }
  );
}

async function storeRefreshToken(userId, refreshToken, rememberMe) {
  const expiry = rememberMe ? SECURITY.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 3600 : 7 * 24 * 3600; // 30 days or 7 days
  await redis.set(`rt:${refreshToken}`, userId, { EX: expiry });
}

async function revokeRefreshToken(refreshToken) {
  await redis.del(`rt:${refreshToken}`);
}

async function revokeAllUserRefreshTokens(userId) {
  // In a real implementation, you'd need to track all user refresh tokens
  // For now, we'll just log the event
  await logAuthEvent('ALL_TOKENS_REVOKED', userId, {});
}

async function checkRateLimit(email) {
  const attempts = await redis.get(`login_attempts:${email}`);
  if (attempts && parseInt(attempts) >= SECURITY.MAX_LOGIN_ATTEMPTS) {
    throw new AuthError('Too many login attempts. Please try again later.', 429);
  }
}

async function recordFailedLogin(email) {
  const attempts = await redis.get(`login_attempts:${email}`);
  const count = attempts ? parseInt(attempts) + 1 : 1;
  
  await redis.set(`login_attempts:${email}`, count, { EX: SECURITY.LOCKOUT_DURATION_MINUTES * 60 });
}

async function clearFailedLogins(email) {
  await redis.del(`login_attempts:${email}`);
}

async function logAuthEvent(event, userId, metadata) {
  try {
    await prisma.analyticsLog.create({
      data: {
        event,
        entity: 'User',
        entityId: userId,
        userId,
        metadata: JSON.stringify(metadata)
      }
    });
  } catch (error) {
    console.error('Failed to log auth event:', error);
  }
}

module.exports = { 
  register, 
  login, 
  logout, 
  me, 
  refreshAccessToken,
  requestPasswordReset,
  resetPassword,
  changePassword
};


