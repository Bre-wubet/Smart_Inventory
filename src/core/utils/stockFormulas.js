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

module.exports = {
  calculateAvailableStock,
  isLowStock,
  isOverstocked,
  calculateStockTurnover,
  calculateDaysOfInventory,
  calculateEOQ,
  calculateSafetyStock
};
