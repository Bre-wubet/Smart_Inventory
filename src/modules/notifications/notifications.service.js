const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { AlertType } = require('../../core/constants');
const { isLowStock, isOverstocked } = require('../../core/utils/stockFormulas');

async function getAlerts({ tenantId, type, status, limit, offset }) {
  const where = {
    tenantId,
    ...(type && { type }),
    ...(status && { status })
  };

  const [alerts, total] = await Promise.all([
    prisma.alert.findMany({
      where,
      include: {
        item: {
          select: { id: true, name: true, sku: true, unit: true }
        },
        warehouse: {
          select: { id: true, name: true, code: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    }),
    prisma.alert.count({ where })
  ]);

  return {
    alerts,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    }
  };
}

async function getAlertById(alertId, tenantId) {
  const alert = await prisma.alert.findFirst({
    where: { id: alertId, tenantId },
    include: {
      item: {
        select: { id: true, name: true, sku: true, unit: true }
      },
      warehouse: {
        select: { id: true, name: true, code: true }
      }
    }
  });

  if (!alert) {
    throw new NotFoundError('Alert not found');
  }

  return alert;
}

async function markAlertAsRead(alertId, tenantId) {
  const alert = await prisma.alert.updateMany({
    where: { id: alertId, tenantId },
    data: { status: 'READ' }
  });

  if (alert.count === 0) {
    throw new NotFoundError('Alert not found');
  }

  return await getAlertById(alertId, tenantId);
}

async function markAllAlertsAsRead(tenantId) {
  const result = await prisma.alert.updateMany({
    where: { tenantId, status: 'UNREAD' },
    data: { status: 'READ' }
  });

  return {
    updatedCount: result.count,
    message: `${result.count} alerts marked as read`
  };
}

async function deleteAlert(alertId, tenantId) {
  const result = await prisma.alert.deleteMany({
    where: { id: alertId, tenantId }
  });

  if (result.count === 0) {
    throw new NotFoundError('Alert not found');
  }
}

async function getAlertSettings(tenantId) {
  // For now, return default settings. In production, store these in database
  return {
    lowStockThreshold: 0.1, // 10% of average stock
    overstockThreshold: 3, // 3x average stock
    expiryDaysAhead: 30,
    reorderPointMultiplier: 1.5,
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
    alertFrequency: 'daily' // daily, weekly, immediate
  };
}

async function updateAlertSettings(tenantId, settings) {
  // In production, store these settings in database
  // For now, just return the updated settings
  return {
    ...settings,
    updatedAt: new Date()
  };
}

async function createCustomAlert(tenantId, alertData) {
  const { type, title, message, itemId, warehouseId, priority = 'MEDIUM' } = alertData;

  if (!type || !title || !message) {
    throw new ValidationError('type, title, and message are required');
  }

  const alert = await prisma.alert.create({
    data: {
      tenantId,
      type,
      title,
      message,
      priority,
      itemId,
      warehouseId,
      status: 'UNREAD'
    },
    include: {
      item: {
        select: { id: true, name: true, sku: true, unit: true }
      },
      warehouse: {
        select: { id: true, name: true, code: true }
      }
    }
  });

  return alert;
}

async function getLowStockAlerts({ tenantId, warehouseId, threshold }) {
  const where = {
    item: { tenantId },
    ...(warehouseId && { warehouseId })
  };

  const stock = await prisma.stock.findMany({
    where,
    include: {
      item: {
        select: { id: true, name: true, sku: true, unit: true, reorderPoint: true }
      },
      warehouse: {
        select: { id: true, name: true, code: true }
      }
    }
  });

  const lowStockItems = stock.filter(stockItem => {
    const quantity = parseFloat(stockItem.quantity);
    const reorderPoint = parseFloat(stockItem.item.reorderPoint || 0);
    const thresholdValue = threshold || (reorderPoint * 0.5); // Default to 50% of reorder point
    
    return quantity <= thresholdValue;
  });

  // Create alerts for low stock items
  const alerts = await Promise.all(
    lowStockItems.map(async (stockItem) => {
      const existingAlert = await prisma.alert.findFirst({
        where: {
          tenantId,
          type: 'LOW_STOCK',
          itemId: stockItem.itemId,
          warehouseId: stockItem.warehouseId,
          status: 'UNREAD'
        }
      });

      if (existingAlert) {
        return existingAlert;
      }

      return await prisma.alert.create({
        data: {
          tenantId,
          type: 'LOW_STOCK',
          title: 'Low Stock Alert',
          message: `${stockItem.item.name} (${stockItem.item.sku}) is running low in ${stockItem.warehouse.name}. Current stock: ${stockItem.quantity} ${stockItem.item.unit}`,
          priority: 'HIGH',
          itemId: stockItem.itemId,
          warehouseId: stockItem.warehouseId,
          status: 'UNREAD'
        },
        include: {
          item: {
            select: { id: true, name: true, sku: true, unit: true }
          },
          warehouse: {
            select: { id: true, name: true, code: true }
          }
        }
      });
    })
  );

  return alerts;
}

async function getExpiryAlerts({ tenantId, daysAhead }) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const stock = await prisma.stock.findMany({
    where: {
      item: { tenantId },
      expiryDate: {
        lte: futureDate,
        gte: new Date() // Not expired yet
      }
    },
    include: {
      item: {
        select: { id: true, name: true, sku: true, unit: true }
      },
      warehouse: {
        select: { id: true, name: true, code: true }
      }
    }
  });

  const alerts = await Promise.all(
    stock.map(async (stockItem) => {
      const existingAlert = await prisma.alert.findFirst({
        where: {
          tenantId,
          type: 'EXPIRY',
          itemId: stockItem.itemId,
          warehouseId: stockItem.warehouseId,
          status: 'UNREAD'
        }
      });

      if (existingAlert) {
        return existingAlert;
      }

      const daysUntilExpiry = Math.ceil((stockItem.expiryDate - new Date()) / (1000 * 60 * 60 * 24));
      
      return await prisma.alert.create({
        data: {
          tenantId,
          type: 'EXPIRY',
          title: 'Expiry Alert',
          message: `${stockItem.item.name} (${stockItem.item.sku}) expires in ${daysUntilExpiry} days in ${stockItem.warehouse.name}`,
          priority: daysUntilExpiry <= 7 ? 'HIGH' : 'MEDIUM',
          itemId: stockItem.itemId,
          warehouseId: stockItem.warehouseId,
          status: 'UNREAD'
        },
        include: {
          item: {
            select: { id: true, name: true, sku: true, unit: true }
          },
          warehouse: {
            select: { id: true, name: true, code: true }
          }
        }
      });
    })
  );

  return alerts;
}

async function getReorderPointAlerts({ tenantId, warehouseId }) {
  const where = {
    item: { tenantId },
    ...(warehouseId && { warehouseId })
  };

  const stock = await prisma.stock.findMany({
    where,
    include: {
      item: {
        select: { id: true, name: true, sku: true, unit: true, reorderPoint: true }
      },
      warehouse: {
        select: { id: true, name: true, code: true }
      }
    }
  });

  const reorderItems = stock.filter(stockItem => {
    const quantity = parseFloat(stockItem.quantity);
    const reorderPoint = parseFloat(stockItem.item.reorderPoint || 0);
    
    return quantity <= reorderPoint && reorderPoint > 0;
  });

  const alerts = await Promise.all(
    reorderItems.map(async (stockItem) => {
      const existingAlert = await prisma.alert.findFirst({
        where: {
          tenantId,
          type: 'REORDER_POINT',
          itemId: stockItem.itemId,
          warehouseId: stockItem.warehouseId,
          status: 'UNREAD'
        }
      });

      if (existingAlert) {
        return existingAlert;
      }

      return await prisma.alert.create({
        data: {
          tenantId,
          type: 'REORDER_POINT',
          title: 'Reorder Point Alert',
          message: `${stockItem.item.name} (${stockItem.item.sku}) has reached reorder point in ${stockItem.warehouse.name}. Current stock: ${stockItem.quantity} ${stockItem.item.unit}`,
          priority: 'HIGH',
          itemId: stockItem.itemId,
          warehouseId: stockItem.warehouseId,
          status: 'UNREAD'
        },
        include: {
          item: {
            select: { id: true, name: true, sku: true, unit: true }
          },
          warehouse: {
            select: { id: true, name: true, code: true }
          }
        }
      });
    })
  );

  return alerts;
}

async function getOverstockAlerts({ tenantId, warehouseId, threshold }) {
  const where = {
    item: { tenantId },
    ...(warehouseId && { warehouseId })
  };

  const stock = await prisma.stock.findMany({
    where,
    include: {
      item: {
        select: { id: true, name: true, sku: true, unit: true }
      },
      warehouse: {
        select: { id: true, name: true, code: true }
      }
    }
  });

  // Calculate average stock for each item across all warehouses
  const itemAverages = {};
  stock.forEach(stockItem => {
    if (!itemAverages[stockItem.itemId]) {
      itemAverages[stockItem.itemId] = { total: 0, count: 0 };
    }
    itemAverages[stockItem.itemId].total += parseFloat(stockItem.quantity);
    itemAverages[stockItem.itemId].count += 1;
  });

  const overstockItems = stock.filter(stockItem => {
    const quantity = parseFloat(stockItem.quantity);
    const average = itemAverages[stockItem.itemId].total / itemAverages[stockItem.itemId].count;
    const thresholdValue = threshold || (average * 3); // Default to 3x average
    
    return quantity > thresholdValue;
  });

  const alerts = await Promise.all(
    overstockItems.map(async (stockItem) => {
      const existingAlert = await prisma.alert.findFirst({
        where: {
          tenantId,
          type: 'OVERSTOCK',
          itemId: stockItem.itemId,
          warehouseId: stockItem.warehouseId,
          status: 'UNREAD'
        }
      });

      if (existingAlert) {
        return existingAlert;
      }

      return await prisma.alert.create({
        data: {
          tenantId,
          type: 'OVERSTOCK',
          title: 'Overstock Alert',
          message: `${stockItem.item.name} (${stockItem.item.sku}) is overstocked in ${stockItem.warehouse.name}. Current stock: ${stockItem.quantity} ${stockItem.item.unit}`,
          priority: 'MEDIUM',
          itemId: stockItem.itemId,
          warehouseId: stockItem.warehouseId,
          status: 'UNREAD'
        },
        include: {
          item: {
            select: { id: true, name: true, sku: true, unit: true }
          },
          warehouse: {
            select: { id: true, name: true, code: true }
          }
        }
      });
    })
  );

  return alerts;
}

async function getPurchaseOrderAlerts({ tenantId, status, daysOverdue }) {
  const where = {
    tenantId,
    ...(status && { status })
  };

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where,
    include: {
      supplier: {
        select: { id: true, name: true }
      }
    }
  });

  const alerts = [];
  const currentDate = new Date();

  purchaseOrders.forEach(po => {
    // Check for overdue orders
    if (po.expectedDate && po.expectedDate < currentDate && po.status !== 'RECEIVED') {
      const daysOverdueValue = Math.ceil((currentDate - po.expectedDate) / (1000 * 60 * 60 * 24));
      
      if (!daysOverdue || daysOverdueValue >= daysOverdue) {
        alerts.push({
          id: `po-overdue-${po.id}`,
          type: 'PURCHASE_ORDER_OVERDUE',
          title: 'Overdue Purchase Order',
          message: `Purchase Order ${po.reference} from ${po.supplier.name} is ${daysOverdueValue} days overdue`,
          priority: 'HIGH',
          status: 'UNREAD',
          createdAt: new Date(),
          purchaseOrderId: po.id
        });
      }
    }

    // Check for orders pending approval
    if (po.status === 'PENDING' && po.createdAt < new Date(currentDate.getTime() - 24 * 60 * 60 * 1000)) {
      alerts.push({
        id: `po-pending-${po.id}`,
        type: 'PURCHASE_ORDER_PENDING',
        title: 'Pending Purchase Order',
        message: `Purchase Order ${po.reference} from ${po.supplier.name} is pending approval`,
        priority: 'MEDIUM',
        status: 'UNREAD',
        createdAt: new Date(),
        purchaseOrderId: po.id
      });
    }
  });

  return alerts;
}

