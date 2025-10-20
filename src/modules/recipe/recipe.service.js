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

// Advanced Recipe Analytics Functions

// Get comprehensive recipe analytics dashboard
async function getRecipeAnalyticsDashboard(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    groupBy = 'month'
  } = options;

  const where = {
    recipe: { tenantId },
    createdAt: { gte: startDate, lte: endDate }
  };

  const [recipes, batches, transactions] = await Promise.all([
    prisma.recipe.findMany({
      where: { tenantId },
      include: {
        product: { select: { id: true, name: true, sku: true, cost: true, price: true } },
        items: {
          include: {
            item: { select: { id: true, name: true, sku: true, cost: true } }
          }
        },
        _count: { select: { batches: true } }
      }
    }),
    prisma.productionBatch.findMany({
      where,
      include: {
        recipe: {
          select: { id: true, name: true, product: { select: { id: true, name: true } } }
        }
      },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.inventoryTransaction.findMany({
      where: {
        ...where,
        type: 'USAGE'
      },
      include: {
        item: { select: { id: true, name: true, sku: true, cost: true } }
      },
      orderBy: { createdAt: 'asc' }
    })
  ]);

  // Group batches by time period
  const batchTrends = {};
  batches.forEach(batch => {
    let groupKey;
    const date = new Date(batch.createdAt);
    
    switch (groupBy) {
      case 'day':
        groupKey = date.toISOString().slice(0, 10);
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        groupKey = weekStart.toISOString().slice(0, 10);
        break;
      case 'month':
        groupKey = date.toISOString().slice(0, 7);
        break;
      case 'quarter':
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        groupKey = `${date.getFullYear()}-Q${quarter}`;
        break;
      default:
        groupKey = date.toISOString().slice(0, 7);
    }

    if (!batchTrends[groupKey]) {
      batchTrends[groupKey] = {
        period: groupKey,
        totalBatches: 0,
        totalQuantity: 0,
        totalCost: 0,
        recipes: new Set(),
        averageCostPerUnit: 0
      };
    }

    batchTrends[groupKey].totalBatches += 1;
    batchTrends[groupKey].totalQuantity += parseFloat(batch.quantity);
    batchTrends[groupKey].totalCost += parseFloat(batch.costPerUnit || 0) * parseFloat(batch.quantity);
    batchTrends[groupKey].recipes.add(batch.recipeId);
  });

  // Calculate analytics
  const batchAnalytics = Object.values(batchTrends).map(trend => ({
    ...trend,
    uniqueRecipesCount: trend.recipes.size,
    averageCostPerUnit: trend.totalQuantity > 0 ? trend.totalCost / trend.totalQuantity : 0,
    averageBatchSize: trend.totalBatches > 0 ? trend.totalQuantity / trend.totalBatches : 0
  }));

  // Calculate recipe performance metrics
  const recipePerformance = recipes.map(recipe => {
    const recipeBatches = batches.filter(b => b.recipeId === recipe.id);
    const totalQuantity = recipeBatches.reduce((sum, b) => sum + parseFloat(b.quantity), 0);
    const totalCost = recipeBatches.reduce((sum, b) => sum + (parseFloat(b.costPerUnit || 0) * parseFloat(b.quantity)), 0);
    const theoreticalCost = calculateRecipeCost(recipe.items);
    
    const averageCostPerUnit = totalQuantity > 0 ? totalCost / totalQuantity : 0;
    const costVariance = theoreticalCost > 0 ? ((averageCostPerUnit - theoreticalCost) / theoreticalCost) * 100 : 0;
    
    const profitMargin = recipe.product && recipe.product.price > 0 
      ? ((parseFloat(recipe.product.price) - averageCostPerUnit) / parseFloat(recipe.product.price)) * 100 
      : null;

    return {
      recipe: {
        id: recipe.id,
        name: recipe.name,
        product: recipe.product
      },
      performance: {
        totalBatches: recipeBatches.length,
        totalQuantity,
        totalCost,
        theoreticalCost,
        averageCostPerUnit,
        costVariance,
        profitMargin,
        efficiency: theoreticalCost > 0 ? (theoreticalCost / averageCostPerUnit) * 100 : null
      }
    };
  });

  // Calculate summary statistics
  const summary = {
    totalRecipes: recipes.length,
    totalBatches: batches.length,
    totalQuantity: batches.reduce((sum, b) => sum + parseFloat(b.quantity), 0),
    totalCost: batches.reduce((sum, b) => sum + (parseFloat(b.costPerUnit || 0) * parseFloat(b.quantity)), 0),
    averageCostPerUnit: batches.length > 0 
      ? batches.reduce((sum, b) => sum + (parseFloat(b.costPerUnit || 0) * parseFloat(b.quantity)), 0) / 
        batches.reduce((sum, b) => sum + parseFloat(b.quantity), 0) 
      : 0,
    averageProfitMargin: recipePerformance.filter(r => r.performance.profitMargin !== null).length > 0
      ? recipePerformance.filter(r => r.performance.profitMargin !== null)
          .reduce((sum, r) => sum + r.performance.profitMargin, 0) / 
        recipePerformance.filter(r => r.performance.profitMargin !== null).length
      : 0
  };

  return {
    batchTrends: batchAnalytics,
    recipePerformance,
    summary,
    period: { startDate, endDate, groupBy }
  };
}

// Get recipe optimization recommendations
async function getRecipeOptimizationRecommendations(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    focus = 'all' // all, cost, efficiency, quality
  } = options;

  const recommendations = [];

  // Analyze recipe cost efficiency
  if (focus === 'all' || focus === 'cost') {
    const costAnalysis = await analyzeRecipeCostEfficiency(tenantId, startDate, endDate);
    recommendations.push(...costAnalysis);
  }

  // Analyze production efficiency
  if (focus === 'all' || focus === 'efficiency') {
    const efficiencyAnalysis = await analyzeProductionEfficiency(tenantId, startDate, endDate);
    recommendations.push(...efficiencyAnalysis);
  }

  // Analyze ingredient usage
  if (focus === 'all' || focus === 'quality') {
    const ingredientAnalysis = await analyzeIngredientUsage(tenantId, startDate, endDate);
    recommendations.push(...ingredientAnalysis);
  }

  // Sort by potential savings
  recommendations.sort((a, b) => b.potentialSavings - a.potentialSavings);

  return {
    recommendations,
    summary: {
      totalRecommendations: recommendations.length,
      totalPotentialSavings: recommendations.reduce((sum, rec) => sum + rec.potentialSavings, 0),
      highImpactRecommendations: recommendations.filter(rec => rec.impact === 'HIGH').length,
      mediumImpactRecommendations: recommendations.filter(rec => rec.impact === 'MEDIUM').length,
      lowImpactRecommendations: recommendations.filter(rec => rec.impact === 'LOW').length
    },
    period: { startDate, endDate }
  };
}

