// src/modules/recipe/recipe-analytics.service.js
const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');

// Advanced Recipe Analytics Service
// This service provides specialized analytics functions for recipe management

// Get recipe performance analysis
async function getRecipePerformanceAnalysis(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    recipeId,
    groupBy = 'recipe' // recipe, product, category
  } = options;

  const where = {
    recipe: { tenantId },
    createdAt: { gte: startDate, lte: endDate },
    ...(recipeId && { recipeId })
  };

  const [recipes, batches, transactions] = await Promise.all([
    prisma.recipe.findMany({
      where: { tenantId },
      include: {
        product: { select: { id: true, name: true, sku: true, type: true } },
        items: {
          include: {
            item: { select: { id: true, name: true, sku: true, type: true } }
          }
        }
      }
    }),
    prisma.productionBatch.findMany({
      where,
      include: {
        recipe: {
          select: { id: true, name: true, product: { select: { id: true, name: true } } }
        }
      }
    }),
    prisma.inventoryTransaction.findMany({
      where: {
        ...where,
        type: 'USAGE'
      },
      include: {
        item: { select: { id: true, name: true, sku: true, type: true } }
      }
    })
  ]);

  // Group by specified criteria
  const performanceGroups = {};
  
  batches.forEach(batch => {
    let groupKey;
    let groupName;
    
    switch (groupBy) {
      case 'recipe':
        groupKey = batch.recipeId;
        groupName = batch.recipe.name;
        break;
      case 'product':
        groupKey = batch.recipe.product?.id || 'no-product';
        groupName = batch.recipe.product?.name || 'No Product';
        break;
      case 'category':
        groupKey = batch.recipe.product?.type || 'no-category';
        groupName = batch.recipe.product?.type || 'No Category';
        break;
      default:
        groupKey = batch.recipeId;
        groupName = batch.recipe.name;
    }

    if (!performanceGroups[groupKey]) {
      performanceGroups[groupKey] = {
        groupKey,
        groupName,
        batches: [],
        totalQuantity: 0,
        totalCost: 0,
        theoreticalCost: 0,
        efficiency: 0,
        costVariance: 0
      };
    }

    performanceGroups[groupKey].batches.push(batch);
    performanceGroups[groupKey].totalQuantity += parseFloat(batch.quantity);
    performanceGroups[groupKey].totalCost += parseFloat(batch.costPerUnit || 0) * parseFloat(batch.quantity);
  });

  // Calculate performance metrics for each group
  const performanceAnalysis = Object.values(performanceGroups).map(group => {
    const batchCount = group.batches.length;
    const averageQuantity = group.totalQuantity / batchCount;
    const averageCost = group.totalCost / group.totalQuantity;
    
    // Calculate theoretical cost from recipe
    const recipe = recipes.find(r => r.id === group.batches[0].recipeId);
    const theoreticalCost = recipe ? calculateRecipeCost(recipe.items) : 0;
    group.theoreticalCost = theoreticalCost;
    
    // Calculate efficiency and variance
    const efficiency = theoreticalCost > 0 ? (theoreticalCost / averageCost) * 100 : 0;
    const costVariance = theoreticalCost > 0 ? ((averageCost - theoreticalCost) / theoreticalCost) * 100 : 0;
    
    group.efficiency = efficiency;
    group.costVariance = costVariance;

    // Calculate additional metrics
    const batchSizes = group.batches.map(b => parseFloat(b.quantity));
    const batchSizeVariance = calculateVariance(batchSizes);
    const batchSizeConsistency = batchSizeVariance > 0 ? (1 - (Math.sqrt(batchSizeVariance) / averageQuantity)) * 100 : 100;

    return {
      ...group,
      metrics: {
        batchCount,
        averageQuantity,
        averageCost,
        theoreticalCost,
        efficiency,
        costVariance,
        batchSizeConsistency,
        totalProductionDays: calculateProductionDays(group.batches),
        averageProductionRate: group.totalQuantity / calculateProductionDays(group.batches)
      },
      performance: {
        costEfficiency: efficiency > 90 ? 'EXCELLENT' : efficiency > 80 ? 'GOOD' : efficiency > 70 ? 'FAIR' : 'POOR',
        consistency: batchSizeConsistency > 90 ? 'EXCELLENT' : batchSizeConsistency > 80 ? 'GOOD' : batchSizeConsistency > 70 ? 'FAIR' : 'POOR',
        overall: calculateOverallPerformance(efficiency, batchSizeConsistency, costVariance)
      }
    };
  });

  // Sort by overall performance
  performanceAnalysis.sort((a, b) => b.metrics.efficiency - a.metrics.efficiency);

  return {
    performanceAnalysis,
    summary: {
      totalGroups: performanceAnalysis.length,
      excellentPerformance: performanceAnalysis.filter(g => g.performance.overall === 'EXCELLENT').length,
      goodPerformance: performanceAnalysis.filter(g => g.performance.overall === 'GOOD').length,
      fairPerformance: performanceAnalysis.filter(g => g.performance.overall === 'FAIR').length,
      poorPerformance: performanceAnalysis.filter(g => g.performance.overall === 'POOR').length,
      averageEfficiency: performanceAnalysis.length > 0 
        ? performanceAnalysis.reduce((sum, g) => sum + g.metrics.efficiency, 0) / performanceAnalysis.length 
        : 0
    },
    groupBy,
    period: { startDate, endDate }
  };
}

