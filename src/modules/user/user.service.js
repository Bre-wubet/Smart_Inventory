const { prisma } = require('../../config/db');
const bcrypt = require('bcrypt');
const { ValidationError, NotFoundError, AuthError } = require('../../core/exceptions');
const { Role } = require('../../core/constants');

async function getUsers({ tenantId, role, isActive, limit, offset, search }) {
  const where = {
    tenantId,
    ...(role && { role }),
    ...(isActive !== undefined && { isActive }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ]
    })
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    }),
    prisma.user.count({ where })
  ]);

  return {
    users,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    }
  };
}

async function getUserById(userId, tenantId) {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      lastLoginAt: true,
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

  return user;
}

async function createUser(tenantId, userData) {
  const { name, email, password, role = Role.USER } = userData;

  if (!name || !email || !password) {
    throw new ValidationError('Name, email, and password are required');
  }

  // Check if email already exists
  const existingUser = await prisma.user.findFirst({
    where: { email, tenantId }
  });

  if (existingUser) {
    throw new ValidationError('Email already exists');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role,
      tenantId,
      isActive: true
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return user;
}

async function updateUser(userId, tenantId, userData) {
  const { name, email, role, isActive } = userData;

  // Check if user exists
  const existingUser = await prisma.user.findFirst({
    where: { id: userId, tenantId }
  });

  if (!existingUser) {
    throw new NotFoundError('User not found');
  }

  // Check if email already exists (excluding current user)
  if (email && email !== existingUser.email) {
    const emailExists = await prisma.user.findFirst({
      where: { 
        email, 
        tenantId,
        id: { not: userId }
      }
    });

    if (emailExists) {
      throw new ValidationError('Email already exists');
    }
  }

  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (email !== undefined) updateData.email = email;
  if (role !== undefined) updateData.role = role;
  if (isActive !== undefined) updateData.isActive = isActive;

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return user;
}

async function deleteUser(userId, tenantId) {
  // Check if user exists
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId }
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Check if user has any related data (transactions, orders, etc.)
  const [transactions, purchaseOrders, salesOrders] = await Promise.all([
    prisma.inventoryTransaction.count({
      where: { createdById: userId }
    }),
    prisma.purchaseOrder.count({
      where: { createdById: userId }
    }),
    prisma.saleOrder.count({
      where: { createdById: userId }
    })
  ]);

  if (transactions > 0 || purchaseOrders > 0 || salesOrders > 0) {
    throw new ValidationError('Cannot delete user with existing transactions or orders. Deactivate instead.');
  }

  await prisma.user.delete({
    where: { id: userId }
  });
}

async function activateUser(userId, tenantId) {
  const user = await prisma.user.updateMany({
    where: { id: userId, tenantId },
    data: { isActive: true }
  });

  if (user.count === 0) {
    throw new NotFoundError('User not found');
  }

  return await getUserById(userId, tenantId);
}

async function deactivateUser(userId, tenantId) {
  const user = await prisma.user.updateMany({
    where: { id: userId, tenantId },
    data: { isActive: false }
  });

  if (user.count === 0) {
    throw new NotFoundError('User not found');
  }

  return await getUserById(userId, tenantId);
}

async function changeUserRole(userId, tenantId, role) {
  const validRoles = Object.values(Role);
  if (!validRoles.includes(role)) {
    throw new ValidationError('Invalid role');
  }

  const user = await prisma.user.updateMany({
    where: { id: userId, tenantId },
    data: { role }
  });

  if (user.count === 0) {
    throw new NotFoundError('User not found');
  }

  return await getUserById(userId, tenantId);
}

async function changePassword(userId, tenantId, currentPassword, newPassword) {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true, password: true }
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Verify current password
  const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isCurrentPasswordValid) {
    throw new AuthError('Current password is incorrect');
  }

  // Hash new password
  const hashedNewPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedNewPassword }
  });
}

async function resetPassword(userId, tenantId, newPassword) {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId }
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword }
  });
}

