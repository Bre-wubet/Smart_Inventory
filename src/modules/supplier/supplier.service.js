const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { PAGINATION } = require('../../core/constants');

async function createSupplier(supplierData) {
  const { 
    name, 
    contact, 
    email, 
    phone, 
    address, 
    tenantId,
    website,
    taxId,
    paymentTerms,
    currency,
    rating,
    notes,
    isActive = true
  } = supplierData;

  if (!name) {
    throw new ValidationError('Supplier name is required');
  }

  if (!tenantId) {
    throw new ValidationError('Tenant ID is required');
  }

  // Check if supplier with same name exists for tenant
  const existingSupplier = await prisma.supplier.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      tenantId
    }
  });

  if (existingSupplier) {
    throw new ValidationError('Supplier with this name already exists for this tenant');
  }

  const supplier = await prisma.supplier.create({
    data: {
      name,
      contact,
      email,
      phone,
      address,
      tenantId,
      website,
      taxId,
      paymentTerms,
      currency: currency || 'USD',
      rating: rating || 0,
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

  return supplier;
}

async function getSuppliers({ page, limit, search, tenantId, isActive, sortBy = 'createdAt', sortOrder = 'desc' }) {
  const skip = (page - 1) * limit;
  
  const where = {
    tenantId,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { contact: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } }
      ]
    }),
    ...(isActive !== undefined && { isActive })
  };

  const orderBy = {};
  orderBy[sortBy] = sortOrder;

  const [suppliers, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      skip,
      take: limit,
      include: {
        _count: {
          select: {
            items: true,
            purchaseOrders: true
          }
        },
        tenant: {
          select: { id: true, name: true }
        }
      },
      orderBy
    }),
    prisma.supplier.count({ where })
  ]);

  // Calculate supplier performance metrics
  const suppliersWithMetrics = await Promise.all(
    suppliers.map(async (supplier) => {
      const metrics = await calculateSupplierMetrics(supplier.id);
      return {
        ...supplier,
        metrics
      };
    })
  );

  return {
    data: suppliersWithMetrics,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function getSupplierById(id, tenantId) {
  const supplier = await prisma.supplier.findFirst({
    where: { id, tenantId },
    include: {
      tenant: {
        select: { id: true, name: true }
      },
      items: {
        include: {
          item: {
            select: { 
              id: true, 
              name: true, 
              sku: true, 
              unit: true, 
              type: true,
              cost: true,
              price: true
            }
          }
        }
      },
      purchaseOrders: {
        include: {
          items: {
            include: {
              item: {
                select: { id: true, name: true, sku: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      },
      _count: {
        select: {
          items: true,
          purchaseOrders: true
        }
      }
    }
  });

  if (!supplier) {
    throw new NotFoundError('Supplier not found');
  }

  // Calculate detailed metrics
  const metrics = await calculateSupplierMetrics(id);
  const performanceHistory = await getSupplierPerformanceHistory(id, 12); // Last 12 months

  return {
    ...supplier,
    metrics,
    performanceHistory
  };
}

async function updateSupplier(id, tenantId, updateData) {
  const { name, ...restData } = updateData;

  // Check if supplier exists and belongs to tenant
  const existingSupplier = await prisma.supplier.findFirst({
    where: { id, tenantId }
  });

  if (!existingSupplier) {
    throw new NotFoundError('Supplier not found');
  }

  // If name is being updated, check for conflicts
  if (name && name !== existingSupplier.name) {
    const nameConflict = await prisma.supplier.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        tenantId,
        NOT: { id }
      }
    });

    if (nameConflict) {
      throw new ValidationError('Supplier with this name already exists for this tenant');
    }
  }

  const supplier = await prisma.supplier.update({
    where: { id },
    data: {
      ...restData,
      ...(name && { name }),
      updatedAt: new Date()
    },
    include: {
      tenant: {
        select: { id: true, name: true }
      }
    }
  });

  return supplier;
}

async function deleteSupplier(id, tenantId) {
  // Check if supplier exists and belongs to tenant
  const supplier = await prisma.supplier.findFirst({
    where: { id, tenantId }
  });

  if (!supplier) {
    throw new NotFoundError('Supplier not found');
  }

  // Check if supplier has any purchase orders or item relationships
  const [itemCount, poCount] = await Promise.all([
    prisma.itemSupplier.count({ where: { supplierId: id } }),
    prisma.purchaseOrder.count({ where: { supplierId: id } })
  ]);

  if (itemCount > 0 || poCount > 0) {
    // Soft delete - mark as inactive
    await prisma.supplier.update({
      where: { id },
      data: { 
        isActive: false,
        updatedAt: new Date()
      }
    });
    return { deleted: true, type: 'soft' };
  } else {
    // Hard delete if no dependencies
    await prisma.supplier.delete({
      where: { id }
    });
    return { deleted: true, type: 'hard' };
  }
}

async function addItemToSupplier({ supplierId, itemId, cost, leadTime, currency, tenantId }) {
  // Verify supplier exists
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId }
  });

  if (!supplier) {
    throw new ValidationError('Supplier not found');
  }

  // Verify item exists and belongs to tenant
  const item = await prisma.item.findFirst({
    where: { id: itemId, tenantId }
  });

  if (!item) {
    throw new ValidationError('Item not found or does not belong to tenant');
  }

  // Check if relationship already exists
  const existingRelationship = await prisma.itemSupplier.findFirst({
    where: { supplierId, itemId }
  });

  if (existingRelationship) {
    throw new ValidationError('Item is already associated with this supplier');
  }

  const itemSupplier = await prisma.itemSupplier.create({
    data: {
      supplierId,
      itemId,
      cost,
      leadTime,
      currency
    },
    include: {
      supplier: {
        select: { id: true, name: true, contact: true, email: true }
      },
      item: {
        select: { id: true, name: true, sku: true, unit: true, type: true }
      }
    }
  });

  return itemSupplier;
}

