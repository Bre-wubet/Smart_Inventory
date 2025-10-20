const { STOCK_THRESHOLDS } = require('../constants');

/**
 * Calculate available stock (quantity - reserved)
 * @param {number} quantity - Total quantity in stock
 * @param {number} reserved - Reserved quantity
 * @returns {number} Available quantity
 */
function calculateAvailableStock(quantity, reserved = 0) {
  return Math.max(0, parseFloat(quantity) - parseFloat(reserved));
}

/**
 * Check if stock is low based on thresholds
 * @param {number} currentStock - Current stock quantity
 * @param {number} averageStock - Average stock level
 * @returns {boolean} True if stock is low
 */
function isLowStock(currentStock, averageStock) {
  const threshold = averageStock * STOCK_THRESHOLDS.LOW_STOCK_PERCENTAGE;
  return currentStock <= threshold;
}

/**
 * Check if stock is overstocked
 * @param {number} currentStock - Current stock quantity
 * @param {number} averageStock - Average stock level
 * @returns {boolean} True if overstocked
 */
function isOverstocked(currentStock, averageStock) {
  const threshold = averageStock * STOCK_THRESHOLDS.OVERSTOCK_MULTIPLIER;
  return currentStock >= threshold;
}

/**
 * Calculate stock turnover ratio
 * @param {number} costOfGoodsSold - Cost of goods sold
 * @param {number} averageInventoryValue - Average inventory value
 * @returns {number} Stock turnover ratio
 */
function calculateStockTurnover(costOfGoodsSold, averageInventoryValue) {
  if (averageInventoryValue <= 0) return 0;
  return parseFloat((costOfGoodsSold / averageInventoryValue).toFixed(2));
}

/**
 * Calculate days of inventory on hand
 * @param {number} currentStock - Current stock quantity
 * @param {number} averageDailyConsumption - Average daily consumption
 * @returns {number} Days of inventory on hand
 */
function calculateDaysOfInventory(currentStock, averageDailyConsumption) {
  if (averageDailyConsumption <= 0) return Infinity;
  return Math.ceil(currentStock / averageDailyConsumption);
}

/**
 * Calculate economic order quantity (EOQ)
 * @param {number} annualDemand - Annual demand quantity
 * @param {number} orderingCost - Cost per order
 * @param {number} holdingCost - Holding cost per unit per year
 * @returns {number} Economic order quantity
 */
function calculateEOQ(annualDemand, orderingCost, holdingCost) {
  if (holdingCost <= 0) return 0;
  return Math.ceil(Math.sqrt((2 * annualDemand * orderingCost) / holdingCost));
}

/**
 * Calculate safety stock based on demand variability
 * @param {number} averageDemand - Average demand
 * @param {number} demandVariability - Standard deviation of demand
 * @param {number} serviceLevel - Desired service level (0-1)
 * @param {number} leadTime - Lead time in days
 * @returns {number} Safety stock quantity
 */
function calculateSafetyStock(averageDemand, demandVariability, serviceLevel = 0.95, leadTime = 1) {
  // Z-score for service level (simplified - in production use proper statistical tables)
  const zScore = serviceLevel >= 0.95 ? 1.65 : serviceLevel >= 0.90 ? 1.28 : 1.0;
  return Math.ceil(zScore * demandVariability * Math.sqrt(leadTime));
}

/**
 * Calculate optimal reorder point using advanced formulas
 * @param {Object} params - Reorder point calculation parameters
 * @returns {Object} Optimal reorder point analysis
 */
function calculateOptimalReorderPoint(params) {
  const {
    averageDemand,
    leadTime,
    demandVariability,
    serviceLevel = 0.95,
    safetyStockFactor = 1.0
  } = params;

  const leadTimeDemand = averageDemand * leadTime;
  const safetyStock = calculateSafetyStock(averageDemand, demandVariability, serviceLevel, leadTime);
  const adjustedSafetyStock = safetyStock * safetyStockFactor;
  const reorderPoint = Math.ceil(leadTimeDemand + adjustedSafetyStock);

  return {
    reorderPoint,
    leadTimeDemand: Math.ceil(leadTimeDemand),
    safetyStock: Math.ceil(adjustedSafetyStock),
    serviceLevel,
    leadTime,
    averageDemand,
    demandVariability
  };
}

/**
 * Calculate ABC analysis for inventory classification
 * @param {Array} items - Array of items with annual usage value
 * @returns {Object} ABC analysis result
 */
