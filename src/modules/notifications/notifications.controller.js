const notificationsService = require('./notifications.service');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { PAGINATION } = require('../../core/constants');

async function getAlerts(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { type, status, limit, offset } = req.query;
    
    const alerts = await notificationsService.getAlerts({
      tenantId,
      type,
      status,
      limit: parseInt(limit) || PAGINATION.DEFAULT_LIMIT,
      offset: parseInt(offset) || 0
    });

    res.json({ success: true, data: alerts });
  } catch (err) {
    next(err);
  }
}

async function getAlertById(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const alertId = req.params.id;

    const alert = await notificationsService.getAlertById(alertId, tenantId);
    res.json({ success: true, data: alert });
  } catch (err) {
    next(err);
  }
}

async function markAlertAsRead(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const alertId = req.params.id;

    const alert = await notificationsService.markAlertAsRead(alertId, tenantId);
    res.json({ success: true, data: alert });
  } catch (err) {
    next(err);
  }
}

async function markAllAlertsAsRead(req, res, next) {
  try {
    const tenantId = req.tenantId;

    const result = await notificationsService.markAllAlertsAsRead(tenantId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function deleteAlert(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const alertId = req.params.id;

    await notificationsService.deleteAlert(alertId, tenantId);
    res.json({ success: true, message: 'Alert deleted successfully' });
  } catch (err) {
    next(err);
  }
}

async function getAlertSettings(req, res, next) {
  try {
    const tenantId = req.tenantId;

    const settings = await notificationsService.getAlertSettings(tenantId);
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
}

async function updateAlertSettings(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const settings = req.body;

    const updatedSettings = await notificationsService.updateAlertSettings(tenantId, settings);
    res.json({ success: true, data: updatedSettings });
  } catch (err) {
    next(err);
  }
}

async function createCustomAlert(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const alertData = req.body;

    const alert = await notificationsService.createCustomAlert(tenantId, alertData);
    res.json({ success: true, data: alert });
  } catch (err) {
    next(err);
  }
}

async function getLowStockAlerts(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { warehouseId, threshold } = req.query;

    const alerts = await notificationsService.getLowStockAlerts({
      tenantId,
      warehouseId,
      threshold: threshold ? parseFloat(threshold) : undefined
    });

    res.json({ success: true, data: alerts });
  } catch (err) {
    next(err);
  }
}

async function getExpiryAlerts(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { daysAhead } = req.query;

    const alerts = await notificationsService.getExpiryAlerts({
      tenantId,
      daysAhead: daysAhead ? parseInt(daysAhead) : 30
    });

    res.json({ success: true, data: alerts });
  } catch (err) {
    next(err);
  }
}

async function getReorderPointAlerts(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { warehouseId } = req.query;

    const alerts = await notificationsService.getReorderPointAlerts({
      tenantId,
      warehouseId
    });

    res.json({ success: true, data: alerts });
  } catch (err) {
    next(err);
  }
}

async function getOverstockAlerts(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { warehouseId, threshold } = req.query;

    const alerts = await notificationsService.getOverstockAlerts({
      tenantId,
      warehouseId,
      threshold: threshold ? parseFloat(threshold) : undefined
    });

    res.json({ success: true, data: alerts });
  } catch (err) {
    next(err);
  }
}

async function getPurchaseOrderAlerts(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { status, daysOverdue } = req.query;

    const alerts = await notificationsService.getPurchaseOrderAlerts({
      tenantId,
      status,
      daysOverdue: daysOverdue ? parseInt(daysOverdue) : undefined
    });

    res.json({ success: true, data: alerts });
  } catch (err) {
    next(err);
  }
}

async function getSalesOrderAlerts(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { status, daysOverdue } = req.query;

    const alerts = await notificationsService.getSalesOrderAlerts({
      tenantId,
      status,
      daysOverdue: daysOverdue ? parseInt(daysOverdue) : undefined
    });

    res.json({ success: true, data: alerts });
  } catch (err) {
    next(err);
  }
}

async function generateAlertReport(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate, alertTypes } = req.body;

    if (!startDate || !endDate) {
      throw new ValidationError('startDate and endDate are required');
    }

    const report = await notificationsService.generateAlertReport({
      tenantId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      alertTypes
    });

    res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
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