async function updateItemSupplier(id, updateData) {
  const itemSupplier = await prisma.itemSupplier.update({
    where: { id },
    data: updateData,
    include: {
      supplier: {
        select: { id: true, name: true, contact: true, email: true }
      },
      item: {
        select: { id: true, name: true, sku: true, unit: true, type: true }
      }
    }
  });

  return itemSupplier;
}

async function removeItemFromSupplier(id) {
  // Check if there are any purchase orders for this item-supplier relationship
  const poCount = await prisma.purchaseOrder.count({
    where: {
      supplier: {
        items: {
          some: { id }
        }
      }
    }
  });

  if (poCount > 0) {
    throw new ValidationError('Cannot remove item from supplier with existing purchase orders');
  }

  await prisma.itemSupplier.delete({
    where: { id }
  });

  return true;
}

async function getSupplierItems(supplierId, tenantId, { page, limit }) {
  const skip = (page - 1) * limit;

  // Verify supplier exists
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, name: true }
  });

  if (!supplier) {
    throw new ValidationError('Supplier not found');
  }

  const [itemSuppliers, total] = await Promise.all([
    prisma.itemSupplier.findMany({
      where: { 
        supplierId,
        item: { tenantId }
      },
      skip,
      take: limit,
      include: {
        item: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: true,
            type: true,
            cost: true,
            price: true,
            stock: {
              include: {
                warehouse: {
                  select: { id: true, name: true, code: true }
                }
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.itemSupplier.count({ 
      where: { 
        supplierId,
        item: { tenantId }
      }
    })
  ]);

  // Calculate stock summary for each item
  const itemsWithStock = itemSuppliers.map(itemSupplier => ({
    ...itemSupplier,
    item: {
      ...itemSupplier.item,
      totalStock: itemSupplier.item.stock.reduce((sum, stock) => sum + parseFloat(stock.quantity), 0),
      stockByWarehouse: itemSupplier.item.stock.map(stock => ({
        warehouse: stock.warehouse,
        quantity: parseFloat(stock.quantity),
        reserved: parseFloat(stock.reserved),
        available: parseFloat(stock.quantity) - parseFloat(stock.reserved)
      }))
    }
  }));

  return {
    supplier,
    data: itemsWithStock,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function getItemSuppliers(itemId, tenantId) {
  // Verify item exists and belongs to tenant
  const item = await prisma.item.findFirst({
    where: { id: itemId, tenantId },
    select: { id: true, name: true, sku: true }
  });

  if (!item) {
    throw new ValidationError('Item not found or does not belong to tenant');
  }

  const itemSuppliers = await prisma.itemSupplier.findMany({
    where: { itemId },
    include: {
      supplier: {
        select: { id: true, name: true, contact: true, email: true, phone: true }
      }
    },
    orderBy: { cost: 'asc' } // Order by cost to show cheapest suppliers first
  });

  return {
    item,
    suppliers: itemSuppliers
  };
}

// Enhanced supplier analytics and performance functions
async function calculateSupplierMetrics(supplierId) {
  const [
    totalOrders,
    totalValue,
    averageOrderValue,
    onTimeDeliveryRate,
    totalItems,
    averageLeadTime,
    lastOrderDate
  ] = await Promise.all([
    prisma.purchaseOrder.count({
      where: { supplierId, status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED'] } }
    }),
    prisma.purchaseOrder.aggregate({
      where: { supplierId, status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED'] } },
      _sum: {
        items: {
          quantity: true,
          unitCost: true
        }
      }
    }),
    prisma.itemSupplier.count({ where: { supplierId } }),
    prisma.itemSupplier.aggregate({
      where: { supplierId },
      _avg: { leadTime: true }
    }),
    prisma.purchaseOrder.findFirst({
      where: { supplierId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    })
  ]);

  // Calculate on-time delivery rate
  const ordersWithExpectedDate = await prisma.purchaseOrder.findMany({
    where: { 
      supplierId, 
      expectedAt: { not: null },
      status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED'] }
    },
    select: { expectedAt: true, updatedAt: true }
  });

  const onTimeOrders = ordersWithExpectedDate.filter(order => 
    order.updatedAt <= order.expectedAt
  ).length;

  const deliveryRate = ordersWithExpectedDate.length > 0 
    ? (onTimeOrders / ordersWithExpectedDate.length) * 100 
    : 0;

  return {
    totalOrders,
    totalValue: totalValue._sum || 0,
    averageOrderValue: totalOrders > 0 ? (totalValue._sum || 0) / totalOrders : 0,
    onTimeDeliveryRate: Math.round(deliveryRate * 100) / 100,
    totalItems,
    averageLeadTime: Math.round((averageLeadTime._avg?.leadTime || 0) * 100) / 100,
    lastOrderDate: lastOrderDate?.createdAt || null,
    performanceScore: calculatePerformanceScore({
      deliveryRate,
      totalOrders,
      averageLeadTime: averageLeadTime._avg?.leadTime || 0
    })
  };
}

async function getSupplierPerformanceHistory(supplierId, months = 12) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      supplierId,
      createdAt: { gte: startDate, lte: endDate },
      status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED'] }
    },
    include: {
      items: true
    },
    orderBy: { createdAt: 'asc' }
  });

  // Group by month
  const monthlyData = {};
  purchaseOrders.forEach(po => {
    const monthKey = po.createdAt.toISOString().slice(0, 7); // YYYY-MM
    
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        month: monthKey,
        orders: 0,
        value: 0,
        onTimeDeliveries: 0,
        totalDeliveries: 0
      };
    }

    monthlyData[monthKey].orders++;
    monthlyData[monthKey].value += po.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.unitCost)), 0
    );

    // Check delivery performance
    if (po.expectedAt) {
      monthlyData[monthKey].totalDeliveries++;
      if (po.updatedAt <= po.expectedAt) {
        monthlyData[monthKey].onTimeDeliveries++;
      }
    }
  });

  // Convert to array and calculate metrics
  return Object.values(monthlyData).map(data => ({
    ...data,
    averageOrderValue: data.orders > 0 ? data.value / data.orders : 0,
    onTimeDeliveryRate: data.totalDeliveries > 0 
      ? (data.onTimeDeliveries / data.totalDeliveries) * 100 
      : 0
  }));
}