function calculateABCAnalysis(items) {
  // Sort items by annual usage value (descending)
  const sortedItems = [...items].sort((a, b) => b.annualUsageValue - a.annualUsageValue);
  
  const totalValue = sortedItems.reduce((sum, item) => sum + item.annualUsageValue, 0);
  let cumulativeValue = 0;
  let cumulativePercentage = 0;

  const classifiedItems = sortedItems.map((item, index) => {
    cumulativeValue += item.annualUsageValue;
    cumulativePercentage = (cumulativeValue / totalValue) * 100;

    let classification = 'C';
    if (cumulativePercentage <= 80) {
      classification = 'A';
    } else if (cumulativePercentage <= 95) {
      classification = 'B';
    }

    return {
      ...item,
      cumulativeValue,
      cumulativePercentage: parseFloat(cumulativePercentage.toFixed(2)),
      classification,
      rank: index + 1
    };
  });

  // Group by classification
  const groups = {
    A: classifiedItems.filter(item => item.classification === 'A'),
    B: classifiedItems.filter(item => item.classification === 'B'),
    C: classifiedItems.filter(item => item.classification === 'C')
  };

  return {
    totalItems: items.length,
    totalValue,
    groups,
    summary: {
      A: { count: groups.A.length, value: groups.A.reduce((sum, item) => sum + item.annualUsageValue, 0) },
      B: { count: groups.B.length, value: groups.B.reduce((sum, item) => sum + item.annualUsageValue, 0) },
      C: { count: groups.C.length, value: groups.C.reduce((sum, item) => sum + item.annualUsageValue, 0) }
    }
  };
}

/**
 * Calculate inventory carrying cost
 * @param {Object} params - Carrying cost calculation parameters
 * @returns {Object} Carrying cost analysis
 */
function calculateCarryingCost(params) {
  const {
    averageInventoryValue,
    carryingCostRate = 0.25, // 25% annual carrying cost rate
    insuranceRate = 0.01, // 1% insurance rate
    storageCost = 0,
    obsolescenceRate = 0.05, // 5% obsolescence rate
    opportunityCostRate = 0.10 // 10% opportunity cost rate
  } = params;

  const annualCarryingCost = averageInventoryValue * carryingCostRate;
  const insuranceCost = averageInventoryValue * insuranceRate;
  const obsolescenceCost = averageInventoryValue * obsolescenceRate;
  const opportunityCost = averageInventoryValue * opportunityCostRate;
  const totalCarryingCost = annualCarryingCost + insuranceCost + obsolescenceCost + opportunityCost + storageCost;

  return {
    averageInventoryValue: parseFloat(averageInventoryValue.toFixed(2)),
    annualCarryingCost: parseFloat(annualCarryingCost.toFixed(2)),
    insuranceCost: parseFloat(insuranceCost.toFixed(2)),
    obsolescenceCost: parseFloat(obsolescenceCost.toFixed(2)),
    opportunityCost: parseFloat(opportunityCost.toFixed(2)),
    storageCost: parseFloat(storageCost.toFixed(2)),
    totalCarryingCost: parseFloat(totalCarryingCost.toFixed(2)),
    carryingCostRate: parseFloat((carryingCostRate * 100).toFixed(2))
  };
}

/**
 * Calculate demand forecasting using moving average
 * @param {Array} historicalDemand - Array of historical demand data
 * @param {number} periods - Number of periods for moving average
 * @returns {Object} Demand forecast result
 */
function calculateMovingAverageForecast(historicalDemand, periods = 3) {
  if (historicalDemand.length < periods) {
    return {
      forecast: historicalDemand.length > 0 ? historicalDemand.reduce((sum, val) => sum + val, 0) / historicalDemand.length : 0,
      error: 'Insufficient historical data',
      periods: historicalDemand.length
    };
  }

  const recentDemand = historicalDemand.slice(-periods);
  const forecast = recentDemand.reduce((sum, val) => sum + val, 0) / periods;

  // Calculate forecast accuracy (MAPE)
  const actualDemand = historicalDemand.slice(periods);
  const forecastedDemand = historicalDemand.slice(0, -periods);
  
  let totalError = 0;
  let validForecasts = 0;

  for (let i = 0; i < actualDemand.length; i++) {
    if (actualDemand[i] > 0) {
      const error = Math.abs((actualDemand[i] - forecastedDemand[i]) / actualDemand[i]) * 100;
      totalError += error;
      validForecasts++;
    }
  }

  const mape = validForecasts > 0 ? totalError / validForecasts : 0;

  return {
    forecast: Math.ceil(forecast),
    periods,
    mape: parseFloat(mape.toFixed(2)),
    accuracy: parseFloat((100 - mape).toFixed(2)),
    recentDemand,
    historicalData: historicalDemand
  };
}

/**
 * Calculate exponential smoothing forecast
 * @param {Array} historicalDemand - Array of historical demand data
 * @param {number} alpha - Smoothing constant (0-1)
 * @returns {Object} Exponential smoothing forecast result
 */
