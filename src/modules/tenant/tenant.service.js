const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { TENANT } = require('../../core/constants');

async function getTenants(options = {}) {
  const { limit = 20, offset = 0, search, plan, isActive } = options;

  const where = {
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { domain: { contains: search, mode: 'insensitive' } }
      ]
    }),
    ...(plan && { metadata: { path: ['plan'], equals: plan } }),
    ...(isActive !== undefined && { 
      users: { 
        some: { isActive: true } 
      } 
    })
  };

  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      include: {
        _count: {
          select: {
            users: true,
            warehouses: true,
            items: true,
            purchaseOrders: true,
            saleOrders: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    }),
    prisma.tenant.count({ where })
  ]);

  return {
    tenants: tenants.map(tenant => ({
      ...tenant,
      stats: tenant._count,
      plan: tenant.metadata?.plan || TENANT.DEFAULT_PLAN
    })),
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    }
  };
}

async function getTenantById(tenantId) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      },
      warehouses: {
        select: {
          id: true,
          name: true,
          code: true,
          location: true,
          createdAt: true
        }
      },
      _count: {
        select: {
          users: true,
          warehouses: true,
          items: true,
          purchaseOrders: true,
          saleOrders: true,
          recipes: true,
          alerts: true
        }
      }
    }
  });

  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  return {
    ...tenant,
    stats: tenant._count,
    plan: tenant.metadata?.plan || TENANT.DEFAULT_PLAN
  };
}

async function createTenant(tenantData) {
  const { name, domain, metadata = {} } = tenantData;

  if (!name || !domain) {
    throw new ValidationError('Name and domain are required');
  }

  // Check if domain already exists
  const existingTenant = await prisma.tenant.findUnique({
    where: { domain }
  });

  if (existingTenant) {
    throw new ValidationError('Domain already exists');
  }

  const tenant = await prisma.tenant.create({
    data: {
      name,
      domain,
      metadata: {
        plan: TENANT.DEFAULT_PLAN,
        ...metadata
      }
    },
    include: {
      _count: {
        select: {
          users: true,
          warehouses: true,
          items: true
        }
      }
    }
  });

  return {
    ...tenant,
    stats: tenant._count,
    plan: tenant.metadata?.plan || TENANT.DEFAULT_PLAN
  };
}

async function updateTenant(tenantId, updateData) {
  const { name, domain, metadata } = updateData;

  // Check if tenant exists
  const existingTenant = await prisma.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!existingTenant) {
    throw new NotFoundError('Tenant not found');
  }

  // Check if domain already exists (excluding current tenant)
  if (domain && domain !== existingTenant.domain) {
    const domainExists = await prisma.tenant.findFirst({
      where: { 
        domain,
        id: { not: tenantId }
      }
    });

    if (domainExists) {
      throw new ValidationError('Domain already exists');
    }
  }

  const updateFields = {};
  if (name !== undefined) updateFields.name = name;
  if (domain !== undefined) updateFields.domain = domain;
  if (metadata !== undefined) {
    updateFields.metadata = {
      ...existingTenant.metadata,
      ...metadata
    };
  }

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: updateFields,
    include: {
      _count: {
        select: {
          users: true,
          warehouses: true,
          items: true
        }
      }
    }
  });

  return {
    ...tenant,
    stats: tenant._count,
    plan: tenant.metadata?.plan || TENANT.DEFAULT_PLAN
  };
}

async function deleteTenant(tenantId) {
  // Check if tenant exists
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      _count: {
        select: {
          users: true,
          warehouses: true,
          items: true,
          purchaseOrders: true,
          saleOrders: true
        }
      }
    }
  });

  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  // Check if tenant has any data
  const hasData = Object.values(tenant._count).some(count => count > 0);
  if (hasData) {
    throw new ValidationError('Cannot delete tenant with existing data. Please remove all data first.');
  }

  await prisma.tenant.delete({
    where: { id: tenantId }
  });
}

async function getTenantAnalytics(tenantId, options = {}) {
  const { period = 30 } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  const [
    tenant,
    userStats,
    inventoryStats,
    purchaseStats,
    salesStats,
    recentActivity
  ] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        domain: true,
        metadata: true,
        createdAt: true
      }
    }),
    prisma.user.groupBy({
      by: ['role'],
      where: { tenantId },
      _count: { role: true }
    }),
    prisma.item.groupBy({
      by: ['type'],
      where: { tenantId },
      _count: { type: true }
    }),
    prisma.purchaseOrder.groupBy({
      by: ['status'],
      where: { 
        tenantId,
        createdAt: { gte: startDate }
      },
      _count: { status: true },
      _sum: { totalValue: true }
    }),
    prisma.saleOrder.groupBy({
      by: ['status'],
      where: { 
        tenantId,
        createdAt: { gte: startDate }
      },
      _count: { status: true },
      _sum: { totalAmount: true }
    }),
    prisma.analyticsLog.findMany({
      where: {
        OR: [
          { userId: { in: await prisma.user.findMany({ where: { tenantId }, select: { id: true } }).then(users => users.map(u => u.id)) } },
          { itemId: { in: await prisma.item.findMany({ where: { tenantId }, select: { id: true } }).then(items => items.map(i => i.id)) } }
        ],
        createdAt: { gte: startDate }
      },
      select: {
        event: true,
        entity: true,
        createdAt: true,
        user: {
          select: { name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    })
  ]);

  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  return {
    tenant: {
      ...tenant,
      plan: tenant.metadata?.plan || TENANT.DEFAULT_PLAN
    },
    analytics: {
      period,
      userStats: userStats.map(stat => ({
        role: stat.role,
        count: stat._count.role
      })),
      inventoryStats: inventoryStats.map(stat => ({
        type: stat.type,
        count: stat._count.type
      })),
      purchaseStats: purchaseStats.map(stat => ({
        status: stat.status,
        count: stat._count.status,
        totalValue: stat._sum.totalValue || 0
      })),
      salesStats: salesStats.map(stat => ({
        status: stat.status,
        count: stat._count.status,
        totalAmount: stat._sum.totalAmount || 0
      })),
      recentActivity
    }
  };
}

