/**
 * Currency and Financial Utilities
 * 
 * Comprehensive currency conversion, financial calculations,
 * and monetary formatting functions
 */

/**
 * Format currency amount
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (USD, EUR, etc.)
 * @param {Object} options - Formatting options
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount, currency = 'USD', options = {}) {
  const {
    locale = 'en-US',
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    showSymbol = true
  } = options;

  if (isNaN(amount)) {
    return 'Invalid amount';
  }

  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits,
    maximumFractionDigits
  });

  return formatter.format(amount);
}

/**
 * Convert currency amount
 * @param {number} amount - Amount to convert
 * @param {string} fromCurrency - Source currency
 * @param {string} toCurrency - Target currency
 * @param {number} exchangeRate - Exchange rate
 * @returns {number} Converted amount
 */
function convertCurrency(amount, fromCurrency, toCurrency, exchangeRate) {
  if (isNaN(amount) || isNaN(exchangeRate)) {
    throw new Error('Invalid amount or exchange rate');
  }

  if (fromCurrency === toCurrency) {
    return amount;
  }

  return parseFloat((amount * exchangeRate).toFixed(2));
}

/**
 * Calculate compound interest
 * @param {number} principal - Principal amount
 * @param {number} rate - Annual interest rate (as decimal)
 * @param {number} time - Time period in years
 * @param {number} compoundFrequency - Compounding frequency per year
 * @returns {Object} Compound interest calculation result
 */
function calculateCompoundInterest(principal, rate, time, compoundFrequency = 12) {
  if (principal <= 0 || rate < 0 || time <= 0 || compoundFrequency <= 0) {
    throw new Error('Invalid parameters for compound interest calculation');
  }

  const amount = principal * Math.pow(1 + (rate / compoundFrequency), compoundFrequency * time);
  const interest = amount - principal;

  return {
    principal: parseFloat(principal.toFixed(2)),
    rate: parseFloat((rate * 100).toFixed(2)),
    time: parseFloat(time.toFixed(2)),
    compoundFrequency,
    amount: parseFloat(amount.toFixed(2)),
    interest: parseFloat(interest.toFixed(2)),
    effectiveRate: parseFloat((Math.pow(1 + (rate / compoundFrequency), compoundFrequency) - 1) * 100).toFixed(2)
  };
}

/**
 * Calculate present value
 * @param {number} futureValue - Future value
 * @param {number} rate - Discount rate (as decimal)
 * @param {number} time - Time period in years
 * @returns {number} Present value
 */
function calculatePresentValue(futureValue, rate, time) {
  if (futureValue <= 0 || rate < 0 || time <= 0) {
    throw new Error('Invalid parameters for present value calculation');
  }

  return parseFloat((futureValue / Math.pow(1 + rate, time)).toFixed(2));
}

/**
 * Calculate future value
 * @param {number} presentValue - Present value
 * @param {number} rate - Interest rate (as decimal)
 * @param {number} time - Time period in years
 * @returns {number} Future value
 */
function calculateFutureValue(presentValue, rate, time) {
  if (presentValue <= 0 || rate < 0 || time <= 0) {
    throw new Error('Invalid parameters for future value calculation');
  }

  return parseFloat((presentValue * Math.pow(1 + rate, time)).toFixed(2));
}

/**
 * Calculate loan payment (PMT)
 * @param {number} principal - Loan principal
 * @param {number} rate - Annual interest rate (as decimal)
 * @param {number} time - Loan term in years
 * @param {number} paymentFrequency - Payment frequency per year
 * @returns {Object} Loan payment calculation result
 */