// Get recipe scaling analysis
async function getRecipeScalingAnalysis(tenantId, recipeId, targetQuantity) {
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, tenantId },
    include: {
      product: { select: { id: true, name: true, sku: true, unit: true } },
      items: {
        include: {
          item: {
            select: { 
              id: true, 
              name: true, 
              sku: true, 
              unit: true, 
              cost: true,
              stock: {
                include: {
                  warehouse: { select: { id: true, name: true, code: true } }
                }
              }
            }
          }
        }
      },
      batches: {
        orderBy: { createdAt: 'desc' },
        take: 10
      }
    }
  });

  if (!recipe) {
    throw new ValidationError('Recipe not found');
  }

  // Calculate scaling factors
  const baseQuantity = 1; // Assuming base recipe is for 1 unit
  const scalingFactor = targetQuantity / baseQuantity;

  // Scale ingredients
  const scaledIngredients = recipe.items.map(item => {
    const scaledQuantity = parseFloat(item.quantity) * scalingFactor;
    const totalCost = scaledQuantity * parseFloat(item.item.cost || 0);
    
    // Check stock availability
    const totalStock = item.item.stock.reduce((sum, stock) => 
      sum + parseFloat(stock.quantity) - parseFloat(stock.reserved), 0
    );
    
    const stockShortage = Math.max(0, scaledQuantity - totalStock);
    const stockAvailability = totalStock >= scaledQuantity ? 100 : (totalStock / scaledQuantity) * 100;

    return {
      item: item.item,
      baseQuantity: parseFloat(item.quantity),
      scaledQuantity,
      unitCost: parseFloat(item.item.cost || 0),
      totalCost,
      stockAvailability,
      stockShortage,
      warehouses: item.item.stock.map(stock => ({
        warehouse: stock.warehouse,
        available: parseFloat(stock.quantity) - parseFloat(stock.reserved),
        required: scaledQuantity * (parseFloat(stock.quantity) / totalStock) // Proportional requirement
      }))
    };
  });

  // Calculate total costs
  const totalIngredientCost = scaledIngredients.reduce((sum, ing) => sum + ing.totalCost, 0);
  const totalStockShortage = scaledIngredients.reduce((sum, ing) => sum + ing.stockShortage, 0);
  const averageStockAvailability = scaledIngredients.length > 0 
    ? scaledIngredients.reduce((sum, ing) => sum + ing.stockAvailability, 0) / scaledIngredients.length 
    : 0;

  // Calculate production efficiency based on historical data
  const historicalEfficiency = recipe.batches.length > 0 
    ? recipe.batches.reduce((sum, batch) => {
        const plannedCost = calculateRecipeCost(recipe.items) * parseFloat(batch.quantity);
        const actualCost = parseFloat(batch.costPerUnit || 0) * parseFloat(batch.quantity);
        return sum + (plannedCost > 0 ? (plannedCost / actualCost) * 100 : 100);
      }, 0) / recipe.batches.length
    : 100;

  // Generate recommendations
  const recommendations = [];
  
  if (averageStockAvailability < 80) {
    recommendations.push({
      type: 'INVENTORY',
      title: 'Insufficient Stock for Scaling',
      description: `Average stock availability is ${averageStockAvailability.toFixed(1)}%`,
      impact: averageStockAvailability < 50 ? 'HIGH' : 'MEDIUM',
      recommendation: 'Procure additional ingredients before scaling production',
      data: { averageStockAvailability, totalStockShortage }
    });
  }

  if (historicalEfficiency < 90) {
    recommendations.push({
      type: 'EFFICIENCY',
      title: 'Production Efficiency Concerns',
      description: `Historical efficiency is ${historicalEfficiency.toFixed(1)}%`,
      impact: historicalEfficiency < 80 ? 'HIGH' : 'MEDIUM',
      recommendation: 'Review production processes before scaling',
      data: { historicalEfficiency, batchCount: recipe.batches.length }
    });
  }

  return {
    recipe: {
      id: recipe.id,
      name: recipe.name,
      product: recipe.product
    },
    scaling: {
      baseQuantity,
      targetQuantity,
      scalingFactor,
      totalIngredientCost,
      costPerUnit: targetQuantity > 0 ? totalIngredientCost / targetQuantity : 0
    },
    ingredients: scaledIngredients,
    stockAnalysis: {
      averageStockAvailability,
      totalStockShortage,
      canProduce: averageStockAvailability >= 80
    },
    efficiencyAnalysis: {
      historicalEfficiency,
      estimatedEfficiency: Math.max(80, historicalEfficiency * 0.95), // Slight efficiency loss for scaling
      batchCount: recipe.batches.length
    },
    recommendations
  };
}

