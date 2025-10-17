const salesService = require('./sales.service');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { PAGINATION } = require('../../core/constants');

async function createSaleOrder(req, res, next) {
  try {
    const { customer, items, reference } = req.body;
    const tenantId = req.tenantId;

    if (!customer || !items || !Array.isArray(items) || items.length === 0) {
      throw new ValidationError('customer and items are required');
    }

    const saleOrder = await salesService.createSaleOrder({
      customer,
      items,
      reference,
      tenantId
    });

    res.status(201).json({ success: true, data: saleOrder });
  } catch (err) {
    next(err);
  }
}

async function getSaleOrders(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
    const search = req.query.search;
    const customer = req.query.customer;
    const status = req.query.status;

    const result = await salesService.getSaleOrders({
      tenantId,
      page,
      limit,
      search,
      customer,
      status
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getSaleOrderById(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const saleOrder = await salesService.getSaleOrderById(id, tenantId);
    if (!saleOrder) {
      throw new NotFoundError('Sale order not found');
    }

    res.json({ success: true, data: saleOrder });
  } catch (err) {
    next(err);
  }
}

async function updateSaleOrder(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const updateData = req.body;

    const saleOrder = await salesService.updateSaleOrder(id, tenantId, updateData);
    if (!saleOrder) {
      throw new NotFoundError('Sale order not found');
    }

    res.json({ success: true, data: saleOrder });
  } catch (err) {
    next(err);
  }
}

async function cancelSaleOrder(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const saleOrder = await salesService.cancelSaleOrder(id, tenantId);
    if (!saleOrder) {
      throw new NotFoundError('Sale order not found');
    }

    res.json({ success: true, data: saleOrder });
  } catch (err) {
    next(err);
  }
}

async function fulfillSaleOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { fulfilledItems } = req.body;
    const createdById = req.user.id;

    if (!fulfilledItems || !Array.isArray(fulfilledItems) || fulfilledItems.length === 0) {
      throw new ValidationError('fulfilledItems array is required');
    }

    const result = await salesService.fulfillSaleOrder(id, fulfilledItems, createdById);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getSaleOrderItems(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const items = await salesService.getSaleOrderItems(id, tenantId);
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createSaleOrder,
  getSaleOrders,
  getSaleOrderById,
  updateSaleOrder,
  cancelSaleOrder,
  fulfillSaleOrder,
  getSaleOrderItems
};