// Get ingredient utilization analysis
async function getIngredientUtilizationAnalysis(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    recipeId
  } = options;

  const where = {
    item: { tenantId },
    createdAt: { gte: startDate, lte: endDate },
    type: 'USAGE',
    productionBatch: { isNot: null },
    ...(recipeId && { productionBatch: { recipeId } })
  };

  const transactions = await prisma.inventoryTransaction.findMany({
    where,
    include: {
      item: { select: { id: true, name: true, sku: true, type: true, cost: true } },
      productionBatch: {
        include: {
          recipe: {
            include: {
              items: {
                include: {
                  item: { select: { id: true, name: true, sku: true } }
                }
              }
            }
          }
        }
      }
    }
  });

  // Group by recipe and ingredient
  const utilizationData = {};
  transactions.forEach(transaction => {
    const recipeId = transaction.productionBatch.recipeId;
    const itemId = transaction.itemId;
    const key = `${recipeId}-${itemId}`;
    
    if (!utilizationData[key]) {
      utilizationData[key] = {
        recipe: transaction.productionBatch.recipe,
        ingredient: transaction.item,
        plannedUsage: [],
        actualUsage: [],
        batches: 0
      };
    }

    // Find planned quantity from recipe
    const recipeItem = transaction.productionBatch.recipe.items.find(ri => ri.itemId === itemId);
    const plannedQuantity = recipeItem ? parseFloat(recipeItem.quantity) * parseFloat(transaction.productionBatch.quantity) : 0;
    
    utilizationData[key].plannedUsage.push(plannedQuantity);
    utilizationData[key].actualUsage.push(parseFloat(transaction.quantity));
    utilizationData[key].batches += 1;
  });

  // Calculate utilization metrics
  const utilizationAnalysis = Object.values(utilizationData).map(data => {
    if (data.batches < 2) {
      return {
        recipe: data.recipe,
        ingredient: data.ingredient,
        utilization: 100,
        variance: 0,
        recommendation: 'Insufficient data for analysis'
      };
    }

    const averagePlanned = data.plannedUsage.reduce((sum, qty) => sum + qty, 0) / data.batches;
    const averageActual = data.actualUsage.reduce((sum, qty) => sum + qty, 0) / data.batches;
    const utilization = averagePlanned > 0 ? (averageActual / averagePlanned) * 100 : 0;
    const variance = calculateVariance(data.actualUsage);
    const coefficientOfVariation = averageActual > 0 ? (Math.sqrt(variance) / averageActual) * 100 : 0;

    // Generate recommendations
    let recommendation = 'Ingredient utilization is optimal';
    if (utilization > 110) {
      recommendation = 'Over-utilization detected. Review portioning and waste reduction';
    } else if (utilization < 90) {
      recommendation = 'Under-utilization detected. Verify recipe accuracy and measurements';
    } else if (coefficientOfVariation > 15) {
      recommendation = 'High utilization variance. Improve consistency in ingredient usage';
    }

    return {
      recipe: data.recipe,
      ingredient: data.ingredient,
      metrics: {
        averagePlanned: averagePlanned,
        averageActual: averageActual,
        utilization: utilization,
        variance: variance,
        coefficientOfVariation: coefficientOfVariation,
        batchCount: data.batches,
        totalPlanned: data.plannedUsage.reduce((sum, qty) => sum + qty, 0),
        totalActual: data.actualUsage.reduce((sum, qty) => sum + qty, 0)
      },
      recommendation,
      efficiency: utilization > 95 && utilization < 105 ? 'OPTIMAL' : 
                 utilization > 90 && utilization < 110 ? 'GOOD' : 'NEEDS_IMPROVEMENT'
    };
  });

  // Sort by utilization variance (highest variance first)
  utilizationAnalysis.sort((a, b) => b.metrics.coefficientOfVariation - a.metrics.coefficientOfVariation);

  return {
    utilizationAnalysis,
    summary: {
      totalIngredients: utilizationAnalysis.length,
      optimalUtilization: utilizationAnalysis.filter(u => u.efficiency === 'OPTIMAL').length,
      goodUtilization: utilizationAnalysis.filter(u => u.efficiency === 'GOOD').length,
      needsImprovement: utilizationAnalysis.filter(u => u.efficiency === 'NEEDS_IMPROVEMENT').length,
      averageUtilization: utilizationAnalysis.length > 0 
        ? utilizationAnalysis.reduce((sum, u) => sum + u.metrics.utilization, 0) / utilizationAnalysis.length 
        : 0
    },
    period: { startDate, endDate }
  };
}

