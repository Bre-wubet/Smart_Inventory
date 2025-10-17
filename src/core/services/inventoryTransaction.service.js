const { prisma } = require('../config/db');
const { ValidationError } = require('../exceptions');
const { TransactionType, MovementType } = require('../constants');

/**
 * Create an inventory transaction and update stock levels
 * @param {Object} transactionData - Transaction data
 * @returns {Object} Created transaction
 */
async function createTransaction(transactionData) {
  const {
    type,
    itemId,
    warehouseId,
    quantity,
    costPerUnit,
    reference,
    purchaseOrderId,
    saleOrderId,
    productionBatchId,
    createdById,
    note
  } = transactionData;

  // Validate required fields
  if (!type || !itemId || !quantity) {
    throw new ValidationError('Type, itemId, and quantity are required');
  }

  // Validate quantity is not zero
  if (parseFloat(quantity) === 0) {
    throw new ValidationError('Quantity cannot be zero');
  }

  // Get or create stock record
  let stock = await prisma.stock.findUnique({
    where: {
      warehouseId_itemId: {
        warehouseId,
        itemId
      }
    }
  });

  if (!stock) {
    stock = await prisma.stock.create({
      data: {
        warehouseId,
        itemId,
        quantity: 0,
        reserved: 0
      }
    });
  }

  // Calculate new stock quantity
  const currentQuantity = parseFloat(stock.quantity);
  const transactionQuantity = parseFloat(quantity);
  const movementType = ['PURCHASE', 'TRANSFER', 'ADJUSTMENT'].includes(type) ? 'IN' : 'OUT';
  
  let newQuantity;
  if (movementType === 'IN') {
    newQuantity = currentQuantity + transactionQuantity;
  } else {
    newQuantity = currentQuantity - transactionQuantity;
    
    // Check for negative stock
    if (newQuantity < 0) {
      throw new ValidationError('Insufficient stock available');
    }
  }

  // Create transaction and update stock in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Update stock
    const updatedStock = await tx.stock.update({
      where: { id: stock.id },
      data: { quantity: newQuantity }
    });

    // Create inventory transaction
    const transaction = await tx.inventoryTransaction.create({
      data: {
        type,
        itemId,
        warehouseId,
        stockId: stock.id,
        quantity: transactionQuantity,
        costPerUnit,
        reference,
        purchaseOrderId,
        saleOrderId,
        productionBatchId,
        createdById,
        note
      },
      include: {
        item: {
          select: { id: true, name: true, sku: true }
        },
        warehouse: {
          select: { id: true, name: true, code: true }
        },
        createdBy: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    // Create stock movement record
    await tx.stockMovement.create({
      data: {
        stockId: stock.id,
        type: movementType,
        quantity: transactionQuantity,
        reference: reference || transaction.id,
        createdBy: createdById
      }
    });

    return { transaction, updatedStock };
  });

  return result.transaction;
}

/**
 * Process purchase order receipt
 * @param {string} purchaseOrderId - Purchase order ID
 * @param {Array} receivedItems - Array of received items
 * @param {string} createdById - User ID who processed the receipt
 * @returns {Array} Created transactions
 */
async function processPurchaseReceipt(purchaseOrderId, receivedItems, createdById) {
  const purchaseOrder = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: {
      items: {
        include: {
          item: true
        }
      }
    }
  });

  if (!purchaseOrder) {
    throw new ValidationError('Purchase order not found');
  }

  const transactions = [];

  for (const receivedItem of receivedItems) {
    const poItem = purchaseOrder.items.find(item => item.itemId === receivedItem.itemId);
    
    if (!poItem) {
      throw new ValidationError(`Item ${receivedItem.itemId} not found in purchase order`);
    }

    const receivedQty = parseFloat(receivedItem.quantity);
    const currentReceived = parseFloat(poItem.receivedQty);
    const orderedQty = parseFloat(poItem.quantity);

    // Check if receiving more than ordered
    if (currentReceived + receivedQty > orderedQty) {
      throw new ValidationError(`Cannot receive more than ordered for item ${poItem.item.sku}`);
    }

    // Create transaction
    const transaction = await createTransaction({
      type: TransactionType.PURCHASE,
      itemId: receivedItem.itemId,
      warehouseId: receivedItem.warehouseId,
      quantity: receivedQty,
      costPerUnit: poItem.unitCost,
      reference: `PO-${purchaseOrder.reference}`,
      purchaseOrderId,
      createdById,
      note: `Purchase receipt - ${receivedQty} units`
    });

    // Update PO item received quantity
    await prisma.pOItem.update({
      where: { id: poItem.id },
      data: { receivedQty: currentReceived + receivedQty }
    });

    transactions.push(transaction);
  }

  // Update PO status
  const allItemsReceived = purchaseOrder.items.every(item => 
    parseFloat(item.receivedQty) >= parseFloat(item.quantity)
  );

  const newStatus = allItemsReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
  await prisma.purchaseOrder.update({
    where: { id: purchaseOrderId },
    data: { status: newStatus }
  });

  return transactions;
}

/**
 * Process sale order fulfillment
 * @param {string} saleOrderId - Sale order ID
 * @param {Array} fulfilledItems - Array of fulfilled items
 * @param {string} createdById - User ID who processed the fulfillment
 * @returns {Array} Created transactions
 */
