const userService = require('./user.service');
const { ValidationError, NotFoundError, AuthError } = require('../../core/exceptions');
const { PAGINATION } = require('../../core/constants');

async function getUsers(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { role, isActive, limit, offset, search } = req.query;
    
    const users = await userService.getUsers({
      tenantId,
      role,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      limit: parseInt(limit) || PAGINATION.DEFAULT_LIMIT,
      offset: parseInt(offset) || 0,
      search
    });

    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
}

async function getUserById(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.params.id;

    const user = await userService.getUserById(userId, tenantId);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

async function createUser(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userData = req.body;

    const user = await userService.createUser(tenantId, userData);
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.params.id;
    const userData = req.body;

    const user = await userService.updateUser(userId, tenantId, userData);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.params.id;

    await userService.deleteUser(userId, tenantId);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    next(err);
  }
}

async function activateUser(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.params.id;

    const user = await userService.activateUser(userId, tenantId);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

async function deactivateUser(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.params.id;

    const user = await userService.deactivateUser(userId, tenantId);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

async function changeUserRole(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.params.id;
    const { role } = req.body;

    if (!role) {
      throw new ValidationError('Role is required');
    }

    const user = await userService.changeUserRole(userId, tenantId, role);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.params.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new ValidationError('Current password and new password are required');
    }

    await userService.changePassword(userId, tenantId, currentPassword, newPassword);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.params.id;
    const { newPassword } = req.body;

    if (!newPassword) {
      throw new ValidationError('New password is required');
    }

    await userService.resetPassword(userId, tenantId, newPassword);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
}

async function getUserActivity(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.params.id;
    const { limit, offset } = req.query;

    const activity = await userService.getUserActivity(userId, tenantId, {
      limit: parseInt(limit) || PAGINATION.DEFAULT_LIMIT,
      offset: parseInt(offset) || 0
    });

    res.json({ success: true, data: activity });
  } catch (err) {
    next(err);
  }
}

async function getUserPermissions(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.params.id;

    const permissions = await userService.getUserPermissions(userId, tenantId);
    res.json({ success: true, data: permissions });
  } catch (err) {
    next(err);
  }
}

async function updateUserPermissions(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.params.id;
    const { permissions } = req.body;

    const updatedPermissions = await userService.updateUserPermissions(userId, tenantId, permissions);
    res.json({ success: true, data: updatedPermissions });
  } catch (err) {
    next(err);
  }
}

async function getCurrentUser(req, res, next) {
  try {
    const userId = req.user.id;
    const tenantId = req.tenantId;

    const user = await userService.getUserById(userId, tenantId);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

async function updateCurrentUser(req, res, next) {
  try {
    const userId = req.user.id;
    const tenantId = req.tenantId;
    const userData = req.body;

    // Remove sensitive fields that users shouldn't be able to update themselves
    delete userData.role;
    delete userData.isActive;
    delete userData.password;

    const user = await userService.updateUser(userId, tenantId, userData);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

async function getUserStats(req, res, next) {
  try {
    const tenantId = req.tenantId;

    const stats = await userService.getUserStats(tenantId);
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

async function bulkUpdateUsers(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { userIds, updateData } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      throw new ValidationError('User IDs array is required');
    }

    const result = await userService.bulkUpdateUsers(tenantId, userIds, updateData);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function bulkDeleteUsers(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      throw new ValidationError('User IDs array is required');
    }

    const result = await userService.bulkDeleteUsers(tenantId, userIds);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getUserProfile(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.params.id;

    const profile = await userService.getUserProfile(userId, tenantId);
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
}

async function updateUserProfile(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.params.id;
    const profileData = req.body;

    const profile = await userService.updateUserProfile(userId, tenantId, profileData);
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
}

async function getUserDashboard(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.params.id;

    const dashboard = await userService.getUserDashboard(userId, tenantId);
    res.json({ success: true, data: dashboard });
  } catch (err) {
    next(err);
  }
}

async function getUserSessions(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.params.id;

    const sessions = await userService.getUserSessions(userId, tenantId);
    res.json({ success: true, data: sessions });
  } catch (err) {
    next(err);
  }
}

async function revokeUserSessions(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.params.id;

    const result = await userService.revokeUserSessions(userId, tenantId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getUserPerformanceMetrics(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.params.id;
    const { period } = req.query;

    const metrics = await userService.getUserPerformanceMetrics(userId, tenantId, {
      period: parseInt(period) || 30
    });
    res.json({ success: true, data: metrics });
  } catch (err) {
    next(err);
  }
}

async function getCurrentUserProfile(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.user.id;

    const profile = await userService.getUserProfile(userId, tenantId);
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
}

async function updateCurrentUserProfile(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.user.id;
    const profileData = req.body;

    const profile = await userService.updateUserProfile(userId, tenantId, profileData);
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
}

async function getCurrentUserDashboard(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.user.id;

    const dashboard = await userService.getUserDashboard(userId, tenantId);
    res.json({ success: true, data: dashboard });
  } catch (err) {
    next(err);
  }
}

async function getCurrentUserSessions(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.user.id;

    const sessions = await userService.getUserSessions(userId, tenantId);
    res.json({ success: true, data: sessions });
  } catch (err) {
    next(err);
  }
}

async function revokeCurrentUserSessions(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const userId = req.user.id;

    const result = await userService.revokeUserSessions(userId, tenantId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  activateUser,
  deactivateUser,
  changeUserRole,
  changePassword,
  resetPassword,
  getUserActivity,
  getUserPermissions,
  updateUserPermissions,
  getCurrentUser,
  updateCurrentUser,
  getUserStats,
  bulkUpdateUsers,
  bulkDeleteUsers,
  getUserProfile,
  updateUserProfile,
  getUserDashboard,
  getUserSessions,
  revokeUserSessions,
  getUserPerformanceMetrics,
  getCurrentUserProfile,
  updateCurrentUserProfile,
  getCurrentUserDashboard,
  getCurrentUserSessions,
  revokeCurrentUserSessions
};
