const { Router } = require('express');
const { NotFoundError } = require('../core/exceptions');

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Authentication routes
router.use('/auth', require('../modules/auth/auth.routes'));

// Core business modules
router.use('/inventory', require('../modules/inventory'));
router.use('/warehouse', require('../modules/warehouse'));
router.use('/recipe', require('../modules/recipe'));
router.use('/supplier', require('../modules/supplier'));
router.use('/purchase', require('../modules/purchase'));
router.use('/sales', require('../modules/sales'));

// Advanced modules
router.use('/costing', require('../modules/costing'));
router.use('/notifications', require('../modules/notifications'));
router.use('/user', require('../modules/user'));
router.use('/analytics', require('../modules/analytics'));

router.use((req, res, next) => next(new NotFoundError('Route not found')));

module.exports = router;


