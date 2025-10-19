# Sales Analytics API Documentation

## Overview
This document provides comprehensive documentation for the enhanced Sales Analytics API endpoints. The API offers advanced analytics capabilities for sales data analysis, customer behavior insights, product performance tracking, and AI-powered recommendations.

## Base URL
All endpoints are prefixed with `/sales/`

## Authentication
All endpoints require:
- **Authentication Token**: Bearer token in Authorization header
- **Tenant Access**: Tenant ID must be provided in request context

## Advanced Sales Analytics Endpoints

### 1. Sales Trends Analysis
**Endpoint:** `GET /sales/trends`

**Description:** Advanced sales trends analysis with comprehensive pattern recognition and trend calculations.

**Query Parameters:**
- `startDate` (optional): Start date for analysis (ISO format: YYYY-MM-DD)
- `endDate` (optional): End date for analysis (ISO format: YYYY-MM-DD)
- `groupBy` (optional): Grouping period - `day`, `week`, `month`, `quarter`, `year` (default: `month`)

**Response:**
```json
{
  "success": true,
  "data": {
    "trends": [
      {
        "period": "2024-01",
        "orders": 150,
        "revenue": 45000.00,
        "cost": 30000.00,
        "profit": 15000.00,
        "uniqueCustomersCount": 120,
        "uniqueItemsCount": 45,
        "averageOrderValue": 300.00,
        "profitMargin": 33.33
      }
    ],
    "trendAnalysis": {
      "revenueTrend": "INCREASING",
      "orderTrend": "STABLE",
      "profitTrend": "INCREASING",
      "customerTrend": "STABLE"
    },
    "summary": {
      "totalPeriods": 12,
      "averageRevenuePerPeriod": 42000.00,
      "averageOrdersPerPeriod": 135,
      "peakPeriod": { "period": "2024-12", "revenue": 55000.00 },
      "lowestPeriod": { "period": "2024-02", "revenue": 32000.00 }
    },
    "period": {
      "startDate": "2024-01-01T00:00:00.000Z",
      "endDate": "2024-12-31T23:59:59.999Z",
      "groupBy": "month"
    }
  }
}
```

### 2. Customer Behavior Analysis
**Endpoint:** `GET /sales/customer-behavior`

**Description:** Comprehensive customer behavior analysis with segmentation and pattern recognition.

**Query Parameters:**
- `startDate` (optional): Start date for analysis (ISO format: YYYY-MM-DD)
- `endDate` (optional): End date for analysis (ISO format: YYYY-MM-DD)

**Response:**
```json
{
  "success": true,
  "data": {
    "behaviorAnalysis": [
      {
        "customer": "customer123",
        "orderCount": 8,
        "totalRevenue": 2400.00,
        "totalItems": 24,
        "totalProfit": 720.00,
        "firstOrderDate": "2024-01-15T10:30:00.000Z",
        "lastOrderDate": "2024-12-10T14:20:00.000Z",
        "averageOrderValue": 300.00,
        "orderFrequency": 45.5,
        "customerLifetimeValue": 2400.00,
        "profitMargin": 30.00,
        "preferredItems": [
          { "itemId": "item001", "quantity": 15 },
          { "itemId": "item002", "quantity": 8 }
        ]
      }
    ],
    "segments": {
      "VIP": [
        {
          "customer": "customer123",
          "customerLifetimeValue": 5000.00,
          "orderCount": 12
        }
      ],
      "LOYAL": [
        {
          "customer": "customer456",
          "customerLifetimeValue": 1500.00,
          "orderCount": 6
        }
      ],
      "REGULAR": [
        {
          "customer": "customer789",
          "customerLifetimeValue": 800.00,
          "orderCount": 3
        }
      ],
      "NEW": [
        {
          "customer": "customer101",
          "customerLifetimeValue": 200.00,
          "orderCount": 1
        }
      ],
      "AT_RISK": [
        {
          "customer": "customer202",
          "customerLifetimeValue": 1200.00,
          "orderCount": 4,
          "daysSinceLastOrder": 120
        }
      ]
    },
    "summary": {
      "totalCustomers": 150,
      "averageCustomerLifetimeValue": 1850.00,
      "averageOrderFrequency": 35.2,
      "segmentCounts": {
        "VIP": 15,
        "LOYAL": 45,
        "REGULAR": 60,
        "NEW": 20,
        "AT_RISK": 10
      }
    },
    "period": {
      "startDate": "2024-06-01T00:00:00.000Z",
      "endDate": "2024-12-31T23:59:59.999Z"
    }
  }
}
```

