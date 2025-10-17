const { prisma } = require('../../config/db');
const { ValidationError } = require('../../core/exceptions');

async function createSupplier(supplierData) {
  const { name, contact, email, phone, address } = supplierData;

  const supplier = await prisma.supplier.create({
    data: {
      name,
      contact,
      email,
      phone,
      address
    }
  });

  return supplier;
}

async function getSuppliers({ page, limit, search }) {
  const skip = (page - 1) * limit;
  
  const where = {
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { contact: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ]
    })
  };

  const [suppliers, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      skip,
      take: limit,
      include: {
        _count: {
          select: {
            items: true,
            purchaseOrders: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.supplier.count({ where })
  ]);

  return {
    data: suppliers,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function getSupplierById(id) {
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          item: {
            select: { 
              id: true, 
              name: true, 
              sku: true, 
              unit: true, 
              type: true,
              cost: true,
              price: true
            }
          }
        }
      },
      purchaseOrders: {
        include: {
          items: {
            include: {
              item: {
                select: { id: true, name: true, sku: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      },
      _count: {
        select: {
          items: true,
          purchaseOrders: true
        }
      }
    }
  });

  return supplier;
}

async function updateSupplier(id, updateData) {
  const supplier = await prisma.supplier.update({
    where: { id },
    data: updateData
  });

  return supplier;
}

async function deleteSupplier(id) {
  // Check if supplier has any purchase orders or item relationships
  const [itemCount, poCount] = await Promise.all([
    prisma.itemSupplier.count({ where: { supplierId: id } }),
    prisma.purchaseOrder.count({ where: { supplierId: id } })
  ]);

  if (itemCount > 0 || poCount > 0) {
    throw new ValidationError('Cannot delete supplier with existing items or purchase orders');
  }

  await prisma.supplier.delete({
    where: { id }
  });

  return true;
}

async function addItemToSupplier({ supplierId, itemId, cost, leadTime, currency, tenantId }) {
  // Verify supplier exists
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId }
  });

  if (!supplier) {
    throw new ValidationError('Supplier not found');
  }

  // Verify item exists and belongs to tenant
  const item = await prisma.item.findFirst({
    where: { id: itemId, tenantId }
  });

  if (!item) {
    throw new ValidationError('Item not found or does not belong to tenant');
  }

  // Check if relationship already exists
  const existingRelationship = await prisma.itemSupplier.findFirst({
    where: { supplierId, itemId }
  });

  if (existingRelationship) {
    throw new ValidationError('Item is already associated with this supplier');
  }

  const itemSupplier = await prisma.itemSupplier.create({
    data: {
      supplierId,
      itemId,
      cost,
      leadTime,
      currency
    },
    include: {
      supplier: {
        select: { id: true, name: true, contact: true, email: true }
      },
      item: {
        select: { id: true, name: true, sku: true, unit: true, type: true }
      }
    }
  });

  return itemSupplier;
}

async function updateItemSupplier(id, updateData) {
  const itemSupplier = await prisma.itemSupplier.update({
    where: { id },
    data: updateData,
    include: {
      supplier: {
        select: { id: true, name: true, contact: true, email: true }
      },
      item: {
        select: { id: true, name: true, sku: true, unit: true, type: true }
      }
    }
  });

  return itemSupplier;
}

async function removeItemFromSupplier(id) {
  // Check if there are any purchase orders for this item-supplier relationship
  const poCount = await prisma.purchaseOrder.count({
    where: {
      supplier: {
        items: {
          some: { id }
        }
      }
    }
  });

  if (poCount > 0) {
    throw new ValidationError('Cannot remove item from supplier with existing purchase orders');
  }

  await prisma.itemSupplier.delete({
    where: { id }
  });

  return true;
}

async function getSupplierItems(supplierId, tenantId, { page, limit }) {
  const skip = (page - 1) * limit;

  // Verify supplier exists
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, name: true }
  });

  if (!supplier) {
    throw new ValidationError('Supplier not found');
  }

  const [itemSuppliers, total] = await Promise.all([
    prisma.itemSupplier.findMany({
      where: { 
        supplierId,
        item: { tenantId }
      },
      skip,
      take: limit,
      include: {
        item: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: true,
            type: true,
            cost: true,
            price: true,
            stock: {
              include: {
                warehouse: {
                  select: { id: true, name: true, code: true }
                }
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.itemSupplier.count({ 
      where: { 
        supplierId,
        item: { tenantId }
      }
    })
  ]);

  // Calculate stock summary for each item
  const itemsWithStock = itemSuppliers.map(itemSupplier => ({
    ...itemSupplier,
    item: {
      ...itemSupplier.item,
      totalStock: itemSupplier.item.stock.reduce((sum, stock) => sum + parseFloat(stock.quantity), 0),
      stockByWarehouse: itemSupplier.item.stock.map(stock => ({
        warehouse: stock.warehouse,
        quantity: parseFloat(stock.quantity),
        reserved: parseFloat(stock.reserved),
        available: parseFloat(stock.quantity) - parseFloat(stock.reserved)
      }))
    }
  }));

  return {
    supplier,
    data: itemsWithStock,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function getItemSuppliers(itemId, tenantId) {
  // Verify item exists and belongs to tenant
  const item = await prisma.item.findFirst({
    where: { id: itemId, tenantId },
    select: { id: true, name: true, sku: true }
  });

  if (!item) {
    throw new ValidationError('Item not found or does not belong to tenant');
  }

  const itemSuppliers = await prisma.itemSupplier.findMany({
    where: { itemId },
    include: {
      supplier: {
        select: { id: true, name: true, contact: true, email: true, phone: true }
      }
    },
    orderBy: { cost: 'asc' } // Order by cost to show cheapest suppliers first
  });

  return {
    item,
    suppliers: itemSuppliers
  };
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
