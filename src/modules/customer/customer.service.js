// src/modules/customer/customer.service.js
const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { PAGINATION } = require('../../core/constants');

async function createCustomer(customerData) {
  const { 
    name, 
    email, 
    phone, 
    address, 
    tenantId,
    company,
    taxId,
    paymentTerms,
    creditLimit,
    currency,
    notes,
    isActive = true
  } = customerData;

  if (!name) {
    throw new ValidationError('Customer name is required');
  }

  if (!tenantId) {
    throw new ValidationError('Tenant ID is required');
  }

  // Check if customer with same email exists for tenant
  if (email) {
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        tenantId
      }
    });

    if (existingCustomer) {
      throw new ValidationError('Customer with this email already exists for this tenant');
    }
  }

  const customer = await prisma.customer.create({
    data: {
      name,
      email,
      phone,
      address,
      tenantId,
      company,
      taxId,
      paymentTerms,
      creditLimit: creditLimit ? parseFloat(creditLimit) : null,
      currency: currency || 'USD',
      notes,
      isActive,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    include: {
      tenant: {
        select: { id: true, name: true }
      }
    }
  });

  return customer;
}

async function getCustomers({ tenantId, page, limit, search, isActive, sortBy = 'createdAt', sortOrder = 'desc' }) {
  const skip = (page - 1) * limit;
  
  const where = {
    tenantId,
    ...(isActive !== undefined && { isActive }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } }
      ]
    })
  };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip,
      take: limit,
      include: {
        _count: {
          select: {
            saleOrders: true
          }
        }
      },
      orderBy: { [sortBy]: sortOrder }
    }),
    prisma.customer.count({ where })
  ]);

  // Calculate customer metrics
  const customersWithMetrics = await Promise.all(
    customers.map(async (customer) => {
      const metrics = await calculateCustomerMetrics(customer.id);
      return {
        ...customer,
        metrics
      };
    })
  );

  return {
    data: customersWithMetrics,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function getCustomerById(id, tenantId) {
  const customer = await prisma.customer.findFirst({
    where: { id, tenantId },
    include: {
      tenant: {
        select: { id: true, name: true }
      },
      saleOrders: {
        include: {
          items: {
            include: {
              item: {
                select: { id: true, name: true, sku: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!customer) return null;

  // Calculate detailed metrics
  const metrics = await calculateCustomerMetrics(id);
  const performanceHistory = await getCustomerPerformanceHistory(id, 12);

  return {
    ...customer,
    metrics,
    performanceHistory
  };
}

async function updateCustomer(id, tenantId, updateData) {
  const { email, ...restData } = updateData;

  // If email is being updated, check for conflicts
  if (email) {
    const existingCustomer = await prisma.customer.findFirst({
      where: { 
        email: { equals: email, mode: 'insensitive' }, 
        tenantId,
        NOT: { id }
      }
    });

    if (existingCustomer) {
      throw new ValidationError('Customer with this email already exists for this tenant');
    }
  }

  const customer = await prisma.customer.update({
    where: { id, tenantId },
    data: {
      ...restData,
      ...(email && { email }),
      updatedAt: new Date()
    },
    include: {
      tenant: {
        select: { id: true, name: true }
      }
    }
  });

  return customer;
}

async function deleteCustomer(id, tenantId) {
  // Check if customer has any sale orders
  const saleOrderCount = await prisma.saleOrder.count({
    where: { customer: { contains: id } } // Assuming customer field stores customer ID
  });

  if (saleOrderCount > 0) {
    // Soft delete - mark as inactive
    const customer = await prisma.customer.update({
      where: { id, tenantId },
      data: { 
        isActive: false,
        updatedAt: new Date()
      }
    });
    return { deleted: false, customer, message: 'Customer deactivated due to existing sale orders' };
  }

  // Hard delete if no dependencies
  await prisma.customer.delete({
    where: { id, tenantId }
  });

  return { deleted: true, message: 'Customer deleted successfully' };
}

async function calculateCustomerMetrics(customerId) {
  const [
    totalOrders,
    totalValue,
    averageOrderValue,
    lastOrderDate
  ] = await Promise.all([
    prisma.saleOrder.count({
      where: { customer: { contains: customerId } },
      status: 'COMPLETED'
    }),
    prisma.saleOrder.aggregate({
      where: { 
        customer: { contains: customerId },
        status: 'COMPLETED'
      },
      _sum: {
        items: {
          quantity: true,
          unitPrice: true
        }
      }
    }),
    prisma.saleOrder.findMany({
      where: { 
        customer: { contains: customerId },
        status: 'COMPLETED'
      },
      include: {
        items: true
      }
    }),
    prisma.saleOrder.findFirst({
      where: { customer: { contains: customerId } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    })
  ]);

  // Calculate average order value
  const ordersWithTotals = totalValue._sum.items ? 
    totalValue._sum.items.quantity * totalValue._sum.items.unitPrice : 0;
  const avgOrderValue = totalOrders > 0 ? ordersWithTotals / totalOrders : 0;

  return {
    totalOrders,
    totalValue: ordersWithTotals,
    averageOrderValue: Math.round(avgOrderValue * 100) / 100,
    lastOrderDate: lastOrderDate?.createdAt || null,
    customerLifetimeValue: ordersWithTotals
  };
}

async function getCustomerPerformanceHistory(customerId, months = 12) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(endDate.getMonth() - months);

  const orders = await prisma.saleOrder.findMany({
    where: {
      customer: { contains: customerId },
      createdAt: { gte: startDate, lte: endDate },
      status: 'COMPLETED'
    },
    include: {
      items: true
    },
    orderBy: { createdAt: 'asc' }
  });

  // Group by month
  const monthlyData = {};
  orders.forEach(order => {
    const monthKey = order.createdAt.toISOString().slice(0, 7); // YYYY-MM
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        month: monthKey,
        orders: 0,
        totalValue: 0,
        totalItems: 0
      };
    }
    
    monthlyData[monthKey].orders += 1;
    monthlyData[monthKey].totalValue += order.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.unitPrice)), 0
    );
    monthlyData[monthKey].totalItems += order.items.length;
  });

  return Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
}

async function getCustomerAnalytics(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    groupBy = 'customer'
  } = options;

  const customers = await prisma.customer.findMany({
    where: { tenantId, isActive: true },
    include: {
      saleOrders: {
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: 'COMPLETED'
        },
        include: {
          items: true
        }
      }
    }
  });

  const analytics = customers.map(customer => {
    const totalOrders = customer.saleOrders.length;
    const totalValue = customer.saleOrders.reduce((sum, order) => 
      sum + order.items.reduce((itemSum, item) => 
        itemSum + (parseFloat(item.quantity) * parseFloat(item.unitPrice)), 0
      ), 0
    );

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        company: customer.company
      },
      metrics: {
        totalOrders,
        totalValue,
        averageOrderValue: totalOrders > 0 ? totalValue / totalOrders : 0,
        customerLifetimeValue: totalValue
      }
    };
  });

  return {
    analytics,
    summary: {
      totalCustomers: customers.length,
      totalOrders: analytics.reduce((sum, c) => sum + c.metrics.totalOrders, 0),
      totalValue: analytics.reduce((sum, c) => sum + c.metrics.totalValue, 0),
      averageCustomerValue: analytics.length > 0 
        ? analytics.reduce((sum, c) => sum + c.metrics.totalValue, 0) / analytics.length 
        : 0
    },
    period: { startDate, endDate }
  };
}