// Get recipe cost breakdown analysis
async function getRecipeCostBreakdownAnalysis(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    recipeId
  } = options;

  const where = {
    recipe: { tenantId },
    createdAt: { gte: startDate, lte: endDate },
    ...(recipeId && { recipeId })
  };

  const [recipes, batches] = await Promise.all([
    prisma.recipe.findMany({
      where: { tenantId },
      include: {
        product: { select: { id: true, name: true, sku: true, price: true } },
        items: {
          include: {
            item: { select: { id: true, name: true, sku: true, type: true, cost: true } }
          }
        }
      }
    }),
    prisma.productionBatch.findMany({
      where,
      include: {
        recipe: {
          select: { id: true, name: true, product: { select: { id: true, name: true } } }
        }
      }
    })
  ]);

  // Analyze cost breakdown for each recipe
  const costBreakdownAnalysis = recipes.map(recipe => {
    const recipeBatches = batches.filter(b => b.recipeId === recipe.id);
    
    if (recipeBatches.length === 0) {
      return {
        recipe: {
          id: recipe.id,
          name: recipe.name,
          product: recipe.product
        },
        costBreakdown: {
          theoreticalCost: calculateRecipeCost(recipe.items),
          actualCost: 0,
          costVariance: 0,
          ingredientBreakdown: recipe.items.map(item => ({
            ingredient: item.item,
            plannedQuantity: parseFloat(item.quantity),
            plannedCost: parseFloat(item.quantity) * parseFloat(item.item.cost || 0),
            actualCost: 0,
            costVariance: 0
          })),
          profitMargin: null
        },
        analysis: {
          status: 'NO_DATA',
          recommendation: 'No production batches found for analysis'
        }
      };
    }

    // Calculate actual costs from batches
    const totalActualCost = recipeBatches.reduce((sum, batch) => 
      sum + (parseFloat(batch.costPerUnit || 0) * parseFloat(batch.quantity)), 0
    );
    const totalQuantity = recipeBatches.reduce((sum, batch) => sum + parseFloat(batch.quantity), 0);
    const averageActualCost = totalQuantity > 0 ? totalActualCost / totalQuantity : 0;
    
    const theoreticalCost = calculateRecipeCost(recipe.items);
    const costVariance = theoreticalCost > 0 ? ((averageActualCost - theoreticalCost) / theoreticalCost) * 100 : 0;

    // Calculate ingredient cost breakdown
    const ingredientBreakdown = recipe.items.map(item => {
      const plannedCost = parseFloat(item.quantity) * parseFloat(item.item.cost || 0);
      const actualCost = plannedCost; // Simplified - in real implementation, would calculate from actual usage
      const ingredientCostVariance = plannedCost > 0 ? ((actualCost - plannedCost) / plannedCost) * 100 : 0;

      return {
        ingredient: item.item,
        plannedQuantity: parseFloat(item.quantity),
        plannedCost: plannedCost,
        actualCost: actualCost,
        costVariance: ingredientCostVariance,
        costPercentage: theoreticalCost > 0 ? (plannedCost / theoreticalCost) * 100 : 0
      };
    });

    // Calculate profit margin
    const profitMargin = recipe.product && recipe.product.price > 0 
      ? ((parseFloat(recipe.product.price) - averageActualCost) / parseFloat(recipe.product.price)) * 100 
      : null;

    // Generate analysis and recommendations
    let status = 'OPTIMAL';
    let recommendation = 'Recipe cost performance is optimal';
    
    if (Math.abs(costVariance) > 15) {
      status = costVariance > 0 ? 'OVER_COST' : 'UNDER_COST';
      recommendation = costVariance > 0 
        ? 'Actual costs exceed theoretical costs. Review ingredient costs and usage efficiency'
        : 'Actual costs below theoretical costs. Consider updating theoretical cost calculations';
    } else if (profitMargin !== null && profitMargin < 20) {
      status = 'LOW_MARGIN';
      recommendation = 'Low profit margin detected. Consider cost reduction or price optimization';
    }

    return {
      recipe: {
        id: recipe.id,
        name: recipe.name,
        product: recipe.product
      },
      costBreakdown: {
        theoreticalCost: theoreticalCost,
        actualCost: averageActualCost,
        costVariance: costVariance,
        ingredientBreakdown: ingredientBreakdown.sort((a, b) => b.plannedCost - a.plannedCost),
        profitMargin: profitMargin,
        batchCount: recipeBatches.length,
        totalQuantity: totalQuantity
      },
      analysis: {
        status: status,
        recommendation: recommendation,
        topCostIngredient: ingredientBreakdown[0] || null,
        costConcentration: ingredientBreakdown.length > 0 
          ? ingredientBreakdown.slice(0, 3).reduce((sum, ing) => sum + ing.costPercentage, 0)
          : 0
      }
    };
  });

  // Sort by cost variance (highest variance first)
  costBreakdownAnalysis.sort((a, b) => Math.abs(b.costBreakdown.costVariance) - Math.abs(a.costBreakdown.costVariance));

  return {
    costBreakdownAnalysis,
    summary: {
      totalRecipes: costBreakdownAnalysis.length,
      optimalCost: costBreakdownAnalysis.filter(r => r.analysis.status === 'OPTIMAL').length,
      overCost: costBreakdownAnalysis.filter(r => r.analysis.status === 'OVER_COST').length,
      underCost: costBreakdownAnalysis.filter(r => r.analysis.status === 'UNDER_COST').length,
      lowMargin: costBreakdownAnalysis.filter(r => r.analysis.status === 'LOW_MARGIN').length,
      averageCostVariance: costBreakdownAnalysis.length > 0 
        ? costBreakdownAnalysis.reduce((sum, r) => sum + Math.abs(r.costBreakdown.costVariance), 0) / costBreakdownAnalysis.length 
        : 0
    },
    period: { startDate, endDate }
  };
}

