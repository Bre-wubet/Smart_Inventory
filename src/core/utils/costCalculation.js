const { COST_CALCULATION } = require('../constants');

function calculateRecipeCost(recipeItems) {
  return recipeItems.reduce((total, item) => {
    const itemCost = parseFloat(item.item.cost || 0);
    const quantity = parseFloat(item.quantity || 0);
    return total + (itemCost * quantity);
  }, 0);
}

function calculateCostPerUnit(totalCost, quantity) {
  if (quantity <= 0) return 0;
  return parseFloat((totalCost / quantity).toFixed(COST_CALCULATION.DECIMAL_PRECISION));
}

function calculateProfitMargin(sellingPrice, costPrice) {
  if (costPrice <= 0) return 0;
  return parseFloat((((sellingPrice - costPrice) / costPrice) * 100).toFixed(2));
}

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

function calculateReorderPoint(averageConsumption, leadTime, safetyStock = 0.2) {
  const leadTimeConsumption = averageConsumption * leadTime;
  const safetyStockAmount = leadTimeConsumption * safetyStock;
  return Math.ceil(leadTimeConsumption + safetyStockAmount);
}


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
