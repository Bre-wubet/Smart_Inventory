const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');

async function getDashboardMetrics(tenantId, period) {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - (period * 24 * 60 * 60 * 1000));

  const [
    totalItems,
    totalWarehouses,
    totalSuppliers,
    totalUsers,
    lowStockItems,
    recentTransactions,
    recentPurchaseOrders,
    recentSalesOrders,
    totalInventoryValue,
    totalSales,
    totalPurchases
  ] = await Promise.all([
    prisma.item.count({ where: { tenantId, isActive: true } }),
    prisma.warehouse.count({ where: { tenantId } }),
    prisma.supplier.count({ where: { tenantId } }),
    prisma.user.count({ where: { tenantId, isActive: true } }),
    prisma.stock.count({
      where: {
        item: { tenantId },
        quantity: { lte: 10 } // Low stock threshold
      }
    }),
    prisma.inventoryTransaction.count({
      where: {
        item: { tenantId },
        createdAt: { gte: startDate }
      }
    }),
    prisma.purchaseOrder.count({
      where: {
        tenantId,
        createdAt: { gte: startDate }
      }
    }),
    prisma.saleOrder.count({
      where: {
        tenantId,
        createdAt: { gte: startDate }
      }
    }),
    prisma.stock.aggregate({
      where: {
        item: { tenantId }
      },
      _sum: {
        quantity: true
      }
    }),
    prisma.inventoryTransaction.aggregate({
      where: {
        item: { tenantId },
        type: 'SALE',
        createdAt: { gte: startDate }
      },
      _sum: {
        quantity: true
      }
    }),
    prisma.inventoryTransaction.aggregate({
      where: {
        item: { tenantId },
        type: 'PURCHASE',
        createdAt: { gte: startDate }
      },
      _sum: {
        quantity: true
      }
    })
  ]);

  return {
    overview: {
      totalItems,
      totalWarehouses,
      totalSuppliers,
      totalUsers,
      lowStockItems
    },
    activity: {
      recentTransactions,
      recentPurchaseOrders,
      recentSalesOrders
    },
    financial: {
      totalInventoryValue: totalInventoryValue._sum.quantity || 0,
      totalSales: totalSales._sum.quantity || 0,
      totalPurchases: totalPurchases._sum.quantity || 0
    },
    period: { startDate, endDate, days: period }
  };
}

