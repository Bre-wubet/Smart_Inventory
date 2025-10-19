const { Router } = require('express');
const userController = require('./user.controller');
const { authenticateToken, requireTenantAccess, requireRole } = require('../../core/middlewares/auth');

const router = Router();

// Apply authentication and tenant access to all routes
router.use(authenticateToken);
router.use(requireTenantAccess);

// Current user routes (no additional role restrictions)
router.get('/me', userController.getCurrentUser);
router.put('/me', userController.updateCurrentUser);
router.get('/me/profile', userController.getCurrentUserProfile);
router.put('/me/profile', userController.updateCurrentUserProfile);
router.get('/me/dashboard', userController.getCurrentUserDashboard);
router.get('/me/sessions', userController.getCurrentUserSessions);
router.post('/me/sessions/revoke', userController.revokeCurrentUserSessions);

// User management routes (require ADMIN or MANAGER role)
router.get('/', requireRole(['ADMIN', 'MANAGER']), userController.getUsers);
router.get('/stats', requireRole(['ADMIN', 'MANAGER']), userController.getUserStats);
router.post('/', requireRole(['ADMIN', 'MANAGER']), userController.createUser);
router.post('/bulk-update', requireRole(['ADMIN', 'MANAGER']), userController.bulkUpdateUsers);
router.post('/bulk-delete', requireRole(['ADMIN']), userController.bulkDeleteUsers);

// Individual user routes (require ADMIN or MANAGER role)
router.get('/:id', requireRole(['ADMIN', 'MANAGER']), userController.getUserById);
router.put('/:id', requireRole(['ADMIN', 'MANAGER']), userController.updateUser);
router.delete('/:id', requireRole(['ADMIN']), userController.deleteUser);

// User profile and dashboard routes (require ADMIN or MANAGER role)
router.get('/:id/profile', requireRole(['ADMIN', 'MANAGER']), userController.getUserProfile);
router.put('/:id/profile', requireRole(['ADMIN', 'MANAGER']), userController.updateUserProfile);
router.get('/:id/dashboard', requireRole(['ADMIN', 'MANAGER']), userController.getUserDashboard);
router.get('/:id/sessions', requireRole(['ADMIN', 'MANAGER']), userController.getUserSessions);
router.post('/:id/sessions/revoke', requireRole(['ADMIN', 'MANAGER']), userController.revokeUserSessions);
router.get('/:id/performance', requireRole(['ADMIN', 'MANAGER']), userController.getUserPerformanceMetrics);

// User status management (require ADMIN role)
router.patch('/:id/activate', requireRole(['ADMIN']), userController.activateUser);
router.patch('/:id/deactivate', requireRole(['ADMIN']), userController.deactivateUser);
router.patch('/:id/role', requireRole(['ADMIN']), userController.changeUserRole);

// Password management
router.patch('/:id/password', userController.changePassword); // Users can change their own password
router.patch('/:id/reset-password', requireRole(['ADMIN']), userController.resetPassword);

// User activity and permissions (require ADMIN or MANAGER role)
router.get('/:id/activity', requireRole(['ADMIN', 'MANAGER']), userController.getUserActivity);
router.get('/:id/permissions', requireRole(['ADMIN', 'MANAGER']), userController.getUserPermissions);
router.put('/:id/permissions', requireRole(['ADMIN']), userController.updateUserPermissions);

module.exports = router;