async function getTenantSettings(tenantId) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      domain: true,
      metadata: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  const settings = {
    general: {
      name: tenant.name,
      domain: tenant.domain,
      plan: tenant.metadata?.plan || TENANT.DEFAULT_PLAN,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt
    },
    features: {
      maxUsers: tenant.metadata?.maxUsers || TENANT.MAX_USERS_PER_TENANT,
      maxWarehouses: tenant.metadata?.maxWarehouses || TENANT.MAX_WAREHOUSES_PER_TENANT,
      maxItems: tenant.metadata?.maxItems || TENANT.MAX_ITEMS_PER_TENANT,
      customBranding: tenant.metadata?.customBranding || false,
      apiAccess: tenant.metadata?.apiAccess || false,
      advancedAnalytics: tenant.metadata?.advancedAnalytics || false
    },
    notifications: {
      emailNotifications: tenant.metadata?.emailNotifications || true,
      lowStockAlerts: tenant.metadata?.lowStockAlerts || true,
      orderNotifications: tenant.metadata?.orderNotifications || true,
      systemAlerts: tenant.metadata?.systemAlerts || true
    },
    integrations: {
      emailProvider: tenant.metadata?.emailProvider || null,
      smsProvider: tenant.metadata?.smsProvider || null,
      paymentGateway: tenant.metadata?.paymentGateway || null,
      erpIntegration: tenant.metadata?.erpIntegration || null
    }
  };

  return settings;
}

async function updateTenantSettings(tenantId, settings) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { metadata: true }
  });

  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  const updatedMetadata = {
    ...tenant.metadata,
    ...settings
  };

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { metadata: updatedMetadata }
  });

  return await getTenantSettings(tenantId);
}

async function getTenantUsage(tenantId) {
  const [
    userCount,
    warehouseCount,
    itemCount,
    purchaseOrderCount,
    saleOrderCount,
    recipeCount,
    alertCount
  ] = await Promise.all([
    prisma.user.count({ where: { tenantId } }),
    prisma.warehouse.count({ where: { tenantId } }),
    prisma.item.count({ where: { tenantId } }),
    prisma.purchaseOrder.count({ where: { tenantId } }),
    prisma.saleOrder.count({ where: { tenantId } }),
    prisma.recipe.count({ where: { tenantId } }),
    prisma.alert.count({ where: { tenantId } })
  ]);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { metadata: true }
  });

  const limits = {
    users: tenant?.metadata?.maxUsers || TENANT.MAX_USERS_PER_TENANT,
    warehouses: tenant?.metadata?.maxWarehouses || TENANT.MAX_WAREHOUSES_PER_TENANT,
    items: tenant?.metadata?.maxItems || TENANT.MAX_ITEMS_PER_TENANT
  };

  return {
    usage: {
      users: userCount,
      warehouses: warehouseCount,
      items: itemCount,
      purchaseOrders: purchaseOrderCount,
      saleOrders: saleOrderCount,
      recipes: recipeCount,
      alerts: alertCount
    },
    limits,
    utilization: {
      users: (userCount / limits.users) * 100,
      warehouses: (warehouseCount / limits.warehouses) * 100,
      items: (itemCount / limits.items) * 100
    }
  };
}

async function getTenantBilling(tenantId) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      domain: true,
      metadata: true,
      createdAt: true
    }
  });

  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  const plan = tenant.metadata?.plan || TENANT.DEFAULT_PLAN;
  const billingInfo = tenant.metadata?.billing || {};

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      domain: tenant.domain
    },
    plan: {
      name: plan,
      features: getPlanFeatures(plan)
    },
    billing: {
      status: billingInfo.status || 'active',
      nextBillingDate: billingInfo.nextBillingDate || null,
      amount: billingInfo.amount || 0,
      currency: billingInfo.currency || 'USD',
      paymentMethod: billingInfo.paymentMethod || null,
      autoRenew: billingInfo.autoRenew || true
    },
    usage: await getTenantUsage(tenantId)
  };
}

function getPlanFeatures(plan) {
  const features = {
    BASIC: {
      maxUsers: 10,
      maxWarehouses: 3,
      maxItems: 1000,
      customBranding: false,
      apiAccess: false,
      advancedAnalytics: false,
      prioritySupport: false
    },
    PROFESSIONAL: {
      maxUsers: 50,
      maxWarehouses: 10,
      maxItems: 5000,
      customBranding: true,
      apiAccess: true,
      advancedAnalytics: true,
      prioritySupport: false
    },
    ENTERPRISE: {
      maxUsers: 1000,
      maxWarehouses: 50,
      maxItems: 10000,
      customBranding: true,
      apiAccess: true,
      advancedAnalytics: true,
      prioritySupport: true
    }
  };

  return features[plan] || features.BASIC;
}

module.exports = {
  getTenants,
  getTenantById,
  createTenant,
  updateTenant,
  deleteTenant,
  getTenantAnalytics,
  getTenantSettings,
  updateTenantSettings,
  getTenantUsage,
  getTenantBilling
};
