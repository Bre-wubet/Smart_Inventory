const { Router } = require('express');
const { NotFoundError } = require('../core/exceptions');

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

router.use('/auth', require('../modules/auth/auth.routes'));
router.use('/inventory', require('../modules/inventory'));
router.use('/warehouse', require('../modules/warehouse'));
router.use('/recipe', require('../modules/recipe'));
router.use('/purchase', require('../modules/purchase'));
router.use('/sales', require('../modules/sales'));

router.use((req, res, next) => next(new NotFoundError('Route not found')));

module.exports = router;