function calculateExponentialSmoothingForecast(historicalDemand, alpha = 0.3) {
  if (historicalDemand.length === 0) {
    return { forecast: 0, error: 'No historical data available' };
  }

  let forecast = historicalDemand[0]; // Initialize with first value
  const forecasts = [forecast];

  // Calculate exponential smoothing
  for (let i = 1; i < historicalDemand.length; i++) {
    forecast = alpha * historicalDemand[i] + (1 - alpha) * forecast;
    forecasts.push(forecast);
  }

  // Calculate forecast accuracy
  let totalError = 0;
  let validForecasts = 0;

  for (let i = 1; i < historicalDemand.length; i++) {
    if (historicalDemand[i] > 0) {
      const error = Math.abs((historicalDemand[i] - forecasts[i-1]) / historicalDemand[i]) * 100;
      totalError += error;
      validForecasts++;
    }
  }

  const mape = validForecasts > 0 ? totalError / validForecasts : 0;

  return {
    forecast: Math.ceil(forecast),
    alpha,
    mape: parseFloat(mape.toFixed(2)),
    accuracy: parseFloat((100 - mape).toFixed(2)),
    forecasts,
    historicalData: historicalDemand
  };
}

/**
 * Calculate inventory optimization using Wilson's formula
 * @param {Object} params - Optimization parameters
 * @returns {Object} Inventory optimization result
 */
function calculateInventoryOptimization(params) {
  const {
    annualDemand,
    orderingCost,
    holdingCost,
    unitCost,
    leadTime,
    serviceLevel = 0.95
  } = params;

  // Economic Order Quantity
  const eoq = calculateEOQ(annualDemand, orderingCost, holdingCost);
  
  // Optimal order frequency
  const orderFrequency = annualDemand / eoq;
  
  // Optimal order interval (days)
  const orderInterval = 365 / orderFrequency;
  
  // Reorder point
  const dailyDemand = annualDemand / 365;
  const reorderPoint = Math.ceil(dailyDemand * leadTime);
  
  // Total annual cost
  const annualOrderingCost = orderFrequency * orderingCost;
  const annualHoldingCost = (eoq / 2) * holdingCost;
  const totalAnnualCost = annualOrderingCost + annualHoldingCost;

  return {
    eoq: Math.ceil(eoq),
    orderFrequency: parseFloat(orderFrequency.toFixed(2)),
    orderInterval: parseFloat(orderInterval.toFixed(1)),
    reorderPoint,
    dailyDemand: parseFloat(dailyDemand.toFixed(2)),
    annualOrderingCost: parseFloat(annualOrderingCost.toFixed(2)),
    annualHoldingCost: parseFloat(annualHoldingCost.toFixed(2)),
    totalAnnualCost: parseFloat(totalAnnualCost.toFixed(2)),
    averageInventory: parseFloat((eoq / 2).toFixed(2)),
    serviceLevel
  };
}

/**
 * Calculate stock velocity analysis
 * @param {Array} stockMovements - Array of stock movement data
 * @returns {Object} Stock velocity analysis
 */
function calculateStockVelocity(stockMovements) {
  if (stockMovements.length === 0) {
    return { error: 'No stock movement data available' };
  }

  // Calculate velocity metrics
  const totalMovements = stockMovements.length;
  const totalQuantity = stockMovements.reduce((sum, movement) => sum + Math.abs(movement.quantity), 0);
  const averageMovementSize = totalQuantity / totalMovements;

  // Calculate movement frequency by period
  const movementsByPeriod = {};
  stockMovements.forEach(movement => {
    const period = new Date(movement.date).toISOString().substring(0, 7); // YYYY-MM
    if (!movementsByPeriod[period]) {
      movementsByPeriod[period] = { count: 0, quantity: 0 };
    }
    movementsByPeriod[period].count++;
    movementsByPeriod[period].quantity += Math.abs(movement.quantity);
  });

  // Calculate velocity trends
  const periods = Object.keys(movementsByPeriod).sort();
  const velocityTrend = periods.map(period => ({
    period,
    movementCount: movementsByPeriod[period].count,
    totalQuantity: movementsByPeriod[period].quantity,
    averageQuantity: movementsByPeriod[period].quantity / movementsByPeriod[period].count
  }));

  return {
    totalMovements,
    totalQuantity,
    averageMovementSize: parseFloat(averageMovementSize.toFixed(2)),
    movementsByPeriod,
    velocityTrend,
    analysisPeriod: periods.length > 0 ? `${periods[0]} to ${periods[periods.length - 1]}` : 'N/A'
  };
}

module.exports = {
  calculateAvailableStock,
  isLowStock,
  isOverstocked,
  calculateStockTurnover,
  calculateDaysOfInventory,
  calculateEOQ,
  calculateSafetyStock,
  // Advanced stock management functions
  calculateOptimalReorderPoint,
  calculateABCAnalysis,
  calculateCarryingCost,
  calculateMovingAverageForecast,
  calculateExponentialSmoothingForecast,
  calculateInventoryOptimization,
  calculateStockVelocity
};