// Get production efficiency analysis
async function getProductionEfficiencyAnalysis(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    recipeId
  } = options;

  const where = {
    recipe: { tenantId },
    createdAt: { gte: startDate, lte: endDate },
    ...(recipeId && { recipeId })
  };

  const [recipes, batches] = await Promise.all([
    prisma.recipe.findMany({
      where: { tenantId },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        items: {
          include: {
            item: { select: { id: true, name: true, sku: true, cost: true } }
          }
        }
      }
    }),
    prisma.productionBatch.findMany({
      where,
      include: {
        recipe: {
          select: { id: true, name: true, product: { select: { id: true, name: true } } }
        }
      }
    })
  ]);

  // Analyze production efficiency for each recipe
  const efficiencyAnalysis = recipes.map(recipe => {
    const recipeBatches = batches.filter(b => b.recipeId === recipe.id);
    
    if (recipeBatches.length < 3) {
      return {
        recipe: {
          id: recipe.id,
          name: recipe.name,
          product: recipe.product
        },
        efficiency: {
          averageEfficiency: 0,
          efficiencyVariance: 0,
          trend: 'stable',
          batchCount: recipeBatches.length
        },
        analysis: {
          status: 'INSUFFICIENT_DATA',
          recommendation: 'Need at least 3 batches for efficiency analysis'
        }
      };
    }

    const theoreticalCost = calculateRecipeCost(recipe.items);
    const efficiencies = recipeBatches.map(batch => {
      const actualCost = parseFloat(batch.costPerUnit || 0);
      return theoreticalCost > 0 ? (theoreticalCost / actualCost) * 100 : 100;
    });

    const averageEfficiency = efficiencies.reduce((sum, eff) => sum + eff, 0) / efficiencies.length;
    const efficiencyVariance = calculateVariance(efficiencies);
    const efficiencyConsistency = 100 - (Math.sqrt(efficiencyVariance) / averageEfficiency) * 100;

    // Calculate trend
    const firstHalf = efficiencies.slice(0, Math.floor(efficiencies.length / 2));
    const secondHalf = efficiencies.slice(Math.floor(efficiencies.length / 2));
    const firstHalfAvg = firstHalf.reduce((sum, eff) => sum + eff, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, eff) => sum + eff, 0) / secondHalf.length;
    
    let trend = 'stable';
    if (secondHalfAvg > firstHalfAvg * 1.05) trend = 'improving';
    else if (secondHalfAvg < firstHalfAvg * 0.95) trend = 'declining';

    // Generate analysis
    let status = 'OPTIMAL';
    let recommendation = 'Production efficiency is optimal';
    
    if (averageEfficiency < 80) {
      status = 'POOR';
      recommendation = 'Low production efficiency. Review processes and training';
    } else if (averageEfficiency < 90) {
      status = 'FAIR';
      recommendation = 'Moderate production efficiency. Look for improvement opportunities';
    } else if (efficiencyConsistency < 80) {
      status = 'INCONSISTENT';
      recommendation = 'High efficiency variance. Focus on consistency improvements';
    }

    return {
      recipe: {
        id: recipe.id,
        name: recipe.name,
        product: recipe.product
      },
      efficiency: {
        averageEfficiency: averageEfficiency,
        efficiencyVariance: efficiencyVariance,
        efficiencyConsistency: efficiencyConsistency,
        trend: trend,
        batchCount: recipeBatches.length,
        theoreticalCost: theoreticalCost,
        averageActualCost: recipeBatches.reduce((sum, batch) => 
          sum + parseFloat(batch.costPerUnit || 0), 0) / recipeBatches.length
      },
      analysis: {
        status: status,
        recommendation: recommendation,
        improvementPotential: Math.max(0, 100 - averageEfficiency),
        consistencyLevel: efficiencyConsistency > 90 ? 'EXCELLENT' : 
                        efficiencyConsistency > 80 ? 'GOOD' : 
                        efficiencyConsistency > 70 ? 'FAIR' : 'POOR'
      }
    };
  });

  // Sort by efficiency (highest efficiency first)
  efficiencyAnalysis.sort((a, b) => b.efficiency.averageEfficiency - a.efficiency.averageEfficiency);

  return {
    efficiencyAnalysis,
    summary: {
      totalRecipes: efficiencyAnalysis.length,
      optimalEfficiency: efficiencyAnalysis.filter(r => r.analysis.status === 'OPTIMAL').length,
      fairEfficiency: efficiencyAnalysis.filter(r => r.analysis.status === 'FAIR').length,
      poorEfficiency: efficiencyAnalysis.filter(r => r.analysis.status === 'POOR').length,
      inconsistentEfficiency: efficiencyAnalysis.filter(r => r.analysis.status === 'INCONSISTENT').length,
      averageEfficiency: efficiencyAnalysis.length > 0 
        ? efficiencyAnalysis.reduce((sum, r) => sum + r.efficiency.averageEfficiency, 0) / efficiencyAnalysis.length 
        : 0
    },
    period: { startDate, endDate }
  };
}

