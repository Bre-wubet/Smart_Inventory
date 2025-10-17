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

module.exports = {
  calculateRecipeCost,
  calculateCostPerUnit,
  calculateProfitMargin,
  calculateWeightedAverageCost,
  calculateReorderPoint
};
