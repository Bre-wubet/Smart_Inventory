const { COST_CALCULATION } = require('../constants');

/**
 * Calculate total cost for a recipe based on its ingredients
 * @param {Array} recipeItems - Array of recipe items with quantity and item cost
 * @returns {number} Total cost
 */
function calculateRecipeCost(recipeItems) {
  return recipeItems.reduce((total, item) => {
    const itemCost = parseFloat(item.item.cost || 0);
    const quantity = parseFloat(item.quantity || 0);
    return total + (itemCost * quantity);
  }, 0);
}

/**
 * Calculate cost per unit for a production batch
 * @param {number} totalCost - Total cost of the batch
 * @param {number} quantity - Quantity produced
 * @returns {number} Cost per unit
 */
function calculateCostPerUnit(totalCost, quantity) {
  if (quantity <= 0) return 0;
  return parseFloat((totalCost / quantity).toFixed(COST_CALCULATION.DECIMAL_PRECISION));
}

/**
 * Calculate profit margin
 * @param {number} sellingPrice - Selling price per unit
 * @param {number} costPrice - Cost price per unit
 * @returns {number} Profit margin percentage
 */
function calculateProfitMargin(sellingPrice, costPrice) {
  if (costPrice <= 0) return 0;
  return parseFloat((((sellingPrice - costPrice) / costPrice) * 100).toFixed(2));
}

/**
 * Calculate weighted average cost for inventory valuation
 * @param {Array} transactions - Array of inventory transactions
 * @returns {number} Weighted average cost
 */
function calculateWeightedAverageCost(transactions) {
  let totalCost = 0;
  let totalQuantity = 0;

  transactions.forEach(transaction => {
    const cost = parseFloat(transaction.costPerUnit || 0);
    const quantity = parseFloat(transaction.quantity || 0);
    
    if (quantity > 0) {
      totalCost += cost * quantity;
      totalQuantity += quantity;
    }
  });

  return totalQuantity > 0 ? parseFloat((totalCost / totalQuantity).toFixed(COST_CALCULATION.DECIMAL_PRECISION)) : 0;
}

/**
 * Calculate reorder point based on consumption patterns
 * @param {number} averageConsumption - Average daily consumption
 * @param {number} leadTime - Lead time in days
 * @param {number} safetyStock - Safety stock percentage
 * @returns {number} Reorder point
 */
function calculateReorderPoint(averageConsumption, leadTime, safetyStock = 0.2) {
  const leadTimeConsumption = averageConsumption * leadTime;
  const safetyStockAmount = leadTimeConsumption * safetyStock;
  return Math.ceil(leadTimeConsumption + safetyStockAmount);
}

/**
 * Calculate FIFO (First In, First Out) cost
 * @param {Array} inventoryLayers - Array of inventory layers with quantities and costs
 * @param {number} quantityToConsume - Quantity to consume
 * @returns {Object} FIFO cost calculation result
 */
function calculateFIFOCost(inventoryLayers, quantityToConsume) {
  let remainingQuantity = quantityToConsume;
  let totalCost = 0;
  const consumedLayers = [];

  // Sort layers by date (oldest first)
  const sortedLayers = [...inventoryLayers].sort((a, b) => new Date(a.date) - new Date(b.date));

  for (const layer of sortedLayers) {
    if (remainingQuantity <= 0) break;

    const layerQuantity = parseFloat(layer.quantity);
    const layerCost = parseFloat(layer.costPerUnit);
    const consumeFromLayer = Math.min(remainingQuantity, layerQuantity);

    totalCost += consumeFromLayer * layerCost;
    remainingQuantity -= consumeFromLayer;

    consumedLayers.push({
      layerId: layer.id,
      quantity: consumeFromLayer,
      costPerUnit: layerCost,
      totalCost: consumeFromLayer * layerCost
    });
  }

  return {
    totalCost: parseFloat(totalCost.toFixed(COST_CALCULATION.DECIMAL_PRECISION)),
    consumedQuantity: quantityToConsume - remainingQuantity,
    consumedLayers,
    remainingQuantity
  };
}

