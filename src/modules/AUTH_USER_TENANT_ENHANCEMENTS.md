# Enhanced Authentication, User, and Tenant Management

This document outlines the comprehensive improvements made to the authentication, user management, and tenant management modules based on the Prisma schema and best practices.

## Overview

The enhanced modules provide:
- **Advanced Authentication**: Password policies, rate limiting, session management, refresh tokens
- **Comprehensive User Management**: Profiles, dashboards, bulk operations, performance metrics
- **Multi-tenant Architecture**: Tenant analytics, settings, billing, usage tracking
- **Security Features**: Audit logging, role-based access control, session management

## Authentication Module (`src/modules/auth/`)

### Enhanced Features

#### 1. Password Security
- **Password Strength Validation**: Minimum length, uppercase, lowercase, numbers, symbols
- **Secure Hashing**: bcrypt with salt rounds of 12
- **Password Reset**: Secure token-based password reset flow

#### 2. Session Management
- **Access Tokens**: Short-lived tokens (8 hours by default)
- **Refresh Tokens**: Long-lived tokens (30 days by default)
- **Token Revocation**: Blacklisting and refresh token management
- **Remember Me**: Extended session duration option

#### 3. Rate Limiting & Security
- **Login Attempt Limiting**: Maximum 5 attempts before lockout
- **Account Lockout**: 30-minute lockout duration
- **Audit Logging**: All authentication events logged
- **IP Tracking**: Session tracking with IP and user agent

#### 4. New Endpoints

```javascript
// Enhanced authentication endpoints
POST /auth/register              // User registration with validation
POST /auth/login                 // Login with remember me option
POST /auth/logout                // Enhanced logout with token revocation
POST /auth/refresh-token         // Token refresh
POST /auth/request-password-reset // Password reset request
POST /auth/reset-password        // Password reset with token
POST /auth/change-password       // Change password (authenticated)
GET  /auth/me                    // Enhanced user info
```

### Usage Examples

```javascript
// Register with enhanced validation
const registerData = {
  email: "user@example.com",
  password: "SecurePass123!",
  name: "John Doe",
  tenantId: "tenant-id",
  role: "STAFF"
};

// Login with remember me
const loginData = {
  email: "user@example.com",
  password: "SecurePass123!",
  rememberMe: true
};

// Password reset flow
const resetRequest = {
  email: "user@example.com"
};

const resetConfirm = {
  token: "reset-token",
  newPassword: "NewSecurePass123!"
};
```

## User Management Module (`src/modules/user/`)

### Enhanced Features

#### 1. User Profiles
- **Extended Profile Information**: Account age, activity stats, preferences
- **Profile Management**: Self-service profile updates
- **User Dashboards**: Personalized dashboard with recent activity

#### 2. Bulk Operations
- **Bulk User Updates**: Update multiple users simultaneously
- **Bulk User Deletion**: Safe deletion with dependency checks
- **Bulk Role Changes**: Mass role assignments

#### 3. Session Management
- **Session Tracking**: View active sessions
- **Session Revocation**: Revoke all user sessions
- **Security Monitoring**: Track login patterns

#### 4. Performance Analytics
- **User Performance Metrics**: Transaction stats, activity patterns
- **Error Tracking**: Monitor user errors and issues
- **Activity Analysis**: Detailed user activity breakdown

#### 5. New Endpoints

```javascript
// Current user endpoints
GET  /user/me                    // Current user info
PUT  /user/me                    // Update current user
GET  /user/me/profile           // Current user profile
PUT  /user/me/profile           // Update current user profile
GET  /user/me/dashboard         // Current user dashboard
GET  /user/me/sessions          // Current user sessions
POST /user/me/sessions/revoke   // Revoke current user sessions

// User management endpoints (Admin/Manager)
GET  /user/                      // List users with filtering
POST /user/                      // Create user
POST /user/bulk-update          // Bulk update users
POST /user/bulk-delete          // Bulk delete users
GET  /user/stats                // User statistics

// Individual user endpoints
GET  /user/:id                   // Get user by ID
PUT  /user/:id                   // Update user
DELETE /user/:id                 // Delete user
GET  /user/:id/profile           // Get user profile
PUT  /user/:id/profile           // Update user profile
GET  /user/:id/dashboard         // Get user dashboard
GET  /user/:id/sessions          // Get user sessions
POST /user/:id/sessions/revoke   // Revoke user sessions
GET  /user/:id/performance       // Get user performance metrics
```

### Usage Examples

```javascript
// Bulk user operations
const bulkUpdate = {
  userIds: ["user1", "user2", "user3"],
  updateData: {
    role: "MANAGER",
    isActive: true
  }
};

// User profile management
const profileData = {
  name: "Updated Name",
  email: "newemail@example.com",
  preferences: {
    theme: "dark",
    notifications: true,
    language: "en"
  }
};

// Performance metrics
const metrics = await getUserPerformanceMetrics(userId, tenantId, {
  period: 30 // Last 30 days
});
```

## Tenant Management Module (`src/modules/tenant/`)

### Enhanced Features

#### 1. Tenant Analytics
- **Usage Statistics**: Users, warehouses, items, orders
- **Activity Tracking**: Recent tenant activity
- **Performance Metrics**: Transaction patterns, user activity

#### 2. Tenant Settings
- **General Settings**: Name, domain, plan information
- **Feature Management**: Enabled features based on plan
- **Notification Settings**: Email, SMS, system alerts
- **Integration Settings**: External service configurations

