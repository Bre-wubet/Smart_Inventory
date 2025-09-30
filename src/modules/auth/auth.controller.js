const service = require('./auth.service');
const { ValidationError, AuthError } = require('../../core/exceptions');

async function register(req, res, next) {
  try {
    const { email, password, name, tenantId } = req.body;
    if (!email || !password || !tenantId) {
      throw new ValidationError('email, password and tenantId are required');
    }
    const user = await service.register({ email, password, name, tenantId });
    res.status(201).json({ success: true, user });
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw new ValidationError('email and password are required');
    const result = await service.login({ email, password });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

async function logout(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new AuthError('Token not provided');
    await service.logout(token);
    res.json({ success: true });
  } catch (err) { next(err); }
}

async function me(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new AuthError('Token not provided');
    const user = await service.me(token);
    res.json({ success: true, user });
  } catch (err) { next(err); }
}

module.exports = { register, login, logout, me };


