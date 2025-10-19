const tenantService = require('./tenant.service');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { PAGINATION } = require('../../core/constants');

async function getTenants(req, res, next) {
  try {
    const { search, plan, isActive, limit, offset } = req.query;
    
    const tenants = await tenantService.getTenants({
      search,
      plan,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      limit: parseInt(limit) || PAGINATION.DEFAULT_LIMIT,
      offset: parseInt(offset) || 0
    });

    res.json({ success: true, data: tenants });
  } catch (err) {
    next(err);
  }
}

async function getTenantById(req, res, next) {
  try {
    const tenantId = req.params.id;

    const tenant = await tenantService.getTenantById(tenantId);
    res.json({ success: true, data: tenant });
  } catch (err) {
    next(err);
  }
}

async function createTenant(req, res, next) {
  try {
    const tenantData = req.body;

    const tenant = await tenantService.createTenant(tenantData);
    res.status(201).json({ success: true, data: tenant });
  } catch (err) {
    next(err);
  }
}

async function updateTenant(req, res, next) {
  try {
    const tenantId = req.params.id;
    const updateData = req.body;

    const tenant = await tenantService.updateTenant(tenantId, updateData);
    res.json({ success: true, data: tenant });
  } catch (err) {
    next(err);
  }
}

async function deleteTenant(req, res, next) {
  try {
    const tenantId = req.params.id;

    await tenantService.deleteTenant(tenantId);
    res.json({ success: true, message: 'Tenant deleted successfully' });
  } catch (err) {
    next(err);
  }
}

async function getTenantAnalytics(req, res, next) {
  try {
    const tenantId = req.params.id;
    const { period } = req.query;

    const analytics = await tenantService.getTenantAnalytics(tenantId, {
      period: parseInt(period) || 30
    });

    res.json({ success: true, data: analytics });
  } catch (err) {
    next(err);
  }
}

async function getTenantSettings(req, res, next) {
  try {
    const tenantId = req.params.id;

    const settings = await tenantService.getTenantSettings(tenantId);
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
}

async function updateTenantSettings(req, res, next) {
  try {
    const tenantId = req.params.id;
    const settings = req.body;

    const updatedSettings = await tenantService.updateTenantSettings(tenantId, settings);
    res.json({ success: true, data: updatedSettings });
  } catch (err) {
    next(err);
  }
}

async function getTenantUsage(req, res, next) {
  try {
    const tenantId = req.params.id;

    const usage = await tenantService.getTenantUsage(tenantId);
    res.json({ success: true, data: usage });
  } catch (err) {
    next(err);
  }
}

async function getTenantBilling(req, res, next) {
  try {
    const tenantId = req.params.id;

    const billing = await tenantService.getTenantBilling(tenantId);
    res.json({ success: true, data: billing });
  } catch (err) {
    next(err);
  }
}

async function getCurrentTenant(req, res, next) {
  try {
    const tenantId = req.tenantId;

    const tenant = await tenantService.getTenantById(tenantId);
    res.json({ success: true, data: tenant });
  } catch (err) {
    next(err);
  }
}

async function getCurrentTenantSettings(req, res, next) {
  try {
    const tenantId = req.tenantId;

    const settings = await tenantService.getTenantSettings(tenantId);
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
}

async function updateCurrentTenantSettings(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const settings = req.body;

    const updatedSettings = await tenantService.updateTenantSettings(tenantId, settings);
    res.json({ success: true, data: updatedSettings });
  } catch (err) {
    next(err);
  }
}

async function getCurrentTenantUsage(req, res, next) {
  try {
    const tenantId = req.tenantId;

    const usage = await tenantService.getTenantUsage(tenantId);
    res.json({ success: true, data: usage });
  } catch (err) {
    next(err);
  }
}

async function getCurrentTenantAnalytics(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { period } = req.query;

    const analytics = await tenantService.getTenantAnalytics(tenantId, {
      period: parseInt(period) || 30
    });

    res.json({ success: true, data: analytics });
  } catch (err) {
    next(err);
  }
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
  getTenantBilling,
  getCurrentTenant,
  getCurrentTenantSettings,
  updateCurrentTenantSettings,
  getCurrentTenantUsage,
  getCurrentTenantAnalytics
};
