const warehouseService = require('./warehouse.service');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { PAGINATION } = require('../../core/constants');

async function createWarehouse(req, res, next) {
  try {
    const { name, code, location } = req.body;
    const tenantId = req.tenantId;

    if (!name) {
      throw new ValidationError('Warehouse name is required');
    }

    const warehouse = await warehouseService.createWarehouse({
      name,
      code,
      location,
      tenantId
    });

    res.status(201).json({ success: true, data: warehouse });
  } catch (err) {
    next(err);
  }
}

async function getWarehouses(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
    const search = req.query.search;

    const result = await warehouseService.getWarehouses({
      tenantId,
      page,
      limit,
      search
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getWarehouseById(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const warehouse = await warehouseService.getWarehouseById(id, tenantId);
    if (!warehouse) {
      throw new NotFoundError('Warehouse not found');
    }

    res.json({ success: true, data: warehouse });
  } catch (err) {
    next(err);
  }
}

async function updateWarehouse(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const updateData = req.body;

    const warehouse = await warehouseService.updateWarehouse(id, tenantId, updateData);
    if (!warehouse) {
      throw new NotFoundError('Warehouse not found');
    }

    res.json({ success: true, data: warehouse });
  } catch (err) {
    next(err);
  }
}

async function deleteWarehouse(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const deleted = await warehouseService.deleteWarehouse(id, tenantId);
    if (!deleted) {
      throw new NotFoundError('Warehouse not found');
    }

    res.json({ success: true, message: 'Warehouse deleted successfully' });
  } catch (err) {
    next(err);
  }
}

async function getWarehouseStock(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);

    const result = await warehouseService.getWarehouseStock(id, tenantId, { page, limit });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getWarehouseTransactions(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);

    const result = await warehouseService.getWarehouseTransactions(id, tenantId, { page, limit });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function transferStock(req, res, next) {
  try {
    const { fromWarehouseId, toWarehouseId, itemId, quantity, note } = req.body;
    const createdById = req.user.id;

    if (!fromWarehouseId || !toWarehouseId || !itemId || !quantity) {
      throw new ValidationError('fromWarehouseId, toWarehouseId, itemId, and quantity are required');
    }

    if (fromWarehouseId === toWarehouseId) {
      throw new ValidationError('Source and destination warehouses cannot be the same');
    }

    const result = await warehouseService.transferStock({
      fromWarehouseId,
      toWarehouseId,
      itemId,
      quantity: parseFloat(quantity),
      note,
      createdById
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function adjustStock(req, res, next) {
  try {
    const { warehouseId, itemId, quantity, reason, note } = req.body;
    const createdById = req.user.id;

    if (!warehouseId || !itemId || quantity === undefined) {
      throw new ValidationError('warehouseId, itemId, and quantity are required');
    }

    const result = await warehouseService.adjustStock({
      warehouseId,
      itemId,
      quantity: parseFloat(quantity),
      reason,
      note,
      createdById
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createWarehouse,
  getWarehouses,
  getWarehouseById,
  updateWarehouse,
  deleteWarehouse,
  getWarehouseStock,
  getWarehouseTransactions,
  transferStock,
  adjustStock
};