function calculateLoanPayment(principal, rate, time, paymentFrequency = 12) {
  if (principal <= 0 || rate < 0 || time <= 0 || paymentFrequency <= 0) {
    throw new Error('Invalid parameters for loan payment calculation');
  }

  const periodicRate = rate / paymentFrequency;
  const numberOfPayments = time * paymentFrequency;
  
  let payment;
  if (periodicRate === 0) {
    payment = principal / numberOfPayments;
  } else {
    payment = principal * (periodicRate * Math.pow(1 + periodicRate, numberOfPayments)) / 
              (Math.pow(1 + periodicRate, numberOfPayments) - 1);
  }

  const totalPayments = payment * numberOfPayments;
  const totalInterest = totalPayments - principal;

  return {
    principal: parseFloat(principal.toFixed(2)),
    rate: parseFloat((rate * 100).toFixed(2)),
    time: parseFloat(time.toFixed(2)),
    paymentFrequency,
    payment: parseFloat(payment.toFixed(2)),
    totalPayments: parseFloat(totalPayments.toFixed(2)),
    totalInterest: parseFloat(totalInterest.toFixed(2)),
    numberOfPayments: Math.round(numberOfPayments)
  };
}

/**
 * Calculate net present value (NPV)
 * @param {Array} cashFlows - Array of cash flows
 * @param {number} discountRate - Discount rate (as decimal)
 * @returns {number} Net present value
 */
function calculateNPV(cashFlows, discountRate) {
  if (!Array.isArray(cashFlows) || cashFlows.length === 0) {
    throw new Error('Cash flows array is required');
  }

  if (discountRate < 0) {
    throw new Error('Discount rate cannot be negative');
  }

  let npv = 0;
  
  cashFlows.forEach((cashFlow, index) => {
    if (isNaN(cashFlow)) {
      throw new Error(`Invalid cash flow at index ${index}`);
    }
    
    npv += cashFlow / Math.pow(1 + discountRate, index);
  });

  return parseFloat(npv.toFixed(2));
}

/**
 * Calculate internal rate of return (IRR)
 * @param {Array} cashFlows - Array of cash flows
 * @param {number} guess - Initial guess for IRR (optional)
 * @returns {number} Internal rate of return
 */
function calculateIRR(cashFlows, guess = 0.1) {
  if (!Array.isArray(cashFlows) || cashFlows.length < 2) {
    throw new Error('At least 2 cash flows are required for IRR calculation');
  }

  // Simple implementation using Newton-Raphson method
  let rate = guess;
  const maxIterations = 100;
  const tolerance = 0.0001;

  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let npvDerivative = 0;

    cashFlows.forEach((cashFlow, index) => {
      const discountFactor = Math.pow(1 + rate, index);
      npv += cashFlow / discountFactor;
      npvDerivative -= (index * cashFlow) / (discountFactor * (1 + rate));
    });

    if (Math.abs(npv) < tolerance) {
      break;
    }

    rate = rate - npv / npvDerivative;
  }

  return parseFloat((rate * 100).toFixed(2));
}

/**
 * Calculate payback period
 * @param {Array} cashFlows - Array of cash flows
 * @param {number} initialInvestment - Initial investment amount
 * @returns {Object} Payback period calculation result
 */
function calculatePaybackPeriod(cashFlows, initialInvestment) {
  if (!Array.isArray(cashFlows) || cashFlows.length === 0) {
    throw new Error('Cash flows array is required');
  }

  if (initialInvestment <= 0) {
    throw new Error('Initial investment must be positive');
  }

  let cumulativeCashFlow = -initialInvestment;
  let paybackPeriod = null;

  for (let i = 0; i < cashFlows.length; i++) {
    cumulativeCashFlow += cashFlows[i];
    
    if (cumulativeCashFlow >= 0 && paybackPeriod === null) {
      // Linear interpolation for partial periods
      if (i === 0) {
        paybackPeriod = initialInvestment / cashFlows[0];
      } else {
        const previousCumulative = cumulativeCashFlow - cashFlows[i];
        const fraction = Math.abs(previousCumulative) / cashFlows[i];
        paybackPeriod = i - 1 + fraction;
      }
      break;
    }
  }

  return {
    paybackPeriod: paybackPeriod ? parseFloat(paybackPeriod.toFixed(2)) : null,
    cumulativeCashFlow: parseFloat(cumulativeCashFlow.toFixed(2)),
    isProfitable: cumulativeCashFlow >= 0
  };
}

