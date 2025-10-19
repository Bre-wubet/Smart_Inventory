const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { TransactionType, BatchStatus } = require('../../core/constants');

async function createProductionBatch(batchData) {
  const {
    recipeId,
    quantity,
    batchRef,
    notes,
    tenantId,
    createdById
  } = batchData;

  if (!recipeId || !quantity || !tenantId) {
    throw new ValidationError('Recipe ID, quantity, and tenant ID are required');
  }

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, tenantId },
    include: {
      product: {
        select: { id: true, name: true, sku: true }
      },
      items: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, cost: true }
          }
        }
      }
    }
  });

  if (!recipe) {
    throw new NotFoundError('Recipe not found');
  }

  if (!recipe.product) {
    throw new ValidationError('Recipe must have an associated product');
  }

  // Generate batch reference if not provided
  const finalBatchRef = batchRef || `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Check if batch reference already exists
  const existingBatch = await prisma.productionBatch.findUnique({
    where: { batchRef: finalBatchRef }
  });

  if (existingBatch) {
    throw new ValidationError('Batch reference already exists');
  }

  const batch = await prisma.productionBatch.create({
    data: {
      recipeId,
      batchRef: finalBatchRef,
      quantity: parseFloat(quantity),
      status: BatchStatus.PENDING,
      createdAt: new Date()
    }
  });

  return {
    ...batch,
    recipe: {
      id: recipe.id,
      name: recipe.name,
      product: recipe.product
    },
    ingredients: recipe.items.map(item => ({
      itemId: item.item.id,
      itemName: item.item.name,
      sku: item.item.sku,
      requiredQuantity: parseFloat(item.quantity),
      cost: parseFloat(item.item.cost)
    }))
  };
}

async function startProductionBatch(batchId, tenantId, startedById) {
  const batch = await prisma.productionBatch.findFirst({
    where: { 
      id: batchId,
      recipe: { tenantId }
    },
    include: {
      recipe: {
        include: {
          product: {
            select: { id: true, name: true, sku: true }
          }
        }
      }
    }
  });

  if (!batch) {
    throw new NotFoundError('Production batch not found');
  }

  if (batch.status !== BatchStatus.PENDING) {
    throw new ValidationError('Batch is not in pending status');
  }

  const updatedBatch = await prisma.productionBatch.update({
    where: { id: batchId },
    data: {
      status: BatchStatus.IN_PROGRESS,
      startedAt: new Date()
    }
  });

  return {
    ...updatedBatch,
    recipe: batch.recipe
  };
}

async function completeProductionBatch(batchId, tenantId, completionData) {
  const {
    actualQuantity,
    warehouseId,
    completedById,
    notes
  } = completionData;

  const batch = await prisma.productionBatch.findFirst({
    where: { 
      id: batchId,
      recipe: { tenantId }
    },
    include: {
      recipe: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, cost: true }
          },
          items: {
            include: {
              item: {
                select: { id: true, name: true, sku: true, cost: true }
              }
            }
          }
        }
      }
    }
  });

  if (!batch) {
    throw new NotFoundError('Production batch not found');
  }

  if (batch.status !== BatchStatus.IN_PROGRESS) {
    throw new ValidationError('Batch is not in progress');
  }

  const actualQty = parseFloat(actualQuantity || batch.quantity);
  if (actualQty <= 0) {
    throw new ValidationError('Actual quantity must be positive');
  }

  // Complete the batch and create transactions
  const result = await prisma.$transaction(async (tx) => {
    // Update batch status
    const updatedBatch = await tx.productionBatch.update({
      where: { id: batchId },
      data: {
        status: BatchStatus.COMPLETED,
        quantity: actualQty,
        finishedAt: new Date()
      }
    });

    const transactions = [];

    // Consume ingredients
    for (const recipeItem of batch.recipe.items) {
      const consumeQty = parseFloat(recipeItem.quantity) * actualQty;
      
      // Get or create stock record for ingredient
      let ingredientStock = await tx.stock.findUnique({
        where: {
          warehouseId_itemId: {
            warehouseId,
            itemId: recipeItem.itemId
          }
        }
      });

      if (!ingredientStock) {
        ingredientStock = await tx.stock.create({
          data: {
            warehouseId,
            itemId: recipeItem.itemId,
            quantity: 0,
            reserved: 0
          }
        });
      }

      // Check ingredient availability
      if (parseFloat(ingredientStock.quantity) < consumeQty) {
        throw new ValidationError(`Insufficient stock for ingredient ${recipeItem.item.name}`);
      }

      // Update ingredient stock
      await tx.stock.update({
        where: { id: ingredientStock.id },
        data: { quantity: parseFloat(ingredientStock.quantity) - consumeQty }
      });

      // Create consumption transaction
      const consumptionTransaction = await tx.inventoryTransaction.create({
        data: {
          type: TransactionType.USAGE,
          itemId: recipeItem.itemId,
          warehouseId,
          stockId: ingredientStock.id,
          quantity: consumeQty,
          costPerUnit: parseFloat(recipeItem.item.cost),
          reference: `BATCH-${batch.batchRef}`,
          productionBatchId: batchId,
          createdById: completedById,
          note: `Production consumption - ${consumeQty} units for batch ${batch.batchRef}`
        }
      });

      transactions.push(consumptionTransaction);
    }

    // Produce finished goods
    let productStock = await tx.stock.findUnique({
      where: {
        warehouseId_itemId: {
          warehouseId,
          itemId: batch.recipe.product.id
        }
      }
    });

    if (!productStock) {
      productStock = await tx.stock.create({
        data: {
          warehouseId,
          itemId: batch.recipe.product.id,
          quantity: 0,
          reserved: 0
        }
      });
    }

    // Update product stock
    await tx.stock.update({
      where: { id: productStock.id },
      data: { quantity: parseFloat(productStock.quantity) + actualQty }
    });

    // Calculate cost per unit based on ingredient costs
    const totalIngredientCost = transactions.reduce((sum, t) => 
      sum + (parseFloat(t.costPerUnit) * parseFloat(t.quantity)), 0
    );
    const costPerUnit = actualQty > 0 ? totalIngredientCost / actualQty : 0;

    // Create production transaction
    const productionTransaction = await tx.inventoryTransaction.create({
      data: {
        type: TransactionType.PURCHASE, // Treating production as stock increase
        itemId: batch.recipe.product.id,
        warehouseId,
        stockId: productStock.id,
        quantity: actualQty,
        costPerUnit,
        reference: `BATCH-${batch.batchRef}`,
        productionBatchId: batchId,
        createdById: completedById,
        note: `Production output - ${actualQty} units from batch ${batch.batchRef}`
      }
    });

    transactions.push(productionTransaction);

    // Update batch with cost information
    const finalBatch = await tx.productionBatch.update({
      where: { id: batchId },
      data: { costPerUnit }
    });

    return {
      batch: finalBatch,
      transactions
    };
  });

  return result;
}

async function getBatchTraceability(batchId, tenantId) {
  const batch = await prisma.productionBatch.findFirst({
    where: { 
      id: batchId,
      recipe: { tenantId }
    },
    include: {
      recipe: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, type: true }
          },
          items: {
            include: {
              item: {
                select: { id: true, name: true, sku: true, type: true }
              }
            }
          }
        }
      },
      transactions: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, type: true }
          },
          warehouse: {
            select: { id: true, name: true, code: true }
          },
          createdBy: {
            select: { id: true, name: true, email: true }
          }
        },
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  if (!batch) {
    throw new NotFoundError('Production batch not found');
  }

  // Analyze transactions
  const ingredientTransactions = batch.transactions.filter(t => t.type === TransactionType.USAGE);
  const productionTransactions = batch.transactions.filter(t => t.type === TransactionType.PURCHASE);

  // Calculate traceability metrics
  const traceability = {
    batch: {
      id: batch.id,
      batchRef: batch.batchRef,
      status: batch.status,
      plannedQuantity: parseFloat(batch.quantity),
      actualQuantity: parseFloat(batch.quantity), // Updated during completion
      costPerUnit: parseFloat(batch.costPerUnit || 0),
      startedAt: batch.startedAt,
      finishedAt: batch.finishedAt,
      createdAt: batch.createdAt
    },
    recipe: {
      id: batch.recipe.id,
      name: batch.recipe.name,
      product: batch.recipe.product
    },
    ingredients: batch.recipe.items.map(item => ({
      item: item.item,
      requiredQuantity: parseFloat(item.quantity),
      actualConsumed: ingredientTransactions
        .filter(t => t.itemId === item.itemId)
        .reduce((sum, t) => sum + parseFloat(t.quantity), 0)
    })),
    production: {
      totalProduced: productionTransactions.reduce((sum, t) => sum + parseFloat(t.quantity), 0),
      transactions: productionTransactions
    },
    timeline: batch.transactions.map(transaction => ({
      timestamp: transaction.createdAt,
      type: transaction.type,
      item: transaction.item,
      warehouse: transaction.warehouse,
      quantity: parseFloat(transaction.quantity),
      costPerUnit: parseFloat(transaction.costPerUnit || 0),
      reference: transaction.reference,
      createdBy: transaction.createdBy,
      note: transaction.note
    })),
    quality: {
      yieldEfficiency: batch.quantity > 0 ? (parseFloat(batch.quantity) / parseFloat(batch.quantity)) * 100 : 0,
      costEfficiency: batch.costPerUnit ? parseFloat(batch.costPerUnit) : 0
    }
  };

  return traceability;
}

async function getProductBatchHistory(productId, tenantId, filters = {}) {
  const {
    startDate,
    endDate,
    status,
    page = 1,
    limit = 20
  } = filters;

  const skip = (page - 1) * limit;

  const where = {
    recipe: {
      productId,
      tenantId
    },
    ...(status && { status }),
    ...(startDate && endDate && {
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    })
  };

  const [batches, total] = await Promise.all([
    prisma.productionBatch.findMany({
      where,
      skip,
      take: limit,
      include: {
        recipe: {
          select: {
            id: true,
            name: true,
            product: {
              select: { id: true, name: true, sku: true }
            }
          }
        },
        transactions: {
          where: { type: TransactionType.PURCHASE },
          select: {
            quantity: true,
            costPerUnit: true,
            warehouse: {
              select: { id: true, name: true, code: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.productionBatch.count({ where })
  ]);

  // Calculate batch statistics
  const batchStats = batches.map(batch => {
    const productionTransaction = batch.transactions[0];
    const totalProduced = productionTransaction ? parseFloat(productionTransaction.quantity) : 0;
    const costPerUnit = parseFloat(batch.costPerUnit || 0);
    const totalCost = totalProduced * costPerUnit;

    return {
      id: batch.id,
      batchRef: batch.batchRef,
      status: batch.status,
      plannedQuantity: parseFloat(batch.quantity),
      actualQuantity: totalProduced,
      costPerUnit,
      totalCost,
      startedAt: batch.startedAt,
      finishedAt: batch.finishedAt,
      createdAt: batch.createdAt,
      recipe: batch.recipe,
      warehouse: productionTransaction?.warehouse
    };
  });

  // Calculate summary statistics
  const summary = {
    totalBatches: batches.length,
    completedBatches: batches.filter(b => b.status === BatchStatus.COMPLETED).length,
    inProgressBatches: batches.filter(b => b.status === BatchStatus.IN_PROGRESS).length,
    pendingBatches: batches.filter(b => b.status === BatchStatus.PENDING).length,
    totalProduced: batchStats.reduce((sum, b) => sum + b.actualQuantity, 0),
    totalCost: batchStats.reduce((sum, b) => sum + b.totalCost, 0),
    averageCostPerUnit: batchStats.length > 0 
      ? batchStats.reduce((sum, b) => sum + b.costPerUnit, 0) / batchStats.length 
      : 0
  };

  return {
    summary,
    batches: batchStats,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function getIngredientTraceability(itemId, tenantId, filters = {}) {
  const {
    startDate,
    endDate,
    batchStatus,
    page = 1,
    limit = 20
  } = filters;

  const skip = (page - 1) * limit;

  const where = {
    itemId,
    type: TransactionType.USAGE,
    productionBatchId: { not: null },
    ...(startDate && endDate && {
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    })
  };

  const [transactions, total] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where,
      skip,
      take: limit,
      include: {
        item: {
          select: { id: true, name: true, sku: true, type: true }
        },
        warehouse: {
          select: { id: true, name: true, code: true }
        },
        productionBatch: {
          include: {
            recipe: {
              include: {
                product: {
                  select: { id: true, name: true, sku: true }
                }
              }
            }
          }
        },
        createdBy: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.inventoryTransaction.count({ where })
  ]);

  // Group by batch for better traceability
  const batchGroups = transactions.reduce((acc, transaction) => {
    const batchId = transaction.productionBatch.id;
    if (!acc[batchId]) {
      acc[batchId] = {
        batch: transaction.productionBatch,
        transactions: []
      };
    }
    acc[batchId].transactions.push(transaction);
    return acc;
  }, {});

  // Calculate traceability summary
  const summary = {
    totalTransactions: transactions.length,
    totalQuantityUsed: transactions.reduce((sum, t) => sum + parseFloat(t.quantity), 0),
    totalBatches: Object.keys(batchGroups).length,
    uniqueProducts: new Set(transactions.map(t => t.productionBatch.recipe.product.id)).size
  };

  return {
    item: transactions[0]?.item,
    summary,
    batchGroups: Object.values(batchGroups),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function cancelProductionBatch(batchId, tenantId, cancelledById, reason = '') {
  const batch = await prisma.productionBatch.findFirst({
    where: { 
      id: batchId,
      recipe: { tenantId }
    }
  });

  if (!batch) {
    throw new NotFoundError('Production batch not found');
  }

  if (batch.status === BatchStatus.COMPLETED) {
    throw new ValidationError('Cannot cancel a completed batch');
  }

  const cancelledBatch = await prisma.productionBatch.update({
    where: { id: batchId },
    data: {
      status: BatchStatus.CANCELLED,
      finishedAt: new Date()
    }
  });

  return cancelledBatch;
}

module.exports = {
  createProductionBatch,
  startProductionBatch,
  completeProductionBatch,
  getBatchTraceability,
  getProductBatchHistory,
  getIngredientTraceability,
  cancelProductionBatch
};
