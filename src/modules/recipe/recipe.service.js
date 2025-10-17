const { prisma } = require('../../config/db');
const { ValidationError } = require('../../core/exceptions');
const { calculateRecipeCost } = require('../../core/utils/costCalculation');
const inventoryTransactionService = require('../../core/services/inventoryTransaction.service');

async function createRecipe(recipeData) {
  const { name, description, productId, items, tenantId } = recipeData;

  // Validate that all items exist and belong to the tenant
  const itemIds = items.map(item => item.itemId);
  const existingItems = await prisma.item.findMany({
    where: {
      id: { in: itemIds },
      tenantId
    },
    select: { id: true, name: true, sku: true }
  });

  if (existingItems.length !== itemIds.length) {
    throw new ValidationError('One or more items not found or do not belong to tenant');
  }

  // Validate product exists if provided
  if (productId) {
    const product = await prisma.item.findFirst({
      where: { id: productId, tenantId }
    });
    if (!product) {
      throw new ValidationError('Product not found or does not belong to tenant');
    }
  }

  const recipe = await prisma.recipe.create({
    data: {
      name,
      description,
      productId,
      tenantId,
      items: {
        create: items.map(item => ({
          itemId: item.itemId,
          quantity: parseFloat(item.quantity),
          unit: item.unit
        }))
      }
    },
    include: {
      tenant: {
        select: { id: true, name: true }
      },
      product: {
        select: { id: true, name: true, sku: true, unit: true }
      },
      items: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, unit: true, cost: true }
          }
        }
      }
    }
  });

  return recipe;
}