function calculatePerformanceScore({ deliveryRate, totalOrders, averageLeadTime }) {
  let score = 0;
  
  // Delivery performance (40% weight)
  score += (deliveryRate / 100) * 40;
  
  // Order volume (30% weight) - normalized to 0-30
  const volumeScore = Math.min(totalOrders * 2, 30);
  score += volumeScore;
  
  // Lead time performance (30% weight) - shorter is better
  const leadTimeScore = Math.max(0, 30 - (averageLeadTime / 7) * 10);
  score += leadTimeScore;
  
  return Math.round(score);
}

async function getSupplierAnalytics(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
    endDate = new Date(),
    groupBy = 'supplier'
  } = options;

  const suppliers = await prisma.supplier.findMany({
    where: { tenantId, isActive: true },
    include: {
      purchaseOrders: {
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED'] }
        },
        include: {
          items: true
        }
      },
      items: {
        include: {
          item: {
            select: { id: true, name: true, sku: true }
          }
        }
      }
    }
  });

  const analytics = suppliers.map(supplier => {
    const totalOrders = supplier.purchaseOrders.length;
    const totalValue = supplier.purchaseOrders.reduce((sum, po) => 
      sum + po.items.reduce((itemSum, item) => 
        itemSum + (parseFloat(item.quantity) * parseFloat(item.unitCost)), 0
      ), 0
    );

    const averageOrderValue = totalOrders > 0 ? totalValue / totalOrders : 0;
    const totalItems = supplier.items.length;

    return {
      supplier: {
        id: supplier.id,
        name: supplier.name,
        contact: supplier.contact,
        email: supplier.email,
        rating: supplier.rating
      },
      metrics: {
        totalOrders,
        totalValue,
        averageOrderValue,
        totalItems,
        orderFrequency: totalOrders / Math.max(1, Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000))),
        valuePerItem: totalItems > 0 ? totalValue / totalItems : 0
      }
    };
  });

  return {
    analytics,
    summary: {
      totalSuppliers: suppliers.length,
      totalOrders: analytics.reduce((sum, s) => sum + s.metrics.totalOrders, 0),
      totalValue: analytics.reduce((sum, s) => sum + s.metrics.totalValue, 0),
      averageSupplierValue: analytics.length > 0 
        ? analytics.reduce((sum, s) => sum + s.metrics.totalValue, 0) / analytics.length 
        : 0
    },
    period: { startDate, endDate }
  };
}