async function getSalesOrderAlerts({ tenantId, status, daysOverdue }) {
  const where = {
    tenantId,
    ...(status && { status })
  };

  const salesOrders = await prisma.saleOrder.findMany({
    where
  });

  const alerts = [];
  const currentDate = new Date();

  salesOrders.forEach(so => {
    // Check for overdue orders
    if (so.deliveryDate && so.deliveryDate < currentDate && so.status !== 'FULFILLED') {
      const daysOverdueValue = Math.ceil((currentDate - so.deliveryDate) / (1000 * 60 * 60 * 24));
      
      if (!daysOverdue || daysOverdueValue >= daysOverdue) {
        alerts.push({
          id: `so-overdue-${so.id}`,
          type: 'SALES_ORDER_OVERDUE',
          title: 'Overdue Sales Order',
          message: `Sales Order ${so.reference} for ${so.customer} is ${daysOverdueValue} days overdue`,
          priority: 'HIGH',
          status: 'UNREAD',
          createdAt: new Date(),
          salesOrderId: so.id
        });
      }
    }

    // Check for orders pending fulfillment
    if (so.status === 'CONFIRMED' && so.createdAt < new Date(currentDate.getTime() - 24 * 60 * 60 * 1000)) {
      alerts.push({
        id: `so-pending-${so.id}`,
        type: 'SALES_ORDER_PENDING',
        title: 'Pending Sales Order',
        message: `Sales Order ${so.reference} for ${so.customer} is pending fulfillment`,
        priority: 'MEDIUM',
        status: 'UNREAD',
        createdAt: new Date(),
        salesOrderId: so.id
      });
    }
  });

  return alerts;
}