// Get production planning analysis
async function getProductionPlanningAnalysis(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    recipeId,
    priority = 'cost' // cost, efficiency, demand
  } = options;

  const where = {
    recipe: { tenantId },
    ...(recipeId && { recipeId })
  };

  const [recipes, batches, sales] = await Promise.all([
    prisma.recipe.findMany({
      where: { tenantId },
      include: {
        product: { select: { id: true, name: true, sku: true, price: true } },
        items: {
          include: {
            item: {
              select: { 
                id: true, 
                name: true, 
                sku: true, 
                cost: true,
                stock: {
                  include: {
                    warehouse: { select: { id: true, name: true } }
                  }
                }
              }
            }
          }
        }
      }
    }),
    prisma.productionBatch.findMany({
      where: {
        ...where,
        createdAt: { gte: startDate, lte: endDate }
      },
      include: {
        recipe: {
          select: { id: true, name: true, product: { select: { id: true, name: true } } }
        }
      }
    }),
    prisma.inventoryTransaction.findMany({
      where: {
        item: { tenantId },
        type: 'SALE',
        createdAt: { gte: startDate, lte: endDate }
      },
      include: {
        item: { select: { id: true, name: true, sku: true } }
      }
    })
  ]);

  // Analyze demand patterns
  const demandAnalysis = {};
  sales.forEach(transaction => {
    const itemId = transaction.itemId;
    if (!demandAnalysis[itemId]) {
      demandAnalysis[itemId] = {
        item: transaction.item,
        totalQuantity: 0,
        transactions: 0,
        averageDailyDemand: 0
      };
    }
    demandAnalysis[itemId].totalQuantity += parseFloat(transaction.quantity);
    demandAnalysis[itemId].transactions += 1;
  });

  // Calculate average daily demand
  const daysInPeriod = Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000));
  Object.values(demandAnalysis).forEach(analysis => {
    analysis.averageDailyDemand = analysis.totalQuantity / daysInPeriod;
  });

  // Generate production recommendations
  const productionRecommendations = recipes.map(recipe => {
    const productDemand = demandAnalysis[recipe.product?.id];
    const averageDailyDemand = productDemand?.averageDailyDemand || 0;
    
    // Calculate current stock
    const currentStock = recipe.product ? 
      recipe.product.stock?.reduce((sum, stock) => sum + parseFloat(stock.quantity), 0) || 0 : 0;
    
    // Calculate ingredient availability
    const ingredientAvailability = recipe.items.map(item => {
      const totalStock = item.item.stock.reduce((sum, stock) => 
        sum + parseFloat(stock.quantity) - parseFloat(stock.reserved), 0
      );
      const requiredForDemand = parseFloat(item.quantity) * averageDailyDemand * 7; // 7 days
      return {
        item: item.item,
        available: totalStock,
        required: requiredForDemand,
        availability: totalStock >= requiredForDemand ? 100 : (totalStock / requiredForDemand) * 100
      };
    });

    const averageIngredientAvailability = ingredientAvailability.length > 0 
      ? ingredientAvailability.reduce((sum, ing) => sum + ing.availability, 0) / ingredientAvailability.length 
      : 0;

    // Calculate production priority score
    let priorityScore = 0;
    switch (priority) {
      case 'cost':
        priorityScore = averageIngredientAvailability * 0.4 + (100 - currentStock) * 0.6;
        break;
      case 'efficiency':
        priorityScore = averageIngredientAvailability * 0.6 + averageDailyDemand * 0.4;
        break;
      case 'demand':
        priorityScore = averageDailyDemand * 0.7 + averageIngredientAvailability * 0.3;
        break;
      default:
        priorityScore = (averageIngredientAvailability + averageDailyDemand + (100 - currentStock)) / 3;
    }

    // Generate recommendations
    const recommendations = [];
    
    if (averageDailyDemand > 0 && currentStock < averageDailyDemand * 7) {
      const suggestedQuantity = Math.ceil(averageDailyDemand * 14); // 2 weeks of demand
      recommendations.push({
        type: 'PRODUCTION',
        title: 'Schedule Production Run',
        description: `Suggested quantity: ${suggestedQuantity} units`,
        impact: averageDailyDemand > 10 ? 'HIGH' : 'MEDIUM',
        recommendation: 'Schedule production to meet demand',
        data: { suggestedQuantity, averageDailyDemand, currentStock }
      });
    }

    if (averageIngredientAvailability < 80) {
      recommendations.push({
        type: 'PROCUREMENT',
        title: 'Procure Ingredients',
        description: `Ingredient availability: ${averageIngredientAvailability.toFixed(1)}%`,
        impact: averageIngredientAvailability < 50 ? 'HIGH' : 'MEDIUM',
        recommendation: 'Order ingredients before production',
        data: { averageIngredientAvailability, ingredientAvailability }
      });
    }

    return {
      recipe: {
        id: recipe.id,
        name: recipe.name,
        product: recipe.product
      },
      analysis: {
        averageDailyDemand,
        currentStock,
        averageIngredientAvailability,
        priorityScore,
        daysOfStock: averageDailyDemand > 0 ? currentStock / averageDailyDemand : 0
      },
      ingredientAvailability,
      recommendations
    };
  });

  // Sort by priority score
  productionRecommendations.sort((a, b) => b.analysis.priorityScore - a.analysis.priorityScore);

  return {
    recommendations: productionRecommendations,
    summary: {
      totalRecipes: recipes.length,
      highPriorityRecipes: productionRecommendations.filter(r => r.analysis.priorityScore > 70).length,
      mediumPriorityRecipes: productionRecommendations.filter(r => r.analysis.priorityScore > 40 && r.analysis.priorityScore <= 70).length,
      lowPriorityRecipes: productionRecommendations.filter(r => r.analysis.priorityScore <= 40).length,
      averageDemand: Object.values(demandAnalysis).reduce((sum, d) => sum + d.averageDailyDemand, 0) / Object.keys(demandAnalysis).length
    },
    period: { startDate, endDate },
    priority
  };
}