async function getTopCustomers(tenantId, options = {}) {
  const { 
    limit = 10,
    criteria = 'totalValue',
    startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    endDate = new Date()
  } = options;

  const customers = await prisma.customer.findMany({
    where: { tenantId, isActive: true },
    include: {
      saleOrders: {
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: 'COMPLETED'
        },
        include: {
          items: true
        }
      }
    }
  });

  const customerRankings = customers.map(customer => {
    const totalOrders = customer.saleOrders.length;
    const totalValue = customer.saleOrders.reduce((sum, order) => 
      sum + order.items.reduce((itemSum, item) => 
        itemSum + (parseFloat(item.quantity) * parseFloat(item.unitPrice)), 0
      ), 0
    );

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        company: customer.company
      },
      totalOrders,
      totalValue,
      averageOrderValue: totalOrders > 0 ? totalValue / totalOrders : 0
    };
  });

  // Sort by criteria
  const sortedCustomers = customerRankings.sort((a, b) => {
    switch (criteria) {
      case 'totalValue':
        return b.totalValue - a.totalValue;
      case 'totalOrders':
        return b.totalOrders - a.totalOrders;
      case 'averageOrderValue':
        return b.averageOrderValue - a.averageOrderValue;
      default:
        return b.totalValue - a.totalValue;
    }
  });

  return sortedCustomers.slice(0, limit);
}