async function processSaleFulfillment(saleOrderId, fulfilledItems, createdById) {
  const saleOrder = await prisma.saleOrder.findUnique({
    where: { id: saleOrderId },
    include: {
      items: {
        include: {
          item: true
        }
      }
    }
  });

  if (!saleOrder) {
    throw new ValidationError('Sale order not found');
  }

  const transactions = [];

  for (const fulfilledItem of fulfilledItems) {
    const soItem = saleOrder.items.find(item => item.itemId === fulfilledItem.itemId);
    
    if (!soItem) {
      throw new ValidationError(`Item ${fulfilledItem.itemId} not found in sale order`);
    }

    const fulfilledQty = parseFloat(fulfilledItem.quantity);
    const orderedQty = parseFloat(soItem.quantity);

    // Check if fulfilling more than ordered
    if (fulfilledQty > orderedQty) {
      throw new ValidationError(`Cannot fulfill more than ordered for item ${soItem.item.sku}`);
    }

    // Check stock availability
    const stock = await prisma.stock.findUnique({
      where: {
        warehouseId_itemId: {
          warehouseId: fulfilledItem.warehouseId,
          itemId: fulfilledItem.itemId
        }
      }
    });

    if (!stock || parseFloat(stock.quantity) < fulfilledQty) {
      throw new ValidationError(`Insufficient stock for item ${soItem.item.sku}`);
    }

    // Create transaction
    const transaction = await createTransaction({
      type: TransactionType.SALE,
      itemId: fulfilledItem.itemId,
      warehouseId: fulfilledItem.warehouseId,
      quantity: fulfilledQty,
      costPerUnit: fulfilledItem.costPerUnit,
      reference: `SO-${saleOrder.reference}`,
      saleOrderId,
      createdById,
      note: `Sale fulfillment - ${fulfilledQty} units`
    });

    transactions.push(transaction);
  }

  // Update SO status
  await prisma.saleOrder.update({
    where: { id: saleOrderId },
    data: { status: 'COMPLETED' }
  });

  return transactions;
}

/**
 * Process recipe production
 * @param {string} recipeId - Recipe ID
 * @param {number} quantity - Quantity to produce
 * @param {string} warehouseId - Warehouse ID
 * @param {string} createdById - User ID who processed the production
 * @returns {Object} Production result
 */
async function processRecipeProduction(recipeId, quantity, warehouseId, createdById) {
  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: {
      items: {
        include: {
          item: true
        }
      },
      product: true
    }
  });

  if (!recipe) {
    throw new ValidationError('Recipe not found');
  }

  if (!recipe.product) {
    throw new ValidationError('Recipe has no associated product');
  }

  // Check ingredient availability
  const ingredientChecks = await Promise.all(
    recipe.items.map(async (recipeItem) => {
      const stock = await prisma.stock.findUnique({
        where: {
          warehouseId_itemId: {
            warehouseId,
            itemId: recipeItem.itemId
          }
        }
      });

      const requiredQty = parseFloat(recipeItem.quantity) * quantity;
      const availableQty = stock ? parseFloat(stock.quantity) : 0;

      return {
        item: recipeItem.item,
        required: requiredQty,
        available: availableQty,
        sufficient: availableQty >= requiredQty
      };
    })
  );

  // Check if all ingredients are available
  const insufficientIngredients = ingredientChecks.filter(check => !check.sufficient);
  if (insufficientIngredients.length > 0) {
    throw new ValidationError('Insufficient ingredients for production', {
      insufficientIngredients
    });
  }

  // Create production batch
  const batch = await prisma.productionBatch.create({
    data: {
      recipeId,
      batchRef: `BATCH-${Date.now()}`,
      quantity,
      startedAt: new Date()
    }
  });

  const transactions = [];

  // Consume ingredients
  for (const recipeItem of recipe.items) {
    const consumeQty = parseFloat(recipeItem.quantity) * quantity;
    
    const transaction = await createTransaction({
      type: TransactionType.USAGE,
      itemId: recipeItem.itemId,
      warehouseId,
      quantity: consumeQty,
      reference: `BATCH-${batch.batchRef}`,
      productionBatchId: batch.id,
      createdById,
      note: `Production consumption - ${consumeQty} units`
    });

    transactions.push(transaction);
  }

  // Produce finished goods
  const productionTransaction = await createTransaction({
    type: TransactionType.PURCHASE, // Treating production as "purchase" for stock increase
    itemId: recipe.product.id,
    warehouseId,
    quantity,
    costPerUnit: 0, // Will be calculated based on ingredient costs
    reference: `BATCH-${batch.batchRef}`,
    productionBatchId: batch.id,
    createdById,
    note: `Production output - ${quantity} units`
  });

  transactions.push(productionTransaction);

  // Calculate and update batch cost
  const ingredientCost = transactions
    .filter(t => t.type === TransactionType.USAGE)
    .reduce((sum, t) => sum + (parseFloat(t.costPerUnit || 0) * parseFloat(t.quantity)), 0);

  const costPerUnit = quantity > 0 ? ingredientCost / quantity : 0;

  await prisma.productionBatch.update({
    where: { id: batch.id },
    data: {
      costPerUnit,
      finishedAt: new Date()
    }
  });

  return {
    batch,
    transactions,
    costPerUnit
  };
}

module.exports = {
  createTransaction,
  processPurchaseReceipt,
  processSaleFulfillment,
  processRecipeProduction
};