// Helper functions for recipe analytics
async function analyzeRecipeCostEfficiency(tenantId, startDate, endDate) {
  const recommendations = [];
  
  const recipes = await prisma.recipe.findMany({
    where: { tenantId },
    include: {
      product: { select: { id: true, name: true, sku: true, cost: true, price: true } },
      items: {
        include: {
          item: { select: { id: true, name: true, sku: true, cost: true } }
        }
      },
      batches: {
        where: {
          createdAt: { gte: startDate, lte: endDate }
        }
      }
    }
  });

  recipes.forEach(recipe => {
    if (recipe.batches.length > 2) {
      const theoreticalCost = calculateRecipeCost(recipe.items);
      const actualCosts = recipe.batches.map(batch => parseFloat(batch.costPerUnit || 0));
      const averageActualCost = actualCosts.reduce((sum, cost) => sum + cost, 0) / actualCosts.length;
      
      const costVariance = theoreticalCost > 0 ? ((averageActualCost - theoreticalCost) / theoreticalCost) * 100 : 0;
      
      if (Math.abs(costVariance) > 15) {
        recommendations.push({
          type: 'COST',
          category: 'cost_efficiency',
          title: `Cost Variance in ${recipe.name}`,
          description: `Actual cost ${costVariance > 0 ? 'above' : 'below'} theoretical by ${Math.abs(costVariance).toFixed(1)}%`,
          impact: Math.abs(costVariance) > 25 ? 'HIGH' : 'MEDIUM',
          potentialSavings: Math.abs(costVariance) * theoreticalCost * 100, // Assuming 100 units
          recommendation: costVariance > 0 
            ? 'Review ingredient usage and supplier costs'
            : 'Consider updating theoretical cost calculations',
          data: {
            recipe: { id: recipe.id, name: recipe.name },
            theoreticalCost,
            averageActualCost,
            costVariance,
            batchCount: recipe.batches.length
          }
        });
      }
    }
  });

  return recommendations;
}

