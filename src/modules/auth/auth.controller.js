const service = require('./auth.service');
const { ValidationError, AuthError } = require('../../core/exceptions');

async function register(req, res, next) {
  try {
    const { email, password, name, tenantId, role } = req.body;
    if (!email || !password || !tenantId) {
      throw new ValidationError('email, password and tenantId are required');
    }
    const user = await service.register({ email, password, name, tenantId, role });
    res.status(201).json({ success: true, data: user });
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  try {
    const { email, password, rememberMe } = req.body;
    if (!email || !password) throw new ValidationError('email and password are required');
    const result = await service.login({ email, password, rememberMe });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function logout(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const { refreshToken } = req.body;
    if (!token) throw new AuthError('Token not provided');
    await service.logout(token, refreshToken);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) { next(err); }
}

async function me(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new AuthError('Token not provided');
    const user = await service.me(token);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
}

async function refreshToken(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new ValidationError('Refresh token is required');
    const result = await service.refreshAccessToken(refreshToken);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function requestPasswordReset(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) throw new ValidationError('Email is required');
    const result = await service.requestPasswordReset(email);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      throw new ValidationError('Token and new password are required');
    }
    const result = await service.resetPassword(token, newPassword);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function changePassword(req, res, next) {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      throw new ValidationError('Current password and new password are required');
    }
    await service.changePassword(userId, currentPassword, newPassword);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) { next(err); }
}

module.exports = { 
  register, 
  login, 
  logout, 
  me, 
  refreshToken,
  requestPasswordReset,
  resetPassword,
  changePassword
};