/**
 * Calculate LIFO (Last In, First Out) cost
 * @param {Array} inventoryLayers - Array of inventory layers with quantities and costs
 * @param {number} quantityToConsume - Quantity to consume
 * @returns {Object} LIFO cost calculation result
 */
function calculateLIFOCost(inventoryLayers, quantityToConsume) {
  let remainingQuantity = quantityToConsume;
  let totalCost = 0;
  const consumedLayers = [];

  // Sort layers by date (newest first)
  const sortedLayers = [...inventoryLayers].sort((a, b) => new Date(b.date) - new Date(a.date));

  for (const layer of sortedLayers) {
    if (remainingQuantity <= 0) break;

    const layerQuantity = parseFloat(layer.quantity);
    const layerCost = parseFloat(layer.costPerUnit);
    const consumeFromLayer = Math.min(remainingQuantity, layerQuantity);

    totalCost += consumeFromLayer * layerCost;
    remainingQuantity -= consumeFromLayer;

    consumedLayers.push({
      layerId: layer.id,
      quantity: consumeFromLayer,
      costPerUnit: layerCost,
      totalCost: consumeFromLayer * layerCost
    });
  }

  return {
    totalCost: parseFloat(totalCost.toFixed(COST_CALCULATION.DECIMAL_PRECISION)),
    consumedQuantity: quantityToConsume - remainingQuantity,
    consumedLayers,
    remainingQuantity
  };
}

/**
 * Calculate standard cost variance
 * @param {number} standardCost - Standard cost per unit
 * @param {number} actualCost - Actual cost per unit
 * @param {number} quantity - Quantity produced/consumed
 * @returns {Object} Cost variance analysis
 */
function calculateCostVariance(standardCost, actualCost, quantity) {
  const standardTotal = standardCost * quantity;
  const actualTotal = actualCost * quantity;
  const variance = actualTotal - standardTotal;
  const variancePercentage = standardTotal !== 0 ? (variance / standardTotal) * 100 : 0;

  return {
    standardCost,
    actualCost,
    quantity,
    standardTotal: parseFloat(standardTotal.toFixed(COST_CALCULATION.DECIMAL_PRECISION)),
    actualTotal: parseFloat(actualTotal.toFixed(COST_CALCULATION.DECIMAL_PRECISION)),
    variance: parseFloat(variance.toFixed(COST_CALCULATION.DECIMAL_PRECISION)),
    variancePercentage: parseFloat(variancePercentage.toFixed(2)),
    isFavorable: variance < 0
  };
}

/**
 * Calculate activity-based costing (ABC) allocation
 * @param {Array} activities - Array of activities with costs and drivers
 * @param {Array} costObjects - Array of cost objects with driver consumption
 * @returns {Object} ABC allocation result
 */
function calculateABCCost(activities, costObjects) {
  const totalDriverUnits = activities.reduce((sum, activity) => sum + activity.driverUnits, 0);
  const driverRates = {};

  // Calculate driver rates
  activities.forEach(activity => {
    driverRates[activity.id] = activity.cost / activity.driverUnits;
  });

  // Allocate costs to cost objects
  const allocations = costObjects.map(costObject => {
    let totalAllocatedCost = 0;
    const activityAllocations = [];

    activities.forEach(activity => {
      const consumption = costObject.driverConsumption[activity.id] || 0;
      const allocatedCost = consumption * driverRates[activity.id];
      
      totalAllocatedCost += allocatedCost;
      activityAllocations.push({
        activityId: activity.id,
        activityName: activity.name,
        consumption,
        rate: driverRates[activity.id],
        allocatedCost: parseFloat(allocatedCost.toFixed(COST_CALCULATION.DECIMAL_PRECISION))
      });
    });

    return {
      costObjectId: costObject.id,
      costObjectName: costObject.name,
      totalAllocatedCost: parseFloat(totalAllocatedCost.toFixed(COST_CALCULATION.DECIMAL_PRECISION)),
      activityAllocations
    };
  });

  return {
    driverRates,
    allocations,
    totalCost: activities.reduce((sum, activity) => sum + activity.cost, 0)
  };
}

/**
 * Calculate break-even point
 * @param {number} fixedCosts - Total fixed costs
 * @param {number} sellingPrice - Selling price per unit
 * @param {number} variableCostPerUnit - Variable cost per unit
 * @returns {Object} Break-even analysis
 */
