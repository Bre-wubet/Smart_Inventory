// Enums matching Prisma schema
const Role = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  USER: 'USER'
};

const ProductType = {
  RAW: 'RAW',
  SEMI_FINISHED: 'SEMI_FINISHED',
  FINISHED: 'FINISHED'
};

const TransactionType = {
  PURCHASE: 'PURCHASE',
  SALE: 'SALE',
  TRANSFER: 'TRANSFER',
  USAGE: 'USAGE',
  ADJUSTMENT: 'ADJUSTMENT',
  MANUAL: 'MANUAL'
};

const AlertType = {
  LOW_STOCK: 'LOW_STOCK',
  OVERSTOCK: 'OVERSTOCK',
  EXPIRY: 'EXPIRY',
  REORDER: 'REORDER'
};

const POStatus = {
  PENDING: 'PENDING',
  RECEIVED: 'RECEIVED',
  PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
  CANCELLED: 'CANCELLED'
};

const SOStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

const MovementType = {
  IN: 'IN',
  OUT: 'OUT'
};

// Business constants
const STOCK_THRESHOLDS = {
  LOW_STOCK_PERCENTAGE: 0.1, // 10% of average stock
  OVERSTOCK_MULTIPLIER: 3,   // 3x average stock
  REORDER_POINT_MULTIPLIER: 1.5 // 1.5x average consumption
};

const COST_CALCULATION = {
  DECIMAL_PRECISION: 6,
  DEFAULT_CURRENCY: 'USD'
};

const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100
};

module.exports = {
  Role,
  ProductType,
  TransactionType,
  AlertType,
  POStatus,
  SOStatus,
  MovementType,
  STOCK_THRESHOLDS,
  COST_CALCULATION,
  PAGINATION
};