### 3. Product Performance Analysis
**Endpoint:** `GET /sales/product-performance`

**Description:** Detailed product performance analysis with comprehensive metrics and insights.

**Query Parameters:**
- `startDate` (optional): Start date for analysis (ISO format: YYYY-MM-DD)
- `endDate` (optional): End date for analysis (ISO format: YYYY-MM-DD)
- `groupBy` (optional): Grouping method - `item`, `category`, `type` (default: `item`)

**Response:**
```json
{
  "success": true,
  "data": {
    "performanceAnalysis": [
      {
        "item": {
          "id": "item001",
          "name": "Premium Widget",
          "sku": "PW-001",
          "type": "Electronics",
          "cost": 50.00,
          "price": 75.00
        },
        "totalQuantitySold": 500,
        "totalRevenue": 37500.00,
        "totalCost": 25000.00,
        "totalProfit": 12500.00,
        "orderCount": 120,
        "averagePrice": 75.00,
        "priceVariance": 2.5,
        "profitMargin": 33.33,
        "uniqueCustomers": 85,
        "averageOrderQuantity": 4.17,
        "salesVelocity": 5.56,
        "priceRange": {
          "min": 70.00,
          "max": 80.00,
          "average": 75.00
        },
        "salesByPeriod": {
          "2024-01": { "quantity": 45, "revenue": 3375.00 },
          "2024-02": { "quantity": 52, "revenue": 3900.00 }
        }
      }
    ],
    "summary": {
      "totalProducts": 150,
      "totalRevenue": 450000.00,
      "totalProfit": 135000.00,
      "averageProfitMargin": 30.00,
      "topPerformers": [
        {
          "item": { "name": "Premium Widget" },
          "totalRevenue": 37500.00,
          "profitMargin": 33.33
        }
      ],
      "underPerformers": [
        {
          "item": { "name": "Basic Item" },
          "totalRevenue": 5000.00,
          "profitMargin": 8.5
        }
      ]
    },
    "period": {
      "startDate": "2024-01-01T00:00:00.000Z",
      "endDate": "2024-12-31T23:59:59.999Z"
    }
  }
}
```

### 4. Sales Insights
**Endpoint:** `GET /sales/insights`

**Description:** AI-powered sales insights and recommendations based on comprehensive data analysis.

**Query Parameters:**
- `startDate` (optional): Start date for analysis (ISO format: YYYY-MM-DD)
- `endDate` (optional): End date for analysis (ISO format: YYYY-MM-DD)

**Response:**
```json
{
  "success": true,
  "data": {
    "insights": [
      {
        "type": "PATTERN",
        "title": "Peak Sales Day Analysis",
        "description": "Peak sales day generated 15000.00 in revenue",
        "insight": "Identify factors contributing to peak performance",
        "recommendation": "Replicate successful strategies on other days",
        "impact": "HIGH",
        "data": {
          "peakDay": "2024-12-15",
          "peakRevenue": 15000.00,
          "averageRevenue": 8500.00
        }
      },
      {
        "type": "CUSTOMER",
        "title": "Customer Loyalty Opportunity",
        "description": "45 customers have made 3+ orders",
        "insight": "High customer retention indicates strong product-market fit",
        "recommendation": "Implement loyalty program and referral incentives",
        "impact": "MEDIUM",
        "data": {
          "frequentCustomers": 45,
          "totalCustomers": 150,
          "retentionRate": 30.00
        }
      },
      {
        "type": "PRODUCT",
        "title": "Top Performing Product",
        "description": "Premium Widget generated 37500.00 in revenue",
        "insight": "Best-selling product indicates market demand",
        "recommendation": "Increase inventory and marketing for top products",
        "impact": "HIGH",
        "data": {
          "topProduct": {
            "id": "item001",
            "name": "Premium Widget",
            "sku": "PW-001"
          },
          "revenue": 37500.00,
          "quantitySold": 500
        }
      }
    ],
    "summary": {
      "totalInsights": 8,
      "byType": {
        "PATTERN": 3,
        "CUSTOMER": 2,
        "PRODUCT": 2,
        "PRICING": 1
      },
      "byImpact": {
        "HIGH": 4,
        "MEDIUM": 3,
        "LOW": 1
      }
    },
    "period": {
      "startDate": "2024-01-01T00:00:00.000Z",
      "endDate": "2024-12-31T23:59:59.999Z"
    }
  }
}
```

