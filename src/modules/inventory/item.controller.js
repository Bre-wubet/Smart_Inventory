const itemService = require('./item.service');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { PAGINATION } = require('../../core/constants');

async function createItem(req, res, next) {
  try {
    const { sku, name, description, unit, type, cost, price } = req.body;
    const tenantId = req.tenantId;

    if (!sku || !name || !unit) {
      throw new ValidationError('SKU, name, and unit are required');
    }

    const item = await itemService.createItem({
      sku,
      name,
      description,
      unit,
      type,
      cost: parseFloat(cost || 0),
      price: parseFloat(price || 0),
      tenantId
    });

    res.status(201).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

async function getItems(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
    const search = req.query.search;
    const type = req.query.type;
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;

    const result = await itemService.getItems({
      tenantId,
      page,
      limit,
      search,
      type,
      isActive
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getItemById(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const item = await itemService.getItemById(id, tenantId);
    if (!item) {
      throw new NotFoundError('Item not found');
    }

    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

async function updateItem(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const updateData = req.body;

    const item = await itemService.updateItem(id, tenantId, updateData);
    if (!item) {
      throw new NotFoundError('Item not found');
    }

    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

async function deleteItem(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const deleted = await itemService.deleteItem(id, tenantId);
    if (!deleted) {
      throw new NotFoundError('Item not found');
    }

    res.json({ success: true, message: 'Item deleted successfully' });
  } catch (err) {
    next(err);
  }
}

async function getItemStock(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const stock = await itemService.getItemStock(id, tenantId);
    res.json({ success: true, data: stock });
  } catch (err) {
    next(err);
  }
}

async function getItemTransactions(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);

    const result = await itemService.getItemTransactions(id, tenantId, { page, limit });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createItem,
  getItems,
  getItemById,
  updateItem,
  deleteItem,
  getItemStock,
  getItemTransactions
};
