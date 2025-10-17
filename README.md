# Smart Inventory ERP System

A comprehensive inventory management system built with Node.js, Express, Prisma, and PostgreSQL. This system provides advanced inventory tracking, multi-warehouse management, recipe/formula management, and automated stock optimization.

## 🚀 Features

### Core Features
- **Multi-tenant Architecture**: Isolated data per tenant with secure access control
- **Inventory Management**: Complete CRUD operations for items with SKU tracking
- **Multi-warehouse Support**: Track stock across multiple warehouses with transfers
- **Recipe/Formula Management**: Bill of Materials (BOM) with cost calculations
- **Purchase Order Management**: Supplier integration with receipt processing
- **Sales Order Management**: Customer order fulfillment with stock validation
- **Real-time Stock Tracking**: Automatic stock updates with transaction history
- **Cost Analysis**: Recipe cost calculations and profit margin analysis
- **Alert System**: Low stock, overstock, and expiry notifications
- **Analytics & Reporting**: Comprehensive reporting and insights

### Advanced Features
- **JWT Authentication**: Secure API access with Redis token blacklisting
- **Role-based Access Control**: Admin, Manager, and User roles
- **Stock Movement Tracking**: Complete audit trail of all inventory changes
- **Production Batches**: Track manufacturing with ingredient consumption
- **Stock Transfers**: Inter-warehouse transfers with validation
- **Stock Adjustments**: Manual adjustments with reason tracking
- **Background Jobs**: Automated reorder point calculations and reporting

## 🏗️ Architecture

### Tech Stack
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT with Redis session management
- **Background Jobs**: Bull Queue with Redis
- **Logging**: Pino logger
- **API Documentation**: Swagger/OpenAPI

### Project Structure
```
src/
├── config/                 # Configuration files
│   ├── db.js              # Prisma client setup
│   ├── redis.js           # Redis connection
│   ├── logger.js          # Logging configuration
│   └── env.js             # Environment validation
├── core/                  # Core system components
│   ├── middlewares/       # Authentication & error handling
│   ├── exceptions/        # Custom error classes
│   ├── utils/             # Utility functions
│   ├── constants/         # Enums and constants
│   └── services/         # Core business services
├── modules/               # Feature modules
│   ├── auth/              # Authentication module
│   ├── inventory/         # Item management
│   ├── warehouse/         # Warehouse & stock management
│   ├── recipe/            # Recipe/BOM management
│   ├── purchase/          # Purchase order management
│   ├── sales/             # Sales order management
│   └── ...
├── jobs/                  # Background job processors
├── docs/                  # API documentation
└── routes/                # Route aggregation
```

## 📊 Database Schema

### Key Models
- **Tenant**: Multi-tenant isolation
- **User**: User management with roles
- **Item**: Product/inventory items
- **Warehouse**: Storage locations
- **Stock**: Item quantities per warehouse
- **Recipe**: Bill of materials
- **PurchaseOrder/SaleOrder**: Order management
- **InventoryTransaction**: Stock movement tracking
- **Alert**: Notification system
- **AnalyticsLog**: Audit trail

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 13+
- Redis 6+

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd smart_inventory_ERP
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   ```
   
   Update `.env` with your configuration:
   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/smart_inventory
   JWT_SECRET=your-super-secret-jwt-key
   PORT=3000
   REDIS_URL=redis://localhost:6379
   LOG_LEVEL=info
   ```

4. **Database Setup**
   ```bash
   # Generate Prisma client
   npm run prisma:generate
   
   # Run migrations
   npm run prisma:migrate
   ```

5. **Start the server**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:3000`

## 📚 API Documentation

### Authentication
All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### Core Endpoints

#### Items Management
- `POST /api/inventory/items` - Create new item
- `GET /api/inventory/items` - List items with pagination
- `GET /api/inventory/items/:id` - Get item details
- `PUT /api/inventory/items/:id` - Update item
- `DELETE /api/inventory/items/:id` - Delete item
- `GET /api/inventory/items/:id/stock` - Get item stock across warehouses
- `GET /api/inventory/items/:id/transactions` - Get item transaction history

#### Warehouse Management
- `POST /api/warehouse/warehouses` - Create warehouse
- `GET /api/warehouse/warehouses` - List warehouses
- `GET /api/warehouse/warehouses/:id` - Get warehouse details
- `GET /api/warehouse/warehouses/:id/stock` - Get warehouse stock
- `POST /api/warehouse/transfer` - Transfer stock between warehouses
- `POST /api/warehouse/adjust` - Adjust stock quantities

#### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user info

### API Documentation
Visit `http://localhost:3000/docs` for interactive Swagger documentation.

## 🔧 Business Logic

### Stock Management
- **Automatic Updates**: Stock levels update automatically with transactions
- **Reserved Stock**: Track allocated vs available inventory
- **Multi-warehouse**: Items can exist in multiple warehouses
- **Transfer Validation**: Ensures sufficient stock before transfers
- **Adjustment Tracking**: All manual adjustments are logged with reasons

### Cost Calculations
- **Recipe Costs**: Automatic calculation based on ingredient costs
- **Production Batches**: Track actual costs per production run
- **Profit Margins**: Calculate margins based on cost vs selling price
- **Weighted Average**: Inventory valuation using weighted average cost

### Alert System
- **Low Stock**: Configurable thresholds for stock alerts
- **Overstock**: Identify excess inventory
- **Reorder Points**: Automatic reorder suggestions
- **Expiry Tracking**: Monitor item expiration dates

## 🛠️ Development

### Running Tests
```bash
npm test
```

### Database Migrations
```bash
# Create new migration
npm run prisma:migrate

# Deploy migrations
npm run prisma:deploy
```

### Background Jobs
The system includes background jobs for:
- Stock reorder point calculations
- Daily report generation
- Alert processing

## 🔒 Security

### Authentication & Authorization
- JWT-based authentication
- Role-based access control (RBAC)
- Token blacklisting for secure logout
- Tenant isolation for multi-tenancy

### Data Protection
- Input validation and sanitization
- SQL injection prevention via Prisma
- CORS configuration
- Helmet.js security headers

## 📈 Performance

### Optimization Features
- Database indexing on frequently queried fields
- Pagination for large datasets
- Connection pooling
- Redis caching for session management
- Efficient Prisma queries with proper includes

### Monitoring
- Structured logging with Pino
- Request/response logging
- Error tracking and reporting
- Performance metrics

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the API documentation at `/docs`
- Review the database schema in `prisma/schema.prisma`

## 🔮 Roadmap

### Planned Features
- [ ] Mobile app integration
- [ ] Advanced analytics dashboard
- [ ] Barcode scanning support
- [ ] Integration with external systems
- [ ] Advanced reporting with charts
- [ ] Multi-currency support
- [ ] Automated reordering
- [ ] Supplier portal
- [ ] Customer portal

---

Built with ❤️ for modern inventory management needs.