## Enhanced Sales Analytics Endpoints

### 5. Sales Analytics Dashboard
**Endpoint:** `GET /sales/analytics`

**Description:** Comprehensive sales analytics dashboard with time-based grouping and summary statistics.

**Query Parameters:**
- `startDate` (optional): Start date for analysis (ISO format: YYYY-MM-DD)
- `endDate` (optional): End date for analysis (ISO format: YYYY-MM-DD)
- `groupBy` (optional): Grouping period - `hour`, `day`, `week`, `month` (default: `day`)

### 6. Sales Performance Metrics
**Endpoint:** `GET /sales/performance`

**Description:** Detailed sales performance metrics and KPIs.

**Query Parameters:**
- `period` (optional): Analysis period in days (default: 30)
- `includeComparison` (optional): Include period-over-period comparison (default: true)

### 7. Top Selling Items
**Endpoint:** `GET /sales/top-items`

**Description:** Analysis of top performing products and items.

**Query Parameters:**
- `criteria` (optional): Ranking criteria - `revenue`, `quantity`, `profit` (default: `revenue`)
- `limit` (optional): Number of top items to return (default: 10)
- `period` (optional): Analysis period in days (default: 30)

### 8. Sales Forecasting
**Endpoint:** `GET /sales/forecast`

**Description:** Sales forecasting with trend analysis and confidence levels.

**Query Parameters:**
- `forecastPeriod` (optional): Forecast period in days (default: 30)
- `confidenceLevel` (optional): Confidence level percentage (default: 95)
- `includeTrend` (optional): Include trend analysis (default: true)

### 9. Sales Optimization Recommendations
**Endpoint:** `GET /sales/optimization-recommendations`

**Description:** AI-powered recommendations for sales optimization and pricing strategies.

**Query Parameters:**
- `focus` (optional): Focus area - `pricing`, `inventory`, `marketing`, `all` (default: `all`)
- `priority` (optional): Priority level - `high`, `medium`, `low`, `all` (default: `all`)

## Error Responses

All endpoints return standardized error responses:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid date format",
    "details": "Date must be in YYYY-MM-DD format"
  }
}
```

## Common Error Codes

- `VALIDATION_ERROR`: Invalid request parameters
- `NOT_FOUND`: Resource not found
- `UNAUTHORIZED`: Authentication required
- `FORBIDDEN`: Insufficient permissions
- `INTERNAL_ERROR`: Server error

## Rate Limiting

- **Standard Endpoints**: 100 requests per minute
- **Analytics Endpoints**: 50 requests per minute
- **Advanced Analytics**: 25 requests per minute

## Usage Examples

### Get Sales Trends for Last 6 Months
```bash
curl -X GET "https://api.example.com/sales/trends?startDate=2024-06-01&endDate=2024-12-31&groupBy=month" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-ID: tenant123"
```

### Analyze Customer Behavior for Q4
```bash
curl -X GET "https://api.example.com/sales/customer-behavior?startDate=2024-10-01&endDate=2024-12-31" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-ID: tenant123"
```

### Get Product Performance Insights
```bash
curl -X GET "https://api.example.com/sales/product-performance?startDate=2024-01-01&endDate=2024-12-31" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-ID: tenant123"
```

### Generate Sales Insights
```bash
curl -X GET "https://api.example.com/sales/insights?startDate=2024-01-01&endDate=2024-12-31" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-ID: tenant123"
```

## Data Privacy and Security

- All data is tenant-isolated
- Personal customer information is anonymized in analytics
- All requests are logged for audit purposes
- Data retention policies apply to analytics data

## Support

For technical support or questions about the Sales Analytics API, please contact the development team or refer to the main API documentation.
