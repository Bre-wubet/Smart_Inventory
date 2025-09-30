const { Router } = require('express');
const router = Router();

router.get('/purchase-orders', (req, res) => res.json({ data: [] }));

module.exports = router;


