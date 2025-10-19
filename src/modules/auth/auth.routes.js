const { Router } = require('express');
const controller = require('./auth.controller');
const { authenticateToken } = require('../../core/middlewares/auth');

const router = Router();

// Public routes
router.post('/register', controller.register);
router.post('/login', controller.login);
router.post('/refresh-token', controller.refreshToken);
router.post('/request-password-reset', controller.requestPasswordReset);
router.post('/reset-password', controller.resetPassword);

// Protected routes
router.use(authenticateToken);
router.post('/logout', controller.logout);
router.get('/me', controller.me);
router.post('/change-password', controller.changePassword);

module.exports = router;