/**
 * Calculate depreciation using various methods
 * @param {number} cost - Asset cost
 * @param {number} salvageValue - Salvage value
 * @param {number} usefulLife - Useful life in years
 * @param {string} method - Depreciation method (straight-line, declining-balance, sum-of-years)
 * @returns {Object} Depreciation calculation result
 */
function calculateDepreciation(cost, salvageValue, usefulLife, method = 'straight-line') {
  if (cost <= 0 || usefulLife <= 0) {
    throw new Error('Invalid parameters for depreciation calculation');
  }

  if (salvageValue < 0 || salvageValue > cost) {
    throw new Error('Salvage value must be between 0 and cost');
  }

  const annualDepreciation = (cost - salvageValue) / usefulLife;
  const depreciationSchedule = [];

  switch (method) {
    case 'straight-line':
      for (let year = 1; year <= usefulLife; year++) {
        depreciationSchedule.push({
          year,
          depreciation: parseFloat(annualDepreciation.toFixed(2)),
          bookValue: parseFloat((cost - (annualDepreciation * year)).toFixed(2))
        });
      }
      break;

    case 'declining-balance':
      const rate = 2 / usefulLife; // Double declining balance
      let bookValue = cost;
      
      for (let year = 1; year <= usefulLife; year++) {
        const depreciation = Math.min(bookValue * rate, bookValue - salvageValue);
        bookValue -= depreciation;
        
        depreciationSchedule.push({
          year,
          depreciation: parseFloat(depreciation.toFixed(2)),
          bookValue: parseFloat(Math.max(bookValue, salvageValue).toFixed(2))
        });
      }
      break;

    case 'sum-of-years':
      const sumOfYears = (usefulLife * (usefulLife + 1)) / 2;
      
      for (let year = 1; year <= usefulLife; year++) {
        const depreciation = ((usefulLife - year + 1) / sumOfYears) * (cost - salvageValue);
        
        depreciationSchedule.push({
          year,
          depreciation: parseFloat(depreciation.toFixed(2)),
          bookValue: parseFloat((cost - (depreciation * year)).toFixed(2))
        });
      }
      break;

    default:
      throw new Error('Invalid depreciation method');
  }

  return {
    method,
    cost: parseFloat(cost.toFixed(2)),
    salvageValue: parseFloat(salvageValue.toFixed(2)),
    usefulLife,
    totalDepreciation: parseFloat((cost - salvageValue).toFixed(2)),
    depreciationSchedule
  };
}

/**
 * Calculate financial ratios
 * @param {Object} financialData - Financial statement data
 * @returns {Object} Financial ratios
 */
function calculateFinancialRatios(financialData) {
  const {
    currentAssets = 0,
    currentLiabilities = 0,
    totalAssets = 0,
    totalLiabilities = 0,
    shareholdersEquity = 0,
    netIncome = 0,
    revenue = 0,
    costOfGoodsSold = 0,
    inventory = 0,
    accountsReceivable = 0,
    accountsPayable = 0
  } = financialData;

  const ratios = {};

  // Liquidity Ratios
  ratios.currentRatio = currentLiabilities > 0 ? parseFloat((currentAssets / currentLiabilities).toFixed(2)) : 0;
  ratios.quickRatio = currentLiabilities > 0 ? parseFloat(((currentAssets - inventory) / currentLiabilities).toFixed(2)) : 0;

  // Leverage Ratios
  ratios.debtToEquity = shareholdersEquity > 0 ? parseFloat((totalLiabilities / shareholdersEquity).toFixed(2)) : 0;
  ratios.debtToAssets = totalAssets > 0 ? parseFloat((totalLiabilities / totalAssets).toFixed(2)) : 0;

  // Profitability Ratios
  ratios.netProfitMargin = revenue > 0 ? parseFloat(((netIncome / revenue) * 100).toFixed(2)) : 0;
  ratios.grossProfitMargin = revenue > 0 ? parseFloat((((revenue - costOfGoodsSold) / revenue) * 100).toFixed(2)) : 0;
  ratios.returnOnAssets = totalAssets > 0 ? parseFloat(((netIncome / totalAssets) * 100).toFixed(2)) : 0;
  ratios.returnOnEquity = shareholdersEquity > 0 ? parseFloat(((netIncome / shareholdersEquity) * 100).toFixed(2)) : 0;

  // Efficiency Ratios
  ratios.inventoryTurnover = inventory > 0 ? parseFloat((costOfGoodsSold / inventory).toFixed(2)) : 0;
  ratios.receivablesTurnover = accountsReceivable > 0 ? parseFloat((revenue / accountsReceivable).toFixed(2)) : 0;
  ratios.payablesTurnover = accountsPayable > 0 ? parseFloat((costOfGoodsSold / accountsPayable).toFixed(2)) : 0;

  return ratios;
}