async function getRecipes({ tenantId, page, limit, search, productId }) {
  const skip = (page - 1) * limit;
  
  const where = {
    tenantId,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ]
    }),
    ...(productId && { productId })
  };

  const [recipes, total] = await Promise.all([
    prisma.recipe.findMany({
      where,
      skip,
      take: limit,
      include: {
        product: {
          select: { id: true, name: true, sku: true, unit: true }
        },
        items: {
          include: {
            item: {
              select: { id: true, name: true, sku: true, unit: true, cost: true }
            }
          }
        },
        _count: {
          select: {
            batches: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.recipe.count({ where })
  ]);

  // Calculate cost for each recipe
  const recipesWithCost = recipes.map(recipe => {
    const totalCost = calculateRecipeCost(recipe.items);
    return {
      ...recipe,
      totalCost,
      costPerUnit: recipe.product ? totalCost : null
    };
  });

  return {
    data: recipesWithCost,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function getRecipeById(id, tenantId) {
  const recipe = await prisma.recipe.findFirst({
    where: { id, tenantId },
    include: {
      tenant: {
        select: { id: true, name: true }
      },
      product: {
        select: { id: true, name: true, sku: true, unit: true, cost: true, price: true }
      },
      items: {
        include: {
          item: {
            select: { 
              id: true, 
              name: true, 
              sku: true, 
              unit: true, 
              cost: true,
              type: true,
              stock: {
                include: {
                  warehouse: {
                    select: { id: true, name: true, code: true }
                  }
                }
              }
            }
          }
        }
      },
      batches: {
        include: {
          transactions: {
            include: {
              item: {
                select: { id: true, name: true, sku: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      }
    }
  });

  if (!recipe) return null;

  // Calculate detailed cost analysis
  const costAnalysis = {
    totalCost: calculateRecipeCost(recipe.items),
    ingredientBreakdown: recipe.items.map(item => ({
      item: item.item,
      quantity: parseFloat(item.quantity),
      unit: item.unit,
      unitCost: parseFloat(item.item.cost || 0),
      totalCost: parseFloat(item.quantity) * parseFloat(item.item.cost || 0),
      stockAvailability: item.item.stock.map(stock => ({
        warehouse: stock.warehouse,
        available: parseFloat(stock.quantity) - parseFloat(stock.reserved)
      }))
    }))
  };

  return {
    ...recipe,
    costAnalysis
  };
}

async function updateRecipe(id, tenantId, updateData) {
  const { items, ...restData } = updateData;

  // If items are being updated, validate them
  if (items) {
    const itemIds = items.map(item => item.itemId);
    const existingItems = await prisma.item.findMany({
      where: {
        id: { in: itemIds },
        tenantId
      },
      select: { id: true }
    });

    if (existingItems.length !== itemIds.length) {
      throw new ValidationError('One or more items not found or do not belong to tenant');
    }
  }

  const recipe = await prisma.$transaction(async (tx) => {
    // Update recipe basic info
    const updatedRecipe = await tx.recipe.update({
      where: { id, tenantId },
      data: restData
    });

    // Update items if provided
    if (items) {
      // Delete existing items
      await tx.recipeItem.deleteMany({
        where: { recipeId: id }
      });

      // Create new items
      await tx.recipeItem.createMany({
        data: items.map(item => ({
          recipeId: id,
          itemId: item.itemId,
          quantity: parseFloat(item.quantity),
          unit: item.unit
        }))
      });
    }

    return updatedRecipe;
  });

  return await getRecipeById(id, tenantId);
}

async function deleteRecipe(id, tenantId) {
  // Check if recipe has any production batches
  const batchCount = await prisma.productionBatch.count({
    where: { recipeId: id }
  });

  if (batchCount > 0) {
    throw new ValidationError('Cannot delete recipe with existing production batches');
  }

  await prisma.$transaction(async (tx) => {
    // Delete recipe items first
    await tx.recipeItem.deleteMany({
      where: { recipeId: id }
    });

    // Delete recipe
    await tx.recipe.delete({
      where: { id, tenantId }
    });
  });

  return true;
}

async function calculateRecipeCost(recipeId, tenantId) {
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, tenantId },
    include: {
      product: {
        select: { id: true, name: true, sku: true, unit: true, cost: true, price: true }
      },
      items: {
        include: {
          item: {
            select: { 
              id: true, 
              name: true, 
              sku: true, 
              unit: true, 
              cost: true,
              type: true
            }
          }
        }
      }
    }
  });

  if (!recipe) {
    throw new ValidationError('Recipe not found');
  }

  const totalCost = calculateRecipeCost(recipe.items);
  const costPerUnit = totalCost;

  // Calculate profit margin if product has selling price
  const profitMargin = recipe.product && recipe.product.price > 0 
    ? ((parseFloat(recipe.product.price) - totalCost) / totalCost) * 100 
    : null;

  return {
    recipe: {
      id: recipe.id,
      name: recipe.name,
      product: recipe.product
    },
    costAnalysis: {
      totalCost,
      costPerUnit,
      profitMargin,
      ingredientBreakdown: recipe.items.map(item => ({
        item: item.item,
        quantity: parseFloat(item.quantity),
        unit: item.unit,
        unitCost: parseFloat(item.item.cost || 0),
        totalCost: parseFloat(item.quantity) * parseFloat(item.item.cost || 0)
      }))
    }
  };
}

async function createProductionBatch({ recipeId, quantity, warehouseId, note, createdById }) {
  const recipe = await prisma.recipe.findFirst({
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

  // Use the inventory transaction service to process production
  const result = await inventoryTransactionService.processRecipeProduction(
    recipeId,
    quantity,
    warehouseId,
    createdById
  );

  // Update batch with note if provided
  if (note) {
    await prisma.productionBatch.update({
      where: { id: result.batch.id },
      data: { /* Add note field if needed in schema */ }
    });
  }

  return {
    batch: result.batch,
    transactions: result.transactions,
    costPerUnit: result.costPerUnit,
    totalCost: result.costPerUnit * quantity
  };
}

async function getProductionBatches({ tenantId, page, limit, recipeId }) {
  const skip = (page - 1) * limit;
  
  const where = {
    recipe: {
      tenantId
    },
    ...(recipeId && { recipeId })
  };

  const [batches, total] = await Promise.all([
    prisma.productionBatch.findMany({
      where,
      skip,
      take: limit,
      include: {
        recipe: {
          select: { id: true, name: true, product: { select: { id: true, name: true, sku: true } } }
        },
        transactions: {
          include: {
            item: {
              select: { id: true, name: true, sku: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.productionBatch.count({ where })
  ]);

  return {
    data: batches,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function getProductionBatchById(id, tenantId) {
  const batch = await prisma.productionBatch.findFirst({
    where: { 
      id,
      recipe: {
        tenantId
      }
    },
    include: {
      recipe: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, unit: true, cost: true, price: true }
          },
          items: {
            include: {
              item: {
                select: { id: true, name: true, sku: true, unit: true, cost: true }
              }
            }
          }
        }
      },
      transactions: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, unit: true }
          },
          warehouse: {
            select: { id: true, name: true, code: true }
          }
        }
      }
    }
  });

  if (!batch) return null;

  // Calculate production efficiency and costs
  const ingredientTransactions = batch.transactions.filter(t => t.type === 'USAGE');
  const outputTransactions = batch.transactions.filter(t => t.type === 'PURCHASE');
  
  const totalIngredientCost = ingredientTransactions.reduce((sum, t) => 
    sum + (parseFloat(t.costPerUnit || 0) * parseFloat(t.quantity)), 0
  );

  const actualCostPerUnit = batch.quantity > 0 ? totalIngredientCost / batch.quantity : 0;
  const plannedCostPerUnit = parseFloat(batch.costPerUnit || 0);

  return {
    ...batch,
    productionAnalysis: {
      totalIngredientCost,
      actualCostPerUnit,
      plannedCostPerUnit,
      costVariance: actualCostPerUnit - plannedCostPerUnit,
      efficiency: plannedCostPerUnit > 0 ? (plannedCostPerUnit / actualCostPerUnit) * 100 : null,
      ingredientUsage: ingredientTransactions.map(t => ({
        item: t.item,
        plannedQuantity: parseFloat(t.quantity),
        actualCost: parseFloat(t.costPerUnit || 0) * parseFloat(t.quantity)
      }))
    }
  };
}

module.exports = {
  createRecipe,
  getRecipes,
  getRecipeById,
  updateRecipe,
  deleteRecipe,
  calculateRecipeCost,
  createProductionBatch,
  getProductionBatches,
  getProductionBatchById
};