function calculateBreakEvenPoint(fixedCosts, sellingPrice, variableCostPerUnit) {
  const contributionMargin = sellingPrice - variableCostPerUnit;
  const breakEvenUnits = contributionMargin > 0 ? fixedCosts / contributionMargin : 0;
  const breakEvenRevenue = breakEvenUnits * sellingPrice;

  return {
    breakEvenUnits: Math.ceil(breakEvenUnits),
    breakEvenRevenue: parseFloat(breakEvenRevenue.toFixed(COST_CALCULATION.DECIMAL_PRECISION)),
    contributionMargin: parseFloat(contributionMargin.toFixed(COST_CALCULATION.DECIMAL_PRECISION)),
    contributionMarginRatio: sellingPrice > 0 ? (contributionMargin / sellingPrice) * 100 : 0
  };
}

/**
 * Calculate target costing
 * @param {number} targetPrice - Target selling price
 * @param {number} targetProfitMargin - Target profit margin percentage
 * @param {number} marketShare - Expected market share percentage
 * @returns {Object} Target costing analysis
 */
function calculateTargetCost(targetPrice, targetProfitMargin, marketShare = 100) {
  const targetProfit = (targetPrice * targetProfitMargin) / 100;
  const targetCost = targetPrice - targetProfit;
  const costReductionNeeded = targetCost < 0 ? Math.abs(targetCost) : 0;

  return {
    targetPrice: parseFloat(targetPrice.toFixed(COST_CALCULATION.DECIMAL_PRECISION)),
    targetProfit: parseFloat(targetProfit.toFixed(COST_CALCULATION.DECIMAL_PRECISION)),
    targetCost: parseFloat(targetCost.toFixed(COST_CALCULATION.DECIMAL_PRECISION)),
    costReductionNeeded: parseFloat(costReductionNeeded.toFixed(COST_CALCULATION.DECIMAL_PRECISION)),
    marketShare: parseFloat(marketShare.toFixed(2))
  };
}

/**
 * Calculate total cost of ownership (TCO)
 * @param {Object} tcoData - TCO calculation data
 * @returns {Object} TCO analysis
 */
function calculateTCO(tcoData) {
  const {
    acquisitionCost = 0,
    operatingCosts = 0,
    maintenanceCosts = 0,
    disposalCost = 0,
    opportunityCost = 0,
    lifecycleYears = 1
  } = tcoData;

  const totalCost = acquisitionCost + operatingCosts + maintenanceCosts + disposalCost + opportunityCost;
  const annualCost = totalCost / lifecycleYears;
  const monthlyCost = annualCost / 12;

  return {
    acquisitionCost: parseFloat(acquisitionCost.toFixed(COST_CALCULATION.DECIMAL_PRECISION)),
    operatingCosts: parseFloat(operatingCosts.toFixed(COST_CALCULATION.DECIMAL_PRECISION)),
    maintenanceCosts: parseFloat(maintenanceCosts.toFixed(COST_CALCULATION.DECIMAL_PRECISION)),
    disposalCost: parseFloat(disposalCost.toFixed(COST_CALCULATION.DECIMAL_PRECISION)),
    opportunityCost: parseFloat(opportunityCost.toFixed(COST_CALCULATION.DECIMAL_PRECISION)),
    totalCost: parseFloat(totalCost.toFixed(COST_CALCULATION.DECIMAL_PRECISION)),
    annualCost: parseFloat(annualCost.toFixed(COST_CALCULATION.DECIMAL_PRECISION)),
    monthlyCost: parseFloat(monthlyCost.toFixed(COST_CALCULATION.DECIMAL_PRECISION)),
    lifecycleYears
  };
}

module.exports = {
  calculateRecipeCost,
  calculateCostPerUnit,
  calculateProfitMargin,
  calculateWeightedAverageCost,
  calculateReorderPoint,
  // Advanced costing methods
  calculateFIFOCost,
  calculateLIFOCost,
  calculateCostVariance,
  calculateABCCost,
  calculateBreakEvenPoint,
  calculateTargetCost,
  calculateTCO
};