async function segmentCustomers(tenantId, options = {}) {
  const { 
    segmentationType = 'RFM',
    startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    endDate = new Date()
  } = options;

  const customers = await prisma.customer.findMany({
    where: { tenantId, isActive: true },
    include: {
      saleOrders: {
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: 'COMPLETED'
        },
        include: {
          items: true
        }
      }
    }
  });

  const segments = {};

  customers.forEach(customer => {
    const totalOrders = customer.saleOrders.length;
    const totalValue = customer.saleOrders.reduce((sum, order) => 
      sum + order.items.reduce((itemSum, item) => 
        itemSum + (parseFloat(item.quantity) * parseFloat(item.unitPrice)), 0
      ), 0
    );
    const lastOrderDate = customer.saleOrders.length > 0 
      ? Math.max(...customer.saleOrders.map(o => o.createdAt.getTime()))
      : 0;
    const daysSinceLastOrder = lastOrderDate > 0 
      ? Math.floor((Date.now() - lastOrderDate) / (24 * 60 * 60 * 1000))
      : 999;

    let segment = 'NEW';
    
    if (segmentationType === 'RFM') {
      // RFM Segmentation: Recency, Frequency, Monetary
      if (totalOrders === 0) {
        segment = 'INACTIVE';
      } else if (daysSinceLastOrder <= 30 && totalOrders >= 3 && totalValue >= 1000) {
        segment = 'CHAMPIONS';
      } else if (daysSinceLastOrder <= 60 && totalOrders >= 2 && totalValue >= 500) {
        segment = 'LOYAL_CUSTOMERS';
      } else if (daysSinceLastOrder <= 90 && totalOrders >= 1) {
        segment = 'POTENTIAL_LOYALISTS';
      } else if (daysSinceLastOrder <= 180 && totalOrders >= 1) {
        segment = 'AT_RISK';
      } else {
        segment = 'LOST';
      }
    } else if (segmentationType === 'VALUE') {
      // Value-based segmentation
      if (totalValue >= 5000) {
        segment = 'HIGH_VALUE';
      } else if (totalValue >= 1000) {
        segment = 'MEDIUM_VALUE';
      } else if (totalValue >= 100) {
        segment = 'LOW_VALUE';
      } else {
        segment = 'PROSPECT';
      }
    }

    if (!segments[segment]) {
      segments[segment] = [];
    }

    segments[segment].push({
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        company: customer.company
      },
      metrics: {
        totalOrders,
        totalValue,
        daysSinceLastOrder,
        averageOrderValue: totalOrders > 0 ? totalValue / totalOrders : 0
      }
    });
  });

  return {
    segments,
    summary: {
      totalCustomers: customers.length,
      segmentCounts: Object.keys(segments).reduce((acc, segment) => {
        acc[segment] = segments[segment].length;
        return acc;
      }, {})
    }
  };
}

module.exports = {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  calculateCustomerMetrics,
  getCustomerPerformanceHistory,
  getCustomerAnalytics,
  getTopCustomers,
  segmentCustomers
};