async function getUserActivity(userId, tenantId, { limit, offset }) {
  // Check if user exists
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId }
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Get user's recent activity from various sources
  const [transactions, purchaseOrders, salesOrders, alerts] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where: { createdById: userId },
      select: {
        id: true,
        type: true,
        quantity: true,
        createdAt: true,
        item: {
          select: { id: true, name: true, sku: true }
        },
        warehouse: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    }),
    prisma.purchaseOrder.findMany({
      where: { createdById: userId },
      select: {
        id: true,
        reference: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        supplier: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    }),
    prisma.saleOrder.findMany({
      where: { createdById: userId },
      select: {
        id: true,
        reference: true,
        status: true,
        totalAmount: true,
        customer: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    }),
    prisma.alert.findMany({
      where: { tenantId },
      select: {
        id: true,
        type: true,
        title: true,
        priority: true,
        status: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    })
  ]);

  // Combine and sort all activities
  const activities = [
    ...transactions.map(t => ({
      type: 'TRANSACTION',
      id: t.id,
      description: `${t.type} transaction for ${t.item.name} (${t.item.sku})`,
      details: {
        quantity: t.quantity,
        warehouse: t.warehouse.name
      },
      createdAt: t.createdAt
    })),
    ...purchaseOrders.map(po => ({
      type: 'PURCHASE_ORDER',
      id: po.id,
      description: `Purchase Order ${po.reference} from ${po.supplier.name}`,
      details: {
        status: po.status,
        totalAmount: po.totalAmount
      },
      createdAt: po.createdAt
    })),
    ...salesOrders.map(so => ({
      type: 'SALES_ORDER',
      id: so.id,
      description: `Sales Order ${so.reference} for ${so.customer}`,
      details: {
        status: so.status,
        totalAmount: so.totalAmount
      },
      createdAt: so.createdAt
    })),
    ...alerts.map(a => ({
      type: 'ALERT',
      id: a.id,
      description: a.title,
      details: {
        alertType: a.type,
        priority: a.priority,
        status: a.status
      },
      createdAt: a.createdAt
    }))
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    activities: activities.slice(0, limit),
    pagination: {
      total: activities.length,
      limit,
      offset,
      hasMore: offset + limit < activities.length
    }
  };
}

async function getUserPermissions(userId, tenantId) {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true, role: true }
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Define role-based permissions
  const rolePermissions = {
    [Role.ADMIN]: [
      'users:read', 'users:write', 'users:delete',
      'inventory:read', 'inventory:write', 'inventory:delete',
      'warehouse:read', 'warehouse:write', 'warehouse:delete',
      'recipe:read', 'recipe:write', 'recipe:delete',
      'supplier:read', 'supplier:write', 'supplier:delete',
      'purchase:read', 'purchase:write', 'purchase:delete',
      'sales:read', 'sales:write', 'sales:delete',
      'costing:read', 'costing:write',
      'notifications:read', 'notifications:write', 'notifications:delete',
      'analytics:read', 'analytics:write',
      'settings:read', 'settings:write'
    ],
    [Role.MANAGER]: [
      'users:read',
      'inventory:read', 'inventory:write',
      'warehouse:read', 'warehouse:write',
      'recipe:read', 'recipe:write',
      'supplier:read', 'supplier:write',
      'purchase:read', 'purchase:write',
      'sales:read', 'sales:write',
      'costing:read', 'costing:write',
      'notifications:read', 'notifications:write',
      'analytics:read', 'analytics:write'
    ],
    [Role.USER]: [
      'inventory:read',
      'warehouse:read',
      'recipe:read',
      'supplier:read',
      'purchase:read', 'purchase:write',
      'sales:read', 'sales:write',
      'notifications:read'
    ]
  };

  return {
    userId: user.id,
    role: user.role,
    permissions: rolePermissions[user.role] || []
  };
}

async function updateUserPermissions(userId, tenantId, permissions) {
  // In a real application, you might want to store custom permissions in the database
  // For now, we'll just return the current role-based permissions
  const currentPermissions = await getUserPermissions(userId, tenantId);
  
  return {
    ...currentPermissions,
    customPermissions: permissions,
    updatedAt: new Date()
  };
}

async function getUserStats(tenantId) {
  const [
    totalUsers,
    activeUsers,
    usersByRole,
    recentUsers
  ] = await Promise.all([
    prisma.user.count({ where: { tenantId } }),
    prisma.user.count({ where: { tenantId, isActive: true } }),
    prisma.user.groupBy({
      by: ['role'],
      where: { tenantId },
      _count: { role: true }
    }),
    prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        lastLoginAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    })
  ]);

  return {
    totalUsers,
    activeUsers,
    inactiveUsers: totalUsers - activeUsers,
    usersByRole: usersByRole.map(group => ({
      role: group.role,
      count: group._count.role
    })),
    recentUsers
  };
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
  getUserStats
};