/**
 * Calculate weighted average cost of capital (WACC)
 * @param {Object} waccData - WACC calculation data
 * @returns {Object} WACC calculation result
 */
function calculateWACC(waccData) {
  const {
    equityValue = 0,
    debtValue = 0,
    costOfEquity = 0,
    costOfDebt = 0,
    taxRate = 0
  } = waccData;

  const totalValue = equityValue + debtValue;
  
  if (totalValue === 0) {
    throw new Error('Total value cannot be zero');
  }

  const equityWeight = equityValue / totalValue;
  const debtWeight = debtValue / totalValue;
  const afterTaxCostOfDebt = costOfDebt * (1 - taxRate);
  
  const wacc = (equityWeight * costOfEquity) + (debtWeight * afterTaxCostOfDebt);

  return {
    equityValue: parseFloat(equityValue.toFixed(2)),
    debtValue: parseFloat(debtValue.toFixed(2)),
    totalValue: parseFloat(totalValue.toFixed(2)),
    equityWeight: parseFloat((equityWeight * 100).toFixed(2)),
    debtWeight: parseFloat((debtWeight * 100).toFixed(2)),
    costOfEquity: parseFloat((costOfEquity * 100).toFixed(2)),
    costOfDebt: parseFloat((costOfDebt * 100).toFixed(2)),
    afterTaxCostOfDebt: parseFloat((afterTaxCostOfDebt * 100).toFixed(2)),
    wacc: parseFloat((wacc * 100).toFixed(2)),
    taxRate: parseFloat((taxRate * 100).toFixed(2))
  };
}

/**
 * Calculate price elasticity of demand
 * @param {number} initialQuantity - Initial quantity demanded
 * @param {number} finalQuantity - Final quantity demanded
 * @param {number} initialPrice - Initial price
 * @param {number} finalPrice - Final price
 * @returns {Object} Price elasticity calculation result
 */
function calculatePriceElasticity(initialQuantity, finalQuantity, initialPrice, finalPrice) {
  if (initialQuantity <= 0 || initialPrice <= 0) {
    throw new Error('Initial quantity and price must be positive');
  }

  const quantityChange = (finalQuantity - initialQuantity) / initialQuantity;
  const priceChange = (finalPrice - initialPrice) / initialPrice;
  
  if (priceChange === 0) {
    throw new Error('Price change cannot be zero');
  }

  const elasticity = quantityChange / priceChange;

  return {
    initialQuantity: parseFloat(initialQuantity.toFixed(2)),
    finalQuantity: parseFloat(finalQuantity.toFixed(2)),
    initialPrice: parseFloat(initialPrice.toFixed(2)),
    finalPrice: parseFloat(finalPrice.toFixed(2)),
    quantityChange: parseFloat((quantityChange * 100).toFixed(2)),
    priceChange: parseFloat((priceChange * 100).toFixed(2)),
    elasticity: parseFloat(elasticity.toFixed(2)),
    elasticityType: elasticity > 1 ? 'Elastic' : elasticity < 1 ? 'Inelastic' : 'Unit Elastic'
  };
}

module.exports = {
  formatCurrency,
  convertCurrency,
  calculateCompoundInterest,
  calculatePresentValue,
  calculateFutureValue,
  calculateLoanPayment,
  calculateNPV,
  calculateIRR,
  calculatePaybackPeriod,
  calculateDepreciation,
  calculateFinancialRatios,
  calculateWACC,
  calculatePriceElasticity
};
