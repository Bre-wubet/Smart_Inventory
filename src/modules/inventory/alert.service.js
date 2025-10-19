const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { 
  calculateAvailableStock, 
  isLowStock, 
  isOverstocked,
  calculateSafetyStock
} = require('../../core/utils/stockFormulas');
const { AlertType } = require('../../core/constants');

async function generateStockAlerts(tenantId, options = {}) {
  const { 
    warehouseId, 
    itemType, 
    forceRegenerate = false,
    alertTypes = ['LOW_STOCK', 'OVERSTOCK', 'REORDER']
  } = options;

  const where = {
    item: { tenantId },
    ...(warehouseId && { warehouseId }),
    ...(itemType && { item: { type: itemType } })
  };

  // Get all stock records with item and warehouse details
  const stockRecords = await prisma.stock.findMany({
    where,
    include: {
      item: {
        select: {
          id: true,
          sku: true,
          name: true,
          type: true,
          cost: true,
          unit: true
        }
      },
      warehouse: {
        select: {
          id: true,
          name: true,
          code: true
        }
      }
    }
  });

  const alerts = [];
  const alertCounts = {
    LOW_STOCK: 0,
    OVERSTOCK: 0,
    REORDER: 0
  };

  for (const stock of stockRecords) {
    const availableStock = calculateAvailableStock(stock.quantity, stock.reserved);
    const currentStock = parseFloat(stock.quantity);

    // Check for low stock alert
    if (alertTypes.includes('LOW_STOCK') && currentStock <= 10) { // Simplified threshold
      const alert = await createOrUpdateAlert({
        tenantId,
        itemId: stock.item.id,
        warehouseId: stock.warehouse.id,
        type: AlertType.LOW_STOCK,
        message: `Low stock alert: ${stock.item.name} (${stock.item.sku}) has ${currentStock} ${stock.item.unit} remaining in ${stock.warehouse.name}`,
        metadata: {
          currentStock,
          availableStock,
          threshold: 10,
          warehouse: stock.warehouse.name,
          item: stock.item.name
        }
      });

      if (alert) {
        alerts.push(alert);
        alertCounts.LOW_STOCK++;
      }
    }

    // Check for overstock alert
    if (alertTypes.includes('OVERSTOCK') && currentStock >= 1000) { // Simplified threshold
      const alert = await createOrUpdateAlert({
        tenantId,
        itemId: stock.item.id,
        warehouseId: stock.warehouse.id,
        type: AlertType.OVERSTOCK,
        message: `Overstock alert: ${stock.item.name} (${stock.item.sku}) has ${currentStock} ${stock.item.unit} in ${stock.warehouse.name}`,
        metadata: {
          currentStock,
          availableStock,
          threshold: 1000,
          warehouse: stock.warehouse.name,
          item: stock.item.name
        }
      });

      if (alert) {
        alerts.push(alert);
        alertCounts.OVERSTOCK++;
      }
    }

    // Check for reorder point alert
    if (alertTypes.includes('REORDER') && currentStock <= 5) { // Simplified reorder point
      const alert = await createOrUpdateAlert({
        tenantId,
        itemId: stock.item.id,
        warehouseId: stock.warehouse.id,
        type: AlertType.REORDER,
        message: `Reorder alert: ${stock.item.name} (${stock.item.sku}) needs to be reordered. Current stock: ${currentStock} ${stock.item.unit}`,
        metadata: {
          currentStock,
          availableStock,
          reorderPoint: 5,
          warehouse: stock.warehouse.name,
          item: stock.item.name
        }
      });

      if (alert) {
        alerts.push(alert);
        alertCounts.REORDER++;
      }
    }
  }

  return {
    alerts,
    summary: {
      totalGenerated: alerts.length,
      byType: alertCounts
    }
  };
}

