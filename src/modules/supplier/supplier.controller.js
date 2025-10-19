const supplierService = require('./supplier.service');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { PAGINATION } = require('../../core/constants');

async function createSupplier(req, res, next) {
  try {
    const { 
      name, 
      contact, 
      email, 
      phone, 
      address, 
      website,
      taxId,
      paymentTerms,
      currency,
      rating,
      notes
    } = req.body;
    const tenantId = req.tenantId;

    if (!name) {
      throw new ValidationError('Supplier name is required');
    }

    const supplier = await supplierService.createSupplier({
      name,
      contact,
      email,
      phone,
      address,
      website,
      taxId,
      paymentTerms,
      currency,
      rating,
      notes,
      tenantId
    });

    res.status(201).json({ success: true, data: supplier });
  } catch (err) {
    next(err);
  }
}

async function getSuppliers(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
    const search = req.query.search;
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder || 'desc';
    const tenantId = req.tenantId;

    const result = await supplierService.getSuppliers({
      page,
      limit,
      search,
      tenantId,
      isActive,
      sortBy,
      sortOrder
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getSupplierById(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const supplier = await supplierService.getSupplierById(id, tenantId);
    res.json({ success: true, data: supplier });
  } catch (err) {
    next(err);
  }
}

async function updateSupplier(req, res, next) {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const tenantId = req.tenantId;

    const supplier = await supplierService.updateSupplier(id, tenantId, updateData);
    res.json({ success: true, data: supplier });
  } catch (err) {
    next(err);
  }
}

async function deleteSupplier(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const result = await supplierService.deleteSupplier(id, tenantId);
    res.json({ 
      success: true, 
      message: result.type === 'soft' 
        ? 'Supplier deactivated successfully' 
        : 'Supplier deleted successfully',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

async function addItemToSupplier(req, res, next) {
  try {
    const { supplierId, itemId, cost, leadTime, currency } = req.body;
    const tenantId = req.tenantId;

    if (!supplierId || !itemId || !cost) {
      throw new ValidationError('supplierId, itemId, and cost are required');
    }

    const itemSupplier = await supplierService.addItemToSupplier({
      supplierId,
      itemId,
      cost: parseFloat(cost),
      leadTime: leadTime ? parseInt(leadTime) : null,
      currency: currency || 'USD',
      tenantId
    });

    res.status(201).json({ success: true, data: itemSupplier });
  } catch (err) {
    next(err);
  }
}

async function updateItemSupplier(req, res, next) {
  try {
    const { id } = req.params;
    const { cost, leadTime, currency } = req.body;

    const itemSupplier = await supplierService.updateItemSupplier(id, {
      cost: cost ? parseFloat(cost) : undefined,
      leadTime: leadTime ? parseInt(leadTime) : undefined,
      currency
    });

    if (!itemSupplier) {
      throw new NotFoundError('Item supplier relationship not found');
    }

    res.json({ success: true, data: itemSupplier });
  } catch (err) {
    next(err);
  }
}

async function removeItemFromSupplier(req, res, next) {
  try {
    const { id } = req.params;

    const deleted = await supplierService.removeItemFromSupplier(id);
    if (!deleted) {
      throw new NotFoundError('Item supplier relationship not found');
    }

    res.json({ success: true, message: 'Item removed from supplier successfully' });
  } catch (err) {
    next(err);
  }
}

async function getSupplierItems(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);

    const result = await supplierService.getSupplierItems(id, tenantId, { page, limit });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getItemSuppliers(req, res, next) {
  try {
    const { itemId } = req.params;
    const tenantId = req.tenantId;

    const suppliers = await supplierService.getItemSuppliers(itemId, tenantId);
    res.json({ success: true, data: suppliers });
  } catch (err) {
    next(err);
  }
}

// Enhanced supplier analytics and management functions
async function getSupplierAnalytics(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate, 
      endDate, 
      groupBy = 'supplier' 
    } = req.query;

    const options = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      groupBy
    };

    const analytics = await supplierService.getSupplierAnalytics(tenantId, options);
    res.json({ success: true, data: analytics });
  } catch (err) {
    next(err);
  }
}

async function getTopSuppliers(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      limit = 10, 
      sortBy = 'totalValue', 
      period = 90 
    } = req.query;

    const options = {
      limit: parseInt(limit),
      sortBy,
      period: parseInt(period)
    };

    const topSuppliers = await supplierService.getTopSuppliers(tenantId, options);
    res.json({ success: true, data: topSuppliers });
  } catch (err) {
    next(err);
  }
}

async function updateSupplierRating(req, res, next) {
  try {
    const { id } = req.params;
    const { rating, notes } = req.body;
    const tenantId = req.tenantId;

    if (rating === undefined) {
      throw new ValidationError('Rating is required');
    }

    const supplier = await supplierService.updateSupplierRating(id, tenantId, rating, notes);
    res.json({ success: true, data: supplier });
  } catch (err) {
    next(err);
  }
}

async function getSupplierRiskAssessment(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const riskAssessment = await supplierService.getSupplierRiskAssessment(id, tenantId);
    res.json({ success: true, data: riskAssessment });
  } catch (err) {
    next(err);
  }
}

async function getSupplierPerformanceHistory(req, res, next) {
  try {
    const { id } = req.params;
    const { months = 12 } = req.query;
    const tenantId = req.tenantId;

    // First verify supplier exists and belongs to tenant
    await supplierService.getSupplierById(id, tenantId);
    
    const performanceHistory = await supplierService.getSupplierPerformanceHistory(id, parseInt(months));
    res.json({ success: true, data: performanceHistory });
  } catch (err) {
    next(err);
  }
}

async function getSupplierMetrics(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    // First verify supplier exists and belongs to tenant
    await supplierService.getSupplierById(id, tenantId);
    
    const metrics = await supplierService.calculateSupplierMetrics(id);
    res.json({ success: true, data: metrics });
  } catch (err) {
    next(err);
  }
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
  getSupplierAnalytics,
  getTopSuppliers,
  updateSupplierRating,
  getSupplierRiskAssessment,
  getSupplierPerformanceHistory,
  getSupplierMetrics
};