#### 3. Usage Monitoring
- **Resource Utilization**: Track usage against limits
- **Billing Information**: Plan details, usage costs
- **Limit Management**: Monitor against plan limits

#### 4. Multi-tenant Features
- **Plan Management**: Basic, Professional, Enterprise plans
- **Feature Toggles**: Plan-based feature access
- **Resource Limits**: Per-plan resource restrictions

#### 5. New Endpoints

```javascript
// Current tenant endpoints
GET  /tenant/current             // Current tenant info
GET  /tenant/current/settings    // Current tenant settings
PUT  /tenant/current/settings    // Update current tenant settings
GET  /tenant/current/usage       // Current tenant usage
GET  /tenant/current/analytics   // Current tenant analytics

// Admin tenant management endpoints
GET  /tenant/                    // List all tenants
POST /tenant/                    // Create tenant
GET  /tenant/:id                 // Get tenant by ID
PUT  /tenant/:id                 // Update tenant
DELETE /tenant/:id               // Delete tenant
GET  /tenant/:id/analytics       // Get tenant analytics
GET  /tenant/:id/settings        // Get tenant settings
PUT  /tenant/:id/settings        // Update tenant settings
GET  /tenant/:id/usage           // Get tenant usage
GET  /tenant/:id/billing         // Get tenant billing info
```

### Usage Examples

```javascript
// Tenant settings management
const settings = {
  general: {
    name: "Updated Company Name",
    domain: "new-domain.com"
  },
  features: {
    maxUsers: 100,
    maxWarehouses: 20,
    customBranding: true,
    apiAccess: true
  },
  notifications: {
    emailNotifications: true,
    lowStockAlerts: true,
    orderNotifications: true
  }
};

// Usage monitoring
const usage = await getTenantUsage(tenantId);
// Returns: usage, limits, utilization percentages

// Billing information
const billing = await getTenantBilling(tenantId);
// Returns: plan details, billing status, usage costs
```

## Security Enhancements

### 1. Password Policies
```javascript
const SECURITY = {
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_REQUIRE_UPPERCASE: true,
  PASSWORD_REQUIRE_LOWERCASE: true,
  PASSWORD_REQUIRE_NUMBERS: true,
  PASSWORD_REQUIRE_SYMBOLS: true,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION_MINUTES: 30,
  SESSION_TIMEOUT_HOURS: 8,
  REFRESH_TOKEN_EXPIRY_DAYS: 30
};
```

### 2. Role-Based Access Control
```javascript
const Role = {
  ADMIN: 'ADMIN',           // Full system access
  MANAGER: 'MANAGER',       // Management operations
  CUSTOMER: 'CUSTOMER',     // Customer operations
  SUPPLIER: 'SUPPLIER',     // Supplier operations
  STAFF: 'STAFF'            // Basic staff operations
};
```

### 3. Audit Logging
All critical operations are logged to `AnalyticsLog`:
- User registration/login/logout
- Password changes/resets
- Role changes
- Session management
- Administrative actions

## Database Schema Updates

### Updated Constants
The constants file has been updated to match the Prisma schema:

```javascript
// Updated Role enum
const Role = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  CUSTOMER: 'CUSTOMER',
  SUPPLIER: 'SUPPLIER',
  STAFF: 'STAFF'
};

// Added BatchStatus enum
const BatchStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

// Added security constants
const SECURITY = {
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_REQUIRE_UPPERCASE: true,
  PASSWORD_REQUIRE_LOWERCASE: true,
  PASSWORD_REQUIRE_NUMBERS: true,
  PASSWORD_REQUIRE_SYMBOLS: true,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION_MINUTES: 30,
  SESSION_TIMEOUT_HOURS: 8,
  REFRESH_TOKEN_EXPIRY_DAYS: 30
};

// Added tenant constants
const TENANT = {
  MAX_USERS_PER_TENANT: 1000,
  MAX_WAREHOUSES_PER_TENANT: 50,
  MAX_ITEMS_PER_TENANT: 10000,
  DEFAULT_PLAN: 'BASIC',
  PLANS: ['BASIC', 'PROFESSIONAL', 'ENTERPRISE']
};
```

## Error Handling

All modules include comprehensive error handling:
- **ValidationError**: Input validation failures
- **NotFoundError**: Resource not found
- **AuthError**: Authentication/authorization failures
- **RateLimitError**: Rate limiting violations

## Best Practices Implemented

1. **Security First**: Password policies, rate limiting, secure tokens
2. **Audit Trail**: Comprehensive logging of all operations
3. **Multi-tenancy**: Proper tenant isolation and management
4. **Role-based Access**: Granular permission system
5. **Performance**: Efficient queries with proper indexing
6. **Scalability**: Bulk operations and pagination
7. **User Experience**: Self-service capabilities and dashboards

## Migration Notes

When deploying these changes:

1. **Database**: Ensure Prisma schema is up to date
2. **Constants**: Update any hardcoded role references
3. **Authentication**: Update client applications to handle new token structure
4. **Permissions**: Review and update role-based access controls
5. **Monitoring**: Set up monitoring for new audit logs

## API Documentation

For detailed API documentation, refer to the Swagger documentation at `/docs` endpoint, which includes:
- Request/response schemas
- Authentication requirements
- Error codes and messages
- Example requests and responses

This enhanced authentication, user, and tenant management system provides a robust foundation for enterprise-level inventory management with proper security, scalability, and multi-tenancy support.
