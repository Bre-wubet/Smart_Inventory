const purchaseService = require('./purchase.service');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { PAGINATION } = require('../../core/constants');

async function createPurchaseOrder(req, res, next) {
  try {
    const { supplierId, items, expectedAt, reference } = req.body;
    const tenantId = req.tenantId;

    if (!supplierId || !items || !Array.isArray(items) || items.length === 0) {
      throw new ValidationError('supplierId and items are required');
    }

    const purchaseOrder = await purchaseService.createPurchaseOrder({
      supplierId,
      items,
      expectedAt: expectedAt ? new Date(expectedAt) : null,
      reference,
      tenantId
    });

    res.status(201).json({ success: true, data: purchaseOrder });
  } catch (err) {
    next(err);
  }
}

async function getPurchaseOrders(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
    const search = req.query.search;
    const supplierId = req.query.supplierId;
    const status = req.query.status;

    const result = await purchaseService.getPurchaseOrders({
      tenantId,
      page,
      limit,
      search,
      supplierId,
      status
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getPurchaseOrderById(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const purchaseOrder = await purchaseService.getPurchaseOrderById(id, tenantId);
    if (!purchaseOrder) {
      throw new NotFoundError('Purchase order not found');
    }

    res.json({ success: true, data: purchaseOrder });
  } catch (err) {
    next(err);
  }
}

async function updatePurchaseOrder(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const updateData = req.body;

    const purchaseOrder = await purchaseService.updatePurchaseOrder(id, tenantId, updateData);
    if (!purchaseOrder) {
      throw new NotFoundError('Purchase order not found');
    }

    res.json({ success: true, data: purchaseOrder });
  } catch (err) {
    next(err);
  }
}

async function cancelPurchaseOrder(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const purchaseOrder = await purchaseService.cancelPurchaseOrder(id, tenantId);
    if (!purchaseOrder) {
      throw new NotFoundError('Purchase order not found');
    }

    res.json({ success: true, data: purchaseOrder });
  } catch (err) {
    next(err);
  }
}

async function receivePurchaseOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { receivedItems } = req.body;
    const createdById = req.user.id;

    if (!receivedItems || !Array.isArray(receivedItems) || receivedItems.length === 0) {
      throw new ValidationError('receivedItems array is required');
    }

    const result = await purchaseService.receivePurchaseOrder(id, receivedItems, createdById);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getPurchaseOrderItems(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const items = await purchaseService.getPurchaseOrderItems(id, tenantId);
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
}

async function generatePurchaseOrder(req, res, next) {
  try {
    const { items, supplierId, warehouseId } = req.body;
    const tenantId = req.tenantId;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ValidationError('items array is required');
    }

    const purchaseOrder = await purchaseService.generatePurchaseOrder({
      items,
      supplierId,
      warehouseId,
      tenantId
    });

    res.status(201).json({ success: true, data: purchaseOrder });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrder,
  cancelPurchaseOrder,
  receivePurchaseOrder,
  getPurchaseOrderItems,
  generatePurchaseOrder
};