async function getTopSuppliers(tenantId, options = {}) {
  const { 
    limit = 10,
    sortBy = 'totalValue',
    period = 90
  } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  const suppliers = await prisma.supplier.findMany({
    where: { tenantId, isActive: true },
    include: {
      purchaseOrders: {
        where: {
          createdAt: { gte: startDate },
          status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED'] }
        },
        include: {
          items: true
        }
      }
    }
  });

  const supplierRankings = suppliers.map(supplier => {
    const totalOrders = supplier.purchaseOrders.length;
    const totalValue = supplier.purchaseOrders.reduce((sum, po) => 
      sum + po.items.reduce((itemSum, item) => 
        itemSum + (parseFloat(item.quantity) * parseFloat(item.unitCost)), 0
      ), 0
    );

    return {
      supplier: {
        id: supplier.id,
        name: supplier.name,
        contact: supplier.contact,
        email: supplier.email,
        rating: supplier.rating
      },
      totalOrders,
      totalValue,
      averageOrderValue: totalOrders > 0 ? totalValue / totalOrders : 0
    };
  });

  // Sort by specified criteria
  supplierRankings.sort((a, b) => {
    switch (sortBy) {
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

  return supplierRankings.slice(0, limit);
}

async function updateSupplierRating(supplierId, tenantId, rating, notes) {
  if (rating < 0 || rating > 5) {
    throw new ValidationError('Rating must be between 0 and 5');
  }

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, tenantId }
  });

  if (!supplier) {
    throw new NotFoundError('Supplier not found');
  }

  const updatedSupplier = await prisma.supplier.update({
    where: { id: supplierId },
    data: {
      rating,
      notes: notes || supplier.notes,
      updatedAt: new Date()
    }
  });

  return updatedSupplier;
}