async function analyzeProductionEfficiency(tenantId, startDate, endDate) {
  const recommendations = [];
  
  const batches = await prisma.productionBatch.findMany({
    where: {
      recipe: { tenantId },
      createdAt: { gte: startDate, lte: endDate }
    },
    include: {
      recipe: {
        include: {
          product: { select: { id: true, name: true, sku: true } },
          items: {
            include: {
              item: { select: { id: true, name: true, cost: true } }
            }
          }
        }
      }
    }
  });

  // Group by recipe
  const recipeBatches = {};
  batches.forEach(batch => {
    const recipeId = batch.recipeId;
    if (!recipeBatches[recipeId]) {
      recipeBatches[recipeId] = [];
    }
    recipeBatches[recipeId].push(batch);
  });

  Object.entries(recipeBatches).forEach(([recipeId, recipeBatches]) => {
    if (recipeBatches.length > 3) {
      const recipe = recipeBatches[0].recipe;
      const theoreticalCost = calculateRecipeCost(recipe.items);
      
      const efficiencies = recipeBatches.map(batch => {
        const actualCost = parseFloat(batch.costPerUnit || 0);
        return theoreticalCost > 0 ? (theoreticalCost / actualCost) * 100 : 100;
      });
      
      const averageEfficiency = efficiencies.reduce((sum, eff) => sum + eff, 0) / efficiencies.length;
      const efficiencyVariance = calculateVariance(efficiencies);
      
      if (averageEfficiency < 85 || efficiencyVariance > 100) {
        recommendations.push({
          type: 'EFFICIENCY',
          category: 'production_efficiency',
          title: `Production Efficiency Issues in ${recipe.name}`,
          description: `Average efficiency: ${averageEfficiency.toFixed(1)}%, Variance: ${efficiencyVariance.toFixed(1)}`,
          impact: averageEfficiency < 80 ? 'HIGH' : 'MEDIUM',
          potentialSavings: (100 - averageEfficiency) * theoreticalCost * 1000, // Assuming 1000 units
          recommendation: 'Review production processes and training',
          data: {
            recipe: { id: recipe.id, name: recipe.name },
            averageEfficiency,
            efficiencyVariance,
            batchCount: recipeBatches.length
          }
        });
      }
    }
  });

  return recommendations;
}

