const supplierService = require('./supplier.service');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { PAGINATION } = require('../../core/constants');

async function createSupplier(req, res, next) {
  try {
    const { name, contact, email, phone, address } = req.body;

    if (!name) {
      throw new ValidationError('Supplier name is required');
    }

    const supplier = await supplierService.createSupplier({
      name,
      contact,
      email,
      phone,
      address
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

    const result = await supplierService.getSuppliers({
      page,
      limit,
      search
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getSupplierById(req, res, next) {
  try {
    const { id } = req.params;

    const supplier = await supplierService.getSupplierById(id);
    if (!supplier) {
      throw new NotFoundError('Supplier not found');
    }

    res.json({ success: true, data: supplier });
  } catch (err) {
    next(err);
  }
}

async function updateSupplier(req, res, next) {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const supplier = await supplierService.updateSupplier(id, updateData);
    if (!supplier) {
      throw new NotFoundError('Supplier not found');
    }

    res.json({ success: true, data: supplier });
  } catch (err) {
    next(err);
  }
}

async function deleteSupplier(req, res, next) {
  try {
    const { id } = req.params;

    const deleted = await supplierService.deleteSupplier(id);
    if (!deleted) {
      throw new NotFoundError('Supplier not found');
    }

    res.json({ success: true, message: 'Supplier deleted successfully' });
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
  getItemSuppliers
};