async function createOrUpdateAlert(alertData) {
  const { tenantId, itemId, warehouseId, type, message, metadata } = alertData;

  // Check if similar alert already exists and is unresolved
  const existingAlert = await prisma.alert.findFirst({
    where: {
      tenantId,
      itemId,
      warehouseId,
      type,
      isResolved: false
    }
  });

  if (existingAlert) {
    // Update existing alert with new message and metadata
    const updatedAlert = await prisma.alert.update({
      where: { id: existingAlert.id },
      data: {
        message,
        metadata: {
          ...existingAlert.metadata,
          ...metadata,
          lastUpdated: new Date()
        }
      }
    });

    return updatedAlert;
  }

  // Create new alert
  const newAlert = await prisma.alert.create({
    data: {
      tenantId,
      itemId,
      warehouseId,
      type,
      message,
      metadata
    }
  });

  return newAlert;
}

async function getActiveAlerts(tenantId, filters = {}) {
  const {
    alertType,
    warehouseId,
    itemId,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = filters;

  const skip = (page - 1) * limit;

  const where = {
    tenantId,
    isResolved: false,
    ...(alertType && { type: alertType }),
    ...(warehouseId && { warehouseId }),
    ...(itemId && { itemId })
  };

  const [alerts, total] = await Promise.all([
    prisma.alert.findMany({
      where,
      skip,
      take: limit,
      include: {
        item: {
          select: {
            id: true,
            name: true,
            sku: true,
            type: true,
            unit: true
          }
        },
        warehouse: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      },
      orderBy: { [sortBy]: sortOrder }
    }),
    prisma.alert.count({ where })
  ]);

  // Group alerts by type for summary
  const alertsByType = alerts.reduce((acc, alert) => {
    if (!acc[alert.type]) {
      acc[alert.type] = 0;
    }
    acc[alert.type]++;
    return acc;
  }, {});

  return {
    alerts,
    summary: {
      total,
      byType: alertsByType
    },
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function resolveAlert(alertId, tenantId, resolvedBy, resolutionNote = '') {
  const alert = await prisma.alert.findFirst({
    where: { id: alertId, tenantId }
  });

  if (!alert) {
    throw new NotFoundError('Alert not found');
  }

  if (alert.isResolved) {
    throw new ValidationError('Alert is already resolved');
  }

  const resolvedAlert = await prisma.alert.update({
    where: { id: alertId },
    data: {
      isResolved: true,
      resolvedAt: new Date(),
      metadata: {
        ...alert.metadata,
        resolvedBy,
        resolutionNote,
        resolvedAt: new Date()
      }
    },
    include: {
      item: {
        select: {
          id: true,
          name: true,
          sku: true
        }
      },
      warehouse: {
        select: {
          id: true,
          name: true,
          code: true
        }
      }
    }
  });

  return resolvedAlert;
}

async function bulkResolveAlerts(alertIds, tenantId, resolvedBy, resolutionNote = '') {
  if (!alertIds || alertIds.length === 0) {
    throw new ValidationError('Alert IDs array is required');
  }

  const results = await prisma.$transaction(async (tx) => {
    const resolvedAlerts = [];

    for (const alertId of alertIds) {
      const alert = await tx.alert.findFirst({
        where: { id: alertId, tenantId, isResolved: false }
      });

      if (alert) {
        const resolvedAlert = await tx.alert.update({
          where: { id: alertId },
          data: {
            isResolved: true,
            resolvedAt: new Date(),
            metadata: {
              ...alert.metadata,
              resolvedBy,
              resolutionNote,
              resolvedAt: new Date()
            }
          }
        });

        resolvedAlerts.push(resolvedAlert);
      }
    }

    return resolvedAlerts;
  });

  return {
    resolved: results.length,
    total: alertIds.length,
    alerts: results
  };
}

async function getAlertStatistics(tenantId, options = {}) {
  const { period = 30, warehouseId } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  const where = {
    tenantId,
    createdAt: { gte: startDate },
    ...(warehouseId && { warehouseId })
  };

  // Get all alerts in the period
  const alerts = await prisma.alert.findMany({
    where,
    include: {
      item: {
        select: {
          id: true,
          type: true
        }
      },
      warehouse: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  // Calculate statistics
  const stats = {
    total: alerts.length,
    resolved: alerts.filter(a => a.isResolved).length,
    unresolved: alerts.filter(a => !a.isResolved).length,
    byType: {},
    byWarehouse: {},
    byItemType: {},
    resolutionTime: []
  };

  // Group by type
  alerts.forEach(alert => {
    if (!stats.byType[alert.type]) {
      stats.byType[alert.type] = { total: 0, resolved: 0, unresolved: 0 };
    }
    stats.byType[alert.type].total++;
    if (alert.isResolved) {
      stats.byType[alert.type].resolved++;
    } else {
      stats.byType[alert.type].unresolved++;
    }
  });

  // Group by warehouse
  alerts.forEach(alert => {
    const warehouseName = alert.warehouse.name;
    if (!stats.byWarehouse[warehouseName]) {
      stats.byWarehouse[warehouseName] = { total: 0, resolved: 0, unresolved: 0 };
    }
    stats.byWarehouse[warehouseName].total++;
    if (alert.isResolved) {
      stats.byWarehouse[warehouseName].resolved++;
    } else {
      stats.byWarehouse[warehouseName].unresolved++;
    }
  });

  // Group by item type
  alerts.forEach(alert => {
    const itemType = alert.item.type;
    if (!stats.byItemType[itemType]) {
      stats.byItemType[itemType] = { total: 0, resolved: 0, unresolved: 0 };
    }
    stats.byItemType[itemType].total++;
    if (alert.isResolved) {
      stats.byItemType[itemType].resolved++;
    } else {
      stats.byItemType[itemType].unresolved++;
    }
  });

  // Calculate resolution times
  const resolvedAlerts = alerts.filter(a => a.isResolved && a.resolvedAt);
  stats.resolutionTime = resolvedAlerts.map(alert => {
    const resolutionTime = alert.resolvedAt.getTime() - alert.createdAt.getTime();
    return {
      alertId: alert.id,
      alertType: alert.type,
      resolutionTimeHours: Math.round(resolutionTime / (1000 * 60 * 60) * 100) / 100
    };
  });

  // Calculate average resolution time
  if (stats.resolutionTime.length > 0) {
    const totalResolutionTime = stats.resolutionTime.reduce((sum, rt) => sum + rt.resolutionTimeHours, 0);
    stats.averageResolutionTimeHours = Math.round((totalResolutionTime / stats.resolutionTime.length) * 100) / 100;
  } else {
    stats.averageResolutionTimeHours = 0;
  }

  return {
    period,
    summary: stats
  };
}

async function getItemAlerts(itemId, tenantId, filters = {}) {
  const { includeResolved = false, alertType, warehouseId } = filters;

  const where = {
    itemId,
    tenantId,
    ...(includeResolved ? {} : { isResolved: false }),
    ...(alertType && { type: alertType }),
    ...(warehouseId && { warehouseId })
  };

  const alerts = await prisma.alert.findMany({
    where,
    include: {
      warehouse: {
        select: {
          id: true,
          name: true,
          code: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Group by warehouse
  const alertsByWarehouse = alerts.reduce((acc, alert) => {
    const warehouseName = alert.warehouse.name;
    if (!acc[warehouseName]) {
      acc[warehouseName] = [];
    }
    acc[warehouseName].push({
      id: alert.id,
      type: alert.type,
      message: alert.message,
      isResolved: alert.isResolved,
      createdAt: alert.createdAt,
      resolvedAt: alert.resolvedAt,
      metadata: alert.metadata
    });
    return acc;
  }, {});

  return {
    itemId,
    totalAlerts: alerts.length,
    activeAlerts: alerts.filter(a => !a.isResolved).length,
    resolvedAlerts: alerts.filter(a => a.isResolved).length,
    alertsByWarehouse
  };
}

module.exports = {
  generateStockAlerts,
  createOrUpdateAlert,
  getActiveAlerts,
  resolveAlert,
  bulkResolveAlerts,
  getAlertStatistics,
  getItemAlerts
};