// Helper functions
function calculateRecipeCost(items) {
  return items.reduce((sum, item) => 
    sum + (parseFloat(item.quantity) * parseFloat(item.item.cost || 0)), 0
  );
}

function calculateVariance(values) {
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
}

function calculateProductionDays(batches) {
  if (batches.length === 0) return 1;
  
  const dates = batches.map(batch => new Date(batch.createdAt));
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  
  return Math.max(1, Math.ceil((maxDate - minDate) / (24 * 60 * 60 * 1000)));
}

function calculateOverallPerformance(efficiency, consistency, costVariance) {
  const efficiencyScore = efficiency > 90 ? 4 : efficiency > 80 ? 3 : efficiency > 70 ? 2 : 1;
  const consistencyScore = consistency > 90 ? 4 : consistency > 80 ? 3 : consistency > 70 ? 2 : 1;
  const varianceScore = Math.abs(costVariance) < 5 ? 4 : Math.abs(costVariance) < 10 ? 3 : Math.abs(costVariance) < 15 ? 2 : 1;
  
  const overallScore = (efficiencyScore + consistencyScore + varianceScore) / 3;
  
  if (overallScore >= 3.5) return 'EXCELLENT';
  if (overallScore >= 2.5) return 'GOOD';
  if (overallScore >= 1.5) return 'FAIR';
  return 'POOR';
}

module.exports = {
  getRecipePerformanceAnalysis,
  getIngredientUtilizationAnalysis,
  getRecipeCostBreakdownAnalysis,
  getProductionEfficiencyAnalysis
};