async function getSupplierRiskAssessment(supplierId, tenantId) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, tenantId },
    include: {
      purchaseOrders: {
        include: {
          items: true
        }
      }
    }
  });

  if (!supplier) {
    throw new NotFoundError('Supplier not found');
  }

  const riskFactors = [];
  let riskScore = 0;

  // Check for recent orders
  const recentOrders = supplier.purchaseOrders.filter(po => 
    po.createdAt > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  );

  if (recentOrders.length === 0) {
    riskFactors.push({
      factor: 'No recent orders',
      severity: 'medium',
      description: 'No purchase orders in the last 30 days'
    });
    riskScore += 30;
  }

  // Check delivery performance
  const ordersWithExpectedDate = supplier.purchaseOrders.filter(po => po.expectedAt);
  const lateOrders = ordersWithExpectedDate.filter(po => po.updatedAt > po.expectedAt);
  
  if (ordersWithExpectedDate.length > 0) {
    const lateDeliveryRate = (lateOrders.length / ordersWithExpectedDate.length) * 100;
    if (lateDeliveryRate > 20) {
      riskFactors.push({
        factor: 'High late delivery rate',
        severity: lateDeliveryRate > 50 ? 'high' : 'medium',
        description: `${lateDeliveryRate.toFixed(1)}% of orders delivered late`
      });
      riskScore += lateDeliveryRate > 50 ? 40 : 20;
    }
  }

  // Check order volume consistency
  const monthlyOrders = {};
  supplier.purchaseOrders.forEach(po => {
    const month = po.createdAt.toISOString().slice(0, 7);
    monthlyOrders[month] = (monthlyOrders[month] || 0) + 1;
  });

  const orderCounts = Object.values(monthlyOrders);
  if (orderCounts.length > 1) {
    const variance = calculateVariance(orderCounts);
    if (variance > 2) {
      riskFactors.push({
        factor: 'Inconsistent order volume',
        severity: 'low',
        description: 'High variance in monthly order volume'
      });
      riskScore += 10;
    }
  }

  // Determine overall risk level
  let riskLevel = 'low';
  if (riskScore >= 60) riskLevel = 'high';
  else if (riskScore >= 30) riskLevel = 'medium';

  return {
    supplier: {
      id: supplier.id,
      name: supplier.name,
      rating: supplier.rating
    },
    riskAssessment: {
      riskLevel,
      riskScore,
      riskFactors,
      lastAssessment: new Date(),
      recommendations: generateRiskRecommendations(riskFactors)
    }
  };
}

function calculateVariance(values) {
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function generateRiskRecommendations(riskFactors) {
  const recommendations = [];
  
  riskFactors.forEach(factor => {
    switch (factor.factor) {
      case 'No recent orders':
        recommendations.push('Consider reaching out to supplier to understand current status');
        break;
      case 'High late delivery rate':
        recommendations.push('Review delivery terms and consider backup suppliers');
        break;
      case 'Inconsistent order volume':
        recommendations.push('Implement better demand forecasting and ordering patterns');
        break;
    }
  });

  return recommendations;
}

module.exports = {
  createSupplier,
  getSuppliers,
  getSupplierById,
  updateSupplier,
  deleteSupplier,
  addItemToSupplier,
  updateItemSupplier,
  removeItemFromSupplier,
  getSupplierItems,
  getItemSuppliers,
  calculateSupplierMetrics,
  getSupplierPerformanceHistory,
  getSupplierAnalytics,
  getTopSuppliers,
  updateSupplierRating,
  getSupplierRiskAssessment
};
