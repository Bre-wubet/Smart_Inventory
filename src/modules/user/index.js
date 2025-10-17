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

// User management routes (require ADMIN or MANAGER role)
router.get('/', requireRole(['ADMIN', 'MANAGER']), userController.getUsers);
router.get('/stats', requireRole(['ADMIN', 'MANAGER']), userController.getUserStats);
router.post('/', requireRole(['ADMIN', 'MANAGER']), userController.createUser);

// Individual user routes (require ADMIN or MANAGER role)
router.get('/:id', requireRole(['ADMIN', 'MANAGER']), userController.getUserById);
router.put('/:id', requireRole(['ADMIN', 'MANAGER']), userController.updateUser);
router.delete('/:id', requireRole(['ADMIN']), userController.deleteUser);

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