async function getInventoryAnalytics({ tenantId, startDate, endDate, warehouseId, itemId }) {
  const where = {
    item: { tenantId },
    createdAt: { gte: startDate, lte: endDate },
    ...(warehouseId && { warehouseId }),
    ...(itemId && { itemId })
  };

  const [transactions, stockLevels, movementsByType] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where,
      include: {
        item: {
          select: { id: true, name: true, sku: true, unit: true }
        },
        warehouse: {
          select: { id: true, name: true, code: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.stock.findMany({
      where: {
        item: { tenantId },
        ...(warehouseId && { warehouseId }),
        ...(itemId && { itemId })
      },
      include: {
        item: {
          select: { id: true, name: true, sku: true, unit: true }
        },
        warehouse: {
          select: { id: true, name: true, code: true }
        }
      }
    }),
    prisma.inventoryTransaction.groupBy({
      by: ['type'],
      where,
      _sum: { quantity: true },
      _count: { type: true }
    })
  ]);

  // Calculate analytics
  const totalMovements = transactions.length;
  const totalQuantity = transactions.reduce((sum, t) => sum + parseFloat(t.quantity), 0);
  const averageMovement = totalMovements > 0 ? totalQuantity / totalMovements : 0;

  const movementsByItem = transactions.reduce((acc, transaction) => {
    const itemId = transaction.itemId;
    if (!acc[itemId]) {
      acc[itemId] = {
        item: transaction.item,
        totalQuantity: 0,
        movements: 0
      };
    }
    acc[itemId].totalQuantity += parseFloat(transaction.quantity);
    acc[itemId].movements += 1;
    return acc;
  }, {});

  return {
    summary: {
      totalMovements,
      totalQuantity,
      averageMovement,
      movementsByType: movementsByType.map(m => ({
        type: m.type,
        totalQuantity: m._sum.quantity || 0,
        count: m._count.type
      }))
    },
    stockLevels,
    movementsByItem: Object.values(movementsByItem),
    period: { startDate, endDate }
  };
}

async function getSalesAnalytics({ tenantId, startDate, endDate, customer, itemId, groupBy }) {
  const where = {
    item: { tenantId },
    type: 'SALE',
    createdAt: { gte: startDate, lte: endDate },
    ...(customer && { saleOrder: { customer: { contains: customer, mode: 'insensitive' } } }),
    ...(itemId && { itemId })
  };

  const transactions = await prisma.inventoryTransaction.findMany({
    where,
    include: {
      item: {
        select: { id: true, name: true, sku: true, unit: true, price: true }
      },
      saleOrder: {
        select: { id: true, customer: true, reference: true }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  // Group by time period
  const groupedData = {};
  transactions.forEach(transaction => {
    let groupKey;
    const date = new Date(transaction.createdAt);
    
    switch (groupBy) {
      case 'hour':
        groupKey = date.toISOString().slice(0, 13); // YYYY-MM-DDTHH
        break;
      case 'day':
        groupKey = date.toISOString().slice(0, 10); // YYYY-MM-DD
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        groupKey = weekStart.toISOString().slice(0, 10);
        break;
      case 'month':
        groupKey = date.toISOString().slice(0, 7); // YYYY-MM
        break;
      default:
        groupKey = date.toISOString().slice(0, 10);
    }

    if (!groupedData[groupKey]) {
      groupedData[groupKey] = {
        period: groupKey,
        totalQuantity: 0,
        totalRevenue: 0,
        totalOrders: 0,
        uniqueCustomers: new Set(),
        items: {}
      };
    }

    const quantity = parseFloat(transaction.quantity);
    const revenue = quantity * parseFloat(transaction.item.price || 0);

    groupedData[groupKey].totalQuantity += quantity;
    groupedData[groupKey].totalRevenue += revenue;
    groupedData[groupKey].totalOrders += 1;
    groupedData[groupKey].uniqueCustomers.add(transaction.saleOrder?.customer || 'Unknown');

    // Track items
    const itemId = transaction.itemId;
    if (!groupedData[groupKey].items[itemId]) {
      groupedData[groupKey].items[itemId] = {
        item: transaction.item,
        quantity: 0,
        revenue: 0
      };
    }
    groupedData[groupKey].items[itemId].quantity += quantity;
    groupedData[groupKey].items[itemId].revenue += revenue;
  });

  const analytics = Object.values(groupedData).map(group => ({
    ...group,
    uniqueCustomers: group.uniqueCustomers.size,
    averageOrderValue: group.totalOrders > 0 ? group.totalRevenue / group.totalOrders : 0,
    items: Object.values(group.items)
  }));

  const summary = {
    totalRevenue: analytics.reduce((sum, group) => sum + group.totalRevenue, 0),
    totalQuantity: analytics.reduce((sum, group) => sum + group.totalQuantity, 0),
    totalOrders: analytics.reduce((sum, group) => sum + group.totalOrders, 0),
    averageOrderValue: analytics.length > 0 ? 
      analytics.reduce((sum, group) => sum + group.totalRevenue, 0) / 
      analytics.reduce((sum, group) => sum + group.totalOrders, 0) : 0
  };

  return {
    summary,
    analytics,
    groupBy,
    period: { startDate, endDate }
  };
}

async function getPurchaseAnalytics({ tenantId, startDate, endDate, supplierId, itemId, groupBy }) {
  const where = {
    item: { tenantId },
    type: 'PURCHASE',
    createdAt: { gte: startDate, lte: endDate },
    ...(supplierId && { purchaseOrder: { supplierId } }),
    ...(itemId && { itemId })
  };

  const transactions = await prisma.inventoryTransaction.findMany({
    where,
    include: {
      item: {
        select: { id: true, name: true, sku: true, unit: true }
      },
      purchaseOrder: {
        select: { id: true, supplierId: true, reference: true },
        include: {
          supplier: {
            select: { id: true, name: true }
          }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  // Group by time period
  const groupedData = {};
  transactions.forEach(transaction => {
    let groupKey;
    const date = new Date(transaction.createdAt);
    
    switch (groupBy) {
      case 'hour':
        groupKey = date.toISOString().slice(0, 13);
        break;
      case 'day':
        groupKey = date.toISOString().slice(0, 10);
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        groupKey = weekStart.toISOString().slice(0, 10);
        break;
      case 'month':
        groupKey = date.toISOString().slice(0, 7);
        break;
      default:
        groupKey = date.toISOString().slice(0, 10);
    }

    if (!groupedData[groupKey]) {
      groupedData[groupKey] = {
        period: groupKey,
        totalQuantity: 0,
        totalCost: 0,
        totalOrders: 0,
        uniqueSuppliers: new Set(),
        items: {}
      };
    }

    const quantity = parseFloat(transaction.quantity);
    const cost = quantity * parseFloat(transaction.costPerUnit || 0);

    groupedData[groupKey].totalQuantity += quantity;
    groupedData[groupKey].totalCost += cost;
    groupedData[groupKey].totalOrders += 1;
    groupedData[groupKey].uniqueSuppliers.add(transaction.purchaseOrder?.supplier?.name || 'Unknown');

    // Track items
    const itemId = transaction.itemId;
    if (!groupedData[groupKey].items[itemId]) {
      groupedData[groupKey].items[itemId] = {
        item: transaction.item,
        quantity: 0,
        cost: 0
      };
    }
    groupedData[groupKey].items[itemId].quantity += quantity;
    groupedData[groupKey].items[itemId].cost += cost;
  });

  const analytics = Object.values(groupedData).map(group => ({
    ...group,
    uniqueSuppliers: group.uniqueSuppliers.size,
    averageOrderValue: group.totalOrders > 0 ? group.totalCost / group.totalOrders : 0,
    items: Object.values(group.items)
  }));

  const summary = {
    totalCost: analytics.reduce((sum, group) => sum + group.totalCost, 0),
    totalQuantity: analytics.reduce((sum, group) => sum + group.totalQuantity, 0),
    totalOrders: analytics.reduce((sum, group) => sum + group.totalOrders, 0),
    averageOrderValue: analytics.length > 0 ? 
      analytics.reduce((sum, group) => sum + group.totalCost, 0) / 
      analytics.reduce((sum, group) => sum + group.totalOrders, 0) : 0
  };

  return {
    summary,
    analytics,
    groupBy,
    period: { startDate, endDate }
  };
}

async function getStockMovementAnalytics({ tenantId, startDate, endDate, warehouseId, itemId, type }) {
  const where = {
    item: { tenantId },
    createdAt: { gte: startDate, lte: endDate },
    ...(warehouseId && { warehouseId }),
    ...(itemId && { itemId }),
    ...(type && { type })
  };

  const transactions = await prisma.inventoryTransaction.findMany({
    where,
    include: {
      item: {
        select: { id: true, name: true, sku: true, unit: true }
      },
      warehouse: {
        select: { id: true, name: true, code: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Group by movement type
  const movementsByType = transactions.reduce((acc, transaction) => {
    if (!acc[transaction.type]) {
      acc[transaction.type] = {
        type: transaction.type,
        totalQuantity: 0,
        count: 0,
        items: {}
      };
    }
    
    const quantity = parseFloat(transaction.quantity);
    acc[transaction.type].totalQuantity += quantity;
    acc[transaction.type].count += 1;

    // Track items
    const itemId = transaction.itemId;
    if (!acc[transaction.type].items[itemId]) {
      acc[transaction.type].items[itemId] = {
        item: transaction.item,
        quantity: 0,
        count: 0
      };
    }
    acc[transaction.type].items[itemId].quantity += quantity;
    acc[transaction.type].items[itemId].count += 1;

    return acc;
  }, {});

  // Group by warehouse
  const movementsByWarehouse = transactions.reduce((acc, transaction) => {
    const warehouseId = transaction.warehouseId;
    if (!acc[warehouseId]) {
      acc[warehouseId] = {
        warehouse: transaction.warehouse,
        totalQuantity: 0,
        count: 0,
        types: {}
      };
    }
    
    const quantity = parseFloat(transaction.quantity);
    acc[warehouseId].totalQuantity += quantity;
    acc[warehouseId].count += 1;

    // Track movement types
    if (!acc[warehouseId].types[transaction.type]) {
      acc[warehouseId].types[transaction.type] = { quantity: 0, count: 0 };
    }
    acc[warehouseId].types[transaction.type].quantity += quantity;
    acc[warehouseId].types[transaction.type].count += 1;

    return acc;
  }, {});

  return {
    summary: {
      totalMovements: transactions.length,
      totalQuantity: transactions.reduce((sum, t) => sum + parseFloat(t.quantity), 0),
      movementsByType: Object.values(movementsByType).map(m => ({
        ...m,
        items: Object.values(m.items)
      })),
      movementsByWarehouse: Object.values(movementsByWarehouse)
    },
    period: { startDate, endDate }
  };
}

async function getTopSellingItems({ tenantId, startDate, endDate, limit, warehouseId }) {
  const where = {
    item: { tenantId },
    type: 'SALE',
    createdAt: { gte: startDate, lte: endDate },
    ...(warehouseId && { warehouseId })
  };

  const transactions = await prisma.inventoryTransaction.findMany({
    where,
    include: {
      item: {
        select: { id: true, name: true, sku: true, unit: true, price: true }
      }
    }
  });

  // Group by item
  const itemSales = transactions.reduce((acc, transaction) => {
    const itemId = transaction.itemId;
    if (!acc[itemId]) {
      acc[itemId] = {
        item: transaction.item,
        totalQuantity: 0,
        totalRevenue: 0,
        sales: 0
      };
    }
    
    const quantity = parseFloat(transaction.quantity);
    const revenue = quantity * parseFloat(transaction.item.price || 0);
    
    acc[itemId].totalQuantity += quantity;
    acc[itemId].totalRevenue += revenue;
    acc[itemId].sales += 1;

    return acc;
  }, {});

  const topItems = Object.values(itemSales)
    .sort((a, b) => b.totalQuantity - a.totalQuantity)
    .slice(0, limit);

  return {
    items: topItems,
    period: { startDate, endDate },
    limit
  };
}

async function getSlowMovingItems({ tenantId, startDate, endDate, limit, warehouseId }) {
  const where = {
    item: { tenantId },
    type: 'SALE',
    createdAt: { gte: startDate, lte: endDate },
    ...(warehouseId && { warehouseId })
  };

  const transactions = await prisma.inventoryTransaction.findMany({
    where,
    include: {
      item: {
        select: { id: true, name: true, sku: true, unit: true, price: true }
      }
    }
  });

  // Get all items to identify slow movers
  const allItems = await prisma.item.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, sku: true, unit: true, price: true }
  });

  // Group sales by item
  const itemSales = transactions.reduce((acc, transaction) => {
    const itemId = transaction.itemId;
    if (!acc[itemId]) {
      acc[itemId] = {
        totalQuantity: 0,
        totalRevenue: 0,
        sales: 0
      };
    }
    
    const quantity = parseFloat(transaction.quantity);
    const revenue = quantity * parseFloat(transaction.item.price || 0);
    
    acc[itemId].totalQuantity += quantity;
    acc[itemId].totalRevenue += revenue;
    acc[itemId].sales += 1;

    return acc;
  }, {});

  // Find slow moving items (items with no sales or very low sales)
  const slowMovingItems = allItems
    .map(item => ({
      item,
      totalQuantity: itemSales[item.id]?.totalQuantity || 0,
      totalRevenue: itemSales[item.id]?.totalRevenue || 0,
      sales: itemSales[item.id]?.sales || 0
    }))
    .sort((a, b) => a.totalQuantity - b.totalQuantity)
    .slice(0, limit);

  return {
    items: slowMovingItems,
    period: { startDate, endDate },
    limit
  };
}

async function getSupplierPerformance({ tenantId, startDate, endDate, limit }) {
  const where = {
    item: { tenantId },
    type: 'PURCHASE',
    createdAt: { gte: startDate, lte: endDate }
  };

  const transactions = await prisma.inventoryTransaction.findMany({
    where,
    include: {
      purchaseOrder: {
        select: { supplierId: true },
        include: {
          supplier: {
            select: { id: true, name: true, contact: true, email: true }
          }
        }
      }
    }
  });

  // Group by supplier
  const supplierPerformance = transactions.reduce((acc, transaction) => {
    const supplierId = transaction.purchaseOrder?.supplierId;
    if (!supplierId) return acc;

    if (!acc[supplierId]) {
      acc[supplierId] = {
        supplier: transaction.purchaseOrder.supplier,
        totalQuantity: 0,
        totalCost: 0,
        orders: 0,
        items: new Set()
      };
    }
    
    const quantity = parseFloat(transaction.quantity);
    const cost = quantity * parseFloat(transaction.costPerUnit || 0);
    
    acc[supplierId].totalQuantity += quantity;
    acc[supplierId].totalCost += cost;
    acc[supplierId].orders += 1;
    acc[supplierId].items.add(transaction.itemId);

    return acc;
  }, {});

  const performance = Object.values(supplierPerformance)
    .map(supplier => ({
      ...supplier,
      uniqueItems: supplier.items.size,
      averageOrderValue: supplier.orders > 0 ? supplier.totalCost / supplier.orders : 0
    }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, limit);

  return {
    suppliers: performance,
    period: { startDate, endDate },
    limit
  };
}

async function getCustomerAnalytics({ tenantId, startDate, endDate, limit }) {
  const where = {
    item: { tenantId },
    type: 'SALE',
    createdAt: { gte: startDate, lte: endDate }
  };

  const transactions = await prisma.inventoryTransaction.findMany({
    where,
    include: {
      saleOrder: {
        select: { customer: true }
      },
      item: {
        select: { id: true, name: true, sku: true, price: true }
      }
    }
  });

  // Group by customer
  const customerAnalytics = transactions.reduce((acc, transaction) => {
    const customer = transaction.saleOrder?.customer || 'Unknown';
    
    if (!acc[customer]) {
      acc[customer] = {
        customer,
        totalQuantity: 0,
        totalRevenue: 0,
        orders: 0,
        items: new Set()
      };
    }
    
    const quantity = parseFloat(transaction.quantity);
    const revenue = quantity * parseFloat(transaction.item.price || 0);
    
    acc[customer].totalQuantity += quantity;
    acc[customer].totalRevenue += revenue;
    acc[customer].orders += 1;
    acc[customer].items.add(transaction.itemId);

    return acc;
  }, {});

  const analytics = Object.values(customerAnalytics)
    .map(customer => ({
      ...customer,
      uniqueItems: customer.items.size,
      averageOrderValue: customer.orders > 0 ? customer.totalRevenue / customer.orders : 0
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, limit);

  return {
    customers: analytics,
    period: { startDate, endDate },
    limit
  };
}

async function getWarehouseAnalytics({ tenantId, startDate, endDate, warehouseId }) {
  const where = {
    item: { tenantId },
    createdAt: { gte: startDate, lte: endDate },
    ...(warehouseId && { warehouseId })
  };

  const [transactions, warehouses] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where,
      include: {
        warehouse: {
          select: { id: true, name: true, code: true }
        },
        item: {
          select: { id: true, name: true, sku: true, unit: true }
        }
      }
    }),
    prisma.warehouse.findMany({
      where: { tenantId },
      include: {
        stocks: {
          include: {
            item: {
              select: { id: true, name: true, sku: true, unit: true, price: true }
            }
          }
        }
      }
    })
  ]);

  // Group by warehouse
  const warehouseAnalytics = warehouses.map(warehouse => {
    const warehouseTransactions = transactions.filter(t => t.warehouseId === warehouse.id);
    
    const movementsByType = warehouseTransactions.reduce((acc, transaction) => {
      if (!acc[transaction.type]) {
        acc[transaction.type] = { quantity: 0, count: 0 };
      }
      acc[transaction.type].quantity += parseFloat(transaction.quantity);
      acc[transaction.type].count += 1;
      return acc;
    }, {});

    const totalStockValue = warehouse.stocks.reduce((sum, stock) => {
      return sum + (parseFloat(stock.quantity) * parseFloat(stock.item.price || 0));
    }, 0);

    return {
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        code: warehouse.code
      },
      totalTransactions: warehouseTransactions.length,
      movementsByType,
      totalStockValue,
      stockItems: warehouse.stocks.length
    };
  });

  return {
    warehouses: warehouseAnalytics,
    period: { startDate, endDate }
  };
}

async function getProfitLossAnalysis({ tenantId, startDate, endDate, groupBy }) {
  const where = {
    item: { tenantId },
    createdAt: { gte: startDate, lte: endDate }
  };

  const [salesTransactions, purchaseTransactions] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where: { ...where, type: 'SALE' },
      include: {
        item: {
          select: { id: true, name: true, sku: true, price: true }
        }
      }
    }),
    prisma.inventoryTransaction.findMany({
      where: { ...where, type: 'PURCHASE' },
      include: {
        item: {
          select: { id: true, name: true, sku: true }
        }
      }
    })
  ]);

  // Group by time period
  const groupedData = {};
  
  // Process sales
  salesTransactions.forEach(transaction => {
    let groupKey;
    const date = new Date(transaction.createdAt);
    
    switch (groupBy) {
      case 'day':
        groupKey = date.toISOString().slice(0, 10);
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        groupKey = weekStart.toISOString().slice(0, 10);
        break;
      case 'month':
        groupKey = date.toISOString().slice(0, 7);
        break;
      default:
        groupKey = date.toISOString().slice(0, 10);
    }

    if (!groupedData[groupKey]) {
      groupedData[groupKey] = {
        period: groupKey,
        revenue: 0,
        cost: 0,
        profit: 0
      };
    }

    const quantity = parseFloat(transaction.quantity);
    const revenue = quantity * parseFloat(transaction.item.price || 0);
    
    groupedData[groupKey].revenue += revenue;
  });

  // Process purchases
  purchaseTransactions.forEach(transaction => {
    let groupKey;
    const date = new Date(transaction.createdAt);
    
    switch (groupBy) {
      case 'day':
        groupKey = date.toISOString().slice(0, 10);
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        groupKey = weekStart.toISOString().slice(0, 10);
        break;
      case 'month':
        groupKey = date.toISOString().slice(0, 7);
        break;
      default:
        groupKey = date.toISOString().slice(0, 10);
    }

    if (!groupedData[groupKey]) {
      groupedData[groupKey] = {
        period: groupKey,
        revenue: 0,
        cost: 0,
        profit: 0
      };
    }

    const quantity = parseFloat(transaction.quantity);
    const cost = quantity * parseFloat(transaction.costPerUnit || 0);
    
    groupedData[groupKey].cost += cost;
  });

  // Calculate profit for each period
  const analysis = Object.values(groupedData).map(group => ({
    ...group,
    profit: group.revenue - group.cost,
    profitMargin: group.revenue > 0 ? ((group.revenue - group.cost) / group.revenue) * 100 : 0
  }));

  const summary = {
    totalRevenue: analysis.reduce((sum, group) => sum + group.revenue, 0),
    totalCost: analysis.reduce((sum, group) => sum + group.cost, 0),
    totalProfit: analysis.reduce((sum, group) => sum + group.profit, 0),
    averageProfitMargin: analysis.length > 0 ? 
      analysis.reduce((sum, group) => sum + group.profitMargin, 0) / analysis.length : 0
  };

  return {
    summary,
    analysis,
    groupBy,
    period: { startDate, endDate }
  };
}

async function getTrendAnalysis({ tenantId, metric, period, groupBy }) {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - (period * 24 * 60 * 60 * 1000));

  // This is a simplified implementation. In production, you'd want more sophisticated trend analysis
  const where = {
    item: { tenantId },
    createdAt: { gte: startDate, lte: endDate }
  };

  let transactions;
  switch (metric) {
    case 'sales':
      transactions = await prisma.inventoryTransaction.findMany({
        where: { ...where, type: 'SALE' },
        orderBy: { createdAt: 'asc' }
      });
      break;
    case 'purchases':
      transactions = await prisma.inventoryTransaction.findMany({
        where: { ...where, type: 'PURCHASE' },
        orderBy: { createdAt: 'asc' }
      });
      break;
    default:
      transactions = await prisma.inventoryTransaction.findMany({
        where,
        orderBy: { createdAt: 'asc' }
      });
  }

  // Group by time period
  const groupedData = {};
  transactions.forEach(transaction => {
    let groupKey;
    const date = new Date(transaction.createdAt);
    
    switch (groupBy) {
      case 'hour':
        groupKey = date.toISOString().slice(0, 13);
        break;
      case 'day':
        groupKey = date.toISOString().slice(0, 10);
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        groupKey = weekStart.toISOString().slice(0, 10);
        break;
      case 'month':
        groupKey = date.toISOString().slice(0, 7);
        break;
      default:
        groupKey = date.toISOString().slice(0, 10);
    }

    if (!groupedData[groupKey]) {
      groupedData[groupKey] = {
        period: groupKey,
        value: 0,
        count: 0
      };
    }

    groupedData[groupKey].value += parseFloat(transaction.quantity);
    groupedData[groupKey].count += 1;
  });

  const trends = Object.values(groupedData).sort((a, b) => 
    new Date(a.period) - new Date(b.period)
  );

  // Calculate trend direction
  const firstValue = trends[0]?.value || 0;
  const lastValue = trends[trends.length - 1]?.value || 0;
  const trendDirection = lastValue > firstValue ? 'increasing' : lastValue < firstValue ? 'decreasing' : 'stable';
  const trendPercentage = firstValue > 0 ? ((lastValue - firstValue) / firstValue) * 100 : 0;

  return {
    metric,
    trends,
    summary: {
      trendDirection,
      trendPercentage,
      firstValue,
      lastValue,
      period: { startDate, endDate, days: period }
    }
  };
}

async function generateCustomReport({ tenantId, reportType, parameters }) {
  const reportTypes = {
    'inventory_summary': () => getInventoryAnalytics({ tenantId, ...parameters }),
    'sales_summary': () => getSalesAnalytics({ tenantId, ...parameters }),
    'purchase_summary': () => getPurchaseAnalytics({ tenantId, ...parameters }),
    'profit_loss': () => getProfitLossAnalysis({ tenantId, ...parameters }),
    'top_items': () => getTopSellingItems({ tenantId, ...parameters }),
    'supplier_performance': () => getSupplierPerformance({ tenantId, ...parameters })
  };

  if (!reportTypes[reportType]) {
    throw new ValidationError('Invalid report type');
  }

  const reportData = await reportTypes[reportType]();
  
  return {
    reportType,
    parameters,
    data: reportData,
    generatedAt: new Date(),
    generatedBy: tenantId
  };
}

async function getAnalyticsLogs({ tenantId, type, limit, offset }) {
  const where = {
    tenantId,
    ...(type && { type })
  };

  const [logs, total] = await Promise.all([
    prisma.analyticsLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    }),
    prisma.analyticsLog.count({ where })
  ]);

  return {
    logs,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    }
  };
}

async function logAnalyticsEvent({ tenantId, eventType, eventData, userId }) {
  const log = await prisma.analyticsLog.create({
    data: {
      tenantId,
      type: eventType,
      data: eventData,
      userId
    }
  });

  return log;
}

module.exports = {
  getDashboardMetrics,
  getInventoryAnalytics,
  getSalesAnalytics,
  getPurchaseAnalytics,
  getStockMovementAnalytics,
  getTopSellingItems,
  getSlowMovingItems,
  getSupplierPerformance,
  getCustomerAnalytics,
  getWarehouseAnalytics,
  getProfitLossAnalysis,
  getTrendAnalysis,
  generateCustomReport,
  getAnalyticsLogs,
  logAnalyticsEvent
};