async function analyzeIngredientUsage(tenantId, startDate, endDate) {
  const recommendations = [];
  
  const transactions = await prisma.inventoryTransaction.findMany({
    where: {
      item: { tenantId },
      type: 'USAGE',
      createdAt: { gte: startDate, lte: endDate },
      productionBatch: { isNot: null }
    },
    include: {
      item: { select: { id: true, name: true, sku: true } },
      productionBatch: {
        include: {
          recipe: {
            include: {
              items: {
                include: {
                  item: { select: { id: true, name: true } }
                }
              }
            }
          }
        }
      }
    }
  });

  // Group by recipe and ingredient
  const usageAnalysis = {};
  transactions.forEach(transaction => {
    const recipeId = transaction.productionBatch.recipeId;
    const itemId = transaction.itemId;
    const key = `${recipeId}-${itemId}`;
    
    if (!usageAnalysis[key]) {
      usageAnalysis[key] = {
        recipe: transaction.productionBatch.recipe,
        item: transaction.item,
        plannedQuantity: 0,
        actualQuantity: 0,
        batches: 0
      };
    }
    
    // Find planned quantity from recipe
    const recipeItem = transaction.productionBatch.recipe.items.find(ri => ri.itemId === itemId);
    const plannedQuantity = recipeItem ? parseFloat(recipeItem.quantity) * parseFloat(transaction.productionBatch.quantity) : 0;
    
    usageAnalysis[key].plannedQuantity += plannedQuantity;
    usageAnalysis[key].actualQuantity += parseFloat(transaction.quantity);
    usageAnalysis[key].batches += 1;
  });

  Object.values(usageAnalysis).forEach(analysis => {
    if (analysis.batches > 2) {
      const averagePlanned = analysis.plannedQuantity / analysis.batches;
      const averageActual = analysis.actualQuantity / analysis.batches;
      const usageVariance = averagePlanned > 0 ? ((averageActual - averagePlanned) / averagePlanned) * 100 : 0;
      
      if (Math.abs(usageVariance) > 10) {
        recommendations.push({
          type: 'QUALITY',
          category: 'ingredient_usage',
          title: `Ingredient Usage Variance: ${analysis.item.name}`,
          description: `Usage ${usageVariance > 0 ? 'above' : 'below'} planned by ${Math.abs(usageVariance).toFixed(1)}%`,
          impact: Math.abs(usageVariance) > 20 ? 'HIGH' : 'MEDIUM',
          potentialSavings: Math.abs(usageVariance) * parseFloat(analysis.item.cost || 0) * 100,
          recommendation: usageVariance > 0 
            ? 'Review portioning and waste reduction'
            : 'Verify recipe accuracy and measurements',
          data: {
            recipe: analysis.recipe,
            item: analysis.item,
            averagePlanned,
            averageActual,
            usageVariance,
            batchCount: analysis.batches
          }
        });
      }
    }
  });

  return recommendations;
}

function calculateVariance(values) {
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
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
  getProductionBatchById,
  // Advanced Analytics Functions
  getRecipeAnalyticsDashboard,
  getRecipeOptimizationRecommendations,
  getRecipeScalingAnalysis,
  getProductionPlanningAnalysis
};
