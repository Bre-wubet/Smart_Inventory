// src/modules/customer/customer.controller.js
const customerService = require('./customer.service');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { PAGINATION } = require('../../core/constants');

async function createCustomer(req, res, next) {
  try {
    const { 
      name, 
      email, 
      phone, 
      address,
      company,
      taxId,
      paymentTerms,
      creditLimit,
      currency,
      notes
    } = req.body;
    const tenantId = req.tenantId;

    if (!name) {
      throw new ValidationError('Customer name is required');
    }

    const customer = await customerService.createCustomer({
      name,
      email,
      phone,
      address,
      company,
      taxId,
      paymentTerms,
      creditLimit,
      currency,
      notes,
      tenantId
    });

    res.status(201).json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
}

async function getCustomers(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
    const search = req.query.search;
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder || 'desc';

    const result = await customerService.getCustomers({
      tenantId,
      page,
      limit,
      search,
      isActive,
      sortBy,
      sortOrder
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getCustomerById(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const customer = await customerService.getCustomerById(id, tenantId);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    res.json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
}

async function updateCustomer(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const updateData = req.body;

    const customer = await customerService.updateCustomer(id, tenantId, updateData);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    res.json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
}

async function deleteCustomer(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const result = await customerService.deleteCustomer(id, tenantId);
    if (!result) {
      throw new NotFoundError('Customer not found');
    }

    res.json({ 
      success: true, 
      data: result,
      message: result.message 
    });
  } catch (err) {
    next(err);
  }
}

async function getCustomerAnalytics(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate, 
      endDate, 
      groupBy = 'customer' 
    } = req.query;

    const options = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      groupBy
    };

    const analytics = await customerService.getCustomerAnalytics(tenantId, options);
    res.json({ success: true, data: analytics });
  } catch (err) {
    next(err);
  }
}

async function getTopCustomers(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      limit = 10,
      criteria = 'totalValue',
      startDate,
      endDate
    } = req.query;

    const options = {
      limit: parseInt(limit),
      criteria,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    };

    const topCustomers = await customerService.getTopCustomers(tenantId, options);
    res.json({ success: true, data: topCustomers });
  } catch (err) {
    next(err);
  }
}

async function segmentCustomers(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      segmentationType = 'RFM',
      startDate,
      endDate
    } = req.query;

    const options = {
      segmentationType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    };

    const segments = await customerService.segmentCustomers(tenantId, options);
    res.json({ success: true, data: segments });
  } catch (err) {
    next(err);
  }
}

async function getCustomerMetrics(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const customer = await customerService.getCustomerById(id, tenantId);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    res.json({ success: true, data: customer.metrics });
  } catch (err) {
    next(err);
  }
}

async function getCustomerPerformanceHistory(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const { months = 12 } = req.query;

    const customer = await customerService.getCustomerById(id, tenantId);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    const history = await customerService.getCustomerPerformanceHistory(id, parseInt(months));
    res.json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  getCustomerAnalytics,
  getTopCustomers,
  segmentCustomers,
  getCustomerMetrics,
  getCustomerPerformanceHistory
};