async function generateAlertReport({ tenantId, startDate, endDate, alertTypes }) {
  const where = {
    tenantId,
    createdAt: { gte: startDate, lte: endDate },
    ...(alertTypes && alertTypes.length > 0 && { type: { in: alertTypes } })
  };

  const alerts = await prisma.alert.findMany({
    where,
    include: {
      item: {
        select: { id: true, name: true, sku: true }
      },
      warehouse: {
        select: { id: true, name: true, code: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Group alerts by type
  const alertsByType = alerts.reduce((acc, alert) => {
    if (!acc[alert.type]) {
      acc[alert.type] = [];
    }
    acc[alert.type].push(alert);
    return acc;
  }, {});

  // Calculate summary statistics
  const summary = {
    totalAlerts: alerts.length,
    unreadAlerts: alerts.filter(a => a.status === 'UNREAD').length,
    highPriorityAlerts: alerts.filter(a => a.priority === 'HIGH').length,
    alertsByType: Object.keys(alertsByType).map(type => ({
      type,
      count: alertsByType[type].length,
      unread: alertsByType[type].filter(a => a.status === 'UNREAD').length
    })),
    period: { startDate, endDate }
  };

  return {
    summary,
    alertsByType,
    allAlerts: alerts
  };
}

module.exports = {
  getAlerts,
  getAlertById,
  markAlertAsRead,
  markAllAlertsAsRead,
  deleteAlert,
  getAlertSettings,
  updateAlertSettings,
  createCustomAlert,
  getLowStockAlerts,
  getExpiryAlerts,
  getReorderPointAlerts,
  getOverstockAlerts,
  getPurchaseOrderAlerts,
  getSalesOrderAlerts,
  generateAlertReport
};
